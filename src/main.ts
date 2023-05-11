import { NestFactory } from '@nestjs/core';
import * as fs from 'fs-extra';
import { AppModule } from './app.module';
import { config } from 'dotenv';
import { gqlService } from './services/backend/gql.service';
import {
  getMerkleOrchard,
  getOrchardMulticaller,
  getVertekAdminActions,
} from './utils/contract.utils';
import { GaugeBribeRaw } from './services/backend/generated/vertek-subgraph-types';
import { formatEther, parseUnits } from 'ethers/lib/utils';
import { doTransaction, getSigner } from './utils/web3.utils';
import { join } from 'path';
import { approveTokensIfNeeded } from './utils/token.utils';
import * as moment from 'moment';
import * as schedule from 'node-schedule';
import { logger } from './utils/logger';

async function bootstrap() {
  // App service will load env vars itself
  if (process.env.NODE_ENV !== 'production') {
    config();
  }

  const app = await NestFactory.create(AppModule, {
    logger: false,
  });
  const port = process.env.PORT || 4545;
  await app.listen(port, () => {
    console.log('Listening on: ' + port);
  });

  await runEpochSyncs();

  // // Wednesdays 8PM EST = 12:00AM UTC (on chain uses UTC timestamps)
  // const syncRule = new schedule.RecurrenceRule();
  // syncRule.dayOfWeek = 3; // Wednesday
  // syncRule.hour = 20; // 8PM EST (0 - 23 hours)
  // syncRule.minute = 1;

  // schedule.scheduleJob(syncRule, async function () {
  //   try {
  //     logger.info(`Starting sync job: ${moment().utc().format()}`);
  //     await runEpochSyncs();

  //     logger.success(
  //       `Sync jobs completed successfully: ${moment().utc().format()}`,
  //     );
  //   } catch (error) {
  //     console.log(error);
  //     console.log('Epoch syncs failed.....');
  //   }
  // });

  // logger.success(
  //   `Sync jobs scheduled: Current UTC time ${moment().utc().format()}`,
  // );
}

bootstrap();

async function runEpochSyncs() {
  // Remember the epoch start thing for bribe syncs
  // We need to send in week before voting start for initial syncing
  // Rest of operations should use the actual epochStartTime for the bribe records

  // @note GAUGE AUTOMATION MUST RUN BEFORE THIS TO UPDATE CONTROLLER EPOCH
  // console.log(await gqlService.sdk.SyncEpochs());

  // const { getGaugeEpochs } = await gqlService.sdk.GetGaugeEpochs();
  // const syncStartEpoch = getGaugeEpochs[getGaugeEpochs.length - 4];
  // const voteStartEpoch = getGaugeEpochs[getGaugeEpochs.length - 3];
  // console.log(getGaugeEpochs);
  // console.log('syncStartEpoch:');
  // console.log(syncStartEpoch);
  // console.log('voteStartEpoch:');
  // console.log(voteStartEpoch);

  // console.log(await gqlService.sdk.SyncEpochs());

  // @note GAUGE AUTOMATION MUST RUN BEFORE THIS TO UPDATE CONTROLLER EPOCH
  const { getCurrentGaugesEpoch: currentEpoch } =
    await gqlService.sdk.GetCurrentGaugesEpoch();
  // console.log(`Current epoch: `);
  // console.log(currentEpoch);

  // @note GAUGE AUTOMATION MUST RUN BEFORE THIS TO UPDATE CONTROLLER EPOCH
  // We're getting votes from previous week (after epochs sync update)
  const lastVotingWeek = moment
    .unix(currentEpoch.epoch)
    .utc()
    .subtract(1, 'week')
    .unix();

  // console.log(lastVotingWeek);

  const bribesAddedWeek = moment
    .unix(currentEpoch.epoch)
    .utc()
    .subtract(2, 'week')
    .unix();

  // Syncing bribes ADDED week start of 2023-04-27T00:00:00Z (1682553600)
  // Voting for these bribes starts: 2023-05-04T00:00:00Z (1683158400)
  // console.log(bribesAddedWeek); // 1682553600

  // console.log(
  //   await gqlService.sdk.SyncEpochVotes({
  //     epoch: lastVotingWeek,
  //   }),
  // );

  // Sync start is the week the bribes were added on chain
  // console.log(
  //   await gqlService.sdk.SyncEpochBribes({
  //     epoch: bribesAddedWeek,
  //   }),
  // );

  // console.log(
  //   await gqlService.sdk.GenerateAllGaugesVotingEpochInfo({
  //     epoch: lastVotingWeek,
  //   }),
  // );

  // const { getBribesNeedingDistribution } =
  //   await gqlService.sdk.GetBribesNeedingDistribution({
  //     epoch: lastVotingWeek,
  //   });
  // console.log(getBribesNeedingDistribution);

  // const txPath = join(
  //   process.cwd(),
  //   `src/data/distributions/${lastVotingWeek}.json`,
  // );
  // const distros = getDistributionInfoForBribes(getBribesNeedingDistribution);
  // // TODO: Chunk the inputs to avoid block gas limits in event of larger distros on other chains
  // const tx = await doBulkDistributions(distros);
  // fs.writeJSONSync(txPath, tx);

  // // Will in memory set distribution id with on chain event logs
  // parseDistributionLogs(tx, getBribesNeedingDistribution);

  // const input = getBribesNeedingDistribution.map((dist) => {
  //   return {
  //     bribeId: dist.id,
  //     distributionId: dist.distributionId,
  //   };
  // });

  // console.log(
  //   await gqlService.sdk.SetDistributionIds({
  //     input,
  //   }),
  // );
}

async function doBulkDistributions(
  distributions: {
    merkleRoot: string;
    amount: string;
    briber: string;
    tokenAddress: string;
  }[],
) {
  console.log(`Bulk distribution for (${distributions.length}) total bribes`);

  //  const distributions = getDistributionInfoForBribes(bribes);

  console.log(`
  Distributions:`);
  console.log(distributions);

  const admin = getVertekAdminActions();

  const tx = await doTransaction(
    admin.createBribeDistributions(getMerkleOrchard().address, distributions),
  );

  return tx;
}

function getDistributionInfoForBribes(
  bribes: {
    merkleRoot?: string;
    amount: string;
    briber: string;
    tokenAddress: string;
  }[],
) {
  return bribes.reduce((prev, current) => {
    if (!current.merkleRoot) {
      throw new Error('Missing merkle root');
    }

    prev.push({
      amount: parseUnits(current.amount),
      token: current.tokenAddress,
      briber: current.briber,
      merkleRoot: current.merkleRoot,
    });

    return prev;
  }, []);
}

// Set the distribution id and txHash for each distribution
function parseDistributionLogs(data, bribes: Partial<GaugeBribeRaw>[]) {
  const orchard = getMerkleOrchard();

  // Event logs should index align with distributions
  console.log(`${data.logs.length} = ${bribes.length}`);
  if (data.logs.length !== bribes.length) {
    throw new Error(`data.logs.length !== bribes.length`);
  }

  data.logs.forEach((eventData, idx) => {
    // Use interface to get the data out in human readable form
    const evt = orchard.interface.decodeEventLog(
      'DistributionAdded',
      eventData.data,
      eventData.topics,
    );

    // const briber = `0x${eventData.topics[1].slice(26)}`.toLowerCase();
    // const token = `0x${eventData.topics[2].slice(26)}`.toLowerCase();
    // const merkleRoot = evt.merkleRoot.toLowerCase();

    // const bribe = bribes[idx];
    //   console.log(`
    //   evt[idx]
    //   briber: ${briber}
    //   token: ${token}
    //   merkleRoot: ${merkleRoot}
    // `);

    //   console.log(`
    //     bribes[idx]
    //     briber: ${bribe.briber}
    //     token: ${bribe.token}
    //     merkleRoot: ${bribe.merkleRoot}
    //   `);

    bribes[idx].distributionId = evt.distributionId.toNumber();
    bribes[idx].txHash = data.transactionHash;
  });
}

function getTokenAmountsOwed(
  tokenChecks: string[],
  bribes: { tokenAddress: string; amount: string }[],
) {
  const tokenAmounts = {};

  tokenChecks.forEach((token) => {
    tokenAmounts[token] = bribes
      .filter((b) => b.tokenAddress === token)
      .reduce((prev, current) => (prev += parseFloat(current.amount)), 0);
  });

  return tokenAmounts;
}

async function getBriberBalances(bribers: { briber: string; token: string }[]) {
  const orchard = getMerkleOrchard();
  const multi = getOrchardMulticaller();

  bribers.forEach((briber) => {
    multi.call(
      `${briber.briber}-${briber.token}`,
      orchard.address,
      'getRemainingBalance',
      [briber.token, briber.briber],
    );
  });

  const balances = await multi.execute('getBriberBalances');

  for (const briber in balances) {
    balances[briber] = formatEther(balances[briber]);
  }

  return balances;
}
