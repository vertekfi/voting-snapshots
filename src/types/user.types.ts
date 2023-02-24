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
  weightPercent: number;
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
}
