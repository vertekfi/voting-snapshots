import { formatEther } from '@ethersproject/units';
import { Contract } from 'ethers';
import { UserBalanceInfo } from 'src/types/user.types';
import { getMulticall } from './contract.utils';
import { getRpcProvider } from './web3.utils';
import * as moment from 'moment';

const veABI = [
  'function balanceOf(address, uint256) public view returns (uint256)',
  'function totalSupply(uint256 timestamp) public view returns (uint256)',
];

export async function getUsersVeBalancesForEpoch(
  epochTimestamp: number,
  users: string[],
) {
  // Balance snapshot needs to be for the end of the epoch to account for new stakers who vote during epoch
  // They should still be entitled to the bribes
  epochTimestamp = moment
    .unix(epochTimestamp)
    .utc()
    .add(1, 'week')
    .subtract(3, 'seconds')
    .unix();

  console.log(
    `Getting user balances for epoch: ${new Date(
      epochTimestamp * 1000,
    ).toUTCString()}`,
  );

  const votingEscrow = new Contract(
    '0x98A73443fb00EDC2EFF0520a00C53633226BF9ED',
    veABI,
    getRpcProvider(),
  );

  const multicall = getMulticall(veABI);

  users.forEach((user) =>
    multicall.call(`${user}.balance`, votingEscrow.address, 'balanceOf', [
      user,
      epochTimestamp,
    ]),
  );

  const [balances, totalSupplyAtEpochtime] = await Promise.all([
    multicall.execute('getUsersVeBalancesForEpoch'),
    votingEscrow.totalSupply(epochTimestamp),
  ]);

  const totalSupplyNum = parseFloat(formatEther(totalSupplyAtEpochtime._hex));

  const data = Object.entries(balances).map((info): UserBalanceInfo => {
    const [user, balance] = info;

    const balanceNum = parseFloat(formatEther(balance.balance._hex));
    const weightPercent = Number((balanceNum / totalSupplyNum).toFixed(12));

    return {
      user,
      balance: balanceNum,
      percentOfTotalVE: weightPercent,
    };
  });

  return {
    epochTimestamp,
    epochTimestampDateUTC: new Date(epochTimestamp * 1000).toUTCString(),
    votingEscrowTotalSupply: totalSupplyNum,
    data,
  };
}
