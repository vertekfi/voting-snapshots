import { Contract } from '@ethersproject/contracts';
import { JsonRpcProvider } from '@ethersproject/providers';
import * as ControllerAbi from '../../abis/GaugeController.json';
import * as fs from 'fs-extra';
import { join } from 'path';
import * as moment from 'moment';
import { getMulticall } from '../../utils/contract.utils';
import { csvService } from '../standalone/csv.service';
import { bscScanService } from '../standalone/bsc-scan.service';
import { gqlService } from '../backend/gql.service';
import { Gauge } from 'src/types/gauge.types';
import {
  UserBaseVoteInfo,
  UserBalanceInfo,
  UserBalanceData,
  UserGaugeVotes,
  UserInfo,
} from 'src/types/user.types';
import { getEventData } from '../../utils/event-scraping';
import {
  getEpochDir,
  getEpochRangeLabel,
  getGaugeFileName,
} from 'src/utils/epoch.utils';
import {
  getUserAddresses,
  getRawVotesEventData,
  getUsersGaugeVotes,
  getUserBalances,
  getUsersFullData,
  userBalanceFile,
  rawVotesFile,
  userDataFile,
  userVotesFile,
  voterAddressesFile,
} from './reward.utils';
import { config } from 'dotenv';
import { formatEther } from 'ethers/lib/utils';

const veABI = [
  'function balanceOf(address, uint256) public view returns (uint256)',
  'function totalSupply(uint256 timestamp) public view returns (uint256)',
];

export class VoteDataService {
  readonly provider: JsonRpcProvider;
  readonly gaugeController: Contract;
  readonly votingEscrow: Contract;
  readonly feeDistributor: Contract;

  constructor() {
    config();
    this.provider = new JsonRpcProvider(process.env.BSC_RPC);
    this.gaugeController = new Contract(
      '0x99bFf5953843A211792BF3715b1b3b4CBeE34CE6',
      ControllerAbi,
      this.provider,
    );

    this.votingEscrow = new Contract(
      '0x98A73443fb00EDC2EFF0520a00C53633226BF9ED',
      veABI,
      this.provider,
    );

    this.feeDistributor = new Contract(
      '0x1ac7c3C34d03f0b4E97FB4a3F08dF4DE6989FfB3',
      ['function getTimeCursor() public view returns (uint256)'],
      this.provider,
    );
  }

  // Automation can pass in after a new epoch starts
  async doVotingSnapshot(startDate: Date, upToCurrentBlock?: boolean) {
    // TODO: Need to get bribe data from backend to calc user rewards
    // That will be used to submit root hash to claim contract then

    const epochStart = moment(startDate).utc().startOf('day');

    let epochEnd;

    if (upToCurrentBlock) {
      // get current block time
      const block = await this.provider.getBlock(
        await this.provider.getBlockNumber(),
      );

      epochEnd = moment.unix(block.timestamp).utc();
    } else {
      epochEnd = moment(epochStart).utc().add(1, 'week');
    }

    console.log(
      `Running for epoch: ${epochStart.format()} - ${epochEnd.format()}`,
    );

    // Still overwrite the full weeks data regardless
    const epochDirectoryName = getEpochRangeLabel(epochStart.unix());
    const currentEpochDataDir = getEpochDir(epochStart.unix());
    fs.ensureDirSync(currentEpochDataDir);

    // Check how high this can go to save calls
    // Default BSC RPC is capped at 2000. Quicknode accepts this 5000+ at least
    const blockReadRange = 5000;

    const startingBlockNumber = await bscScanService.getBlockNumberByTimestamp(
      epochStart.unix(),
    );

    const endBlockNumber = await bscScanService.getBlockNumberByTimestamp(
      epochEnd.unix(),
    );

    console.log(
      `Initial blocks = start: ${startingBlockNumber} - end: ${endBlockNumber}`,
    );

    await this.getVotingEventData(
      startingBlockNumber,
      endBlockNumber,
      blockReadRange,
      currentEpochDataDir,
    );

    this.filterUniqueUsers(currentEpochDataDir);
    await this.saveUserEpochBalances(epochEnd.unix(), currentEpochDataDir);
    this.joinUsersToVotes(currentEpochDataDir);
    this.joinUserBalanceInfo(currentEpochDataDir);

    const gauges = await gqlService.getGauges();

    for (const gauge of gauges) {
      this.saveVotesForGaugeJSON(currentEpochDataDir, gauge);
      this.saveVotesForGaugeCSV(currentEpochDataDir, gauge, epochDirectoryName);
    }
  }

  // Need to scrape events
  async getVotingEventData(
    startBlockInPast: number,
    upToBlock: number,
    blockReadRange: number,
    currentEpochDataDir: string,
  ) {
    const filePath = join(currentEpochDataDir, rawVotesFile);
    fs.createFileSync(filePath);
    fs.writeJSONSync(filePath, []);

    await getEventData(
      this.gaugeController,
      'VoteForGauge',
      startBlockInPast,
      upToBlock,
      blockReadRange,
      (evt) => {
        const weightUsed = evt.args.weight.toNumber();

        // Skip people removing their vote for the gauge
        if (weightUsed > 0) {
          const voteData = {
            who: evt.args.user,
            when: new Date(evt.args.time.toNumber() * 1000).toUTCString(),
            whenTimestamp: evt.args.time.toNumber(),
            // will need the users actual ve % for snapshots
            // multicall balance on voting escrow and total weight at a specific time
            weightUsed: evt.args.weight.toNumber(),
            gauge: evt.args.gauge_addr,
            blockNumber: evt.blockNumber,
            txHash: evt.transactionHash,
          };

          const records: any[] = fs.readJSONSync(filePath);
          records.push(voteData);
          fs.writeJSONSync(filePath, records);
        }
      },
    );
  }

  private filterUniqueUsers(currentEpochDataDir: string) {
    // could just use reduce
    const addresses = [];
    const data: UserBaseVoteInfo[] = fs.readJSONSync(
      join(currentEpochDataDir, rawVotesFile),
    );

    data.forEach((vote) => {
      if (!addresses.includes(vote.who)) {
        addresses.push(vote.who);
      }
    });

    fs.writeJSONSync(join(currentEpochDataDir, voterAddressesFile), addresses);
  }

  private async saveUserEpochBalances(timestamp: number, epochDir: string) {
    const userAddresses = getUserAddresses(epochDir);
    const userBalances = await this.getUsersVeBalancesForEpoch(
      timestamp,
      userAddresses,
    );

    fs.writeJSONSync(join(epochDir, userBalanceFile), userBalances);
  }

  async getUsersVeBalancesForEpoch(epochTimestamp: number, users: string[]) {
    console.log(
      `Getting user balances for epoch: ${new Date(
        epochTimestamp * 1000,
      ).toUTCString()}`,
    );

    const multicall = getMulticall(veABI);

    users.forEach((user) =>
      multicall.call(
        `${user}.balance`,
        this.votingEscrow.address,
        'balanceOf',
        [user, epochTimestamp],
      ),
    );

    const [balances, totalSupplyAtEpochtime] = await Promise.all([
      multicall.execute('getUsersVeBalancesForEpoch'),
      this.votingEscrow.totalSupply(epochTimestamp),
    ]);

    const totalSupplyNum = parseFloat(formatEther(totalSupplyAtEpochtime._hex));

    const data = Object.entries(balances).map((info): UserBalanceInfo => {
      const [user, balance] = info;

      const balanceNum = parseFloat(formatEther(balance.balance._hex));
      const weightPercent = balanceNum / totalSupplyNum;

      return {
        user,
        balance: balanceNum,
        percentOfTotalVE: weightPercent,
      };
    });

    return {
      epochTimestamp,
      epochTimestampDateUTC: new Date(epochTimestamp * 1000).toUTCString(),
      votingEscrowTotalSupply: totalSupplyNum,
      data,
    };
  }

  private joinUsersToVotes(epochDir: string) {
    const userAddresses = getUserAddresses(epochDir);
    const voteEventsData = getRawVotesEventData(epochDir);

    const userData = userAddresses.map((user) => {
      // TODO: Need to filter out duplicates somehow
      const userVotes = voteEventsData.filter((vote) => vote.who === user);

      return {
        user,
        votes: userVotes,
      };
    });

    fs.writeJSONSync(join(epochDir, userVotesFile), userData);
  }

  private joinUserBalanceInfo(epochDir: string) {
    const userVotes = getUsersGaugeVotes(epochDir);
    const userBalances = getUserBalances(epochDir);

    const data = userVotes.map((user): UserInfo => {
      return {
        user: user.user,
        votes: user.votes,
        balance: userBalances.data.find((bal) => bal.user === user.user),
        claims: [],
      };
    });

    fs.writeJSONSync(join(epochDir, userDataFile), data);
  }

  private saveVotesForGaugeJSON(epochDir: string, gauge: Gauge) {
    const gaugesDir = join(epochDir, 'gauges');
    fs.ensureDirSync(gaugesDir);

    const userData = getUsersFullData(epochDir);
    const votesFor = [];

    userData.forEach((user) => {
      const voteInfo = user.votes.find(
        (vote) => vote.gauge.toLowerCase() === gauge.address.toLowerCase(),
      );
      if (voteInfo) {
        votesFor.push({
          ...user.balance,
          ...voteInfo,
        });
      }
    });

    const jsonFileName = `${this.getGaugeVotesFileName(gauge)}.json`;
    fs.writeJSONSync(join(gaugesDir, jsonFileName), {
      gauge,
      votesFor,
    });
  }

  private saveVotesForGaugeCSV(
    epochDir: string,
    gauge: Gauge,
    epochLabel: string,
  ) {
    const gaugesDir = join(epochDir, 'gauges');
    fs.ensureDirSync(gaugesDir);

    const userData = getUsersFullData(epochDir);
    const userBalances = getUserBalances(epochDir);
    const csvData = [];

    userData.forEach((user) => {
      const voteInfo = user.votes.find(
        (vote) => vote.gauge.toLowerCase() === gauge.address.toLowerCase(),
      );
      if (voteInfo) {
        const votingPowerUsed = voteInfo.weightUsed / 10000;
        csvData.push({
          gauge: gauge.symbol,
          gaugeAddress: gauge.address,
          user: user.user,
          userVotePowerPercentage: user.balance.percentOfTotalVE,
          votingPowerUsed,
          votingPowerUsedDisplay: `${votingPowerUsed * 100}%`,
          snapshotTime: userBalances.epochTimestampDateUTC,
        });
      }
    });

    const csvFileName = `${this.getGaugeVotesFileName(
      gauge,
    )}-${epochLabel}.csv`;
    csvService.write(
      join(gaugesDir, `${csvFileName}`),
      [
        {
          id: 'gauge',
          title: 'Gauge',
        },
        {
          id: 'gaugeAddress',
          title: 'Gauge Address',
        },
        {
          id: 'user',
          title: 'User',
        },
        {
          id: 'userVotePowerPercentage',
          title: 'User VE weight %',
        },
        {
          id: 'votingPowerUsedDisplay',
          title: 'Vote % used',
        },
        // {
        //   id: 'votingPowerUsed',
        //   title: 'Vote % used',
        // },
        {
          id: 'snapshotTime',
          title: 'Snapshot timestamp',
        },
      ],
      csvData,
    );
  }

  private getGaugeVotesFileName(gauge: Gauge) {
    return `${getGaugeFileName(gauge)}-votes-for`;
  }
}

export const voteService = new VoteDataService();
