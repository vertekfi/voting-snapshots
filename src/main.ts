import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from 'dotenv';
import { jobScheduler } from './services/job-scheduler.service';
import { voteService } from './services/rewards/vote-data.service';
import {
  associateBribesToBribers,
  doCreateBribeDistribution,
  generateRewardTree,
  getDistributionInfo,
  getTokenTotalForGaugeBribes,
  getUniqueBribeTokens,
} from './services/rewards/reward-generator.service';
import {
  getBribersData,
  getUserMerkleDistribution,
  getUsersFullData,
  saveEpochDistribution,
  setBribersData,
} from './services/rewards/reward.utils';
import {
  addNewEpochToFile,
  getEpochDir,
  getEpochsFile,
  getWeeksSinceStartEpoch,
} from './utils/epoch.utils';
import * as moment from 'moment';
import { formatEther, parseUnits } from 'ethers';
import { gqlService } from './services/backend/gql.service';
import { LiquidityGauge } from './services/backend/generated/vertek-subgraph-types';
import { UserInfo } from './types/user.types';
import { BigNumber } from '@ethersproject/bignumber';
import { DistributionStruct } from './types/bribe.types';

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

  const epoch = moment().utc().startOf('day').subtract(1, 'week');
  const epochDir = getEpochDir(epoch.unix());

  // Get list of all base params except merkle root setup for createDistribution call
  // So users vote for a gauge, bribers bribe gauge. Gauge link?
  const gauges = await gqlService.getGaugesWithBribes(epoch.unix());
  //  const briberChannelParamsData = await getDistributionInfo(gauges);

  // Get the user reward amounts per gauge
  // Then need the merkle roots for each distribution

  const userData: UserInfo[] = getUsersFullData(epochDir);

  // const tokens = getUniqueBribeTokens(gauges);
  // for (const gauge of gauges) {
  //   const gaugeTokenAmounts = getTokenTotalForGaugeBribes(tokens, gauge);

  //   gaugeTokenAmounts.forEach((ta) => {
  //     const { root } = generateRewardTree(
  //       userData,
  //       gauge.gauge,
  //       ta.token,
  //       ta.totalAmount,
  //     );
  //   });
  // }

  const bribersBribes = associateBribesToBribers(gauges);

  setBribersData(epochDir, bribersBribes);

  for (const briber of bribersBribes) {
    // Account for people doing things like adding the same token, to same gauge,
    // at a later time in the week. (Currently no updateBribe function)

    for (const bribe of briber.bribes) {
      const gauge = bribe.gauge;

      // Do not need to ccount for duplicate users.
      // Users cant change vote for a gauge within 10 days. So all good in this setup then
      bribe.userVotes = userData
        .reduce((prev, current) => {
          current.votes
            .filter((v) => v.gauge === gauge)
            .forEach((uv) => {
              prev.push({
                user: current.user,
                weightUsed: uv.weightUsed,
                gauge,
              });
            });

          return prev;
        }, [])
        .flat();

      // Now run the root generation...
      // Amount has to be per the single bribe for a gauge and not the total briber token amount
      // Since the amount/distribution is associated with the merkle root
      // that contains the users eligible to claim from this amount
      // Contract channel _remainingBalance would get boosted way up artificially
      const { root, userTreeData, tree } = generateRewardTree(
        userData,
        gauge,
        bribe.token,
        parseFloat(bribe.amount),
      );

      bribe.userTreeData = userTreeData;
      bribe.merkleRoot = root;

      // We already have a dist id from total token amount
      // Will probably go extra loose and just do it per gauge instance
      // Probably very infrequent scenario with someone adding the same token for additional brine for same gauge in same epoch
    }
  }

  setBribersData(epochDir, bribersBribes);

  const bribersData = getBribersData(epochDir);
  const structs: DistributionStruct[] = [];

  for (const briber of bribersData) {
    for (const bribe of briber.bribes) {
      structs.push({
        token: bribe.token.address,
        amount: bribe.amount,
        briber: briber.briber,
        merkleRoot: bribe.merkleRoot,
      });

      // bribe.distributionInfo = await doCreateBribeDistribution(
      //   bribe.token.address,
      //   bribe.amount,
      //   bribe.briber,
      //   bribe.merkleRoot,
      // );
    }
  }

  //  console.log(structs);

  // TODO: Verify these roots
  // Could forl test and push this data to the forked orchard. BOOM

  // setBribersData(epochDir, bribersData);
}

bootstrap();
