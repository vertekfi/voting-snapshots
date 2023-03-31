import * as moment from 'moment';
import { gqlService } from 'src/services/backend/gql.service';
import { getGaugeController } from 'src/utils/contract.utils';
import { doTransaction } from 'src/utils/web3.utils';

export async function getBribesForEpoch(epoch: number) {
  const { getBribes } = await gqlService.sdk.GetBribesInfo({
    filter: {
      epochStartTime: epoch,
    },
  });
  console.log(`
  There are (${getBribes.length}) total bribes this epoch`);

  return getBribes;
}

export async function getVotesForEpoch(epoch: number) {
  const { getGaugeVotes } = await gqlService.sdk.GetGaugeVotes({
    filter: {
      epochStartTime: epoch,
    },
  });
  console.log(`
  There are (${getGaugeVotes.count}) total votes this epoch`);

  return getGaugeVotes.votes;
}

// Check if we need to bump up controller epoch depending on automation timing
// TODO: With new simplicity this can just be moved into vertek lib repo then
export async function checkpointGaugeControllerIfNeeded() {
  const currentTimestamp = moment.utc();
  const controller = getGaugeController();
  const controllerEpochTimestamp = (await controller.time_total()).toNumber();

  console.log(`
  Current UTC time ${currentTimestamp.format()}`);

  console.log(`
  Current controller epoch time ${moment
    .unix(controllerEpochTimestamp)
    .utc()
    .format()}`);

  // Controller is hasn't been checkpointed for whatever reason to start of coming week (Thursday UTC 00:00)
  if (currentTimestamp.unix() > controllerEpochTimestamp) {
    await doTransaction(controller.checkpoint());
  } else {
    console.log('Controller epoch already up to date');
  }
}
