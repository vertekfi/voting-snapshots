import * as fs from 'fs-extra';
import { join } from 'path';
import { parseUnits } from 'ethers/lib/utils';
import {
  getMerkleOrchard,
  getVertekAdminActions,
} from './utils/contract.utils';
import { doTransaction } from './utils/web3.utils';

export async function doBulkDistributions(
  bribes: {
    merkleRoot: string;
    amount: string;
    briber: string;
    tokenAddress: string;
  }[],
) {
  console.log(`Bulk distribution for (${bribes.length}) total bribes`);

  const distributions = getDistributionInfoForBribes(bribes);

  console.log(`
  Distributions:`);
  console.log(distributions);

  const admin = getVertekAdminActions();

  const tx = await doTransaction(
    admin.createBribeDistributions(getMerkleOrchard().address, distributions),
  );

  return tx;
}

export function getDistributionInfoForBribes(
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
function parseDistributionLogs(
  distPath: string,
  bribes: any[],
  epochDir: string,
) {
  const data = fs.readJsonSync(distPath);
  const orchard = getMerkleOrchard();

  // Event logs should index align with distributions
  console.log(`${data.events.length} = ${bribes.length}`);
  if (data.events.length !== bribes.length) {
    throw new Error(`data.events.length !== bribes.length`);
  }

  data.events.forEach((eventData, idx) => {
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

    bribes[idx].distribution = {
      distributionId: evt.distributionId.toNumber(),
      txHash: data.transactionHash,
    };
  });

  fs.writeJSONSync(join(epochDir, 'bribers-data.json'), bribes);
}
