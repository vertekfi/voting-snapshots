import { formatEther, parseUnits } from 'ethers/lib/utils';
import * as fs from 'fs-extra';
import { join } from 'path';
import { gqlService } from './services/backend/gql.service';
import {
  attachUserProofs,
  generateMerkleTreeForBribes,
  getUsersBribeClaims,
} from './snapshot';
import {
  getGaugeData,
  getGaugesAddressList,
  getGaugeVotes,
} from './snapshot/data.utils';
import { getUsersMergedWithBalances } from './snapshot/user.utils';
import {
  getMerkleOrchard,
  getMulticaller,
  getOrchardMulticaller,
} from './utils/contract.utils';
import { getEpochDir } from './utils/epoch.utils';
import { approveTokensIfNeeded } from './utils/token.utils';
import { bnStringToNumber, ethNum } from './utils/utils';
import { doTransaction } from './utils/web3.utils';

const oldDistPath = join(process.cwd(), 'src/data/old-dist.json');
const oldPassedDistPath = join(
  process.cwd(),
  'src/data/old-clean-passed-dist.json',
);
const cleanOldDistPath = join(process.cwd(), 'src/data/old-clean-dist.json');
const allShitPath = join(process.cwd(), 'src/data/new-dist.json');
const unclaimedPath = join(
  process.cwd(),
  'src/data/old-clean-unclaimed-dist.json',
);
const finalbalancesPath = join(
  process.cwd(),
  'src/data/old-clean-unclaimed-balances-dist.json',
);

const lastDumbDistroPath = join(process.cwd(), 'src/data/last-fml-dist.json');
//
export async function fixLife() {
  // fillOldBribes()

  // 3/2, 3/9, 3/16, 3/23
  const epochs = [1677715200, 1678320000, 1678924800, 1679529600];

  // const allShit: any[] = fs.readJsonSync(allShitPath);
  // // console.log(allShit[0]);

  // let realTotal = 0;
  // allShit.forEach((gaugeData) => {
  //   realTotal += gaugeData.bribes.length * gaugeData.userVotes.length;
  // });

  // //  console.log(realTotal); // 996 claims

  // for (const epoch of epochs) {
  //   const gauges = getGaugesAddressList(epoch);
  //   gauges.forEach((gauge) => {
  //     const data = getGaugeData(epoch, gauge);
  //     allShit.push(data);
  //   });
  // }
  // fs.writeJsonSync(allShitPath, allShit); // 996

  // const orchard = getMerkleOrchard();
  // const multi = getOrchardMulticaller();

  // TODO: Rerun clean process and include bribe db ids
  // I took the old ones and check claim and verified status
  // Needed to compare that to the new synced data
  // old-dist.json is list of all old claims
  // old-dist-clean
  //

  //   const oldClean: any[] = fs.readJsonSync(cleanOldDistPath); // 1001 claims (-317 after clean up) = 684
  // const passed: any[] = fs.readJsonSync(oldPassedDistPath);
  // // console.log(passed.length); // 684...

  // const fucked = [];
  // oldClean.forEach((claim, i) => {
  //   if (claim.user && claim.claimAmount && claim.distributionId) {
  //     multi.call(
  //       `${claim.user}.${i.toString()}`,
  //       orchard.address,
  //       'verifyClaim',
  //       [
  //         claim.token,
  //         claim.briber,
  //         claim.distributionId,
  //         claim.user,
  //         claim.claimAmount,
  //         claim.merkleProof,
  //       ],
  //     );
  //   } else {
  //     console.log(claim);
  //     fucked.push(i);
  //   }
  // });

  // const verified = await multi.execute('');
  // console.log(verified);

  // const cleanOld = allShit.filter((claim, i) => !fucked.includes(i));

  // fs.writeJsonSync(cleanOldDistPath, cleanOld);
  // Object.entries(verified).forEach((verification, i) => {
  //   verification[1].forEach((claimPassedVerification, i) => {
  //     oldClean[i].claimPassedVerification = claimPassedVerification;
  //   });
  // });
  // fs.writeJsonSync(oldDistPath, oldClean);

  // passed.forEach((claim, i) => {
  //   multi.call(`${claim.user}.${i.toString()}`, orchard.address, 'isClaimed', [
  //     claim.token,
  //     claim.briber,
  //     claim.distributionId,
  //     claim.user,
  //   ]);
  // });

  // const claimed = await multi.execute('');

  // Object.entries(claimed).forEach((verification, i) => {
  //   verification[1].forEach((claimed, i) => {
  //     passed[i].claimed = claimed;
  //   });
  // });

  // // Busted ones should be removed from the verify check
  // // const unclaimed = passed.filter((p) => !p.claimed);
  // // console.log(unclaimed.length);
  // // fs.writeJsonSync(unclaimedPath, unclaimed);  // 271 unclaimed....

  const unclaimed: any[] = fs.readJsonSync(unclaimedPath);
  // const tokens = {};

  // const unclaimedInfo = unclaimed.reduce((prev, current) => {
  //   if (!prev[current.briber]) prev[current.briber] = {};

  //   if (!prev[current.briber][current.token]) {
  //     prev[current.briber][current.token] = {
  //       amountOwed: 0,
  //     };
  //   }

  //   const amount = bnStringToNumber(current.claimAmount, 18);
  //   prev[current.briber][current.token].amountOwed += amount;

  //   if (!tokens[current.token]) {
  //     tokens[current.token] = {
  //       amountOwed: 0,
  //     };
  //   }

  //   tokens[current.token].amountOwed += amount;

  //   return prev;
  // }, {});

  // for (const briber in unclaimedInfo) {
  //   for (const token in unclaimedInfo[briber]) {
  //     multi.call(`${briber}.${token}`, orchard.address, 'getRemainingBalance', [
  //       token,
  //       briber,
  //     ]);
  //   }
  // }

  // const balances = await multi.execute('');
  // //  console.log(balances);

  // for (const briber in balances) {
  //   for (const token in balances[briber]) {
  //     unclaimedInfo[briber][token].remainingBalance = ethNum(
  //       balances[briber][token],
  //     );
  //   }
  // }

  // for (const briber in unclaimedInfo) {
  //   for (const token in unclaimedInfo[briber]) {
  //     unclaimedInfo[briber][token].remainingBalance <
  //     unclaimedInfo[briber][token].amountOwed
  //       ? (unclaimedInfo[briber][token].insufficientBalance = true)
  //       : (unclaimedInfo[briber][token].insufficientBalance = false);
  //   }
  // }

  // fs.writeJsonSync(finalbalancesPath, {
  //   briberAmountsOwed: unclaimedInfo,
  //   totalTokenAmountsOwed: tokens,
  // });

  // // console.log(unclaimedInfo);
  // // console.log(tokens);

  // // TODO: Now create a distribution for all of these tokens/amount/bribers
  // // Need a root
  // // Generate fresh for each token/briber combo with all unclaimed
  // // TODO: ASSOCIATE UNCLAIMED TO THE ORIGINAL BRIBE..

  // // When iterating over unclaimedPath, get the gauge and the epochs, then users who voted for that gauge for that epochs
  // // That will align right with whats intended
  // const info = fs.readJsonSync(finalbalancesPath);

  //   const distros = unclaimed.reduce((prev, current) => {
  //     const epoch = current.epochStartTime;
  //     const gauge = current.gauge;

  //     if (!prev[epoch]) {
  //       prev[epoch] = {};
  //     }

  //     if (!prev[epoch][gauge]) {
  //       prev[epoch][gauge] = {};
  //     }

  //     const { userVotes, bribes } = getGaugeData(epoch, gauge);

  //     prev[epoch][gauge].bribes = bribes;
  //     prev[epoch][gauge].voters = getUsersMergedWithBalances(epoch, userVotes);

  //     prev[epoch][gauge].bribes.forEach((bribe) => {
  //       // let bribeClaims = getUsersBribeClaims(bribe, prev[epoch][gauge].voters);
  //       // // Per gauge bribe/token
  //       // const tree = generateMerkleTreeForBribes(epoch, bribeClaims);
  //       // bribe.merkleRoot = tree.root;
  //       // bribeClaims = attachUserProofs(bribeClaims, tree);
  //       //  prev[epoch][gauge].voters = bribeClaims;
  //     });

  //     return prev;
  //   }, {});

  //  console.log(distros); // This has the db ids...

  //  fs.writeJSONSync(lastDumbDistroPath, distros);

  // const distros = fs.readJSONSync(lastDumbDistroPath);

  // // Could predict dist ids per briber token dist then to, maybe, simplify

  // let totalClaims = 0;
  // for (const epoch in distros) {
  //   for (const gauge in distros[epoch]) {
  //     const bribes = distros[epoch][gauge].bribes;
  //     const voters = distros[epoch][gauge].voters;
  //     //  console.log(voters);

  //     bribes.forEach((bribe) => {
  //       console.log(`Gauge: ${gauge}`);
  //       console.log(`Token: ${bribe.token.address}`);
  //       console.log('bribe count: ' + bribes.length);
  //       console.log('voter count: ' + voters.length);
  //       const claims = getUsersBribeClaims(bribe, voters);
  //       console.log('claims count: ' + claims.length);
  //       console.log(`
  //       `);
  //       totalClaims += claims.length;

  //       // put each claim token under the gauge, or briber => token...

  //       // Not about briber though. It's about the group of voters for the gauge
  //       // Then get a piece of each bribe
  //     });
  //   }
  // }
  // console.log(totalClaims); // TODO: ..... ......833... from 271?...
  // // // 271 * 3 = 813 (There were a lot of missing proofs for the one dude)

  // TODO: distros jumps over the already verified good claims, thats why its back up to 800+
  // Why db ids is easier/more important
  // Have to start over.....

  // const noProofGuy = unclaimed.filter((c) => !c.merkleProof.length);
  // console.log(noProofGuy.map((u) => formatEther(u.claimAmount)));

  // Get briber balance for token (Can create new dist with same briber by creating adding function to contract)
  // operatorCreateDistribution()
}

function fillOldBribes() {
  fs.writeJsonSync(oldDistPath, []);
  const allOldDist: any[] = fs.readJSONSync(oldDistPath);
  const oldEpoch = 1677715200;
  const oldBribes: any[] = fs.readJSONSync(
    join(getEpochDir(oldEpoch), 'bribers-data-old.json'),
  );
  oldBribes.forEach((briber) => {
    briber.bribes.forEach((bribe) => {
      bribe.userTreeData.forEach((claimInfo) => {
        const claim = claimInfo.claims[0];
        allOldDist.push({
          user: claimInfo.user,
          distributionId: bribe.distribution.distributionId,
          briber: bribe.briber,
          token: bribe.token.address,
          gauge: bribe.gauge,
          bribeAmount: bribe.amount,
          epochStartTime: bribe.epochStartTime,
          merkleProof: claim.proof,
          claimAmount: claim.amountOwed,
          merkleRoot: bribe.merkleRoot,
        });
      });
    });
  });

  console.log('old dist count: ' + allOldDist.length);

  // Now 3/9, 3/16 and 3/23
  const epochs = [1678320000, 1678924800, 1679529600];

  const oldBribes2: any[] = fs.readJSONSync(
    join(getEpochDir(1678320000), 'bribers-data-old.json'), // 3/9
  );
  oldBribes2.forEach((bribe) => {
    bribe.users.forEach((claim) => {
      allOldDist.push({
        user: claim.user,
        distributionId: claim.distributionId,
        briber: bribe.briber,
        token: claim.token,
        gauge: bribe.gauge,
        bribeAmount: bribe.amount,
        epochStartTime: bribe.epochStartTime,
        merkleProof: claim.merkleProof,
        claimAmount: claim.claimAmount,
        merkleRoot: claim.merkleRoot,
      });
    });
  });

  console.log('old dist count now: ' + allOldDist.length);

  const oldBribes3: any[] = fs.readJSONSync(
    join(getEpochDir(1678924800), 'bribers-data-old.json'), // 3/16 TODO: Mine are here and need the distribution merkle root from contract..
  );

  oldBribes3.forEach((bribe) => {
    bribe.users.forEach((claim) => {
      allOldDist.push({
        user: claim.user,
        distributionId: claim.distributionId,
        briber: bribe.briber,
        token: claim.token,
        gauge: bribe.gauge,
        bribeAmount: bribe.amount,
        epochStartTime: bribe.epochStartTime,
        merkleProof: claim.merkleProof,
        claimAmount: claim.claimAmount,
        merkleRoot: claim.merkleRoot,
      });
    });
  });

  console.log('old dist count now: ' + allOldDist.length); //

  const oldBribes4: any[] = fs.readJSONSync(
    join(getEpochDir(1679529600), 'bribers-data-old.json'), // 3/23
  );

  oldBribes4.forEach((bribe) => {
    bribe.users.forEach((claim) => {
      allOldDist.push({
        user: claim.user,
        distributionId: claim.distributionId,
        briber: bribe.briber,
        token: claim.token,
        gauge: bribe.gauge,
        bribeAmount: bribe.amount,
        epochStartTime: bribe.epochStartTime,
        merkleProof: claim.merkleProof,
        claimAmount: claim.claimAmount,
        merkleRoot: claim.merkleRoot,
      });
    });
  });

  console.log('old dist count now: ' + allOldDist.length); // 1001

  fs.writeJsonSync(oldDistPath, allOldDist);
}
