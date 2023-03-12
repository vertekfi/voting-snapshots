export interface UserBaseVoteInfo {
  who: string;
  when: string;
  whenTimestamp: number;
  txHash: string;
  gauge: string;
  weightUsed: number;
  blockNumber: number;
}

export interface UserBalanceInfo {
  user: string;
  balance: number;
  percentOfTotalVE: number;
}

export interface UserBalanceData {
  epochTimestampDateUTC: string;
  epochTimestamp: number;
  votingEscrowTotalSupply: number;
  data: UserBalanceInfo[];
}

export interface UserGaugeVotes {
  user: string;
  votes: UserBaseVoteInfo[];
}

export interface UserInfo {
  user: string;
  balance: UserBalanceInfo;
  votes: UserBaseVoteInfo[];
  claims: any[];
}

export interface UserMerkleSnapshot {
  user: string;
  userGaugeRelativeWeight: number;
}

export interface UserGaugeSnapshotRelativeInfo {
  user: string;
  token: string;
  userGaugeRelativeWeight: number;
  userRelativeAmount: number;
  claims?: UserClaim[];
}

export interface UserClaim {
  gauge: string;
  token: string;
  userRelativeAmount: number;
  proof: string[];
  amountOwed: string;
}
