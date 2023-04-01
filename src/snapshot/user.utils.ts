import { BigNumber } from 'ethers';
import { formatEther, parseUnits } from 'ethers/lib/utils';
import { eToNumber, getPrecisionNumber } from 'src/utils/utils';
import { getUserBalances } from './data.utils';

const PRECISION = 8;

// weightUsed is per gauge
// Users % of reward they can claim is based on thier % ownership of total VE.
// They are given credit for the amount of voting power they actually used
// for any given vote that they have made.
// Eg. User owns 5% of total ve and used 5000/10000 available voting power on a gauge.
// Their relative weight to other users who voted for that gauge is adjusted to
// be 50% of their voting weight = 2.5% of total ve.
// This is needed to provide a level of "fairness" when determining rewards.
// Otherwise a large holder could simple spread their votes across many gauges and
// end up with the bulk of rewards. While a smaller holder put all of their votes into
// a single gauge (showing more, something). All should be rewarded at proper scale then.
export function getUserAdjustedVePercentForGauge(user) {
  const votePercentUsed = user.weightUsed / 10000;

  // They only get credit for the % of voting power used
  const adjustedVePercentOwned: number =
    votePercentUsed !== 1
      ? user.percentOfTotalVE * votePercentUsed
      : user.percentOfTotalVE;

  // console.log(`user.percentOfTotalVE: ${user.percentOfTotalVE}`);
  // console.log(`user.weightUsed: ${user.weightUsed}`);
  // console.log('votePercentUsed: ' + votePercentUsed);
  // console.log(`userVePercentAdjusted: ${adjustedVePercentOwned}
  // `);

  return getPrecisionNumber(adjustedVePercentOwned, PRECISION);
}

// Get total adjusted weight of voters for a gauge
// Also set it per user object while here
export function getUsersAdjustedTotalWeight(users: any[]) {
  let totalWeightScaled = 0;

  users.forEach((user) => {
    const userAdjustedPercent = getUserAdjustedVePercentForGauge(user);
    user.gaugeAdjustedVePercent = userAdjustedPercent;
    totalWeightScaled = getPrecisionNumber(
      totalWeightScaled + userAdjustedPercent,
      PRECISION,
    );
  });

  // Need a second run to get user % based on the scaled total now
  // users.forEach((user) => {
  //   const userTotalWeightPercentAdjusted = user.gaugeAdjustedVePercent / totalWeightScaled
  //   console.log(`userTotalWeightPercentAdjusted: ${userTotalWeightPercentAdjusted}`)
  // });

  return {
    totalWeightScaled,
    users,
  };
}

export function getUserAmountForToken(
  user,
  totalGaugeUserWeight: number,
  tokenAmount: number,
) {
  const userAmount = getPrecisionNumber(
    tokenAmount * (user.gaugeAdjustedVePercent / totalGaugeUserWeight),
    6,
  );

  let claimAmount: number;
  let claimAmountBN: BigNumber;

  claimAmount = getPrecisionNumber(userAmount, 12);

  if (claimAmount.toString().includes('e')) {
    // Provides error check also
    claimAmountBN = parseUnits(eToNumber(claimAmount));

    claimAmount = parseFloat(formatEther(parseUnits(eToNumber(claimAmount))));
  } else {
    claimAmountBN = parseUnits(String(claimAmount));
    claimAmount = parseFloat(
      formatEther(parseUnits(String(claimAmount.toString()))),
    );
  }

  // console.log(`claimAmountBN: ${claimAmount}
  // `);

  return {
    claimAmount,
    claimAmountBN,
  };
}

export function checkUserAmountForToken(users: any[], tokenAmount: number) {
  let totalVePercent = 0;
  let totalWeightUsed = 0;

  // Ok this seems to work
  // But how to with scaling considered
  // -> total weight should use real total weight. But then users amounts are based on scaled weight
  // That way some % of larger % owners possibly shifts towards lawer % owner
  // Wont get us to full token amount though?...

  let totalReducedWeight = 0;

  users.forEach((user) => {
    totalWeightUsed += user.weightUsed;

    totalVePercent += user.percentOfTotalVE;

    const userWeightBasis = Number(
      ((user.weightUsed / 10000) * user.userGaugeRelativeWeight).toFixed(8),
    );
    const userScaledPercent = 0;
    totalReducedWeight += 0;
  });

  totalVePercent = Number(totalVePercent.toFixed(6)); // TODO: USE THIS This keeps an even (100, 100.27, 0.00023455) under bounds

  let totalOwed = 0;
  let unscaledTotal = 0;

  users.forEach((user) => {
    // userGaugeRelativeWeight = Number(
    //   (userWeightBasis / totalVoteUsersWeightForGauge).toFixed(4),
    // );

    // Try something using the token amount as a different factor or base..?

    user.userGaugeRelativeWeight = Number(
      (user.percentOfTotalVE / totalVePercent).toFixed(8),
    );

    user.userRelativeAmount = Number(
      (tokenAmount * user.userGaugeRelativeWeight).toFixed(8),
    );

    // Give them proportional weight towards rewards
    // TODO: This can be calculated once and then applied to all token amounts..
    const userWeightBasis = Number(
      ((user.weightUsed / 10000) * user.userGaugeRelativeWeight).toFixed(8),
    );

    user.userRelativeAmountScaled = Number(
      (tokenAmount * userWeightBasis).toFixed(8),
    );

    unscaledTotal += user.userRelativeAmountScaled;

    totalOwed += user.userRelativeAmount;
  });

  if (users.length === 4) {
    console.log(`
    `);
    // console.log('tokenAmount: ' + tokenAmount);
    // console.log('User count: ' + users.length);

    // console.log('totalVePercent: ' + totalVePercent);
    // console.log('totalWeightUsed: ' + totalWeightUsed);

    console.log('totalOwed: ' + totalOwed);
    console.log('unscaledTotal: ' + unscaledTotal);
  }

  users.forEach((user, i) => {
    if (users.length === 4) {
      console.log(`
      `);

      console.log(
        `userRelativeAmount (${i}) unscaled: ${user.userRelativeAmount}`,
      );
      console.log(
        `userRelativeAmountScaled (${i}) : ${user.userRelativeAmountScaled}`,
      );
      console.log(
        `userGaugeRelativeWeight (${i}) : ${user.userGaugeRelativeWeight}`,
      );
    }
  });
}

export function getUserClaimAmount(
  user,
  totalVoteUsersWeightForGauge: number,
  totalRewardAmountForToken: number,
) {
  let userWeightBasis = getUserRelativeWeightScaled(user);
  userWeightBasis = Number(userWeightBasis.toFixed(6));

  totalVoteUsersWeightForGauge = Number(
    totalVoteUsersWeightForGauge.toFixed(6),
  );

  const userGaugeRelativeWeight = Number(
    (userWeightBasis / totalVoteUsersWeightForGauge).toFixed(4),
  );

  let userRelativeAmount = (
    totalRewardAmountForToken * userGaugeRelativeWeight
  ).toFixed(10);

  // if (userRelativeAmount.length > 12) {
  //   userRelativeAmount = userRelativeAmount.slice(0, 13);
  // }

  if (userRelativeAmount.includes('e')) {
    userRelativeAmount = eToNumber(userRelativeAmount);
    // Error check
    parseUnits(userRelativeAmount);
  }

  // console.log(`${totalVoteUsersWeightForGauge}`);

  return userRelativeAmount;
}

export function getTotalUseVerWeightForGauge(users: any[]) {
  let totalWeightScaled = 0;

  users.forEach((user) => {
    totalWeightScaled += user.percentOfTotalVE;
  });

  return totalWeightScaled;
}

export function getUserRelativeWeightScaled(user) {
  // Scale users % by amount of voting power they used for the gauge
  // 10000 is max voting power (100% used)

  // User with 10% of total power who uses 5000 of their power for a gauge,
  // has their rewards calculated based on having 5% of total ve
  const userWeightBasis = Number(
    ((user.weightUsed / 10000) * user.percentOfTotalVE).toFixed(12),
  );

  return userWeightBasis;
}

export function getUsersMergedWithBalances(epoch: number, users: any[]) {
  const userBalances = getUserBalances(epoch);

  const votersMergedWithVeInfo = users.map((user) => {
    const balance = userBalances.find((u) => u.user === user.user);

    if (!balance) {
      throw new Error(`User balance missing`);
    }

    return {
      ...user,
      ...balance,
    };
  });

  return votersMergedWithVeInfo;
}
