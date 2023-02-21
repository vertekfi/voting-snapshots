import { Contract } from '@ethersproject/contracts';
import { Block, JsonRpcProvider } from '@ethersproject/providers';
import { Injectable } from '@nestjs/common';
import * as ControllerAbi from '../abis/GaugeController.json';
import * as fs from 'fs-extra';
import { formatEther, parseEther } from 'ethers';
import { join } from 'path';
import * as moment from 'moment';
import { Multicaller } from './multicaller';
import { getMulticall } from '../utils/web3.utils';
import { csvService } from './csv.service';
import { bscScanService } from './bsc-scan.service';
import { gqlService } from './gql.service';
import { Gauge } from 'src/types/gauge.types';

const dataPath = join(process.cwd(), 'src/data/'); // Can't do this on app service can we? database it
const txDataPath = join(dataPath, 'tx-data');

const bscBlockTime = 3;
const blocksPerWeek = 201600; // (86400 * 7) / bscBlockTime;

interface UserBaseVoteInfo {
  who: string;
  when: string;
  whenTimestamp: number;
  txHash: string;
  gauge: string;
  weightUsed: number;
  blockNumber: number;
}

interface UserBalanceInfo {
  user: string;
  balance: number;
  weightPercent: number;
}

interface UserBalanceData {
  epochTimestampDateUTC: string;
  epochTimestamp: number;
  votingEscrowTotalSupply: number;
  data: UserBalanceInfo[];
}

interface UserGaugeVotes {
  user: string;
  votes: UserBaseVoteInfo[];
}

interface UserInfo {
  user: string;
  balance: UserBalanceInfo;
  votes: UserBaseVoteInfo[];
}

const veABI = [
  'function balanceOf(address, uint256) public view returns (uint256)',
  'function totalSupply(uint256 timestamp) public view returns (uint256)',
];

@Injectable()
export class VoteDataService {
  readonly provider: JsonRpcProvider;
  readonly gaugeController: Contract;
  readonly votingEscrow: Contract;
  readonly feeDistributor: Contract;

  constructor() {
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

  async doVotingSnapshot() {
    const nextEpochTime = (await this.gaugeController.time_total()).toNumber();
    // // const nextEpochTime = 1677110400;
    const startOfCurrentEpoch = moment
      .unix(nextEpochTime)
      .subtract(1, 'week')
      .utc();

    const currentEpochRange = this.getEpochRangeLabel(
      startOfCurrentEpoch.unix(),
      nextEpochTime,
    );

    // Check how high this can go to save calls
    // Default BSC RPC is capped at 2000. Quicknode accepts this 5000+ at least
    const blockReadRange = 5000;
    // const startingBlockNumber = await bscScanService.getBlockNumberByTimestamp(
    //   startOfCurrentEpoch.unix(),
    // );
    // const endBlockNumber = await bscScanService.getBlockNumberByTimestamp(
    //   nextEpochTime,
    // );

    // await this.getVotingEventData(
    //   startingBlockNumber,
    //   endBlockNumber,
    //   blockReadRange,
    // );

    // this.filterUniqueUsers();
    // this.saveUserEpochBalances()
    // this.joinUsersToVotes();
    // this.joinUserBalanceInfo(currentEpochRange);

    // const gauges = await gqlService.getGauges();

    // for (const gauge of gauges) {
    //   this.saveVotesForGauge(gauge, currentEpochRange);
    // }
  }

  private getEpochRangeLabel(startTimestamp: number, endTimestamp: number) {
    return `${moment.unix(startTimestamp).utc().format('yyyyMMDD')}-${moment
      .unix(endTimestamp)
      .utc()
      .format('yyyyMMDD')}`;
  }

  saveVotesForGauge(gauge: Gauge, epochDir: string) {
    const { userData, userBalances } = this.getAllEpochData(epochDir);

    const votesFor = [];
    const csvData = [];

    userData.forEach((user) => {
      const voteInfo = user.votes.find(
        (vote) => vote.gauge.toLowerCase() === gauge.address.toLowerCase(),
      );
      if (voteInfo) {
        const votingPowerUsed = voteInfo.weightUsed / 10000;

        votesFor.push({
          ...user.balance,
          ...voteInfo,
        });

        csvData.push({
          gauge: gauge.symbol,
          gaugeAddress: gauge.address,
          user: user.user,
          userVotePowerPercentage: user.balance.weightPercent,
          votingPowerUsed,
          votingPowerUsedDisplay: `${votingPowerUsed * 100}%`,
          snapshotTime: userBalances.epochTimestampDateUTC,
        });
      }
    });

    const filePath = join(dataPath, epochDir, 'gauges');
    const fileName = gauge.pool.name.split(' ').join('-');
    fs.writeJSONSync(join(filePath, `${fileName}-votes-for.json`), {
      gauge,
      votesFor,
    });

    csvService.write(
      join(filePath, `${fileName}-votes-for.csv`),
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

  private joinUserBalanceInfo(epochDir: string) {
    const { userBalances, userVotes } = this.getAllEpochData(epochDir);

    const data = userVotes.map((user): UserInfo => {
      return {
        user: user.user,
        votes: user.votes,
        balance: userBalances.data.find((bal) => bal.user === user.user),
      };
    });

    fs.writeJSONSync(join(dataPath, epochDir, 'user-data.json'), data);
  }

  private filterUniqueUsers() {
    // could just use reduce
    const addresses = [];
    const data = this.getLastDataFile<UserBaseVoteInfo[]>();

    data.forEach((vote) => {
      if (!addresses.includes(vote.who)) {
        addresses.push(vote.who);
      }
    });

    const fileName = this.getDateStampedJsonFileName('user-addresses');
    fs.writeJSONSync(this.getDataFilePath(fileName), addresses);
  }

  private joinUsersToVotes(epochDir: string) {
    const { userAddresses, voteEventsData } = this.getAllEpochData(epochDir);
    const userData = userAddresses.map((user) => {
      const userVotes = voteEventsData.filter((vote) => vote.who === user);

      return {
        user,
        votes: userVotes,
      };
    });

    fs.writeJSONSync(join(dataPath, epochDir, 'user-votes.json'), userData);
  }

  private async saveUserEpochBalances(timestamp: number, epochDir: string) {
    const { userAddresses } = this.getAllEpochData(epochDir);
    const userBalances = await this.getUsersVeBalancesForEpoch(
      timestamp,
      userAddresses,
    );

    fs.writeJSONSync(
      join(dataPath, epochDir, 'user-balances.json'),
      userBalances,
    );
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
        weightPercent,
      };
    });

    return {
      epochTimestamp,
      epochTimestampDateUTC: new Date(epochTimestamp * 1000).toUTCString(),
      votingEscrowTotalSupply: totalSupplyNum,
      data,
    };
  }

  // Need to scrape events
  async getVotingEventData(
    startBlockInPast: number,
    upToBlock: number,
    blockReadRange: number,
  ) {
    const fileName = this.getDateStampedJsonFileName('');
    const filePath = join(dataPath, fileName);
    fs.createFileSync(filePath);
    fs.writeJSONSync(filePath, []);

    let iterations = 1;

    //  const currentBlockNumber = await this.provider.getBlockNumber();

    let endBlock = startBlockInPast + blockReadRange;
    //  let iteration = 0;
    while (startBlockInPast <= upToBlock) {
      console.log(
        `Running iteration (${iterations}) - startblock: ${startBlockInPast} endblock: ${endBlock}`,
      );

      const filter = this.gaugeController.filters.VoteForGauge();
      const data = await this.gaugeController.queryFilter(
        filter,
        startBlockInPast,
        endBlock,
      );

      const events = [];
      if (data.length) {
        data.forEach((vote) => {
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
      startBlockInPast = endBlock + 1;
      endBlock = startBlockInPast + blockReadRange;
      iterations++;
    }
  }

  private getAllEpochData(epochDir: string) {
    const userBalances: UserBalanceData = this.getEpochFileData(
      epochDir,
      'balances',
    );
    const voteEventsData: UserBaseVoteInfo[] = this.getEpochFileData(
      epochDir,
      'votes',
    );
    const userAddresses: string[] = this.getEpochFileData(
      epochDir,
      'addresses',
    );
    const userVotes: UserGaugeVotes[] = this.getEpochFileData(
      epochDir,
      'userVotes',
    );
    const userData: UserInfo[] = this.getEpochFileData(epochDir, 'userData');

    return {
      userBalances,
      voteEventsData,
      userAddresses,
      userVotes,
      userData,
    };
  }

  private getDateStampedJsonFileName(preLabel: string) {
    return `${preLabel ? preLabel + '-' : ''}${new Date()
      .toDateString()
      .split(' ')
      .join('-')}-${Date.now()}.json`;
  }

  private getDataFilePath(fileName: string) {
    return join(dataPath, fileName);
  }

  private getLastDataFile<T>() {
    const files = fs.readdirSync(dataPath);
    const filePath = join(dataPath, files[files.length - 1]);
    return fs.readJsonSync(filePath) as T;
  }

  private getEpochFileData(
    epochDir: string,
    type: 'balances' | 'votes' | 'addresses' | 'userVotes' | 'userData',
  ) {
    const map = {
      balances: 'user-balances',
      addresses: 'voter-addresses',
      votes: 'votes',
      userVotes: 'user-votes',
      userData: 'user-data',
    };

    return fs.readJSONSync(join(dataPath, epochDir, `${map[type]}.json`));
  }
}
