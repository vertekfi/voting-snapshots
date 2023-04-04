import { join } from 'path';
import * as fs from 'fs-extra';
import {
  getMerkleOrchard,
  getOrchardMulticaller,
  getVertekAdminActions,
} from './utils/contract.utils';
import { attachUserProofs } from './snapshot';
import { getBribeMerkleTree } from './user-data';
import { formatEther, parseUnits } from '@ethersproject/units';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { BigNumber } from 'ethers';
import { doTransaction } from './utils/web3.utils';
import { getAddress } from 'ethers/lib/utils';

const oldDistPath = join(process.cwd(), 'src/data/old-dist.json');
const oldPassedDistPath = join(
  process.cwd(),
  'src/data/old-clean-passed-dist.json',
);
const cleanOldDistPath = join(process.cwd(), 'src/data/old-clean-dist.json');
const newDistPath = join(process.cwd(), 'src/data/new-dist.json');
const unclaimedPath = join(
  process.cwd(),
  'src/data/old-clean-unclaimed-dist.json',
);
const finalbalancesPath = join(
  process.cwd(),
  'src/data/old-clean-unclaimed-balances-dist.json',
);

const resetPath = join(process.cwd(), 'src/data/reset.json');
const resetTodoPath = join(process.cwd(), 'src/data/reset-todo.json');
const briberDistPath = join(process.cwd(), 'src/data/reset-briber-dist.json');

export async function fml2() {
  // const newDist: any[] = fs.readJsonSync(newDistPath);

  // Aggregate of all old briber-data.json userTreeData/users for all epochs so far
  // This is just a flat list of single claim instances
  // const oldDist: any[] = fs.readJSONSync(oldDistPath);

  // // Clean out unverified and claimed
  // const orchard = getMerkleOrchard();
  // const multi = getOrchardMulticaller();

  // const fucked = [];
  // oldDist.forEach((claim, i) => {
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
  //     // console.log(claim);
  //     fucked.push(i);
  //   }
  // });

  // // console.log(oldDist.length); // 1001
  // // console.log(fucked.length); // 317

  // // Filter out ones missing data
  // const cleanOld = oldDist.filter((c, i) => {
  //   return !fucked.includes(i);
  // });

  //console.log(cleanOld.length); // 684

  // cleanOld.forEach((claim, i) => {
  //   multi.call(`${i.toString()}.claimed`, orchard.address, 'isClaimed', [
  //     claim.token,
  //     claim.briber,
  //     claim.distributionId,
  //     claim.user,
  //   ]);
  // });

  // const claimed = await multi.execute('');
  // // console.log(claimed);

  // for (const claim of cleanOld) {
  //   const verified = await orchard.verifyClaim(
  //     claim.token,
  //     claim.briber,
  //     claim.distributionId,
  //     claim.user,
  //     claim.claimAmount,
  //     claim.merkleProof,
  //   );

  // for (const claim of cleanOld) {
  //   const claimed = await orchard.isClaimed(
  //     claim.token,
  //     claim.briber,
  //     claim.distributionId,
  //     claim.user,
  //   );

  //   console.log(claimed);

  //   claim.claimed = claimed;
  // }
  // fs.writeJsonSync(resetPath, cleanOld);

  // const reset: any[] = fs.readJSONSync(resetPath);
  // console.log(reset[0]);

  // const todo = reset.filter((r) => !r.claimed && r.claimPassedVerification);
  // console.log(todo.length); // 268

  // const toDist: any[] = fs.readJsonSync(resetTodoPath);
  // // TODO: Just regenerate these motherfuckers, add to db, update be/fe accordingly, and be the fuck done... orchard.operatorCreateDistribution()

  // // console.log(toDist[0]);

  // // Need to group by briber/token

  // const bribers = [];
  // const tokens = [];

  // toDist.forEach((dist) => {
  //   if (!bribers.includes(dist.briber)) {
  //     bribers.push(dist.briber);
  //   }

  //   if (!tokens.includes(dist.token)) {
  //     tokens.push(dist.token);
  //   }
  // });

  // // console.log(bribers);
  // // console.log(tokens);

  // const bribersTokens = {};

  // bribers.forEach((briber) => {
  //   bribersTokens[briber] = [];
  // });

  // bribers.forEach((briber) => {
  //   const bribes = toDist.filter((dist) => dist.briber === briber);
  //   //  console.log(`Briber ${briber} has (${bribes.length}) bribes to distribute`);

  //   bribes.forEach((b) => {
  //     if (!bribersTokens[briber].includes(b.token)) {
  //       bribersTokens[briber].push(b.token);
  //     }
  //   });
  // });

  // //  console.log(bribersTokens);

  // const briberDist = {};

  // let totalCheck = 0;
  // for (const briber in bribersTokens) {
  //   briberDist[briber] = {};
  //   for (const token of bribersTokens[briber]) {
  //     const combos = toDist.filter(
  //       (b) => b.token === token && b.briber === briber,
  //     );

  //     briberDist[briber][token] = {};
  //     briberDist[briber][token].oldClaims = combos;

  //     totalCheck += combos.length;

  //     // console.log(
  //     //   `Briber ${briber} has (${combos.length}) instances for token ${token}`,
  //     // );
  //   }
  // }

  // // console.log(briberDist);

  // // console.log('All combos: ' + totalCheck); // 268 (correct)
  // // console.log(briberDist);
  // fs.writeJSONSync(briberDistPath, briberDist);

  // // const doit = fs.readJSONSync(briberDistPath);

  // Object.entries(briberDist).forEach((dist) => {
  //   const [briber, tokensMap]: [string, any] = dist;

  //   Object.entries(tokensMap).forEach((tokenThing) => {
  //     const [token, claimObj]: [string, any] = tokenThing;
  //     const leaves = [];

  //     claimObj.oldClaims.forEach((claim) => {
  //       try {
  //         // console.log(formatEther(claim.claimAmount));
  //         claim.amountStr = formatEther(claim.claimAmount);
  //         //  console.log(claim.claimAmount.length);
  //         leaves.push([claim.user, claim.claimAmount]);
  //       } catch (error) {
  //         console.log('User amount too low');
  //         console.log(claim.claimAmount);
  //       }
  //     });

  //     const tree = StandardMerkleTree.of(leaves, ['address', 'uint256']);
  //     const merkleRoot = tree.root;

  //     claimObj.newClaims = attachUserProofs(claimObj.oldClaims, tree).map(
  //       (u) => {
  //         return {
  //           ...u,
  //           merkleRoot,
  //         };
  //       },
  //     );
  //   });
  // });

  // fs.writeJSONSync(briberDistPath, briberDist);

  // TODO: Make sure user claim amounts are right
  // Below function is showing crazy numbers, but above logging formatEther is good....

  await doOperatorDistributions();
}

async function doOperatorDistributions() {
  // const briberDist = fs.readJSONSync(briberDistPath);
  const orchard = getMerkleOrchard();
  // const admin = getVertekAdminActions();
  // let total = 0;

  // const deez = [];

  // for (const briberAddress in briberDist) {
  //   for (const tokenAddress in briberDist[briberAddress]) {
  //     const newClaims = briberDist[briberAddress][tokenAddress].newClaims;

  //     total += newClaims.length;

  //     const merkleRoot = newClaims[0].merkleRoot;
  //     const token = newClaims[0].token;
  //     const briber = newClaims[0].briber;
  //     let amount = 0;

  //     const distributionId = (
  //       await orchard.getNextDistributionId(token, briber)
  //     ).toNumber();

  //     newClaims.forEach((claim) => {
  //       claim.distributionId = distributionId;
  //       amount += parseFloat(claim.amountStr);
  //     });

  //     deez.push({
  //       token,
  //       briber,
  //       amount: parseUnits(String(amount)),
  //       // distributionId,
  //       merkleRoot,
  //     });
  //   }
  // }

  const data = fs.readJSONSync(join(process.cwd(), 'src/data/fixed-dist.json'));
  // console.log(data.logs.length); 17

  const briberDist = fs.readJSONSync(briberDistPath);

  data.logs.forEach((eventData) => {
    const evt = orchard.interface.decodeEventLog(
      'DistributionAdded',
      eventData.data,
      eventData.topics,
    );

    const briber = getAddress(`0x${eventData.topics[1].slice(26)}`);
    const token = `0x${eventData.topics[2].slice(26)}`.toLowerCase();
    const merkleRoot = evt.merkleRoot.toLowerCase();
    const distId = evt.distributionId.toNumber();

    console.log(briber);
    console.log(token);
    console.log(distId);

    const tokenClaims = briberDist[briber][token].newClaims;

    tokenClaims.forEach((claim) => {
      if (
        claim.briber === '0x1555D126e096A296A5870A566db224FD9Cf72f03' &&
        claim.token === '0x12b70d84dab272dc5a24f49bdbf6a4c4605f15da'
      ) {
        claim.distributionId = distId;
      }
    });

    fs.writeJSONSync(briberDistPath, briberDist);
    // console.log(evt.distributionId.toNumber());
  });

  // for (const briber in amounts) {
  //   const distros = deez.filter((d) => d.briber === briber);
  //   //  console.log(distros.length);
  //   const tokens = amounts[briber];
  //   // console.log(tokens);

  //   distros.forEach((d) => {
  //     const match = Object.keys(tokens);
  //     console.log(match);
  //   });

  //   for (const token in tokens) {
  //     const distroToken = distros.find((d) => d.token === token);
  //     //  console.log(distroToken);
  //   }
  // }
  // const tx = await doTransaction(admin.createBribeDistributions(orchard.address, deez));
  // hash 0x7917d45fb6e635429faf41a00cd9d66006cd576cc6764e07684da1640b8922c9

  // fs.writeJSONSync(join(process.cwd(), 'src/data/deez-final.json'), deez);
  // fs.writeJSONSync(briberDistPath, briberDist);
  // console.log(total); // 268 (good)
}
