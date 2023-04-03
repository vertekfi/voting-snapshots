import { ContractTransaction } from '@ethersproject/contracts';
import { JsonRpcProvider, Provider } from '@ethersproject/providers';
import { Wallet } from 'ethers';

export async function sleep(ms = 3000) {
  console.log(`Sleeping for ${ms / 1000} seconds..`);
  return new Promise((res) => {
    setTimeout(res, ms);
  });
}

export function getRpcProvider() {
  return new JsonRpcProvider(process.env.BSC_RPC);
}

export function getSigner() {
  let wallet = new Wallet(process.env.DEV_KEY);
  const provider = getRpcProvider();
  wallet = wallet.connect(provider as any);

  return wallet;
}

export async function doTransaction(txResponse: ContractTransaction) {
  try {
    return awaitTransactionComplete(await txResponse);
  } catch (error) {
    throw error;
  }
}

export async function awaitTransactionComplete(
  txResponse: ContractTransaction,
  confirmations = 1,
) {
  try {
    txResponse = await txResponse;
    console.log(`- Starting transaction: ${txResponse.hash}`);
    console.log(
      `- Awaiting transaction receipt with (${confirmations}) confirmations... - ` +
        new Date().toLocaleString(),
    );

    const txReceipt = await txResponse.wait(confirmations);
    console.log(
      '- TransactionReceipt received - ' + new Date().toLocaleString(),
    );
    // success
    if (txReceipt.status === 1) {
      console.log(`Transaction successful`);
    }

    return txReceipt;
  } catch (error) {
    throw error; // Throw and try to let this be handled back in the call stack as needed
  }
}

export function getChainId() {
  return parseInt(process.env.CHAIN_ID);
}
