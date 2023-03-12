import { parseUnits } from 'ethers/lib/utils';
import * as moment from 'moment';
import { UserInfo } from 'src/types/user.types';
import {
  getMerkleOrchard,
  getVertekAdminActions,
} from 'src/utils/contract.utils';
import { getEpochDir } from 'src/utils/epoch.utils';
import { doTransaction, sleep } from 'src/utils/web3.utils';
import { gqlService } from '../backend/gql.service';
import {
  associateBribesToBribers,
  generateRewardTree,
} from './reward-generator.service';
import {
  getBribersData,
  getUsersFullData,
  getVotesForUser,
  setBribersData,
} from './reward.utils';

export async function runBribeRewardsForEpoch() {
  const epoch = moment().utc().startOf('day').subtract(9, 'days');
  const epochDir = getEpochDir(epoch.unix());

  const gauges = await gqlService.getGaugesWithBribes(epoch.unix());
  //  const briberChannelParamsData = await getDistributionInfo(gauges);
  const userData: UserInfo[] = getUsersFullData(epochDir);
  const bribersBribes = associateBribesToBribers(gauges);

  setBribersData(epochDir, bribersBribes);

  for (const briber of bribersBribes) {
    for (const bribe of briber.bribes) {
      const gauge = bribe.gauge;

      bribe.userVotes = userData.filter(
        (u) => u.votes.filter((uv) => uv.gauge === gauge).length > 0,
      );

      const { root, userTreeData } = generateRewardTree(
        bribe.userVotes,
        gauge,
        bribe.token,
        parseFloat(bribe.amount),
        epochDir,
      );

      bribe.userTreeData = userTreeData;
      bribe.merkleRoot = root;

      setBribersData(epochDir, bribersBribes);
    }
  }

  // TODO: 0x25270EEae3ad2c6780Bda16Dd24933d416454B01 has no proof array
}

function getGaugeVoters(userData: any[], gauge: string) {
  return userData
    .reduce((prev, current) => {
      current.votes
        .filter((v) => v.gauge === gauge)
        .forEach((uv) => {
          prev.push({
            user: current.user,
            weightUsed: uv.weightUsed,
            gauge,
            ...current,
          });
        });

      return prev;
    }, [])
    .flat();
}

export async function createDistributions() {
  const epoch = moment().utc().startOf('day').subtract(9, 'days');
  const epochDir = getEpochDir(epoch.unix());
  const bribers = getBribersData(epochDir);

  const briberIndex = 0;
  const bribersToRun = [bribers[briberIndex]];

  for (const briber of bribersToRun) {
    console.log(`Briber has (${briber.bribes.length}) bribes to distribute`);

    for (const bribe of briber.bribes) {
      if (bribe.distribution) {
        console.log('Bribe already has distribution info');
        continue;
      }

      const token = bribe.token.address;
      const amount = bribe.amount;
      const distributor = briber.briber;
      const merkleRoot = bribe.merkleRoot;

      const data = await doCreateBribeDistribution(
        token,
        amount,
        distributor,
        merkleRoot,
      );

      console.log('Distribution successful');

      bribe.distribution = data;

      setBribersData(epochDir, bribers);
    }
  }
}

export async function doCreateBribeDistribution(
  token: string,
  amount: string,
  briber: string,
  merkleRoot: string,
) {
  console.log(`doCreateBribeDistribution: 
  token:      ${token}
  amount:     ${amount}
  briber:     ${briber}
  merkleRoot: ${merkleRoot}`);
  // function createDistribution(
  //   IERC20Upgradeable token,
  //   uint256 amount,
  //   address briber,
  //   uint256 distributionId,
  //   bytes32 merkleRoot
  // )

  const orchard = getMerkleOrchard();
  const distributionId = await orchard.getNextDistributionId(token, briber);

  const txReceipt = await doTransaction(
    orchard.createDistribution(
      token,
      parseUnits(amount),
      briber,
      distributionId,
      merkleRoot,
    ),
  );

  return {
    distributionId: distributionId.toNumber(),
    token,
    amount,
    briber,
    merkleRoot,
    txReceipt,
  };
}
