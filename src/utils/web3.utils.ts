import { JsonRpcProvider } from '@ethersproject/providers';

import { Fragment, JsonFragment } from 'ethers';
import { Multicaller } from 'src/services/multicaller';

export function getMulticall(
  abi: string | Array<Fragment | JsonFragment | string>,
) {
  return new Multicaller(
    '0x4Ba82B21658CAE1975Fa26097d87bd48FF270124',
    getRpcProvider(),
    abi,
  );
}

export function getRpcProvider() {
  return new JsonRpcProvider(process.env.BSC_RPC);
}
