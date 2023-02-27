import * as moment from 'moment';
import * as fs from 'fs-extra';
import { join } from 'path';
import { Gauge } from 'src/types/gauge.types';

const epochFilePath = 'src/data/epochs.json';
fs.ensureFileSync(epochFilePath);

export const firstEpochStart = moment(new Date('2023-01-26'))
  .utc()
  .startOf('day');

export function getEpochSinceStart(weekFromStart: number) {
  return moment(firstEpochStart).add(weekFromStart, 'weeks').utc().unix();
}

export function getWeeksSinceStartEpoch() {
  return getStartOfThisWeekUTC().diff(firstEpochStart, 'weeks');
}

export function getStartOfThisWeekUTC() {
  // UTC week starts Thursdays
  const startOfThisWeekUTC = moment().utc().startOf('week');

  return startOfThisWeekUTC;
}

export function getStartOfNextWeekUTC() {
  return moment(getStartOfThisWeekUTC()).add(1, 'week');
}

export function getEpochRangeLabel(startTimestamp: number) {
  const start = moment.unix(startTimestamp).utc();
  const end = moment(start).utc().add(1, 'week').subtract(1, 'minute');
  return `${start.format('yyyyMMDD')}-${end.format('yyyyMMDD')}`;
}

export function getEpochDir(epochStart: number) {
  const epochDirectoryName = getEpochRangeLabel(epochStart);
  const epochDataDir = join(process.cwd(), 'src/data', epochDirectoryName);

  return epochDataDir;
}

export function getEpochsFile() {
  return fs.readJSONSync(join(process.cwd(), epochFilePath));
}

export function addNewEpochToFile(epoch) {
  const epochs: any[] = getEpochsFile();
  epochs.push(epoch);
  fs.writeJSONSync(join(process.cwd(), epochFilePath), epochs);
}

export function getGaugeFileName(gauge: Gauge) {
  return gauge.pool.name.split(' ').join('-');
}
