import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { parseUnits } from 'ethers';
import {
  UserClaim,
  UserGaugeSnapshotRelativeInfo,
  UserInfo,
  UserMerkleSnapshot,
} from 'src/types/user.types';

export function generateRewardTree(
  userData: UserInfo[],
  gauge: string,
  token: string,
  totalRewardAmountForToken: number,
) {
  const usersWhoVoted = userData.filter(
    (user) => user.votes.filter((vote) => vote.gauge === gauge).length > 0,
  );

  const weightBase = getVotersTotalWeight(usersWhoVoted);
  const userInfo: UserGaugeSnapshotRelativeInfo[] = mapUserInfo(
    usersWhoVoted,
    weightBase,
    token,
    totalRewardAmountForToken,
  );

  const tree = getMerkleTree(userInfo);
  checkDistributionAmounts(userInfo, totalRewardAmountForToken);

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

export function addGaugeRewardForUsers(
  userData: UserMerkleSnapshot[],
  token: string,
  totalRewardAmountForToken: number,
  gauge: string,
) {
  for (const user of userData) {
    const userRelativeAmount = Number(
      (totalRewardAmountForToken * user.userGaugeRelativeWeight).toFixed(18),
    );

    const newClaim: UserClaim = {
      token,
      gauge,
      userRelativeAmount,
      values: {
        proof: [],
        value: [],
      },
    };
    user.claims.push(newClaim);
  }

  return userData;
}

function checkDistributionAmounts(
  userInfo: UserGaugeSnapshotRelativeInfo[],
  totalRewardAmountForToken: number,
) {
  let totalOwed = 0;
  userInfo.forEach((user) => (totalOwed += user.userRelativeAmount));

  if (totalOwed > totalRewardAmountForToken) {
    throw new Error(
      `Amount owed (${totalOwed}) over amount for token (${totalRewardAmountForToken})`,
    );
  }

  if (totalOwed < totalRewardAmountForToken) {
    console.log(
      `
      Amount owed (${totalOwed}) less than amount for token (${totalRewardAmountForToken})
      `,
    );
  }
}

function mapUserInfo(
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
    // Otherwise, for example, a person who owns a large veVRTK % could simply,
    // vote for all bribed gauges and hog rewards.
    // Those who dedicated more of their voting % to rewarded accordingly to.. "total vote power used"

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
      (userInfo.balance.percentOfTotalVE / weightBase).toFixed(14),
    );
    const userRelativeAmount = Number(
      (totalRewardAmountForToken * userGaugeRelativeWeight).toFixed(18),
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

  console.log('Merkle Root:', tree.root);

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
