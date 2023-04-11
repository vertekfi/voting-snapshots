import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from 'dotenv';
import { bscScanService } from './services/standalone/bsc-scan.service';
import { gqlService } from './services/backend/gql.service';
import { doBulkDistributions, getDistributionInfoForBribes } from './user-data';
import * as fs from 'fs-extra';
import { join } from 'path';
import {
  getMerkleOrchard,
  getVertekAdminActions,
} from './utils/contract.utils';
import { GaugeBribeRaw } from './services/backend/generated/vertek-subgraph-types';
import { formatEther, parseUnits } from 'ethers/lib/utils';
import { doTransaction, getSigner } from './utils/web3.utils';
import { approveTokensIfNeeded } from './utils/token.utils';

export const epochs = [
  {
    epoch: 1674691200,
    date: '2023-01-26T00:00:00Z',
    blockNumber: 25105746,
  },
  {
    epoch: 1675296000,
    date: '2023-02-02T00:00:00Z',
    blockNumber: 25304047,
  },
  {
    epoch: 1675900800,
    date: '2023-02-09T00:00:00Z',
    blockNumber: 25502597,
  },
  {
    epoch: 1676505600,
    date: '2023-02-16T00:00:00Z',
    blockNumber: 25702292,
  },
  {
    epoch: 1677110400, // First epoch bribes were able to be created and then voted for starting at 1677715200
    date: '2023-02-23T00:00:00Z',
    blockNumber: 25901363,
  },
  {
    epoch: 1677715200,
    date: '2023-03-02T00:00:00Z',
    blockNumber: 26100819,
  },
  {
    epoch: 1678320000,
    date: '2023-03-09T00:00:00Z',
    blockNumber: 26300371,
  },
  {
    epoch: 1678924800,
    date: '2023-03-16T00:00:00Z',
    blockNumber: 26499942,
  },
  {
    epoch: 1679529600,
    date: '2023-03-23T00:00:00Z',
    blockNumber: 26699047,
  },
  {
    epoch: 1680134400,
    date: '2023-03-30T00:00:00Z',
    blockNumber: 26898870,
  },
  {
    epoch: 1680739200,
    date: '2023-04-06T00:00:00Z',
    blockNumber: 0,
  },
];

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

  // TODO: Do new distributions for last 2/3 weeks
  const epochs = [1679529600, 1680134400, 1680739200];

  const epoch = 1680134400;
  // All user claims have been created for this epoch for all gauges
  // So can go about generating the remainging roots for each bribe/token on all gauges

  // TODO: NOW SYNC OTHER EPOCHS, CREATE DISTRIBUTIONS

  // await gqlService.sdk.GenerateAllGaugesVotingEpochInfo({
  //   epoch,
  // });

  const { getBribesNeedingDistribution: bribes } =
    await gqlService.sdk.GetBribesNeedingDistribution({
      epoch,
    });

  const path = join(process.cwd(), `src/data/distributions/${epoch}.json`);
  fs.ensureFileSync(path);

  // const orchard = getMerkleOrchard();
  // const admin = getVertekAdminActions();

  // const distributions = getDistributionInfoForBribes(bribes);
  // // console.log(distributions[7]);

  // const token = '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56';
  // const amount = '20';

  // let i = 0;
  // for (const dist of distributions) {
  //   try {
  //     // console.log(bribes[i]);
  //     const tx = await admin.callStatic.createBribeDistributions(
  //       orchard.address,
  //       [dist],
  //     );
  //     //  console.log(tx);
  //   } catch (error) {
  //     console.log(i);
  //     console.log(bribes[i]);
  //   }

  //   i++;
  // }

  const tx = await doBulkDistributions(
    bribes.map((bribe) => {
      return {
        briber: bribe.briber,
        tokenAddress: bribe.tokenAddress,
        amount: bribe.amount,
        merkleRoot: bribe.merkleRoot,
      };
    }),
  );

  fs.writeJsonSync(path, tx);

  const data = fs.readJsonSync(path);
  console.log(data.logs.length);

  parseDistributionLogs(data, bribes);
  // console.log(bribes);

  await gqlService.sdk.SetDistributionIds({
    input: bribes.map((bribe) => {
      return {
        bribeId: bribe.id,
        distributionId: bribe.distributionId,
      };
    }),
  });

  // console.log(
  //   formatEther(
  //     await orchard.getRemainingBalance(
  //       token,
  //       '0x59b596e080295F83d67431746f3Eabd70D8A3236',
  //     ),
  //   ),
  // );

  // await approveTokensIfNeeded([token], getSigner().address, orchard.address);

  // await doTransaction(
  //   orchard.operatorAddDistribution(
  //     token,
  //     '0x59b596e080295F83d67431746f3Eabd70D8A3236',
  //     parseUnits(amount),
  //   ),
  // );

  // console.log(
  //   formatEther(
  //     await orchard.getRemainingBalance(
  //       token,
  //       '0x59b596e080295F83d67431746f3Eabd70D8A3236',
  //     ),
  //   ),
  // );
}

bootstrap();

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
