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
export const userBalanceFile = 'user-data.json';
export const userVotesFile = 'user-votes.json';
export const userDataFile = 'user-data.json';
export const userRewardDataFile = 'user-reward-data.json';
export const bribersDataFile = 'bribers-data.json';

export function setBribersData(epochDir: string, data: any[]) {
  const path = join(epochDir, bribersDataFile);
  fs.writeJSONSync(path, []);
  fs.writeJSONSync(path, data);
}

export function getBribersData(epochDir: string): any[] {
  return fs.readJSONSync(join(epochDir, bribersDataFile));
}

export function setUserRewardData(epochDir: string, data: any[]) {
  const path = join(epochDir, userRewardDataFile);
  fs.ensureFileSync(path);
  fs.writeJSONSync(path, data);
}

export function getUserRewardData(epochDir: string) {
  const path = join(epochDir, userRewardDataFile);
  fs.ensureFileSync(path);
  const rewardData: any[] = fs.readJSONSync(path);
  return rewardData || [];
}

export function getUserAddresses(epochDir: string) {
  const userAddresses: string[] = fs.readJSONSync(
    join(epochDir, voterAddressesFile),
  );
  return userAddresses;
}

export function getUsersGaugeVotes(epochDir: string) {
  const userVotes: UserGaugeVotes[] = fs.readJSONSync(
    join(epochDir, userVotesFile),
  );

  return userVotes;
}

export function getUsersFullData(epochDir: string) {
  const userData: UserInfo[] = fs.readJSONSync(join(epochDir, userDataFile));
  return userData;
}

export function getUserBalances(epochDir: string) {
  const balances: UserBalanceData = fs.readJSONSync(
    join(epochDir, userBalanceFile),
  );
  return balances;
}

export function getRawVotesEventData(epochDir: string) {
  const voteEventsData: UserBaseVoteInfo[] = fs.readJSONSync(
    join(epochDir, rawVotesFile),
  );
  return voteEventsData;
}

export function getDistributionDir(epochTimestamp: number) {
  return join(getEpochDir(epochTimestamp), 'distribution');
}

export function getUserMerkleDistribution(
  epochTimestamp: number,
  gauge: Gauge,
): UserMerkleSnapshot[] {
  const distDir = getDistributionDir(epochTimestamp);
  const epochLabel = getEpochRangeLabel(epochTimestamp);
  const filePath = `${getGaugeFileName(gauge)}-user-merkle-${epochLabel}.json`;

  return fs.readJSONSync(join(distDir, filePath));
}

export function saveEpochDistribution(
  epochTimestamp: number,
  gauge: Gauge,
  data,
  userTreeData,
) {
  const epochLabel = getEpochRangeLabel(epochTimestamp);
  const dir = getDistributionDir(epochTimestamp);
  fs.ensureDirSync(dir);
  fs.writeJSONSync(
    join(dir, `${getGaugeFileName(gauge)}-merkle-tree-${epochLabel}.json`),
    data,
  );

  fs.writeJSONSync(
    join(dir, `${getGaugeFileName(gauge)}-user-merkle-${epochLabel}.json`),
    userTreeData,
  );
}
