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
    this.gqlClient = new GraphQLClient(process.env.BACKEND_URL, {
      headers: {
        AdminApiKey: process.env.ADMIN_API_KEY,
      },
    });
  }

  async getGauges(epoch: number): Promise<Gauge[]> {
    const { getLiquidityGauges } = await this.gqlClient.request<{
      getLiquidityGauges: Gauge[];
    }>(gql`
      query {
        getLiquidityGauges(epoch: ${epoch}) {
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
}

export const gqlService = new VertekBackendService();
