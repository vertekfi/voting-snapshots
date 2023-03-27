import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from 'dotenv';
import { jobScheduler } from './services/job-scheduler.service';
import { voteService } from './services/rewards/vote-data.service';
import * as moment from 'moment';
import {
  attachUserProofs,
  doBulkBribeDistribution,
  getAllBribesFlattened,
  getBribeMerkleTree,
  getClaimFileName,
  groupUsersByTokenForDistributionPrep,
  runBribeRewardsForEpoch,
  matchBribeRecord,
  joinDistributionsToUsers,
  updateDistributions,
} from './services/rewards/reward-epoch-runner';
import { getEpochDir, getStartOfThisWeekUTC } from './utils/epoch.utils';
import { doTransaction, getRpcProvider } from './utils/web3.utils';
import { getMerkleOrchard, getMulticall } from './utils/contract.utils';
import { formatEther, parseUnits } from '@ethersproject/units';
import {
  getBribeDistributionInfo,
  getBribersData,
  getDistributionData,
  getUsersGaugeVotes,
  setBribeDistributionInfo,
  setBribersData,
  setUserGaugeBribeClaims,
} from './services/rewards/reward.utils';
import * as fs from 'fs-extra';
import { join } from 'path';
import {
  getUserClaimAmount,
  getVotersTotalWeightForGauge,
} from './services/rewards/reward-generator.service';
import { bscScanService } from './services/standalone/bsc-scan.service';
import { gqlService } from './services/backend/gql.service';
import { BigNumber, Contract } from 'ethers';
import { getEventData } from './utils/event-scraping';

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

  const epochs = [
    {
      epoch: 1674691200,
      date: '2023-01-26T00:00:00Z',
      blockNumber: 25105745,
    },
    {
      epoch: 1675296000,
      date: '2023-02-02T00:00:00Z',
      blockNumber: 25304046,
    },
    {
      epoch: 1675900800,
      date: '2023-02-09T00:00:00Z',
      blockNumber: 25502596,
    },
    {
      epoch: 1676505600,
      date: '2023-02-16T00:00:00Z',
      blockNumber: 25702291,
    },
    {
      epoch: 1677110400,
      date: '2023-02-23T00:00:00Z',
      blockNumber: 25901363,
    },
    {
      epoch: 1677715200,
      date: '2023-03-02T00:00:00Z',
      blockNumber: 26100818,
    },
    {
      epoch: 1678320000,
      date: '2023-03-09T00:00:00Z',
      blockNumber: 26300370,
    },
    {
      epoch: 1678924800,
      date: '2023-03-16T00:00:00Z',
      blockNumber: 26499941,
    },
    {
      epoch: 1679529600,
      date: '2023-03-23T00:00:00Z',
      blockNumber: 26699046,
    },
    // {
    //   epoch: 1680134400,
    //   date: '2023-03-30T00:00:00Z',
    //   blockNumber: 0,
    // },
  ];

  const orchard = getMerkleOrchard();
  const multi = getMulticall([
    `
  function getRemainingBalance(
    address token,
    address briber
  ) external view returns (uint256)`,
  ]);

  let bribeBalances = fs.readJSONSync(
    join(process.cwd(), `src/data/balances.json`),
  );

  const copyBalances = {};
  for (const briber in bribeBalances) {
    copyBalances[briber] = {};
    for (const token in bribeBalances[briber]) {
      copyBalances[briber][token.toLowerCase()] = bribeBalances[briber][token];
    }
  }

  const users = [
    '0x4a895D96c988ac0d47de1aE4E6F20Dfc5fB51c2A',
    '0x84A51c92a653dc0e6AE11C9D873C55Ee7Af62106',
    '0x69e02d001146a86d4e2995f9ecf906265aa77d85',
    '0xc2AA39a914c55B1d86Aac2d41cc09E15ba28adC8',
  ];

  const bustedBriber = [
    '0x1555D126e096A296A5870A566db224FD9Cf72f03',
    '0xe73E4C5Bb944A2195c1cFD3aC474582025d368Ed',
    '0x111fbf7b389e024d09F35fb091D7D4479b321B0A',
  ];

  const realBribers = [
    '0x891eFc56f5CD6580b2fEA416adC960F2A6156494',
    '0xb4ce1A933E85720aF0Df9A6889A63e1309E3984E',
    '0x2E216eF129f7446463D4865Df65576Df96e4308E',
    '0x771D1A7D23D30F9030bC607a559Ce3e7496D8422',
    '0x59b596e080295F83d67431746f3Eabd70D8A3236',
    '0x227c79a7464f08ea8aa5D9f8B22AA63ADeC79a9b',
    '0xaBcD018b36EA7A16fdB177F85988E156182046Ca',
    ...bustedBriber,
  ];

  const tokens = [
    '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    '0x9562Ca0C2b05D089063F562fC3Ecc95e4424AD02',
    '0xd50c729cEbb64604b99E1243a54e840527360581',
    '0x50d8D7F7CcEA28cc1C9dDb996689294dC62569cA',
    '0xeD236c32f695c83Efde232c288701d6f9C23E60E',
    '0x12b70d84DAb272Dc5A24F49bDbF6A4C4605f15da',
    '0xFa4b16b0f63F5A6D0651592620D585D308F749A4',
    '0xb9E05B4C168B56F73940980aE6EF366354357009',
    '0x90C97F71E18723b0Cf0dfa30ee176Ab653E89F40',
    '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
    '0x14016E85a25aeb13065688cAFB43044C2ef86784',
    '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
    '0x55d398326f99059fF775485246999027B3197955',
    '0xc91324601B20ea0e238B63c9fAfca18d32600722',
  ];

  // const erc = new Contract(
  //   '0xb9E05B4C168B56F73940980aE6EF366354357009',
  //   ['function approve(address, uint) external'],
  //   orchard.signer,
  // );

  // await doTransaction(erc.approve(orchard.address, parseUnits('15')));

  // await doTransaction(
  //   orchard.operatorAddDistribution(
  //     '0xb9E05B4C168B56F73940980aE6EF366354357009',
  //     '0x111fbf7b389e024d09f35fb091d7d4479b321b0a',
  //     parseUnits('15'),
  //   ),
  // );

  const multi2 = getMulticall([
    `
  function verifyClaim(
    address token,
    address briber,
    uint,
    address,
    uint,
    bytes32[]
  ) external view returns (bool)`,
    `function isClaimed(
      address token,
      address briber,
      uint256 distributionId,
      address claimer
  ) public view returns (bool)`,
  ]);

  const hisClaims = [];
  const bustedClaims: any[] = [];

  const claimer = '0x84A51c92a653dc0e6AE11C9D873C55Ee7Af62106';

  // const shit: any[] = fs.readJSONSync(
  //   join(process.cwd(), `src/data/${claimer}-correct.json`),
  // );

  const again = [];
  let fml;
  let numRun = 0;

  async function matchBriber() {
    let count = 0;
    const maxCount = 30;
    const distIds = [];
    while (count <= maxCount) {
      distIds.push(count);
      count++;
    }

    distIds.forEach((id) => {
      multi2.call(
        `${fml.briber}-${fml.token + `-${id}`}.valid`,
        orchard.address,
        'verifyClaim',
        [
          fml.token,
          fml.briber,
          id,
          claimer,
          parseUnits(fml.amountOwed),
          fml.proof,
        ],
      );
    });

    const deez = await multi2.execute('');

    for (const d in deez) {
      if (deez[d].valid) {
        // console.log(`${d} ${deez[d].valid}`);
        const claimed = await orchard.isClaimed(
          fml.token,
          fml.briber,
          fml.distributionId,
          claimer,
        );
        console.log('claimed: ' + claimed);

        if (!claimed) {
          again.push(fml);
        }
      }
    }

    // console.log('DONE');
    numRun++;
    // console.log('numRun: ' + numRun);
  }

  const claims: any[] = fs.readJSONSync(
    join(process.cwd(), `src/data/${claimer}.json`),
  );

  //  console.log(claims[claims.length - 2]);

  const briber = '0x771D1A7D23D30F9030bC607a559Ce3e7496D8422';
  // 0x59b596e080295F83d67431746f3Eabd70D8A3236
  // 0x771D1A7D23D30F9030bC607a559Ce3e7496D8422
  // const result = await multi2.execute('');
  // console.log(result);

  for (const sh of claims) {
    fml = sh;
    fml.briber = briber;
    await matchBriber();
  }

  // console.log(again);
  // console.log(again.length);

  // console.log('awaiting multicall');
  // const idk2 = await multi2.execute('');
  // console.log('multicall complete');
  // console.log(idk2);

  // distIds.forEach((id) => {
  //   multi2.call(
  //     `${testClaim.briber}-${testClaim.token + `-${id}`}.valid`,
  //     orchard.address,
  //     'verifyClaim',
  //     [
  //       testClaim.token,
  //       testClaim.briber,
  //       id,
  //       claimer,
  //       parseUnits(testClaim.amountOwed),
  //       testClaim.proof,
  //     ],
  //   );

  //   // multi2.call(
  //   //   `${testClaim.briber}-${testClaim.token + `-${id}`}.claimed`,
  //   //   orchard.address,
  //   //   'isClaimed',
  //   //   [testClaim.token, testClaim.briber, id, claimer],
  //   // );
  // });

  // Object.entries(idk2).forEach((thing, i) => {
  //   if (thing[1].valid) {
  //     console.log(thing);
  //     console.log('Fixing one');
  //     console.log('Before');

  //     console.log(testClaim);

  //     const split = thing[0].split('-');
  //     testClaim.distributionId = Number(split[2]);
  //     testClaim.briber = split[0];
  //     testClaim.claimed = thing[1].claimed;

  //     console.log('After');

  //     console.log(testClaim);
  //   }
  // });

  // const tokenIndex = 0;
  // const tx = await orchard.callStatic.claimDistributions(
  //   claimer,
  //   [
  //     [
  //       cl.distributionId,
  //       parseUnits(cl.amountOwed),
  //       cl.briber,
  //       tokenIndex,
  //       cl.proof,
  //     ],
  //   ],
  //   [cl.token],
  // );
  // console.log(tx);

  //  const date = new Date('2023-03-16');
  //  const epochStartTime = moment(date).utc().unix();
  // const epochDir = getEpochDir(epochStartTime);

  // await voteService.doVotingSnapshot(date);
  // await runBribeRewardsForEpoch(epochStartTime, epochDir);
  // await doBulkBribeDistribution(epochDir);
  // joinDistributionsToUsers(epochDir);
  // updateDistributions(epochDir);
}

bootstrap();

async function getClaimEvents(
  epochStartTime: number,
  maxBlock: number,
  startBlock?: number,
) {
  const epochDir = getEpochDir(epochStartTime);
  const path = join(epochDir, 'claim-events.json');
  fs.ensureFileSync(path);

  const items = fs.readJsonSync(path);
  startBlock = startBlock || items.endBlock + 1;

  if (startBlock == maxBlock) {
    console.log('Max block reached');
    return;
  }

  let endBlock = startBlock + 100000;

  if (endBlock > maxBlock) {
    endBlock = maxBlock;
    console.log('Max block reached');
  }

  console.log('startBlock: ' + startBlock);
  console.log('endBlock: ' + endBlock);

  await getEventData(
    getMerkleOrchard(),
    'DistributionClaimed',
    startBlock,
    endBlock,
    5000,
    (evt) => {
      const data = {
        briber: evt.args.briber,
        token: evt.args.token,
        distributionId: evt.args.distributionId.toNumber(),
        claimer: evt.args.claimer,
        receipient: evt.args.recipient,
        amount: formatEther(evt.args.amount),
        txHash: evt.transactionHash,
      };

      items.records.push(data);
    },
  );

  items.endBlock = endBlock;
  fs.writeJSONSync(
    path,

    items,
  );
}

async function getBriberRemainingBalances(epochDir: string) {
  const orchard = getMerkleOrchard();
  const info = getBribeDistributionInfo(epochDir);
  // console.log(info);
  const bribers = [];
  const tokens = info.reduce((prev, current) => {
    if (!prev.includes(current.token)) {
      prev.push(current.token);
    }

    if (!bribers.includes(current.briber)) {
      bribers.push(current.briber);
    }

    return prev;
  }, []);

  console.log(bribers);
  console.log(tokens);

  const multi = getMulticall([
    `
  function getRemainingBalance(
    address token,
    address briber
  ) external view returns (uint256)`,
  ]);

  bribers.forEach((briber) => {
    tokens.forEach((token) => {
      multi.call(`${briber}.${token}`, orchard.address, 'getRemainingBalance', [
        token,
        briber,
      ]);
    });
  });

  const data = await multi.execute<
    Record<string, { [token: string]: BigNumber }>
  >('');
  console.log(data);

  const balances = Object.entries(data).map((bribeInfo) => {
    const [briber, tokenInfo] = bribeInfo;

    const tokens = [];
    for (const token in tokenInfo) {
      tokens.push({
        token,
        amount: formatEther(tokenInfo[token]),
      });
    }

    return {
      briber,
      tokens,
    };
  });

  console.log(balances);

  return balances;
}
