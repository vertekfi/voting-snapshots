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
import { getMerkleOrchard } from './utils/contract.utils';
import { parseUnits } from '@ethersproject/units';
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
  postProcessUserAmounts,
} from './services/rewards/reward-generator.service';
import { bscScanService } from './services/standalone/bsc-scan.service';

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

  // jobScheduler.init();

  const date = new Date('2023-03-16');
  const epochStart = moment(date).utc().unix();
  const epochDir = getEpochDir(epochStart);

  // await voteService.doVotingSnapshot(date);
  // await runBribeRewardsForEpoch(epochStart, epochDir);
  // await doBulkBribeDistribution(epochDir);
  // joinDistributionsToUsers(epochDir);

  // updateDistributions(epochDir);
}

bootstrap();
