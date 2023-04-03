import { Contract } from '@ethersproject/contracts';
import { Multicaller } from 'src/services/standalone/multicaller';
import * as orchardAbi from '../abis/MerkleOrchard.json';
import * as adminAbi from '../abis/VertekAdminActions.json';
import * as erc20Abi from '../abis/ERC20.json';
import { CONTRACT_MAP } from './data';
import { getChainId, getRpcProvider, getSigner } from './web3.utils';

export function getMerkleOrchard() {
  return new Contract(
    getContractAddress('MerkleOrchard'),
    orchardAbi,
    getSigner(),
  );
}

export function getMulticaller(abi: string | Array<string>) {
  return new Multicaller(
    getContractAddress('Multicall'),
    getRpcProvider(),
    abi,
  );
}

export function getVertekAdminActions() {
  return new Contract(
    getContractAddress('VertekAdminActions'),
    adminAbi,
    getSigner(),
  );
}

export function getGaugeController() {
  return new Contract(
    getContractAddress('GaugeController'),
    [
      'function checkpoint() external',
      'function time_total() external view returns (uint256)',
    ],
    getSigner(),
  );
}

/**
 * Gets a contract address for the current chain id.
 * @param contractName
 * @returns
 */
export function getContractAddress(
  contractName: string,
  chainId?: number,
): string {
  // TODO: maybe type this
  const address = CONTRACT_MAP[contractName]
    ? CONTRACT_MAP[contractName][chainId || getChainId()]
    : null;
  if (!address) {
    throw new Error(`No address for contract: ${contractName}`);
  }

  return address;
}

export async function getERC20(address: string) {
  return new Contract(address, erc20Abi, await getSigner());
}
