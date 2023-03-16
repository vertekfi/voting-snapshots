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
} from './services/rewards/reward-epoch-runner';
import { getEpochDir } from './utils/epoch.utils';
import { getRpcProvider } from './utils/web3.utils';
import { getMerkleOrchard } from './utils/contract.utils';
import { parseUnits } from '@ethersproject/units';
import {
  getBribeDistributionInfo,
  getBribersData,
  getDistributionData,
  setBribeDistributionInfo,
  setBribersData,
  setUserGaugeBribeClaims,
} from './services/rewards/reward.utils';
import * as fs from 'fs-extra';
import { join } from 'path';

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

  const epoch = moment().utc().startOf('day').subtract(1, 'week');
  const epochDir = getEpochDir(epoch.unix());
  //
  // await voteService.doVotingSnapshot(new Date('2023-03-9'));
  // await runBribeRewardsForEpoch(epoch.unix(), epochDir);
  // await doBulkBribeDistribution(epochDir);

  // Need to aggregate all user claims into one file with dist id

  const bribersBribes = getBribersData(epochDir);

  const distroBribes = getBribeDistributionInfo(epochDir);

  for (const briber of bribersBribes) {
    briber.bribes.forEach((bribe) => {
      bribe.merkleRoot = bribe.users[0].merkleRoot;

      const distroMatch = distroBribes.find(
        (b) =>
          bribe.briber.toLowerCase() === b.briber.toLowerCase() &&
          bribe.token.toLowerCase() === b.token.toLowerCase(),
      );

      if (distroMatch) {
        bribe.distribution = distroMatch.distribution;
        bribe.users.forEach(
          (u) => (u.distributionId = distroMatch.distribution.distributionId),
        );
      }

      // const match = matchBribeRecord(
      //   distroBribes,
      //   bribe.briber,
      //   bribe.token,
      //   bribe.merkleRoot,
      //   bribe.amount,
      // );

      // bribe.distribution = match.distribution;
    });

    setBribersData(epochDir, bribersBribes);
  }

  // Match these to the briber dist records for dist id, to then be able to change the root

  // console.log(bribersBribes[0]);
}

bootstrap();
