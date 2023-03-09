import { BigNumber } from '@ethersproject/bignumber';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { parseUnits } from 'ethers';
import {
  UserGaugeSnapshotRelativeInfo,
  UserInfo,
  UserMerkleSnapshot,
} from 'src/types/user.types';
import { getMerkleOrchard, getMulticall } from 'src/utils/contract.utils';

export function getTokenTotalForGaugeBribes(
  tokens: { address: string }[],
  gauge,
) {
  const bribes: any[] = gauge.currentEpochBribes;
  // console.log(`Gauge ${gauge.gauge} has ${bribes.length} total bribes`);

  // Need to see if token is a duplicate in the bribe list
  return tokens
    .map((tk) => {
      const totalBribeAmountForToken = bribes
        .filter((b) => b.token.address.toLowerCase() === tk.address)
        .reduce((prev, cur) => prev + parseFloat(cur.amount), 0);

      return {
        token: tk.address,
        totalAmount: totalBribeAmountForToken,
      };
    })
    .filter((ta) => ta.totalAmount > 0);
}

export async function getDistributionInfo(gauges: any[]): Promise<
  {
    briber: string;
    token: string;
    distributionId: BigNumber;
    tokenAmount: BigNumber;
  }[]
> {
  // We know we only have gauges with current bribes at this point
  console.log(`Setting up distribution for (${gauges.length}) gauges`);

  const ids = await getNextDistributionIds(gauges);
  return getBribersDistributionParams(gauges, ids);
}

export function getBribersDistributionParams(
  gauges: any[],
  ids: Record<string, { [token: string]: BigNumber }>,
) {
  // Get total amount of token(s) for a bribers bribes
  // To be used in distribution. Regardless of gauge.
  // Someone, has a right to those tokens regardless of gauge.
  let distributions = [];
  for (const nextIdInfo of Object.entries(ids)) {
    const [briber, briberDistTokenIds] = nextIdInfo;

    Object.entries(briberDistTokenIds).forEach((tkId) => {
      // Get the user/bribers total amount for token across all bribes
      const tokenAmount = getListOfAllBribes(gauges)
        .filter((b) => b.briber === briber && b.token.address === tkId[0])
        .reduce((prev, cur) => prev + parseFloat(cur.amount), 0);

      distributions.push({
        briber,
        token: tkId[0],
        distributionId: tkId[1],
        tokenAmount: parseUnits(String(tokenAmount)),
        merkleRoot: '',
        votingUsers: [],
      });
    });
  }

  return distributions;
}

export function associateBribesToBribers(gauges: any[]) {
  const bribes = getListOfAllBribes(gauges);
  const bribers = getUniqueBribers(gauges);

  return bribers.map((briber) => {
    return {
      briber,
      bribes: bribes.filter((b) => b.briber === briber),
      gaugeList: [],
    };
  });
}

export function getUniqueBribers(gauges: any[]) {
  const bribers: string[] = [];

  gauges.forEach((g) =>
    g.currentEpochBribes.forEach((b) => {
      if (!bribers.includes(b.briber)) {
        bribers.push(b.briber);
      }
    }),
  );
  console.log(`(${bribers.length}) distinct bribers`);

  return bribers;
}

export function getListOfAllBribes(gauges: any[]) {
  const bribeInstances = gauges
    .map((g) => g.currentEpochBribes.map((b) => b))
    .flat();
  console.log(`(${bribeInstances.length}) distinct bribe instances`);

  return bribeInstances;
}

export function getBriberTokenSets(bribers: string[], bribeInstances: any[]) {
  const bribersDistData = [];

  // Get setup for next dist id for each briber/token distinct combination
  bribers.forEach((briber) => {
    const bribersBribes = bribeInstances.filter((b) => b.briber === briber);
    // console.log(`Briber ${briber} has ${bribersBribes.length} total bribes`);

    const tokens = [];
    bribersBribes.forEach((b) => {
      if (!tokens.find((tk) => tk.address === b.token.address)) {
        tokens.push(b.token);
      }
    });

    bribersDistData.push({
      briber,
      tokens,
    });
  });

  return bribersDistData;
}

export async function getNextDistributionIds(gauges: any[]) {
  // Get next dist id per unique briber/token instances
  const orchard = getMerkleOrchard();
  const multi = getMulticall([
    'function getNextDistributionId(address, address) public view returns (uint)',
  ]);

  const bribeInstances = getListOfAllBribes(gauges);
  const bribers = getUniqueBribers(gauges);
  const bribersDistData = getBriberTokenSets(bribers, bribeInstances);

  bribersDistData.forEach((briber) => {
    briber.tokens.forEach((tk) => {
      multi.call(
        `${briber.briber}.${tk.address}`,
        orchard.address,
        'getNextDistributionId',
        [briber.briber, tk.address],
      );
    });
  });

  return multi.execute<Record<string, { [token: string]: BigNumber }>>(
    'getDistributionInfo:getNextDistributionId',
  );
}

export async function getNextDistributionId(
  briber: string,
  token: string,
): Promise<BigNumber> {
  const orchard = getMerkleOrchard();
  return orchard.getNextDistributionId(briber, token);
}

export function getUniqueBribeTokens(gauges: any[]) {
  const bribeTokens = [];
  gauges.forEach((g) => {
    g.currentEpochBribes.forEach((bribe) => {
      if (!bribeTokens.find((t) => t.address === bribe.token.address)) {
        bribeTokens.push(bribe.token);
      }
    });
  });
  // console.log(bribeTokens);
  console.log(`(${bribeTokens.length}) distinct bribe tokens`);

  return bribeTokens;
}

export function generateRewardTree(
  userData: UserInfo[],
  gauge: string,
  token: string,
  totalRewardAmountForToken: number,
) {
  const usersWhoVoted = userData.filter(
    (user) => user.votes.filter((vote) => vote.gauge === gauge).length > 0,
  );

  const userInfo: UserGaugeSnapshotRelativeInfo[] =
    getUserClaimsToAmountForToken(
      usersWhoVoted,
      getVotersTotalWeight(usersWhoVoted),
      token,
      totalRewardAmountForToken,
    );

  // checkDistributionAmounts(userInfo, totalRewardAmountForToken);

  const tree = getMerkleTree(userInfo);

  const userTreeData: UserMerkleSnapshot[] = [];
  for (const user of userInfo) {
    const { values } = getUserProofs(user.user, tree);

    userTreeData.push({
      user: user.user,
      userGaugeRelativeWeight: user.userGaugeRelativeWeight,
      claims: [
        {
          gauge,
          token,
          userRelativeAmount: user.userRelativeAmount,
          values,
        },
      ],
    });
  }

  return {
    root: tree.root,
    tree,
    userTreeData,
  };
}

// function checkDistributionAmounts(
//   userInfo: UserGaugeSnapshotRelativeInfo[],
//   totalRewardAmountForToken: number,
// ) {
//   let totalOwed = 0;
//   userInfo.forEach((user) => {
//     totalOwed += user.userRelativeAmount;
//     const fixedTotal = totalOwed.toFixed(8);
//     totalOwed = parseFloat(fixedTotal);
//     console.log(String(totalOwed).length);
//   });

//   if (totalOwed > totalRewardAmountForToken) {
//     throw new Error(
//       `Amount owed (${totalOwed}) over amount for token (${totalRewardAmountForToken})`,
//     );
//   }

//   if (totalOwed < totalRewardAmountForToken) {
//     console.log(
//       `
//       Amount owed (${totalOwed}) less than amount for token (${totalRewardAmountForToken})
//       `,
//     );
//   }
// }

function getUserClaimsToAmountForToken(
  users: UserInfo[],
  weightBase: number,
  token: string,
  totalRewardAmountForToken: number,
) {
  return users.map((userInfo) => {
    const user = userInfo.user;

    // TODO: Additional requirement to make this even more accurate.
    // Need to factor in what % of their voting power they used also.
    // Eg. 4000/10000(40%). That data is already available here.
    // Just need to adjust the equation further to offset/account for % used also.
    // Otherwise, for example, a person who owns a large veVRTK % could simply
    // vote for all bribed gauges and hog rewards.
    // Those who dedicated more of their voting % should be rewarded accordingly, to.. "total vote power used"

    // "total vote power used" <-- This might be it. Tally up all user power used as well.
    // Then factor that into the equation somehow. (% weight is cut by lack of % used for example)
    // Eg. User has "relative weight" of 10% but only used 50% of their vote power. They get 5%
    // That will leave a gap leading to 100% then
    // Need to fill it in some how. Maybe users who used 100% are then given the difference
    // Eg. Tally up all "reductions" in vote power, then for users who used 100% of their power,
    // distribute the reduction amount amongst them in, some, fashion

    // TODO: How to manage this for UI?

    // Contract does account for this in some way already
    // Multiple distributions are consolidated by token at claim time then
    // "Note that balances to claim are here accumulated *per token*, independent of the distribution channel and
    // claims set accounting."

    // Since distribution id and related info needed are per claim struct,
    // any number of "unassociated" claim structs can be sent as part of claiming
    // Will probably be easiest to integrate snapshot data with backend to manage this cleanly

    // Scale down % a bit for tighter precision here
    const userGaugeRelativeWeight = Number(
      (userInfo.balance.percentOfTotalVE / weightBase).toFixed(16),
    );
    const userRelativeAmount = Number(
      (totalRewardAmountForToken * userGaugeRelativeWeight).toFixed(12),
    );

    return {
      user,
      token,
      userGaugeRelativeWeight,
      userRelativeAmount,
    };
  });
}

function getUserProofs(user: string, tree: StandardMerkleTree<any>) {
  for (const [i, value] of tree.entries()) {
    const proof = tree.getProof(i);
    // Doing string wrap/unwrap to avoid BigInt file write error for now
    value[value.length - 1] = String(value[value.length - 1]);

    if (value[0] === user) {
      return {
        values: {
          proof,
          value,
        },
      };
    }
  }
}

function getMerkleTree(users: UserGaugeSnapshotRelativeInfo[]) {
  const leaves = [];

  users.forEach((user) =>
    leaves.push([user.user, parseUnits(String(user.userRelativeAmount))]),
  );

  // The leaves are double-hashed to prevent second preimage attacks.
  const tree = StandardMerkleTree.of(leaves, ['address', 'uint256']);

  // console.log('Merkle Root:', tree.root);

  return tree;
}

function getVotersTotalWeight(usersWhoVoted: UserInfo[]) {
  // Need to sum up weight of all voters for the gauge
  // Then convert their ve weight into a relative weight for this gauges vote
  let totalWeight = 0;

  usersWhoVoted.forEach((userInfo) => {
    totalWeight += userInfo.balance.percentOfTotalVE;
  });

  return Number(totalWeight.toFixed(18));
}
