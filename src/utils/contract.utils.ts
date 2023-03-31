import { Contract } from '@ethersproject/contracts';
import { Multicaller } from 'src/services/standalone/multicaller';
import * as orchardAbi from '../abis/MerkleOrchard.json';
import * as adminAbi from '../abis/VertekAdminActions.json';
import { getRpcProvider, getSigner } from './web3.utils';

export function getMerkleOrchard() {
  return new Contract(
    '0x27eDCe99d5aF44318358497fD5Af5C8e312F1721',
    orchardAbi,
    getSigner(),
  );
}

export function getMulticall(abi: string | Array<string>) {
  return new Multicaller(
    '0x4Ba82B21658CAE1975Fa26097d87bd48FF270124',
    getRpcProvider(),
    abi,
  );
}

export function getVertekAdminActions() {
  return new Contract(
    '0x85b3062122Dda49002471500C0F559C776FfD8DD',
    adminAbi,
    getSigner(),
  );
}

export function getGaugeController() {
  return new Contract(
    '0x99bFf5953843A211792BF3715b1b3b4CBeE34CE6',
    [
      'function checkpoint() external',
      'function time_total() external view returns (uint256)',
    ],
    getSigner(),
  );
}
