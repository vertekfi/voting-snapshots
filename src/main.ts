import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from 'dotenv';
import { jobScheduler } from './services/job-scheduler.service';
import { voteService } from './services/rewards/vote-data.service';
import {
  associateBribesToBribers,
  generateRewardTree,
  getDistributionInfo,
  getNextDistributionId,
  getTokenTotalForGaugeBribes,
  getUniqueBribeTokens,
} from './services/rewards/reward-generator.service';
import {
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
  // function createDistribution(
  //   IERC20Upgradeable token,
  //   uint256 amount,
  //   address briber,
  //   uint256 distributionId,
  //   bytes32 merkleRoot
  // )

  // Get list of all base params except merkle root setup for createDistribution call
  // So users vote for a gauge, bribers bribe gauge. Gauge link?
  const gauges = await gqlService.getGaugesWithBribes(epoch.unix());
  const briberChannelParamsData = await getDistributionInfo(gauges);

  // Get the user reward amounts per gauge
  // Then need the merkle roots for each distribution

  // TODO: Need to do tokens => gauge(for root) => briber <=> briber => tokens => dist

  const userData: UserInfo[] = getUsersFullData(epochDir);

  // So different bribers can bribe the same gauge with the same token
  // So we need total amount for each token, regardless of bribers
  // To then allocate per user, per total amount of each unique token, for the gauge
  // Need gauges total amount for token for distribution
  // const tokens = getUniqueBribeTokens(gauges);
  // for (const gauge of gauges) {
  //   const gaugeTokenAmounts = getTokenTotalForGaugeBribes(tokens, gauge);
  //   // console.log(gaugeTokenAmounts);

  //   gaugeTokenAmounts.forEach((ta) => {
  //     // How to associate this root to the briber dist call?
  //     // Get the bribers gauges, and only include users who voted for their specific gauges in the tree?
  //     // What does that look like?

  //     const { root } = generateRewardTree(
  //       userData,
  //       gauge.gauge,
  //       ta.token,
  //       ta.totalAmount,
  //     );

  //     // Need to match the briber to the.. roots
  //     // Users have a claim

  //     // for each gauge
  //     // get its bribes
  //     // user roots (per token to claim***)
  //     // In the end users are concerned with tokens to claim
  //     // contract needs the briber for the channel purpose
  //     // The tree creation gives them a claim to some total amount of, one, token
  //     // The briber only needed for channel dist. Ohhh we have total amount of token for the briber, for "this"
  //     // particular distribution(based on their bribes using, that, token)
  //     // Has to be per briber
  //     // User claims require a sitribution id
  //     // So it does all actually tie together properly
  //     // Focus on dist, not users. Users are in the tree, for, the distribution(s).(Because they voted for that bribers gauge(s) in some way)
  //   });
  // }

  const bribersBribes = associateBribesToBribers(gauges);

  // console.log(bribersBribes);

  for (const briber of bribersBribes) {
    // Get unique gauge instances
    // Get briber/gauge/token sets
    // Account for people doing things like adding the same token, to same gauge, at a later time in the week. (Currently no updateBribe function)

    briber.gaugeList = briber.bribes.reduce((prev, current) => {
      if (!prev.includes(current.gauge)) {
        prev.push(current.gauge);
      }

      return prev;
    }, []);

    for (const bribe of briber.bribes) {
      const gauge = bribe.gauge;

      // TODO: Account for dup users.. cant vote for a gauge within 10 days tho..hmm. Maybe all good then
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

      //  Now run the root generation...

      const { root, userTreeData } = generateRewardTree(
        userData,
        gauge,
        bribe.token,
        parseFloat(bribe.amount), // Just amount for bribe?
      );

      console.log('Briber: ' + briber.briber);
      console.log(root);

      bribe.userTreeData = userTreeData;

      // TODO: Get dist id and increment from there for each
      // const distributionId = await getNextDistributionId(
      //   bribe.briber,
      //   bribe.token,
      // );
    }
  }

  setBribersData(epochDir, bribersBribes);
}

bootstrap();
