import { BigNumber } from '@ethersproject/bignumber';
import { MAX_UINT256 } from './constants';
import { getERC20, getMulticaller } from './contract.utils';
import { logger } from './logger';
import { awaitTransactionComplete } from './web3.utils';

export async function approveTokensIfNeeded(
  tokens: string[],
  owner: string,
  spender: string,
) {
  try {
    logger.info(`Checking token allowances..`);

    const multicall = await getMulticaller([
      'function allowance(address, address) public view returns (uint256)',
    ]);

    tokens.forEach((token) => {
      multicall.call(`${token}.allowance`, token, 'allowance', [
        owner,
        spender,
      ]);
    });

    const allowances = await multicall.execute<
      Record<string, { allowance: BigNumber }>
    >('approveTokensIfNeeded');

    for (const record of Object.entries(allowances)) {
      const [token, info] = record;

      if (info.allowance.isZero()) {
        logger.info(`Approving token: ${token} - for spender ${spender}`);

        const erc20 = await getERC20(token);
        await awaitTransactionComplete(
          await erc20.approve(spender, MAX_UINT256),
        );
        logger.success('Token approval complete');
      }
    }
  } catch (error) {
    logger.error('approveTokensIfNeeded failed');
    throw error;
  }
}
