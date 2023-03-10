import { BigNumber } from '@ethersproject/bignumber';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { parseUnits } from 'ethers';
import { DistributionStruct } from 'src/types/bribe.types';
import {
  UserGaugeSnapshotRelativeInfo,
  UserInfo,
  UserMerkleSnapshot,
} from 'src/types/user.types';
import {
  getMerkleOrchard,
  getMulticall,
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

export async function doCreateBribeDistribution(
  token: string,
  amount: string,
  briber: string,
  merkleRoot: string,
) {
  console.log(`doCreateBribeDistribution: 
  token: ${token}
  amount: ${amount}
  briber: ${briber}`);
  // function createDistribution(
  //   IERC20Upgradeable token,
  //   uint256 amount,
  //   address briber,
  //   uint256 distributionId,
  //   bytes32 merkleRoot
  // )

  const orchard = getMerkleOrchard();

  const distributionId = await orchard.getNextDistributionId(briber, token);

  // const txReceipt = await doTransaction(
  //   orchard.createDistribution(
  //     token,
  //     parseUnits(amount),
  //     briber,
  //     distributionId,
  //     merkleRoot,
  //   ),
  // );

  return {
    distributionId: distributionId.toNumber(),
    token,
    amount,
    briber,
    merkleRoot,
    //  txReceipt
  };
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
      bribes: bribes.filter((b) => b.briber === briber),
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
  const usersWhoVoted = userData.filter((user) => {
    return user.votes.filter((vote) => vote.gauge === gauge).length > 0;
  });

  const userInfo: UserGaugeSnapshotRelativeInfo[] =
    getUserClaimsToAmountForToken(
      usersWhoVoted,
      getVotersTotalWeightForGauge(usersWhoVoted),
      token,
      totalRewardAmountForToken,
    );

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

function getUserClaimsToAmountForToken(
  users: UserInfo[],
  totalVoteUsersWeightForGauge: number,
  token: string,
  totalRewardAmountForToken: number,
) {
  return users.map((userInfo) => {
    const user = userInfo.user;

    console.log(userInfo.votes);

    // User vote %'s should be factored into how much they get
    // scale down percentOfTotalVE?
    //  fuck it for these epoch assuming wont be gamed yet and get them their shit asap..?

    // Scale down % a bit for tighter precision here
    const userGaugeRelativeWeight = Number(
      (
        userInfo.balance.percentOfTotalVE / totalVoteUsersWeightForGauge
      ).toFixed(16),
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
    console.log(user);
    console.log(proof);
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
export function getVotersTotalWeightForGauge(usersWhoVoted: UserInfo[]) {
  // Need to sum up weight of all voters for the gauge
  // Then convert their ve weight into a relative weight for this gauges vote
  let totalWeight = 0;

  usersWhoVoted.forEach((userInfo) => {
    totalWeight += userInfo.balance.percentOfTotalVE;
  });

  return Number(totalWeight.toFixed(18));
}
