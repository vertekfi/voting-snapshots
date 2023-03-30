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
import { getUsersVeBalancesForEpoch } from './utils/vote.utils';
import { setUserBalances } from './services/rewards/reward.utils';
import { UserBalanceInfo } from './types/user.types';

const precision = 12;

export async function runEpochSnapshot() {
  // check for my bribes besides busd
  const me = '0x891eFc56f5CD6580b2fEA416adC960F2A6156494';

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

  // Get all votes and bribes

  // Make sure last epoch item is in the past now

  // TODO: Pull needed epoch on the fly
  let currentEpoch = 1679529600; // 3/23
  const epochDir = getEpochDir(currentEpoch);

  const { getBribes: epochBribes } = await gqlService.sdk.GetBribesInfo({
    filter: {
      epochStartTime: currentEpoch,
    },
  });
  console.log(`
  There are (${epochBribes.length}) total bribes this epoch`);

  const { getGaugeVotes } = await gqlService.sdk.GetGaugeVotes({
    filter: {
      epochStartTime: currentEpoch,
    },
  });

  // Need to match users to the gauges they voted for

  const gaugesWithBribes: string[] = epochBribes.reduce((prev, current) => {
    if (!prev.includes(current.gauge)) prev.push(current.gauge);

    return prev;
  }, []);

  const allUsersWhoVoted = getGaugeVotes.votes;
  const usersVeBalanceInfo = await getUsersVeBalancesForEpoch(
    currentEpoch,
    allUsersWhoVoted.map((u) => u.userAddress),
  );

  const allVotersBalances = usersVeBalanceInfo.data;
  setUserBalances(epochDir, allVotersBalances);

  // The eventual full list of all bribes
  const bribes = [];

  // Setting users who voted for each gauge with their VE balance info
  for (const gauge of gaugesWithBribes) {
    const usersWhoVotedForGauge = allUsersWhoVoted.filter(
      (u) => u.gaugeId === gauge,
    );
    console.log(`
    There are (${usersWhoVotedForGauge.length}) votes for gauge ${gauge}`);

    const votersMergedWithVeInfo = getGaugeVotersBaseInfo(
      gauge,
      allVotersBalances,
      usersWhoVotedForGauge,
    );

    const gaugeBribes: any[] = epochBribes.filter((b) => b.gauge === gauge);

    for (const bribe of gaugeBribes) {
      // Need the relative weight of just these users who voted for this gauge
      const totalVeWeight = getTotalUserWeightScaled(votersMergedWithVeInfo);
      let totalOwed = 0;

      // Need a root for each token
      // Iterate each user per token. Since tokens could duplicate or have diff amounts

      for (const user of votersMergedWithVeInfo) {
        const claimAmount = getUserClaimAmount(
          user,
          totalVeWeight,
          parseFloat(bribe.amount),
        );

        user.claimAmount = claimAmount;
        user.token = bribe.token;
        totalOwed += Number(claimAmount);
      }

      if (totalOwed > parseFloat(bribe.amount)) {
        console.log(`Token ${bribe.token.address} totalOwed: ` + totalOwed);
        throw new Error('totalOwed > tokenAmount');
      }

      // After claim amount has been added
      // Build the tree for this token once
      const tree = getBribeMerkleTree(votersMergedWithVeInfo);
      let usersWithProofs = attachUserProofs(votersMergedWithVeInfo, tree);
      usersWithProofs = usersWithProofs.map((u) => {
        return {
          ...u,
          user: u.userAddress,
        };
      });

      bribes.push({
        briber: bribe.briber,
        gauge,
        token: bribe.token.address,
        amount: bribe.amount,
        epochStartTime: currentEpoch,
        users: usersWithProofs,
        merkleRoot: tree.root,
        distribution: {},
      });
    }
  }

  // Generate output for backend to interface with frontend for user claims
  fs.writeJsonSync(
    join(getEpochDir(currentEpoch), 'bribers-data.json'),
    bribes,
  );

  const tx = await doBulkDistributions(bribes);

  // Need distribution id's
  const distPath = join(epochDir, 'distros.json');
  fs.writeJSONSync(distPath, {});
  fs.writeJsonSync(distPath, tx);

  // Get distribution data from event logs
  // const bribes = fs.readJSONSync(join(epochDir, 'bribers-data.json'));
  parseDistributionLogs(distPath, bribes, epochDir);
}

function getGaugeVotersBaseInfo(
  gauge: string,
  allVotersBalances: UserBalanceInfo[],
  allUsersWhoVoted: any[],
) {
  // TODO: Only need this until moving user balance sync
  const mergedWithVeInfo = [];

  const usersWhoVotedForGauge = allUsersWhoVoted.filter(
    (u) => u.gaugeId === gauge,
  );

  for (const gaugeVoter of usersWhoVotedForGauge) {
    const match = allVotersBalances.find(
      (v) => v.user === gaugeVoter.userAddress,
    );

    if (!match) {
      throw new Error(`No balance match for user ${gaugeVoter.userAddress}`);
    }

    const gauge = gaugeVoter.gaugeId;
    delete gaugeVoter.gaugeId;

    mergedWithVeInfo.push({
      ...gaugeVoter,
      user: gaugeVoter.userAddress,
      gauge,
      percentOfTotalVE: match.percentOfTotalVE,
    });
  }

  return mergedWithVeInfo;
}

export function getUserClaimAmount(
  user,
  totalVoteUsersWeightForGauge: number,
  totalRewardAmountForToken: number,
) {
  let precision = 18;

  const userWeightBasis = getUserRelativeWeightScaled(user);
  const userGaugeRelativeWeight = Number(
    (userWeightBasis / totalVoteUsersWeightForGauge).toFixed(precision),
  );

  let userRelativeAmount = (
    totalRewardAmountForToken * userGaugeRelativeWeight
  ).toFixed(20);

  if (userRelativeAmount.length > 12) {
    userRelativeAmount = userRelativeAmount.slice(0, 13);
  }

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
    if (!user.merkleProof || !user.merkleProof.length) {
      console.log('No proof for user: ' + user.userAddress);
    } else {
      // console.log('Proof length: ' + user.merkleProof.length);
    }
    user.claimAmount = value[1];
  }

  return users;
}

export async function doBulkDistributions(bribes: any[]) {
  console.log(`Bulk distribution for (${bribes.length}) total bribes`);

  const distributions = bribes.reduce((prev, current) => {
    if (!current.merkleRoot) {
      throw new Error('Missing merkle root');
    }

    prev.push({
      amount: parseUnits(current.amount),
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

// Set the distribution id and txHash for each distribution
function parseDistributionLogs(
  distPath: string,
  bribes: any[],
  epochDir: string,
) {
  const data = fs.readJsonSync(distPath);
  const orchard = getMerkleOrchard();

  // Event logs should index align with distributions
  console.log(`${data.events.length} = ${bribes.length}`);
  if (data.events.length !== bribes.length) {
    throw new Error(`data.events.length !== bribes.length`);
  }

  data.events.forEach((eventData, idx) => {
    // Use interface to get the data out in human readable form
    const evt = orchard.interface.decodeEventLog(
      'DistributionAdded',
      eventData.data,
      eventData.topics,
    );

    // const briber = `0x${eventData.topics[1].slice(26)}`.toLowerCase();
    // const token = `0x${eventData.topics[2].slice(26)}`.toLowerCase();
    // const merkleRoot = evt.merkleRoot.toLowerCase();

    // const bribe = bribes[idx];
    //   console.log(`
    //   evt[idx]
    //   briber: ${briber}
    //   token: ${token}
    //   merkleRoot: ${merkleRoot}
    // `);

    //   console.log(`
    //     bribes[idx]
    //     briber: ${bribe.briber}
    //     token: ${bribe.token}
    //     merkleRoot: ${bribe.merkleRoot}
    //   `);

    bribes[idx].distribution = {
      distributionId: evt.distributionId.toNumber(),
      txHash: data.transactionHash,
    };
  });

  fs.writeJSONSync(join(epochDir, 'bribers-data.json'), bribes);
}

function matchBribeRecord(
  bribes: any[],
  briber: string,
  token: string,
  root: string,
  amount: string,
) {
  const matchingBribe = bribes.filter(
    (bribe) =>
      bribe.briber.toLowerCase() === briber.toLowerCase() &&
      bribe.token.toLowerCase() === token.toLowerCase() &&
      bribe.merkleRoot.toLowerCase() === root.toLowerCase() &&
      parseUnits(bribe.amount).eq(amount),
  );

  if (!matchingBribe.length) {
    throw new Error('No matching bribe for event data');
  }

  // They can use the same token more than once in an epoch
  // if (matchingBribe.length > 1) {
  //   throw new Error('More than one matching bribe record');
  // }

  return matchingBribe[0];
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
