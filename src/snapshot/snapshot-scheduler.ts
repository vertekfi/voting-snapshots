import * as schedule from 'node-schedule';

import { doNewEpochBribeSnapshot } from './index';

export function initSnapshotJob() {
  const rule = new schedule.RecurrenceRule();
  rule.dayOfWeek = 5; // Thursday
  rule.hour = 0;
  rule.minute = 1; // TODO: Allow retries for block/RPC data to update

  schedule.scheduleJob(rule, async () => {
    try {
      await doNewEpochBribeSnapshot();
    } catch (error) {
      console.log(error);

      console.log(`
      doBribeSnapshot failed
      `);
    }
  });

  console.log(`
  Snapshot job scheduled`);
}
