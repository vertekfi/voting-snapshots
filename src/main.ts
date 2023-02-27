import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from 'dotenv';
import { jobScheduler } from './services/job-scheduler.service';
import { voteService } from './services/rewards/vote-data.service';
import {
  addGaugeRewardForUsers,
  generateRewardTree,
} from './services/rewards/reward-generator.service';
import {
  getUserMerkleDistribution,
  getUsersFullData,
  saveEpochDistribution,
} from './services/rewards/reward.utils';
import {
  addNewEpochToFile,
  getEpochDir,
  getEpochsFile,
  getWeeksSinceStartEpoch,
} from './utils/epoch.utils';
import * as moment from 'moment';
import { formatEther, parseUnits } from 'ethers';

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
  // voteService.doVotingSnapshot(new Date('2023-01-26'));

  const epoch = getEpochsFile()[3];

  const gauge = {
    symbol: '50VRTK-25ETH-25BTC-gauge',
    address: '0x9DAb43a1D850eC820C88a19561C1fD87dEC09193',
    isKilled: false,
    pool: { name: 'The Three Amigos' },
  };

  const { root, tree, userTreeData } = generateRewardTree(
    getUsersFullData(getEpochDir(epoch.start)),
    gauge.address,
    '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // BUSD
    100,
  );

  saveEpochDistribution(
    epoch.start,
    gauge,
    { distributionTxHash: '', root, tree },
    userTreeData,
  );

  let userData = getUserMerkleDistribution(epoch.start, gauge);
  const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
  const bribeAmount = 10;
  userData = addGaugeRewardForUsers(userData, WBNB, bribeAmount, gauge.address);
}

bootstrap();
