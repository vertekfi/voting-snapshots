import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { parseUnits } from 'ethers/lib/utils';
import * as moment from 'moment';
import {
  getMerkleOrchard,
  getVertekAdminActions,
} from 'src/utils/contract.utils';
import { doTransaction, sleep } from 'src/utils/web3.utils';
import { gqlService } from '../backend/gql.service';
import {
  associateBribesToBribers,
  getUserClaimsToAmountForToken,
  getVotersTotalWeightForGauge,
} from './reward-generator.service';
import {
  getBribeDistributionInfo,
  getBribersData,
  getDistributionData,
  getGaugeBribeClaims,
  getUserBalances,
  getUsersGaugeVotes,
  setBribeDistributionInfo,
  setBribersData,
  setDistributionData,
  setUserGaugeBribeClaims,
} from './reward.utils';

export async function runBribeRewardsForEpoch(epoch: number, epochDir: string) {
  // const bribersBribes = await setBribersEpochBaseData(epoch, epochDir);
  const bribersBribes = getBribersData(epochDir);
  const userVotes = getUsersGaugeVotes(epochDir);

  for (let briber of bribersBribes) {
    // Each bribe is for/provides a specific token
    for (const bribe of briber.bribes) {
      // This is already available somewhere...
      const voters = getBribeUserVotes(bribe, userVotes);

      // trying to organize this in some way
      setUserClaimDataForBribeToken(epochDir, bribe, voters);

      // After setUserBribeClaims
      let usersForTree = groupUsersByTokenForDistributionPrep(epochDir, bribe);

      // users have ROOT attached now for easier claiming setup
      const { tree, users } = getBribeMerkleTree(usersForTree);
      assignMerkleRootToClaims(users, tree.root);
      // Attach proof as well for ease later
      usersForTree = attachUserProofs(usersForTree, tree);
      // Save it all. Higher level for now. Gets aggregated shortly
      usersForTree = setUserGaugeBribeClaims(
        epochDir,
        getClaimFileName(bribe),
        usersForTree,
      );

      // Set minimal user info now instead of using voters data to bloat file
      bribe.users = usersForTree;
      bribe.merkleRoot = tree.root;

      setBribersData(epochDir, bribersBribes);
    }
  }
}

export function groupUsersByTokenForDistributionPrep(epochDir: string, bribe) {
  const users = getGaugeBribeClaims(epochDir, getClaimFileName(bribe));

  // We know we have the claimers for a gauge
  // Distribution is then by token.
  // So need users gathered together by token dist amount,
  // in order to properly create the merkle root the contract is expecting for user claims
  const usersForBribeDistribution = users.filter(
    (c) => c.token.toLowerCase() === bribe.token.toLowerCase(),
  );

  return usersForBribeDistribution;
}

export function assignMerkleRootToClaims(users: any[], root: string) {
  users.forEach((u) => (u.merkleRoot = root));
}

export function getBribeMerkleTree(users: any[]) {
  const leaves = [];
  users.forEach((user) => {
    try {
      leaves.push([user.user, parseUnits(user.userRelativeAmount)]);
    } catch (error) {
      console.log('User amount too low');
      console.log(user.userRelativeAmount);
    }
  });

  // The leaves are double-hashed to prevent second preimage attacks.
  const tree = StandardMerkleTree.of(leaves, ['address', 'uint256']);

  return {
    tree,
    users,
  };
}

export function attachUserProofs(users: any[], tree: StandardMerkleTree<any>) {
  for (const [i, value] of tree.entries()) {
    // Doing string wrap/unwrap to avoid BigInt file write error for now
    value[value.length - 1] = String(value[value.length - 1]);

    const address = value[0];
    const user = users.find((u) => u.user === address);
    if (!user) {
      throw new Error(`User ${address} not found in tree`);
    }
    // Should attch to user claim
    user.merkleProof = tree.getProof(i);
    user.claimAmount = value[1];
  }

  return users;
}

function setUserClaimDataForBribeToken(
  epochDir: string,
  bribe,
  usersWhoVoted: any[],
) {
  const { data } = getUserBalances(epochDir);

  usersWhoVoted = usersWhoVoted.map((user) => {
    const balance = data.find((b) => b.user === user.user);

    return {
      ...user,
      ...balance,
    };
  });

  let usersClaimInfo = getUserClaimsToAmountForToken(
    usersWhoVoted,
    getVotersTotalWeightForGauge(usersWhoVoted),
    parseFloat(bribe.amount),
  );

  usersClaimInfo = usersClaimInfo
    .map((info) => {
      delete info.claimValues;
      return {
        ...info,
        token: bribe.token,
        merkleProof: [],
        claimAmount: '0',
        briber: bribe.briber,
      };
    })
    .flat();

  console.log(
    `(${usersClaimInfo.length}) users to claim for ${bribe.gauge} - ${bribe.token}`,
  );

  setUserGaugeBribeClaims(epochDir, getClaimFileName(bribe), usersClaimInfo);
}

export function getClaimFileName(bribe) {
  // Should check if exists and add an index or something to end of file name
  // In case they add more of the same bribe
  return `${bribe.briber}_${bribe.gauge}_${bribe.token}`;
}

function getBribeUserVotes(bribe, userVotes: any[]) {
  // Already have this by gauge name in gauges directory...
  const gaugeVoters = userVotes.reduce((prev, current) => {
    const voteRecord = current.votes.filter((v) => v.gauge === bribe.gauge);
    if (voteRecord.length) {
      prev.push({
        user: current.user,
        gauge: voteRecord[0].gauge,
        weightUsed: voteRecord[0].weightUsed,
      });
    }

    return prev;
  }, []);

  // console.log(
  //   `Bribe for gauge ${bribe.gauge} has (${gaugeVoters.length}) voters`,
  // );

  return gaugeVoters;
}

export function getAllBribesFlattened(epochDir: string) {
  const bribersBribes = getBribersData(epochDir);

  return bribersBribes.reduce(
    (prev, current) => [...prev, ...current.bribes],
    [],
  );
}

export async function doBulkBribeDistribution(epochDir: string) {
  let allBribes = getAllBribesFlattened(epochDir);
  allBribes = allBribes.filter((b) => !b.distribution);

  console.log(`Bulk distribution for (${allBribes.length}) total bribes`);

  const distributions = allBribes.reduce((prev, current) => {
    prev.push({
      amount: parseUnits(current.amount),
      token: current.token,
      briber: current.briber,
      merkleRoot: current.merkleRoot,
    });

    return prev;
  }, []);

  const admin = getVertekAdminActions();
  const orchard = getMerkleOrchard();

  const tx = await doTransaction(
    admin.createBribeDistributions(orchard.address, distributions),
  );

  setDistributionData(epochDir, tx);
  updateDistributions(epochDir);
}

export function updateDistributions(epochDir: string) {
  // Match distros to event data
  // emit DistributionAdded(briber, token, distributionId, merkleRoot, amount);
  const bribes = getAllBribesFlattened(epochDir);
  const data = getDistributionData(epochDir);
  const orchard = getMerkleOrchard();

  data.events.forEach((eventData) => {
    const evt = orchard.interface.decodeEventLog(
      'DistributionAdded',
      eventData.data,
      eventData.topics,
    );

    const briber = `0x${eventData.topics[1].slice(26)}`.toLowerCase();
    const token = `0x${eventData.topics[2].slice(26)}`.toLowerCase();
    const root = evt.merkleRoot.toLowerCase();

    const matchingBribe = matchBribeRecord(
      bribes,
      briber,
      token,
      root,
      evt.amount,
    );

    if (!matchingBribe.distribution) {
      matchingBribe.distribution = {
        distributionId: evt.distributionId.toNumber(),
        txHash: data.transactionHash,
      };

      setBribeDistributionInfo(epochDir, bribes);
    }
  });
}

export function joinDistributionsToUsers(epochDir: string) {
  const bribesFlat = getBribeDistributionInfo(epochDir);

  bribesFlat.forEach((bribe) => {
    bribe.users.forEach(
      (user) => (user.distributionId = bribe.distribution.distributionId),
    );
  });

  setBribeDistributionInfo(epochDir, bribesFlat);
}

export function matchBribeRecord(
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

// export async function setBribersEpochBaseData(epoch: number, epochDir: string) {
//   const gauges = await gqlService.getGaugesWithBribes(epoch);
//   const bribersBribes = associateBribesToBribers(gauges);
//   setBribersData(epochDir, bribersBribes);

//   return bribersBribes;
// }
