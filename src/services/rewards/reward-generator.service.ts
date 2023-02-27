import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { parseUnits } from 'ethers';
import { UserInfo } from 'src/types/user.types';

export function generateRewardTree(
  userData: UserInfo[],
  epochTimestamp: number,
  gauge: string,
  token: string,
  totalRewardAmountForToken: number,
) {
  const users = userData.filter(
    (user) => user.votes.filter((vote) => vote.gauge === gauge).length > 0,
  );

  const values = [];

  // Need to sum up weight of all voters for the gauge
  // Then convert their ve weight into a relative weight for this gauges vote

  let totalWeight = 0;
  users.forEach((userInfo) => {
    totalWeight += userInfo.balance.percentOfTotalVE;
  });

  const weightBase = Number(totalWeight.toFixed(18));
  let totalOwed = 0;

  const userInfo = users.map((userInfo) => {
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

    // Scale down % a bit for tighter precision here
    const userGaugeRelativeWeight = Number(
      (userInfo.balance.percentOfTotalVE / weightBase).toFixed(14),
    );
    const userRelativeAmount = Number(
      (totalRewardAmountForToken * userGaugeRelativeWeight).toFixed(18),
    );

    totalOwed += userRelativeAmount;

    // This is a "leaf" in the tree that will get hashed
    //user => amount owed
    values.push([
      user,
      // epochTimestamp,
      // gauge,
      // token,
      parseUnits(String(userRelativeAmount)),
    ]);

    return {
      user,
      userGaugeRelativeWeight,
      userRelativeAmount,
    };
  });

  // The leaves are double-hashed to prevent second preimage attacks.
  const tree = StandardMerkleTree.of(values, [
    'address',
    'uint256',
    // 'address',
    // 'address',
    // 'uint256',
  ]);

  console.log('Merkle Root:', tree.root);

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

  const userTreeData = [];

  for (const [i, value] of tree.entries()) {
    const proof = tree.getProof(i);
    // TODO: Handle this. Doing string wrap/unwrap to avoid BigInt file write error for now
    value[value.length - 1] = String(value[value.length - 1]);
    const user = userInfo.find((u) => u.user === value[0]);

    userTreeData.push({
      user: user.user,
      gauge,
      token,
      userGaugeRelativeWeight: user.userGaugeRelativeWeight,
      userRelativeAmount: user.userRelativeAmount,

      values: {
        proof,
        value,
      },
    });
  }

  return {
    root: tree.root,
    tree,
    userTreeData,
  };
}
