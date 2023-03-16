import { join } from 'path';
import * as fs from 'fs-extra';
import {
  UserGaugeVotes,
  UserBalanceData,
  UserBaseVoteInfo,
  UserInfo,
  UserMerkleSnapshot,
} from 'src/types/user.types';
import {
  getEpochDir,
  getEpochRangeLabel,
  getGaugeFileName,
} from 'src/utils/epoch.utils';
import { Gauge } from 'src/types/gauge.types';

export const voterAddressesFile = 'voter-addresses.json';
export const rawVotesFile = 'raw-votes-data.json';
export const userBalanceFile = 'user-balances.json';
export const userVotesFile = 'user-votes.json';
export const userDataFile = 'user-data.json';
export const userRewardDataFile = 'user-reward-data.json';
export const bribersDataFile = 'bribers-data.json';
export const userClaimsFile = 'user-claims.json';
export const claimDistributionsFile = 'claim-distributions.json';
const claimsDir = 'claims';
const distributionFile = 'distributions.json';
const bribeDistributionFile = 'bribe-distributions.json';

export function setUserGaugeBribeClaims(
  epochDir: string,
  fileName: string,
  usersWhoVoted: any[],
) {
  const path = join(epochDir, claimsDir);
  fs.ensureDirSync(path);
  fs.writeJSONSync(join(path, `${fileName}.json`), usersWhoVoted);

  return getGaugeBribeClaims(epochDir, fileName);
}

export function setGaugeBribeClaims(
  epochDir: string,
  fileName: string,
  data: any[],
) {
  fs.writeJSONSync(join(join(epochDir, claimsDir), `${fileName}.json`), data);
}

export function getGaugeBribeClaims(epochDir: string, fileName: string) {
  const path = join(join(epochDir, claimsDir), `${fileName}.json`);
  const claims: any[] = fs.readJSONSync(path);
  return claims;
}

export function getUserClaims(epochDir: string) {
  return fs.readJSONSync(join(epochDir, userClaimsFile));
}

export function setUserClaims(epochDir: string, data: any[]) {
  fs.writeJSONSync(join(epochDir, userClaimsFile), data);
}

export function setBribersData(epochDir: string, data: any[]) {
  const path = join(epochDir, bribersDataFile);
  fs.writeJSONSync(path, data);
}

export function getBribersData(epochDir: string): any[] {
  return fs.readJSONSync(join(epochDir, bribersDataFile));
}

export function getUserRewardData(epochDir: string) {
  const path = join(epochDir, userRewardDataFile);
  fs.ensureFileSync(path);
  const rewardData: any[] = fs.readJSONSync(path);
  return rewardData || [];
}

export function getRawVotesData(epochDir: string) {
  const records: any[] = fs.readJSONSync(join(epochDir, rawVotesFile));

  return records;
}

export function setRawVotesData(epochDir: string, data: any[]) {
  fs.writeJSONSync(join(epochDir, rawVotesFile), data);
}

export function getUserAddresses(epochDir: string) {
  const userAddresses: string[] = fs.readJSONSync(
    join(epochDir, voterAddressesFile),
  );
  return userAddresses;
}

export function getUsersGaugeVotes(epochDir: string) {
  const userVotes: any[] = fs.readJSONSync(join(epochDir, userVotesFile));

  return userVotes;
}

export function setUsersGaugeVotes(epochDir: string, data: any[]) {
  fs.writeJSONSync(join(epochDir, userVotesFile), data);
}

export function getVotesForUser(epochDir: string, user: string) {
  const votes = getUsersGaugeVotes(epochDir);

  return votes.find((v) => v.user === user).votes;
}

export function getUsersFullData(epochDir: string) {
  const userData: UserInfo[] = fs.readJSONSync(join(epochDir, userDataFile));
  return userData;
}

export function setUsersFullData(epochDir: string, data: any[]) {
  fs.writeJSONSync(join(epochDir, userDataFile), data);
}

export function getUserBalances(epochDir: string) {
  const balances: {
    data: any[];
  } = fs.readJSONSync(join(epochDir, userBalanceFile));
  return balances;
}

export function setUserBalances(epochDir: string, data: any) {
  fs.writeJSONSync(join(epochDir, userBalanceFile), data);
}

export function getRawVotesEventData(epochDir: string) {
  const voteEventsData: UserBaseVoteInfo[] = fs.readJSONSync(
    join(epochDir, rawVotesFile),
  );
  return voteEventsData;
}

export function getDistributionData(epochDir: string) {
  return fs.readJSONSync(join(epochDir, distributionFile));
}

export function setDistributionData(epochDir: string, data: any) {
  fs.writeJSONSync(join(epochDir, distributionFile), data);
}

export function getBribeDistributionInfo(epochDir: string) {
  return fs.readJSONSync(join(epochDir, bribeDistributionFile));
}

export function setBribeDistributionInfo(epochDir: string, bribes: any) {
  fs.writeJSONSync(join(epochDir, bribeDistributionFile), bribes);
}

export function getBribeTree() {
  //
}
