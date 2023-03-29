import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from 'dotenv';
import { jobScheduler } from './services/job-scheduler.service';
import { voteService } from './services/rewards/vote-data.service';
import * as moment from 'moment';
import {
  attachUserProofs,
  doBulkBribeDistribution,
  getAllBribesFlattened,
  getBribeMerkleTree,
  getClaimFileName,
  groupUsersByTokenForDistributionPrep,
  runBribeRewardsForEpoch,
  matchBribeRecord,
  joinDistributionsToUsers,
  updateDistributions,
} from './services/rewards/reward-epoch-runner';
import { getEpochDir, getStartOfThisWeekUTC } from './utils/epoch.utils';
import { doTransaction, getRpcProvider } from './utils/web3.utils';
import { getMerkleOrchard, getMulticall } from './utils/contract.utils';
import { formatEther, parseUnits } from '@ethersproject/units';
import {
  getBribeDistributionInfo,
  getBribersData,
  getDistributionData,
  getUsersGaugeVotes,
  setBribeDistributionInfo,
  setBribersData,
  setUserGaugeBribeClaims,
} from './services/rewards/reward.utils';
import * as fs from 'fs-extra';
import { join } from 'path';
import {
  getUserClaimAmount,
  getVotersTotalWeightForGauge,
} from './services/rewards/reward-generator.service';
import { bscScanService } from './services/standalone/bsc-scan.service';
import { gqlService } from './services/backend/gql.service';
import { BigNumber, Contract } from 'ethers';
import { getEventData } from './utils/event-scraping';
import { getAddress } from 'ethers/lib/utils';
import { pullUserData } from './user-data';

export const epochs = [
  {
    epoch: 1674691200,
    date: '2023-01-26T00:00:00Z',
    blockNumber: 25105745,
  },
  {
    epoch: 1675296000,
    date: '2023-02-02T00:00:00Z',
    blockNumber: 25304046,
  },
  {
    epoch: 1675900800,
    date: '2023-02-09T00:00:00Z',
    blockNumber: 25502596,
  },
  {
    epoch: 1676505600,
    date: '2023-02-16T00:00:00Z',
    blockNumber: 25702291,
  },
  {
    epoch: 1677110400,
    date: '2023-02-23T00:00:00Z',
    blockNumber: 25901363,
  },
  {
    epoch: 1677715200,
    date: '2023-03-02T00:00:00Z',
    blockNumber: 26100818,
  },
  {
    epoch: 1678320000,
    date: '2023-03-09T00:00:00Z',
    blockNumber: 26300370,
  },
  {
    epoch: 1678924800,
    date: '2023-03-16T00:00:00Z',
    blockNumber: 26499941,
  },
  {
    epoch: 1679529600,
    date: '2023-03-23T00:00:00Z',
    blockNumber: 26699046,
  },
  // {
  //   epoch: 1680134400,
  //   date: '2023-03-30T00:00:00Z',
  //   blockNumber: 0,
  // },
];

async function bootstrap() {
  // App service will load env vars itself
  if (process.env.NODE_ENV !== 'production') {
    config();
  }

  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 4545;
  await app.listen(port, () => {
    console.log('Listening on: ' + port);
  });

  await pullUserData('0x4a895D96c988ac0d47de1aE4E6F20Dfc5fB51c2A');

  // jobScheduler.init();

  // const date = new Date('2023-03-16');
  // const epochStartTime = moment(date).utc().unix();
  // const epochDir = getEpochDir(epochStartTime);

  // TODO: Only still the user balance part for the voting snapshot since the backend syncs
  // await voteService.doVotingSnapshot(date);
  // await runBribeRewardsForEpoch(epochStartTime, epochDir);
  // await doBulkBribeDistribution(epochDir);
  // joinDistributionsToUsers(epochDir);
  // updateDistributions(epochDir);
}

bootstrap();

async function getBriberRemainingBalances(epochDir: string) {
  const orchard = getMerkleOrchard();
  const info = getBribeDistributionInfo(epochDir);
  // console.log(info);
  const bribers = [];
  const tokens = info.reduce((prev, current) => {
    if (!prev.includes(current.token)) {
      prev.push(current.token);
    }

    if (!bribers.includes(current.briber)) {
      bribers.push(current.briber);
    }

    return prev;
  }, []);

  console.log(bribers);
  console.log(tokens);

  const multi = getMulticall([
    `
  function getRemainingBalance(
    address token,
    address briber
  ) external view returns (uint256)`,
  ]);

  bribers.forEach((briber) => {
    tokens.forEach((token) => {
      multi.call(`${briber}.${token}`, orchard.address, 'getRemainingBalance', [
        token,
        briber,
      ]);
    });
  });

  const data = await multi.execute<
    Record<string, { [token: string]: BigNumber }>
  >('');
  console.log(data);

  const balances = Object.entries(data).map((bribeInfo) => {
    const [briber, tokenInfo] = bribeInfo;

    const tokens = [];
    for (const token in tokenInfo) {
      tokens.push({
        token,
        amount: formatEther(tokenInfo[token]),
      });
    }

    return {
      briber,
      tokens,
    };
  });

  console.log(balances);

  return balances;
}
