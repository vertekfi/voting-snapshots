import { config } from 'dotenv';
import { gql, GraphQLClient } from 'graphql-request';
import { Gauge } from 'src/types/gauge.types';

class GqlService {
  private readonly gqlClient: GraphQLClient;

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
}

export const gqlService = new GqlService();
