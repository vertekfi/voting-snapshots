import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from 'dotenv';
import { jobScheduler } from './services/job-scheduler.service';
import * as moment from 'moment';
import { getEpochDir, getStartOfThisWeekUTC } from './utils/epoch.utils';
import { doTransaction, getRpcProvider } from './utils/web3.utils';
import { getMerkleOrchard, getMulticall } from './utils/contract.utils';
import { formatEther, parseUnits } from '@ethersproject/units';
import { getBribeDistributionInfo } from './services/rewards/reward.utils';
import * as fs from 'fs-extra';
import { join } from 'path';
import { BigNumber } from 'ethers';
import { gqlService } from './services/backend/gql.service';
import { syncData } from './utils/syncs';
import { doNewEpochBribeSnapshot, populateBaseDataForEpoch } from './snapshot';

export const epochs = [
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
  {
    epoch: 1680134400,
    date: '2023-03-30T00:00:00Z',
    blockNumber: 26898869,
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

  await populateBaseDataForEpoch(1678320000);
  // await doNewEpochBribeSnapshot();

  // jobScheduler.init();

  // const date = new Date('2023-03-16');
  // const epochStartTime = moment(date).utc().unix();
  // const epochDir = getEpochDir(epochStartTime);

  // await runEpochSnapshot(epochStartTime);
  // await fixUserShit()
}

bootstrap();

async function fixUserShit() {
  const kuelesCantClaimGuy = '0x41C6741F56893Fc194384f44f8d647485ca26Fe7';
  const mrVas = '0xe06500F6B2C463CB0fc384251ecC3e49001c696d';
  const shouldHaveBribesGuy = '0x69e02d001146a86d4e2995f9ecf906265aa77d85';

  // check for my bribes besides busd
  const me = '0x891eFc56f5CD6580b2fEA416adC960F2A6156494';
  const user1 = '0x2Be237c75A2730B5EbAE1dE8F066CF57F59d12FE'; // 1677715200, 1678924800
  const user2 = '0x2E216eF129f7446463D4865Df65576Df96e4308E'; // 1677715200, 1678320000, 1679529600

  const userOneEpochs = [1677715200, 1678924800];
  const userTwoEpochs = [1677715200, 1678320000, 1679529600];
  const user = user2;
  const epochs = userOneEpochs;

  // const patched: any[] = fs.readJSONSync(
  //   join(getEpochDir(1677715200), 'patch-bribes.json'),
  // );
  // const patchedDist: any[] = fs.readJSONSync(
  //   join(getEpochDir(1677715200), 'patch-distributions.json'),
  // ).events;

  // patchedDist.forEach((eventData, idx) => {
  //   const evt = orchard.interface.decodeEventLog(
  //     'DistributionAdded',
  //     eventData.data,
  //     eventData.topics,
  //   );

  //   const id = evt.distributionId.toNumber();
  //   patched[idx].users.forEach((claim) => (claim.distributionId = id));
  //   patched[idx].distribution = {
  //     distributionId: id,
  //     txHash: eventData.transactionHash,
  //   };
  // });
  // fs.writeJSONSync(join(getEpochDir(1677715200), 'patch-bribes.json'), patched);

  // let claims = [];

  // epochs.forEach((epoch) => {
  //   const epochDir = getEpochDir(epoch);

  //   const bribers: any[] = fs.readJSONSync(join(epochDir, 'bribers-data.json'));

  //   if (epoch === 1677715200) {
  //     bribers.forEach((briber) => {
  //       briber.bribes.forEach((bribe) => {
  //         claims = [
  //           ...claims,
  //           ...bribe.userTreeData
  //             .filter((u) => u.user === user)
  //             .map((claim) => {
  //               const merkleProof = claim.claims[0].proof;
  //               delete claim.claims[0].proof;

  //               return {
  //                 user: claim.user,
  //                 ...claim.claims[0],
  //                 claimAmount: claim.claims[0].amountOwed,
  //                 briber: bribe.briber,
  //                 distributionId: bribe.distribution.distributionId,
  //                 epochStartTime: epoch,
  //                 merkleProof,
  //               };
  //             }),
  //         ];
  //       });
  //     });
  //   } else if (epoch === 1679529600) {
  //     // Use new way
  //     bribers.forEach((bribe) => {
  //       claims = [
  //         ...claims,
  //         ...bribe.users
  //           .filter((u) => u.user === user)
  //           .map((claim) => {
  //             return {
  //               ...claim,
  //               briber: bribe.briber,
  //               distributionId: bribe.distribution.distributionId,
  //               epochStartTime: epoch,
  //             };
  //           }),
  //       ];
  //     });
  //   } else if (epoch === 1678320000 || epoch === 1678924800) {
  //     const bribes = fs.readJSONSync(
  //       join(getEpochDir(epoch), 'bribe-distributions.json'),
  //     );
  //     bribes.forEach((bribe) => {
  //       claims = [
  //         ...claims,
  //         ...bribe.users
  //           .filter((u) => u.user === user)
  //           .map((claim) => {
  //             return {
  //               ...claim,
  //               epochStartTime: epoch,
  //             };
  //           }),
  //       ];
  //     });
  //   }
  // });

  // fs.writeJSONSync(join(process.cwd(), `${user}.json`), claims);
  // console.log(claims.length);
  // const userData: any[] = fs.readJSONSync(join(process.cwd(), `${user}.json`));

  const multi = getMulticall([
    `function isClaimed(
       address token,
       address briber,
       uint256 distributionId,
       address claimer
     ) public view returns (bool)`,
    `
     function verifyClaim(
       address token,
       address briber,
       uint256 distributionId,
       address claimer,
       uint256 claimedBalance,
       bytes32[] memory merkleProof
      ) external view returns (bool)`,
    `
      function getRemainingBalance(
       address token,
       address briber
       ) external view returns (uint256)`,
  ]);

  // Should verify them. Briber may still be busted
  // const userData = [
  //   {
  //     token: '0xed236c32f695c83efde232c288701d6f9c23e60e',
  //     briber: '0x59b596e080295F83d67431746f3Eabd70D8A3236',
  //     distributionId: 0,
  //     user: '0x1b30F8eE9d7718B182BaD677C06980e5A0668526',
  //     claimAmount: '11913375400000000000',
  //     merkleProof: [
  //       '0x6069472d1e630be5acc2b07fb2b07d7881a1711e29192319a34f235f769ee0d6',
  //       '0xdeaf5d60828e8a461a311f08662994815c7e9fc6c82a25f23e6c1656b8449b3c',
  //       '0x736a323ca0207d3dc0a480059a72eb77bb4c18a484a41629165452f08aaf7494',
  //     ],
  //   },
  // ];

  // userData.forEach((claim, i) => {
  //   multi.call(`${user}.${i}`, orchard.address, 'verifyClaim', [
  //     claim.token,
  //     claim.briber,
  //     claim.distributionId,
  //     claim.user,
  //     claim.claimAmount,
  //     claim.merkleProof,
  //   ]);
  // });
  // console.log(await multi.execute(''));

  // const kuele = '0xee02B046b42768e1Ba2FB32d97d55824f3eb6E51';
  // const { getUserBribeClaims } = await gqlService.sdk.getUserRewards({
  //   user: kuele,
  // });

  // const epoch1 = getUserBribeClaims
  //   .filter((b) => b.epochStartTime === 1679529600)
  //   .map((b) => {
  //     return {
  //       token: b.token,
  //       amountOwed: b.amountOwed,
  //       epoch: b.epochStartTime,
  //       gauge: b.gauge,
  //     };
  //   });
  // const epoch2 = getUserBribeClaims
  //   .filter((b) => b.epochStartTime === 1679529600)
  //   .map((b) => {
  //     return {
  //       token: b.token,
  //       amountOwed: b.amountOwed,
  //       epoch: b.epochStartTime,
  //       gauge: b.gauge,
  //     };
  //   });
  // console.log(epoch2);

  // Nice added multiple vrtk to the same gauge, prob in same amounts

  // So get bribes for gauge and compare
  const testGauge = '0xe05DE828EedCe4c4cAa532750F8f0d95a0Fd094e';

  // const { getBribes: niceBribes } = await gqlService.sdk.GetBribesInfo({
  //   filter: {
  //     briber: '0x59b596e080295F83d67431746f3Eabd70D8A3236',
  //     epochStartTime: 1677715200,
  //   },
  // });

  // console.log(
  //   niceBribes.map((b) => {
  //     return {
  //       token: b.token.address,
  //       amount: b.amount,
  //       gauge: b.gauge,
  //     };
  //   }),
  // );

  // console.log(niceBribes.length);

  // const result = await multi.execute('');
  // console.log(result);

  // const claimStatuses: boolean[] = result[user];

  // claimStatuses.forEach((isClaimed, i) => (userData[i].isClaimed = isClaimed));

  // fs.writeJSONSync(join(process.cwd(), `${user}.json`), userData);

  // const unclaimed = userData.filter((claim) => !claim.isClaimed);

  // for (const uc of unclaimed) {
  //   const tx = await orchard.callStatic.claimDistributions(
  //     user,
  //     [[uc.distributionId, uc.claimAmount, uc.briber, 0, uc.merkleProof]],
  //     [uc.token],
  //   );
  //   console.log(tx);
  // }

  // const tokens = ['0xed236c32f695c83efde232c288701d6f9c23e60e'];
  // tokens.forEach((tk) => {
  //   multi.call(`${tk}`, orchard.address, 'getRemainingBalance', [tk, me]);
  // });

  // const tkResult = await multi.execute('');
  // for (const token in tkResult) {
  //   console.log(`${token} - ${formatEther(tkResult[token])}`);
  // }

  // fs.writeJSONSync(join(process.cwd(), `unclaimed-${user}.json`), unclaimed);

  // unclaimed.forEach((claim, i) => {
  //   multi.call(`${user}.${i}`, orchard.address, 'verifyClaim', [
  //     claim.token,
  //     claim.briber,
  //     claim.distributionId,
  //     user,
  //     claim.claimAmount,
  //     claim.merkleProof,
  //   ]);
  // });

  // const verifyResult = await multi.execute('');
  // console.log(verifyResult);
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
