import { config } from 'dotenv';
import { gql, GraphQLClient } from 'graphql-request';
import { Gauge } from 'src/types/gauge.types';
import { getSdk } from './generated/vertek-subgraph-types';

class VertekBackendService {
  private readonly gqlClient: GraphQLClient;

  get sdk() {
    return getSdk(this.gqlClient);
  }

  constructor() {
    config();
    this.gqlClient = new GraphQLClient(process.env.BACKEND_URL);
  }

  async getGauges(): Promise<Gauge[]> {
    const { getLiquidityGauges } = await this.gqlClient.request<{
      getLiquidityGauges: Gauge[];
    }>(gql`
      query {
        getLiquidityGauges {
          symbol
          address
          isKilled
          pool {
            name
          }
        }
      }
    `);

    return getLiquidityGauges.filter((g) => !g.isKilled);
  }

  async getGaugesWithBribes(epoch: number) {
    const { getAllGaugeBribes } = await this.sdk.GetBribes({
      epoch,
    });

    return getAllGaugeBribes.filter((g) => g.currentEpochBribes.length);
  }
}

export const gqlService = new VertekBackendService();
