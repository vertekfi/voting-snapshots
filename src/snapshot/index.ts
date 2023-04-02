import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { gqlService } from '../services/backend/gql.service';
import { getEpochDir, printEpoch } from '../utils/epoch.utils';
import * as fs from 'fs-extra';
import {
  createEpochDirectoryIfNeeded,
  getBribes,
  getGaugeData,
  getGaugesAddressList,
  getGaugeVotes,
  getUserAddressList,
  getVotes,
  resetClaims,
  resetMerkleTrees,
  setAllClaims,
  setBribes,
  setEpochBribers,
  setEpochTokenList,
  setGaugeBribeMerkleTree,
  setGaugeData,
  setGaugesAddressList,
  setGaugeUserClaims,
  setGaugeUserClaimsDeeeezz,
  setGaugeVotes,
  setUserAddressList,
  setUserBalances,
  setVotes,
} from './data.utils';
import {
  checkpointGaugeControllerIfNeeded,
  getBribesForEpoch,
  getVotesForEpoch,
} from './backend.utils';
import { getUsersVeBalancesForEpoch } from 'src/utils/vote.utils';
import {
  getUsersMergedWithBalances,
  getUsersAdjustedTotalWeight,
  getUserAmountForToken,
} from './user.utils';
import { getPrecisionNumber } from 'src/utils/utils';
import { parseUnits } from '@ethersproject/units';

export async function prepForSnapshot() {
  // Remove any concerns about automation timing across services
  await checkpointGaugeControllerIfNeeded();

  // Then sync epochs on backend knowing it will update properly as we need
  // This can take a bit (~1 second per epoch) due to throttling API calls to block explorer on the backend
  // Can upgrade to pro account if needed then
  await gqlService.sdk.SyncEpochs();
}

export async function doNewEpochBribeSnapshot() {
  await prepForSnapshot();

  // Now we know we can pull the epochs.length - 2 record to get our desired epoch timestamp for this run
  const { getGaugeEpochs } = await gqlService.sdk.GetGaugeEpochs();

  console.log(getGaugeEpochs);

  // Now we know the epoch with blockNumber = 0 (last one) is what we reference to go back the 2 to epoch records (blockNumber = 0 one inclusive)
  // Eg. For epoch start of Thursday 4/6 UTC 00:00. When this automation will run we want to get bribes/votes from the start of previous week 3/30 UTC 00:00,
  // up until 4/5 ~12:59 UTC
  const currentEpochForDistribution = getGaugeEpochs[getGaugeEpochs.length - 2];
  console.log(currentEpochForDistribution);

  // Ensure something isnt out of sync to avoid headaches and user issues
  const futureEpochAfterCheckpoint = getGaugeEpochs[getGaugeEpochs.length - 1];

  const created = generateEpochDirectory(
    currentEpochForDistribution.epoch,
    false,
  );

  const snapshotBribes = await getBribesForEpoch(
    currentEpochForDistribution.epoch,
  );
}

// Fill in base data for any epoch
export async function populateBaseDataForEpoch(epoch: number) {
  generateEpochDirectory(epoch, true);

  const [votesForEpoch, bribesForEpoch] = await Promise.all([
    getVotesForEpoch(epoch),
    getBribesForEpoch(epoch),
  ]);

  setVotes(epoch, votesForEpoch);

  setBribes(epoch, bribesForEpoch);

  extractUniqueTokens(epoch);
  extractUniqueBribers(epoch);
  extractUniqueGauges(epoch);
  extractUniqueVoters(epoch);

  await setVoterBalanceInfo(epoch);

  associateVotersToGauge(epoch);
  addVotersToBribes(epoch);

  // Now that we have balances, we can do the reward amount generation per user, per gauge
  setUserGaugeClaimAmounts(epoch);
}

// After user reward amounts have been set
export function generateMerkleTreeForBribes(epoch: number, users: any[]) {
  // Each user array passed in is under/grouped by the same gauge/briber/token (distribution) setup

  const gauge = users[0].gauge;
  const token = users[0].token;

  users = users.map((user) => {
    return {
      user: user.user,
      claimAmount: String(user.claimAmountNum),
      gauge: user.gauge,
      briber: user.briber,
      token: user.token,
    };
  });

  const leaves = [];

  users.forEach((user) => {
    try {
      leaves.push([user.user, parseUnits(user.claimAmount)]);
    } catch (error) {
      console.log('User amount too low');
      console.log(user.claimAmount);
    }
  });

  // The leaves are double-hashed to prevent second preimage attacks.
  const tree = StandardMerkleTree.of(leaves, ['address', 'uint256']);

  // These need some identifier since same briber/token/amount/etc. is possible on the same gauge
  // Root won't work cause that could be the same within the same gauge
  // Could read the directory and increment based on how many of the combo may be in there
  // Or. Think of how to database it now....
  const timestamp = Date.now();
  const id = `${gauge}-${timestamp}`;

  setGaugeBribeMerkleTree(epoch, gauge, tree, id);

  // Increment the count of "trees" under the gauges directory

  for (const [i, value] of tree.entries()) {
    // Doing string wrap/unwrap to avoid BigInt file write error for now
    value[value.length - 1] = String(value[value.length - 1]);

    const address = value[0];
    const user = users.find((u) => u.user === address);
    if (!user) {
      throw new Error(`User ${address} not found in tree`);
    }

    user.merkleProof = tree.getProof(i);

    if (!user.merkleProof || !user.merkleProof.length) {
      console.log('No proof for user: ' + user.user);
    }

    user.claimAmount = value[1];
  }

  setGaugeUserClaimsDeeeezz(
    epoch,
    gauge,
    `user-claims-${token}-${timestamp}`,
    users,
  );
}

export function setUserGaugeClaimAmounts(epoch: number) {
  printEpoch(epoch);

  const gauges = getGaugesAddressList(epoch);
  const allUserClaims = [];

  // Iterative each gauge that was given bribes
  // Users who voted and bribes data are already available at this point per gauge
  gauges.forEach((gauge) => {
    resetMerkleTrees(epoch, gauge);
    resetClaims(epoch, gauge);

    // Working in the context of a single gauge
    // With its associated votes for, and bribes
    const gaugeData = getGaugeData(epoch, gauge);

    // Each user is entitled to each of these bribes/tokens
    // So generate reward distribution info needed for every bribe/token
    const bribes = gaugeData.bribes;
    const gaugeVoters = gaugeData.userVotes;

    const votersMergedWithVeInfo = getUsersMergedWithBalances(
      epoch,
      gaugeVoters,
    );

    const gaugeUserClaims = [];

    // Set user amounts per bribe/token
    // so that distribution info per bribe is in place
    for (const bribe of bribes) {
      // Will set all user relative claim amounts for a bribe
      const bribeClaims = handleUsersBribeClaim(bribe, votersMergedWithVeInfo);

      // Once we have all the amounts for a bribe we need need to create the tree for its distribution
      // Easier than trying to rework and base everything on total briber/token
      generateMerkleTreeForBribes(epoch, bribeClaims);

      gaugeUserClaims.push(...bribeClaims);
      allUserClaims.push(...bribeClaims);
    }

    setGaugeUserClaims(epoch, gauge, gaugeUserClaims);
  });

  setAllClaims(epoch, allUserClaims);
}

function handleUsersBribeClaim(bribe, votersMergedWithVeInfo: any[]) {
  // Need the relative weight of just these users who voted for this gauge
  const totalVeWeightForGauge = getUsersAdjustedTotalWeight(
    votersMergedWithVeInfo,
  );
  const users = totalVeWeightForGauge.users;
  const bribeClaims = [];
  const tokenAmount = parseFloat(bribe.amount);

  // Keep track of total amount owe to watch for overflow
  let bribeTotalAmountOwed = 0;

  users.forEach((user, idx) => {
    let { claimAmount, claimAmountBN } = getUserAmountForToken(
      user,
      totalVeWeightForGauge.totalWeightScaled,
      tokenAmount,
    );

    bribeTotalAmountOwed += claimAmount;

    // To avoid issues with reward claims due to decimal precision errors.
    // If amount is over token amount, and this is the last user, scale down amount to match max amount.
    // In these cases the precision diff is so neglible(0.00....1) we can simply
    // deduct the difference from total and claim amount
    if (bribeTotalAmountOwed > tokenAmount && idx === users.length - 1) {
      console.log(`    bribeTotalAmountOwed > tokenAmount`);
      console.log(`Adjusting last user claim amount`);

      const diff = Math.abs(tokenAmount - bribeTotalAmountOwed);
      console.log(`diff: ${diff}`);

      console.log(`bribeTotalAmountOwed before: ${bribeTotalAmountOwed}`);
      bribeTotalAmountOwed -= diff;
      console.log(`bribeTotalAmountOwed after: ${bribeTotalAmountOwed}`);

      const claimBefore = claimAmount;
      console.log(`claimAmount before: ${claimBefore}`);
      claimAmount = getPrecisionNumber(claimAmount - diff, 16);
      console.log(`claimAmount after: ${claimAmount}`);
      console.log(`claimAmount diff: ${claimBefore - claimAmount}
    `);
    }

    bribeClaims.push({
      ...user,
      briber: bribe.briber,
      token: bribe.token.address,
      claimAmountNum: claimAmount,
      claimAmountBN,
    });
  });

  return bribeClaims;
}

async function setVoterBalanceInfo(epoch: number) {
  const userBalanceData = await getUsersVeBalancesForEpoch(
    epoch,
    getUserAddressList(epoch),
  );

  setUserBalances(epoch, userBalanceData.data);
}

function addVotersToBribes(epoch: number) {
  const bribes = getBribes(epoch);

  // For each gauge, get its gauges/0x1234 file and put it under all matching bribes for that gauge address
  const gauges = getGaugesAddressList(epoch);

  gauges.forEach((gauge) => {
    const gaugesBribes = bribes.filter((b) => b.gauge === gauge);

    // console.log(`
    // Gauge ${gauge} has (${gaugesBribes.length}) total bribes for this epoch`);

    // Now put the users alongside those bribes
    // Only take needed data to unclutter shit
    const userVotes = getGaugeVotes(epoch, gauge).map((user) => {
      return {
        user: user.userAddress,
        gauge: user.gaugeId,
        weightUsed: user.weightUsed,
      };
    });

    setGaugeData(epoch, gauge, {
      gauge,
      bribes: gaugesBribes,
      userVotes,
    });
  });
}

export function associateVotersToGauge(epoch: number) {
  const allVotes = getVotes(epoch);
  const gauges = getGaugesAddressList(epoch);

  function matchVotes(gauge: string) {
    const votesFor = allVotes.filter((vote) => vote.gaugeId === gauge);

    // console.log(`
    // Gauge ${gauge} has (${votesFor.length}) total votes for this epoch`);

    setGaugeVotes(epoch, gauge, votesFor);
  }

  gauges.forEach(matchVotes);
}

export async function generateEpochDirectory(
  epoch: number,
  overwrite: boolean,
) {
  const dir = getEpochDir(epoch);
  if (fs.existsSync(dir) && !overwrite) {
    throw new Error(`
    Epoch directory already exists. Start over if needed`);
  }

  createEpochDirectoryIfNeeded(epoch);
  // setUserBalances(epoch, []);

  console.log(`
  Epoch directory created ${dir}
  `);
}

function extractUniqueVoters(epoch: number) {
  const votes = getVotes(epoch);
  const voters = votes.reduce((prev, current) => {
    if (!prev.includes(current.userAddress)) prev.push(current.userAddress);

    return prev;
  }, []);

  // console.log(`
  // There are (${voters.length}) unique voters for this epoch`);

  setUserAddressList(epoch, voters);
}

export function extractUniqueTokens(epoch: number) {
  const bribes = getBribes(epoch);
  const tokens = bribes.reduce((prev, current) => {
    if (!prev.includes(current.token.address)) prev.push(current.token.address);

    return prev;
  }, []);

  // console.log(`
  // There are (${tokens.length}) unique tokens used for bribing this epoch`);

  setEpochTokenList(epoch, tokens);
}

export function extractUniqueBribers(epoch: number) {
  const bribes = getBribes(epoch);
  const bribers = bribes.reduce((prev, current) => {
    if (!prev.includes(current.briber)) prev.push(current.briber);

    return prev;
  }, []);

  setEpochBribers(epoch, bribers);
}

export function extractUniqueGauges(epoch: number) {
  const bribes = getBribes(epoch);
  const gauges = bribes.reduce((prev, current) => {
    if (!prev.includes(current.gauge)) prev.push(current.gauge);

    return prev;
  }, []);

  // console.log(`
  // There are (${gauges.length}) unique gauges voted for this epoch`);

  setGaugesAddressList(epoch, gauges);
}
