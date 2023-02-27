export interface Pool {
  name: string;
}

export interface Gauge {
  address: string;
  symbol: string;
  isKilled: boolean;
  pool: Pool;
}

export interface GaugeBribe {
  totalAmount: number; // What the briber put in
  token: string; // Could be bribed with the same token by multiple bribers
}
