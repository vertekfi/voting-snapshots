import * as schedule from 'node-schedule';
import { VoteDataService } from './vote-data.service';

class JobScheduler {
  constructor() {}

  init() {
    const voteDataService = new VoteDataService();

    const rule = new schedule.RecurrenceRule();
    rule.tz = 'Etc/UTC';
    rule.dayOfWeek = 4; // Thursday
    // 12:01am UTC
    rule.hour = 0;
    rule.minute = 1;

    schedule.scheduleJob('GaugeVotingAutomation', rule, async () => {
      try {
        // Gets converted into UTC time in the function
        await voteDataService.doVotingSnapshot(new Date());
      } catch (error) {
        throw error;
      }
    });
  }
}

export const jobScheduler = new JobScheduler();
