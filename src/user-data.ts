import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { gqlService } from './services/backend/gql.service';
import * as fs from 'fs-extra';
import * as moment from 'moment';
import { join } from 'path';
import { getEpochDir } from './utils/epoch.utils';
import { formatEther, parseUnits } from 'ethers/lib/utils';
import {
  getMerkleOrchard,
  getMulticall,
  getVertekAdminActions,
} from './utils/contract.utils';
import { getEventData } from './utils/event-scraping';
import { csvService } from './services/standalone/csv.service';
import { doTransaction, getRpcProvider } from './utils/web3.utils';
import { bscScanService } from './services/standalone/bsc-scan.service';
import { epochs } from './main';
import { Contract } from '@ethersproject/contracts';
import { eToNumber } from './services/rewards/reward-generator.service';

const precision = 12;

export async function pullUserData(user: string) {
  // check for my bribes besides busd
  const me = '0x891eFc56f5CD6580b2fEA416adC960F2A6156494';
  const myGauge = '0x8601DFCeE55E9e238f7ED7c42f8E46a7779e3f6f';

  const distTokens = [
    {
      token: '0xfa4b16b0f63f5a6d0651592620d585d308f749a4',
      amount: 50,
      epochStartTime: 1677715200,
      gauge: '0x8601DFCeE55E9e238f7ED7c42f8E46a7779e3f6f',
      briber: me,
    },
    {
      token: '0xb9e05b4c168b56f73940980ae6ef366354357009',
      amount: 350,
      epochStartTime: 1677715200,
      gauge: '0x8601DFCeE55E9e238f7ED7c42f8E46a7779e3f6f',
      briber: me,
    },
    {
      token: '0x50d8d7f7ccea28cc1c9ddb996689294dc62569ca',
      amount: 100,
      epochStartTime: 1677715200,
      gauge: '0x8601DFCeE55E9e238f7ED7c42f8E46a7779e3f6f',
      briber: me,
    },
    {
      token: '0xd50c729cebb64604b99e1243a54e840527360581',
      amount: 20,
      epochStartTime: 1677715200,
      gauge: '0x8601DFCeE55E9e238f7ED7c42f8E46a7779e3f6f',
      briber: me,
    },
    {
      token: '0xed236c32f695c83efde232c288701d6f9c23e60e',
      amount: 750,
      epochStartTime: 1677715200,
      gauge: '0x8601DFCeE55E9e238f7ED7c42f8E46a7779e3f6f',
      briber: me,
    },
    {
      token: '0x12b70d84dab272dc5a24f49bdbf6a4c4605f15da',
      amount: 1000,
      epochStartTime: 1677715200,
      gauge: '0x8601DFCeE55E9e238f7ED7c42f8E46a7779e3f6f',
      briber: me,
    },
  ];

  // TODO: For automation this setup will need to call to sync votes and bribes first after epoch ticks over
  // Can run it local first time and push output file to backend for user claims

  // 46 total voter balances
  // TODO: Dont need this for live
  const data = fs.readJSONSync(
    join(getEpochDir(1677715200), 'user-balances.json'),
  );

  const { getGaugeVotes } = await gqlService.sdk.GetGaugeVotes({
    filter: {
      epochStartTime: 1677715200,
      gaugeId: '0x8601DFCeE55E9e238f7ED7c42f8E46a7779e3f6f',
    },
  });

  // 14 people to dist for my gauge

  const usersWhoVotedForGauge = getGaugeVotes.votes;
  const allVotersBalances = data.data;
  const merged = [];

  for (const voter of usersWhoVotedForGauge) {
    const match = allVotersBalances.find((v) => v.user === voter.userAddress);

    const gauge = voter.gaugeId;
    delete voter.gaugeId;
    merged.push({
      ...voter,
      user: voter.userAddress,
      gauge,
      percentOfTotalVE: match.percentOfTotalVE,
    });
  }

  let totalVeWeight = getTotalUserWeightScaled(merged);

  // Stash to remove for live
  const currentUserList = merged;

  const bribes = [];
  // Need a root for each token
  for (const bribe of distTokens) {
    let totalOwed = 0;

    for (const voter of currentUserList) {
      const claimAmount = getUserClaimAmount(
        voter,
        totalVeWeight,
        bribe.amount,
      );
      voter.claimAmount = claimAmount;
      voter.token = bribe.token;
      totalOwed += Number(claimAmount);
    }

    if (totalOwed > bribe.amount) {
      console.log(`Token ${bribe.token} totalOwed: ` + totalOwed);
      throw new Error('totalOwed > tokenAmount');
    }

    const tree = getBribeMerkleTree(currentUserList);
    const usersWithProofs = attachUserProofs(currentUserList, tree);

    bribes.push({
      briber: bribe.briber,
      bribeAmount: String(bribe.amount),
      gauge: bribe.gauge,
      token: bribe.token,
      epochStartTime: bribe.epochStartTime,
      users: usersWithProofs,
      merkleRoot: tree.root,
      distribution: {},
    });
  }

  // Generate output for backend to interface with frontend for user claims
  fs.writeJsonSync(join(process.cwd(), 'new-sync-test.json'), bribes);

  // Need distribution id's
  const distros: any[] = fs.readJsonSync(join(process.cwd(), 'distros.json'));

  // Use block number or parse events
  // const tx = await doBulkDistributions(bribes);
  // distros.push(tx);
  // fs.writeJsonSync(join(process.cwd(), 'distros.json'), distros);
}

export function getUserClaimAmount(
  user,
  totalVoteUsersWeightForGauge: number,
  totalRewardAmountForToken: number,
) {
  let precision: number;

  if (totalRewardAmountForToken >= 1000) {
    precision = 4;
  } else if (totalRewardAmountForToken < 100) {
    precision = 8;
  } else if (totalRewardAmountForToken > 100) {
    precision = 11;
  } else {
    precision = 18;
  }

  const userWeightBasis = getUserRelativeWeightScaled(user);
  const userGaugeRelativeWeight = Number(
    (userWeightBasis / totalVoteUsersWeightForGauge).toFixed(precision),
  );

  let userRelativeAmount = (
    totalRewardAmountForToken * userGaugeRelativeWeight
  ).toFixed(12);

  if (userRelativeAmount.includes('e')) {
    userRelativeAmount = eToNumber(userRelativeAmount);
    // Error check
    parseUnits(userRelativeAmount);
  }

  return userRelativeAmount;
}

function getUserRelativeWeightScaled(user) {
  // Scale users % by amount of voting power they used for the gauge
  // 10000 is max voting power (100% used)
  const userWeightBasis = Number(
    ((user.weightUsed / 10000) * user.percentOfTotalVE).toFixed(precision),
  );

  return userWeightBasis;
}

function getTotalUserWeightScaled(users: any[]) {
  let totalWeightScaled = 0;

  users.forEach((user) => {
    totalWeightScaled += getUserRelativeWeightScaled(user);
  });

  return totalWeightScaled;
}

export function getBribeMerkleTree(users: any[]) {
  const leaves = [];

  users.forEach((user) => {
    try {
      leaves.push([user.userAddress, parseUnits(user.claimAmount)]);
    } catch (error) {
      console.log('User amount too low');
      console.log(user.claimAmount);
    }
  });

  // The leaves are double-hashed to prevent second preimage attacks.
  return StandardMerkleTree.of(leaves, ['address', 'uint256']);
}

export function attachUserProofs(users: any[], tree: StandardMerkleTree<any>) {
  for (const [i, value] of tree.entries()) {
    // Doing string wrap/unwrap to avoid BigInt file write error for now
    value[value.length - 1] = String(value[value.length - 1]);

    const address = value[0];
    const user = users.find((u) => u.userAddress === address);
    if (!user) {
      throw new Error(`User ${address} not found in tree`);
    }
    // Should attch to user claim
    user.merkleProof = tree.getProof(i);
    user.claimAmount = value[1];
  }

  return users;
}

export async function doBulkDistributions(bribes: any[]) {
  console.log(`Bulk distribution for (${bribes.length}) total bribes`);

  const distributions = bribes.reduce((prev, current) => {
    prev.push({
      amount: parseUnits(current.bribeAmount),
      token: current.token,
      briber: current.briber,
      merkleRoot: current.merkleRoot,
    });

    return prev;
  }, []);

  console.log(`
  Distributions:`);
  console.log(distributions);

  const admin = getVertekAdminActions();

  const tx = await doTransaction(
    admin.createBribeDistributions(getMerkleOrchard().address, distributions),
  );

  return tx;
}

export async function getClaimEvents(
  epochStartTime: number,
  startBlock: number,
) {
  const epochDir = getEpochDir(epochStartTime);
  const path = join(epochDir, 'claim-events.json');
  fs.ensureFileSync(path);

  // const items = fs.readJsonSync(path);

  const items = [];

  const endBlock = await bscScanService.getBlockNumberByTimestamp(
    moment
      .unix(epochStartTime)
      .utc()
      .add(1, 'week')
      .subtract(1, 'second')
      .unix(),
  );

  await getEventData(
    getMerkleOrchard(),
    'DistributionClaimed',
    startBlock,
    endBlock,
    5000,
    (evt) => {
      const data = {
        briber: evt.args.briber,
        token: evt.args.token,
        distributionId: evt.args.distributionId.toNumber(),
        claimer: evt.args.claimer,
        recipient: evt.args.recipient,
        amount: formatEther(evt.args.amount),
        txHash: evt.transactionHash,
      };

      items.push(data);
    },
  );

  fs.writeJSONSync(path, items);
}
