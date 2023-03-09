import { JsonRpcProvider } from '@ethersproject/providers';

export function getRpcProvider() {
  return new JsonRpcProvider(process.env.BSC_RPC);
}
