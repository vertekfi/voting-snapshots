export interface Pool {
  name: string;
}

export interface Gauge {
  address: string;
  symbol: string;
  isKilled: boolean;
  pool: Pool;
}
