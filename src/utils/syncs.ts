import { gqlService } from 'src/services/backend/gql.service';

export async function syncData(epoch: number, type: 'Bribe' | 'Vote') {
  console.log(type);
  console.time(`[${type} Sync]`);
  switch (type) {
    case 'Bribe':
      console.log('B');
      await gqlService.sdk.SyncEpochBribes({ epoch });
      break;
    case 'Vote':
      console.log('V');
      await gqlService.sdk.SyncEpochVotes({ epoch });
      break;
    default:
      throw new Error(`Unknown type ${type}`);
  }

  console.timeEnd(`[${type} Sync]`);
}
