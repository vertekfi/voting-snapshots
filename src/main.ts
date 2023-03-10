import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from 'dotenv';
import { jobScheduler } from './services/job-scheduler.service';
import { voteService } from './services/rewards/vote-data.service';
import * as moment from 'moment';
import { formatEther, parseUnits } from 'ethers';
import { runBribeRewardsForEpoch } from './services/rewards/reward-epoch-runner';

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
  // await voteService.doVotingSnapshot(new Date('2023-03-2'));

  await runBribeRewardsForEpoch();
}

bootstrap();
