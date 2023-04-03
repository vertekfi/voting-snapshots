import { BigNumber } from '@ethersproject/bignumber';
import { parseUnits } from 'ethers/lib/utils';
import { DistributionStruct } from 'src/types/bribe.types';
import {
  getMerkleOrchard,
  getMulticaller,
  getVertekAdminActions,
} from 'src/utils/contract.utils';
import { doTransaction } from 'src/utils/web3.utils';

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

export async function doDistributions(structs: DistributionStruct[]) {
  const formatted = structs.map((s) => {
    return {
      ...s,
      amount: parseUnits(s.amount),
    };
  });
  const adminHelper = getVertekAdminActions();
  await doTransaction(adminHelper.createBribeDistributions(formatted));
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
      // Get the user reward/bribers total amount for each unique token across all bribes
      // This is the way distributions are created contract side
      // Not with users(besides root) or gauges considered
      const tokenAmount = getListOfAllBribes(gauges)
        .filter((b) => b.briber === briber && b.token.address === tkId[0])
        .reduce((prev, cur) => prev + parseFloat(cur.amount), 0);

      distributions.push({
        briber,
        token: tkId[0],
        // distributionId: tkId[1],
        tokenAmount: parseUnits(String(tokenAmount)),
        // merkleRoot: '',
        // votingUsers: [],
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
      bribes: bribes
        .filter((b) => b.briber === briber)
        .map((b) => {
          return {
            ...b,
            token: b.token.address,
          };
        }),
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

  console.log(`(${bribeInstances.length}) unique bribe instances`);

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
  const multi = getMulticaller([
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

export function getUserClaimsToAmountForToken(
  users: any[],
  totalVoteUsersWeightForGauge: number,
  totalRewardAmountForToken: number,
) {
  return users.map((userInfo) => {
    return getUserClaimAmount(
      userInfo,
      totalVoteUsersWeightForGauge,
      totalRewardAmountForToken,
    );
  });
}

export function getUserClaimAmount(
  userInfo,
  totalVoteUsersWeightForGauge: number,
  totalRewardAmountForToken: number,
) {
  const user = userInfo.user;
  const precision = 12;

  // Scale down % a bit for tighter precision here
  const userGaugeRelativeWeight = Number(
    (userInfo.percentOfTotalVE / totalVoteUsersWeightForGauge).toFixed(
      precision,
    ),
  );

  let userRelativeAmount = (
    totalRewardAmountForToken * userGaugeRelativeWeight
  ).toFixed(precision);

  if (userRelativeAmount.includes('e')) {
    userRelativeAmount = eToNumber(userRelativeAmount);
    // Error check
    parseUnits(userRelativeAmount);
  }

  return {
    user,
    userGaugeRelativeWeight,
    userRelativeAmount,
    ...userInfo,
  };
}

export function getVotersTotalWeightForGauge(usersWhoVoted: any[]) {
  // Need to sum up weight of all voters for the gauge
  // Then convert their ve weight into a relative weight for this gauges vote
  let totalWeight = 0;

  // TODO: Use % of 10000 used in calc for relative weight
  // Eg. user uses 5000 of 10000, reduce relative weight by 50%.. BOOOOMMM

  // (weightUsed / 10000) * userInfo.percentOfTotalVE

  usersWhoVoted.forEach((userInfo) => {
    // totalWeight += (userInfo.weightUsed / 10000) * userInfo.percentOfTotalVE;
    totalWeight += userInfo.percentOfTotalVE;
  });

  return Number(totalWeight.toFixed(12));
}

export function eToNumber(num) {
  function r() {
    return w.replace(new RegExp(`^(.{${pos}})(.)`), `$1${dot}$2`);
  }

  let sign = '';
  (num += '').charAt(0) == '-' && ((num = num.substring(1)), (sign = '-'));
  let arr = num.split(/[e]/gi);
  if (arr.length < 2) return sign + num;
  let dot = (0.1).toLocaleString().substr(1, 1),
    n = arr[0],
    exp = +arr[1],
    w = (n = n.replace(/^0+/, '')).replace(dot, ''),
    pos = n.split(dot)[1] ? n.indexOf(dot) + exp : w.length + exp,
    L = pos - w.length,
    s = '' + BigInt(w);
  w =
    exp >= 0
      ? L >= 0
        ? s + '0'.repeat(L)
        : r()
      : pos <= 0
      ? '0' + dot + '0'.repeat(Math.abs(pos)) + s
      : r();
  L = w.split(dot);
  if ((L[0] == 0 && L[1] == 0) || (+w == 0 && +s == 0)) w = 0; //** added 9/10/2021

  return sign + w;
}
