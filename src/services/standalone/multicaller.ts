import { set } from 'lodash';
import { Fragment, JsonFragment, Interface, Result } from '@ethersproject/abi';
import { Contract } from '@ethersproject/contracts';
import { BigNumber } from '@ethersproject/bignumber';
import { JsonRpcProvider } from '@ethersproject/providers';

export interface MulticallUserBalance {
  erc20Address: string;
  userAddress: string;
  balance: BigNumber;
}

export class Multicaller {
  private interface: Interface;
  public options: any = {};
  private calls: [string, string, any][] = [];
  private paths: any[] = [];
  private provider;
  private address;

  constructor(
    address: string,
    provider: JsonRpcProvider,
    abi: string | Array<Fragment | JsonFragment | string>,
    options = {},
  ) {
    this.address = address;
    this.interface = new Interface(abi);
    this.options = options;
    this.provider = provider;
  }

  call(
    path: string,
    address: string,
    functionName: string,
    params?: any[],
  ): Multicaller {
    this.calls.push([address, functionName, params]);
    this.paths.push(path);
    return this;
  }

  async execute<T extends Record<string, any>>(
    callId: string,
    from = {},
  ): Promise<T> {
    const obj = from;
    // not print the full exception for now, not polluting the log too much
    try {
      const results = await this.executeMulticall();
      results.forEach((result, i) => {
        set(obj, this.paths[i], result.length > 1 ? result : result[0]);
      });
    } catch (err) {
      console.log('multicall error', err);
      console.log(`callIdL ${callId}`);
      throw `Non-stacktrace multicall error`;
    }
    this.calls = [];
    this.paths = [];
    return obj as T;
  }

  private async executeMulticall(): Promise<Result[]> {
    const multi = new Contract(
      this.address,
      [
        'function aggregate(tuple[](address target, bytes callData) memory calls) public view returns (uint256 blockNumber, bytes[] memory returnData)',
      ],
      this.provider,
    );

    const [, res] = await multi.aggregate(
      this.calls.map(([address, functionName, params]) => {
        return [
          address,
          this.interface.encodeFunctionData(functionName, params),
        ];
      }),
      this.options,
    );

    return res.map((result: any, i: number) =>
      this.interface.decodeFunctionResult(this.calls[i][1], result),
    );
  }

  public get numCalls() {
    return this.calls.length;
  }

  //   public static async fetchBalances({
  //     rpc,
  //     balancesToFetch,
  //   }: {
  //     multicallAddress: string;
  //     rpc: AccountWeb3;
  //     balancesToFetch: { erc20Address: string; userAddress: string }[];
  //   }): Promise<MulticallUserBalance[]> {
  //     const chunks = chunk(balancesToFetch, 100);
  //     let data: MulticallUserBalance[] = [];

  //     for (const chunk of chunks) {
  //       const multicall = new Multicaller(rpc, [
  //         'function balanceOf(address) public view returns (uint256)',
  //       ]);

  //       for (const { erc20Address, userAddress } of chunk) {
  //         multicall.call(
  //           `${erc20Address}.${userAddress}`,
  //           erc20Address,
  //           'balanceOf',
  //           [userAddress],
  //         );
  //       }

  //       const response = (await multicall.execute()) as {
  //         [erc20Address: string]: { [userAddress: string]: BigNumber };
  //       };

  //       data = [
  //         ...data,
  //         ...map(response, (item, erc20Address) =>
  //           map(item, (balance, userAddress) => ({
  //             erc20Address: erc20Address.toLowerCase(),
  //             userAddress: userAddress.toLowerCase(),
  //             balance,
  //           })),
  //         ).flat(),
  //       ];
  //     }

  //     return data;
  //   }
}
