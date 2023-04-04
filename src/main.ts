import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from 'dotenv';
import { jobScheduler } from './services/job-scheduler.service';
import * as moment from 'moment';
import { getEpochDir, getStartOfThisWeekUTC } from './utils/epoch.utils';
import { doTransaction, getRpcProvider } from './utils/web3.utils';
import { getMerkleOrchard, getMulticaller } from './utils/contract.utils';
import { formatEther, parseUnits } from '@ethersproject/units';
import { getBribeDistributionInfo } from './services/rewards/reward.utils';
import * as fs from 'fs-extra';
import { join } from 'path';
import { BigNumber } from 'ethers';
import { gqlService } from './services/backend/gql.service';
import { syncData } from './utils/syncs';
import {
  doBriberTokenDistribution,
  doNewEpochBribeSnapshot,
  generateMerkleTreeForBribes,
  getTokenDistributionAmounts,
  populateBaseDataForEpoch,
  pushBribeClaimsToBackend,
  setUserGaugeClaimAmounts,
} from './snapshot';
import {
  getEpochBribers,
  getEpochTokenAmounts,
  getUserAddressList,
  getVotes,
} from './snapshot/data.utils';
import { getVotesForEpoch } from './snapshot/backend.utils';
import { fixLife } from './fml';
import { fml2 } from './fml2';

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

  // const epoch = epochs[4];
  // console.log(`
  // Generating for epoch:
  // epoch:  ${epoch.epoch}
  // date:   ${epoch.date}`);

  const allFml = {};

  const FIRST_EPOCH_BRIBES_ENABLED = 1677110400; // 2/23 index = 4 (no bribes though...)
  const FIRST_EPOCH_BRIBE_WAS_ADDED = 1677715200; // 2023-03-02, index = 5

  await fml2();

  // await populateBaseDataForEpoch(FIRST_EPOCH_BRIBE_WAS_ADDED);
  // await backendPostBribeClaims(epoch.epoch);
  // doBriberTokenDistribution(epoch.epoch);
  // getTokenDistributionAmounts(epoch.epoch);

  // TODO: Can use this list to, somehow, generate new... OR... just simply convert these to the current structure
  // Test tx claims for each or some and or verify the claims, etc
  // This is from backend so should like up correctly with bribers/tokens/roots now (need a bribe id concept for sure)

  // const unclaimedPath = join(process.cwd(), 'src/data/unclaimed.json');
  // // fs.writeJSONSync(unclaimedPath, rewards);
  // const unclaimed: any[] = fs.readJSONSync(unclaimedPath);
  // // console.log('unclaimed: ' + unclaimed.length); // 112 unclaimed bribes (wow)

  // const users: string[] = fs.readJSONSync(
  //   join(process.cwd(), 'src/data/all-users.json'),
  // );

  // const rewards = [];
  // for (const user of users) {
  //   const { getUserBribeClaims } = await gqlService.sdk.GetUserRewards({
  //     user,
  //   });

  //   const claims = getUserBribeClaims.map((claim) => {
  //     return {
  //       user,
  //       ...claim,
  //     };
  //   });

  //   if (claims.length) {
  //     rewards.push(...claims);
  //   }
  // }

  // console.log(rewards.length);
  // fs.writeJSONSync(unclaimedPath, rewards);

  // fs.writeJSONSync(unclaimedPath, unclaimed);
  // console.log(unclaimed[0]);

  // const idk = unclaimed.reduce((prev, current) => {
  //   if (!prev[current.user]) {
  //     prev[current.user] = unclaimed.filter((c) => c.user === current.user);
  //   }

  //   return prev;
  // }, {});

  // console.log(idk);

  // const mapPath = join(process.cwd(), 'src/data/user-claim-map.json');
  // // fs.writeJSONSync(mapPath, idk);

  // const userMap = fs.readJSONSync(mapPath);

  // const finalToClaims = [];
  // Object.entries(userMap).forEach((userInfo) => {
  //   const [user, claims]: [string, any] = userInfo;

  //   console.log('Original claims: ' + claims.length);
  //   const good = claims.filter((c) => c.claimPassedVerification && !c.claimed);
  //   console.log('Good claims: ' + good.length);

  //   finalToClaims.push(...good);
  // });

  // console.log(finalToClaims[0]);
  // console.log('Final claims: ' + finalToClaims.length);

  // const finalClaims: any[] = fs.readJSONSync(
  //   join(process.cwd(), 'src/data/final-claims.json'),
  // );
  // //

  // // So this is actually the final state of things
  // // Whatever claims can be made here are the only remaining valid ones
  // // From this point we can use this new sync/database flow to manage this
  // const dbData: any[] = finalClaims.map((claim) => {
  //   return {
  //     user: claim.user,
  //     briber: claim.briber,
  //     token: claim.token,
  //     merkleProof: claim.merkleProof,
  //     gauge: claim.gauge,
  //     epochStartTime: claim.epochStartTime,
  //     distributionId: Number(claim.distributionId),
  //     claimAmount: parseUnits(claim.amountOwed).toString(),
  //   };
  // });

  // const epochsTo = dbData.reduce((prev, current, idx, all) => {
  //   const epochStartTime = current.epochStartTime;
  //   if (!prev[epochStartTime]) {
  //     prev[epochStartTime] = all.filter(
  //       (c) => c.epochStartTime === epochStartTime,
  //     );
  //   }

  //   return prev;
  // }, {});

  // for (const claimInfo of Object.entries(epochsTo)) {
  //   const [epochStr, claims]: [string, any] = claimInfo;
  //   await pushBribeClaimsToBackend(Number(epochStr), claims);
  // }

  // Then test claim tx for each/a few
  // const orchard = getMerkleOrchard();
  // for (const claim of dbData) {
  //   console.log(
  //     await orchard.callStatic.claimDistributions(
  //       claim.user,
  //       [
  //         [
  //           claim.distributionId,
  //           claim.claimAmount,
  //           claim.briber,
  //           0,
  //           claim.merkleProof,
  //         ],
  //       ],
  //       [claim.token],
  //     ),
  //   );
  // }

  // const multi = getOrchardMulticaller()

  // for (const claimInfo of Object.entries(userMap)) {
  //   const [user, claims]: [string, any] = claimInfo;

  //   claims.forEach((claim, i) => {
  //     multi.call(
  //       `${claim.user}.${i.toString()}`,
  //       orchard.address,
  //       'verifyClaim',
  //       [
  //         claim.token,
  //         claim.briber,
  //         claim.distributionId,
  //         claim.user,
  //         parseUnits(claim.amountOwed),
  //         claim.merkleProof,
  //       ],
  //     );
  //   });

  //   const verified = await multi.execute('');

  //   Object.entries(verified).forEach((verification, i) => {
  //     console.log(verification);
  //     verification[1].forEach(
  //       (claimPassedVerification, i) =>
  //         (userMap[user][i].claimPassedVerification = claimPassedVerification),
  //     );
  //   });
  // }

  // fs.writeJSONSync(mapPath, userMap);

  // for (const claimInfo of Object.entries(userMap)) {
  //   const [user, claims]: [string, any] = claimInfo;

  //   claims.forEach((claim, i) => {
  //     multi.call(
  //       `${claim.user}.${i.toString()}`,
  //       orchard.address,
  //       'isClaimed',
  //       [claim.token, claim.briber, claim.distributionId, claim.user],
  //     );
  //   });

  //   const verified = await multi.execute('');

  //   Object.entries(verified).forEach((claimedInfo, i) => {
  //     console.log(claimedInfo);
  //     claimedInfo[1].forEach((claimed, i) => {
  //       userMap[user][i].claimed = claimed;
  //     });
  //   });
  // }

  // fs.writeJSONSync(mapPath, userMap);

  // // TODO: This need to be by user
  //
  // unclaimed.forEach((claim, i) =>
  //   multi.call(
  //     `${claim.user}.${i.toString()}`,
  //     orchard.address,
  //     'verifyClaim',
  //     [
  //       claim.token,
  //       claim.briber,
  //       claim.distributionId,
  //       claim.user,
  //       parseUnits(claim.amountOwed),
  //       claim.merkleProof,
  //     ],
  //   ),
  // );

  // const please = await multi.execute('');
  // console.log(please);

  // for (const user in please) {
  //   please[user] = please[user].filter((v) => v !== null);
  // }

  // fs.writeJSONSync(join(process.cwd(), 'src/data/verifying.json'), please);

  // // The epoch here is to find bribes added that week
  // // But the actual epochStartTime in db will be the following epoch time
  // for (const epoch of epochs.slice(4, 5)) {
  //   if (epoch.blockNumber > 0) {
  //     // await gqlService.sdk.SyncEpochBribes({
  //     //   epoch: epoch.epoch,
  //     // });
  //   }
  // }

  // const allUsers = fs.readJSONSync(usersPath);
  // const rewards = [];
  // for (const user of allUsers) {
  //   const { getUserBribeClaims } = await gqlService.sdk.GetUserRewards({
  //     user,
  //   });

  //   if (getUserBribeClaims.length) {
  //     rewards.push(...getUserBribeClaims);
  //   }
  // }

  // jobScheduler.init();

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

  const multi = getMulticaller([
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

  const multi = getMulticaller([
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
