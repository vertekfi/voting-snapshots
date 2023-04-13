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
import { doTransaction } from './utils/web3.utils';
import { join } from 'path';
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

  // TODO: Automation flow is
  // SyncEpochs
  // SyncEpochVotes
  // SyncEpochBribes
  // generateAllGaugesVotingEpochInfo
  // getBribesNeedingDistribution
  // bulk distribute
  // update dist id's through backend. SetDistributionIds

  const epoch = 1678924800;

  // console.log(
  //   await gqlService.sdk.SyncEpochVotes({
  //     epoch,
  //   }),
  // );

  // console.log(
  //   await gqlService.sdk.SyncEpochBribes({
  //     epoch,
  //   }),
  // );

  // await gqlService.sdk.GenerateAllGaugesVotingEpochInfo({
  //   epoch,
  // });

  // const { getBribesNeedingDistribution } =
  //   await gqlService.sdk.GetBribesNeedingDistribution({
  //     epoch,
  //   });
  // // console.log(getBribesNeedingDistribution);

  // const orchard = getMerkleOrchard();

  // const nice = '0x59b596e080295F83d67431746f3Eabd70D8A3236';

  // const stables = [
  //   '0x55d398326f99059ff775485246999027b3197955', // USDT
  //   '0xe9e7cea3dedca5984780bafc599bd69add087d56', // BUSD
  //   '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // USDC
  //   '0x90c97f71e18723b0cf0dfa30ee176ab653e89f40', // FRAX
  //   '0x14016e85a25aeb13065688cafb43044c2ef86784', // TUSD
  //   '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3', // DAI
  // ];
  // const excludes = ['0xd50c729cebb64604b99e1243a54e840527360581'];
  // const nope = [...stables, ...excludes];

  // const todos = getBribesNeedingDistribution.filter(
  //   (b) => b.briber === nice && !nope.includes(b.tokenAddress),
  // );

  // console.log(todos.length);

  // const tokenChecks = todos.reduce((prev, current) => {
  //   if (!prev.includes(current.tokenAddress)) prev.push(current.tokenAddress);

  //   return prev;
  // }, []);
  // // console.log(tokenChecks);
  // console.log(getTokenAmountsOwed(tokenChecks, todos));

  // const approveToken = '0xfa4b16b0f63f5a6d0651592620d585d308f749a4';
  // await approveTokensIfNeeded(
  //   [approveToken],
  //   '0x891eFc56f5CD6580b2fEA416adC960F2A6156494',
  //   orchard.address,
  // );
  // await doTransaction(
  //   orchard.operatorAddDistribution(approveToken, nice, parseUnits('11')),
  // );

  // const txPath = join(process.cwd(), `src/data/distributions/${epoch}.json`);

  // const distros = getDistributionInfoForBribes(todos);
  // const tx = await doBulkDistributions(distros);

  // fs.writeJSONSync(txPath, tx);

  // // Will in memory set distribution id with on chain event logs
  // parseDistributionLogs(tx, todos);

  // const input = todos.map((dist) => {
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

bootstrap();

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
