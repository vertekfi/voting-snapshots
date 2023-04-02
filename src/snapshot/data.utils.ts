import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import * as fs from 'fs-extra';
import { join } from 'path';
import { getEpochDir } from 'src/utils/epoch.utils';
import {
  briberBalances,
  bribersUniqueFile,
  bribesFile,
  claimsFile,
  gaugesFile,
  tokensFile,
  userBalanceFile,
  userClaimsFile,
  userListFile,
  votesFile,
} from './constants';

export function createEpochDirectoryIfNeeded(epoch: number) {
  fs.ensureDirSync(getEpochDir(epoch));
}

export function getUserBalances(epoch: number): any[] {
  return fs.readJSONSync(join(getEpochDir(epoch), userBalanceFile));
}

export function setUserBalances(epoch: number, data: any[]) {
  fs.writeJSONSync(join(getEpochDir(epoch), userBalanceFile), data);
}

export function getBribes(epoch: number): any[] {
  return fs.readJSONSync(join(getEpochDir(epoch), bribesFile));
}

export function setBribes(epoch: number, data: any[]) {
  fs.writeJSONSync(join(getEpochDir(epoch), bribesFile), data);
}

export function getVotes(epoch: number): any[] {
  return fs.readJSONSync(join(getEpochDir(epoch), votesFile));
}

export function setVotes(epoch: number, data: any[]) {
  fs.writeJSONSync(join(getEpochDir(epoch), votesFile), data);
}

export function getGaugesAddressList(epoch: number): any[] {
  return fs.readJSONSync(join(getEpochDir(epoch), gaugesFile));
}

export function setGaugesAddressList(epoch: number, data: string[]) {
  fs.writeJSONSync(join(getEpochDir(epoch), gaugesFile), data);
}

export function getAllClaims(epoch: number): any[] {
  return fs.readJSONSync(join(getEpochDir(epoch), claimsFile));
}

export function setAllClaims(epoch: number, claims: string[]) {
  fs.writeJSONSync(join(getEpochDir(epoch), claimsFile), claims);
}

export function getGaugeVotes(epoch: number, gauge: string): any[] {
  return fs.readJSONSync(join(getEpochDir(epoch), `${gauge}`, `votes.json`));
}

export function setGaugeVotes(epoch: number, gauge: string, votes: any[]) {
  fs.ensureDirSync(join(getEpochDir(epoch), `${gauge}`));
  fs.writeJSONSync(join(getEpochDir(epoch), `${gauge}`, `votes.json`), votes);
}

export function getGaugeUserClaims(epoch: number, gauge: string): any[] {
  return fs.readJSONSync(join(getEpochDir(epoch), `${gauge}`, userClaimsFile));
}

export function setGaugeUserClaims(
  epoch: number,
  gauge: string,
  claims: any[],
) {
  fs.writeJSONSync(
    join(getEpochDir(epoch), `${gauge}`, userClaimsFile),
    claims,
  );
}

export function getGaugeUserClaimsDeeeezz(
  epoch: number,
  gauge: string,
  id: string,
): any[] {
  return fs.readJSONSync(join(getEpochDir(epoch), `${gauge}`, id));
}

export function setGaugeUserClaimsDeeeezz(
  epoch: number,
  gauge: string,
  id: string,
  claims: any[],
) {
  const path = join(getEpochDir(epoch), `${gauge}`, 'claims');
  // fs.removeSync(path);
  // fs.ensureDirSync(path);
  fs.writeJSONSync(join(path, id), claims);
}

export function getGaugeBribeMerkleTree(
  epoch: number,
  gauge: string,
  id: string,
): StandardMerkleTree<any> {
  return fs.readJSONSync(
    join(getEpochDir(epoch), `${gauge}`, 'merkle-trees', id),
  );
}

export function resetMerkleTrees(epoch: number, gauge: string) {
  const path = join(getEpochDir(epoch), `${gauge}`, 'merkle-trees');
  fs.removeSync(path);
  fs.ensureDirSync(path);
}

export function resetClaims(epoch: number, gauge: string) {
  const path = join(getEpochDir(epoch), `${gauge}`, 'claims');
  fs.removeSync(path);
  fs.ensureDirSync(path);
}

export function setGaugeBribeMerkleTree(
  epoch: number,
  gauge: string,
  tree: StandardMerkleTree<any>,
  id: string,
) {
  fs.writeJSONSync(
    join(getEpochDir(epoch), `${gauge}`, 'merkle-trees', id),
    tree,
  );
}

export function getGaugeData(
  epoch: number,
  gauge: string,
): { gauge: string; bribes: any[]; userVotes: any[] } {
  return fs.readJSONSync(join(getEpochDir(epoch), `${gauge}`, `data.json`));
}

export function setGaugeData(epoch: number, gauge: string, data: any) {
  fs.ensureDirSync(join(getEpochDir(epoch), `${gauge}`));
  fs.writeJSONSync(join(getEpochDir(epoch), `${gauge}`, `data.json`), data);
}

export function getUserAddressList(epoch: number): string[] {
  return fs.readJSONSync(join(getEpochDir(epoch), userListFile));
}

export function setUserAddressList(epoch: number, data: string[]) {
  fs.writeJSONSync(join(getEpochDir(epoch), userListFile), data);
}

export function getGaugeBribes(epoch: number, gauge: string): any[] {
  return fs.readJSONSync(join(getEpochDir(epoch), `${gauge}`, `bribes.json`));
}

export function setGaugeBribes(epoch: number, gauge: string, votes: any[]) {
  fs.ensureDirSync(join(getEpochDir(epoch), `${gauge}`));
  fs.writeJSONSync(join(getEpochDir(epoch), `${gauge}`, `bribes.json`), votes);
}

export function setEpochTokenList(epoch: number, data: string[]) {
  const path = join(getEpochDir(epoch), tokensFile);
  fs.writeJSONSync(path, data);
}

export function getEpochBribers(epoch: number): string[] {
  return fs.readJSONSync(join(getEpochDir(epoch), bribersUniqueFile));
}

export function setEpochBribers(epoch: number, data: any[]) {
  const path = join(getEpochDir(epoch), bribersUniqueFile);
  fs.writeJSONSync(path, data);
}

export function getBribersBalances(epoch: number): any[] {
  return fs.readJSONSync(join(getEpochDir(epoch), briberBalances));
}

export function setBribersBalances(epoch: number, data: any[]) {
  const path = join(getEpochDir(epoch), briberBalances);
  fs.writeJSONSync(path, data);
}

export function getEpochTokenList(epoch: number): string[] {
  return fs.readJSONSync(join(getEpochDir(epoch), tokensFile));
}
