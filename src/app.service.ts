import { Contract } from '@ethersproject/contracts';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Injectable } from '@nestjs/common';
import * as ControllerAbi from './abis/GaugeController.json';
import * as fs from 'fs-extra';
import { formatEther } from 'ethers';
import { join } from 'path';

const dataPath = join(process.cwd(), 'src/data/'); // Can't do this on app service can we? database it

@Injectable()
export class AppService {
  readonly provider: JsonRpcProvider;
  readonly gaugeController: Contract;

  constructor() {
    this.provider = new JsonRpcProvider(process.env.BSC_RPC);
    this.gaugeController = new Contract(
      '0x99bFf5953843A211792BF3715b1b3b4CBeE34CE6',
      ControllerAbi,
      this.provider,
    );
  }

  async doVotingSnapshot(timestamp: number) {
    //  log VoteForGauge(block.timestamp, _user, _gauge_addr, _user_weight)
    // const bscBlockTime = 3; // seconds

    const fileName = `${Date.now()}.json`;
    const filePath = join(dataPath, fileName);
    fs.createFileSync(filePath);
    fs.writeJSONSync(filePath, []);

    const currentBlock = await this.provider.getBlockNumber();
    // const blocksPerWeek = 201600; // (86400 * 7) / bscBlockTime;

    const blockRange = 5000; // higher?
    const maxIterations = 20;
    let startBlock = 25308693;
    let endBlock = startBlock + 5000;
    let iteration = 0;

    while (iteration <= maxIterations && startBlock <= currentBlock) {
      const filter = this.gaugeController.filters.VoteForGauge();
      const data = await this.gaugeController.queryFilter(
        filter,
        startBlock,
        endBlock,
      );

      const events = [];
      if (data.length) {
        data.forEach((vote) => {
          // const args = vote.args;
          events.push({
            who: vote.args.user,
            when: new Date(vote.args.time.toNumber() * 1000).toUTCString(),
            whenTimestamp: vote.args.time.toNumber(),
            // will need the users actual ve % for snapshots
            // multicall balance on voting escrow and total weight at a specific time
            weightUsed: vote.args.weight.toNumber(),
            gauge: vote.args.gauge_addr,
            blockNumber: vote.blockNumber,
            txHash: vote.transactionHash,
          });
        });

        const records: any[] = fs.readJSONSync(filePath);
        fs.writeJSONSync(filePath, records.concat(events));
      }

      console.log(`${data.length} records found`);

      startBlock = endBlock + 1;
      endBlock = startBlock + blockRange;

      iteration++;
    }
  }

  private async getBlockNumberForTime() {
    const bscBlockTime = 3; // seconds
    const blocksPerWeek = 201600; // (86400 * 7) / 3;
    // const currentBlockTime = await this.provider.getBlock(
    //   await this.provider.getBlockNumber(),
    // );

    const currentBlock = await this.provider.getBlockNumber();
    const blocksToGoBack = currentBlock - blocksPerWeek;
    return blocksToGoBack;
  }

  private async getEpochStartTime() {
    const totalTime = await this.gaugeController.time_total();
    const epochTime = totalTime.toNumber();
    return epochTime;
  }
}
