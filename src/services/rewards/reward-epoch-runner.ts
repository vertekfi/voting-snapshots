import * as moment from 'moment';
import { UserInfo } from 'src/types/user.types';
import { getEpochDir } from 'src/utils/epoch.utils';
import { gqlService } from '../backend/gql.service';
import {
  associateBribesToBribers,
  generateRewardTree,
} from './reward-generator.service';
import { getUsersFullData, setBribersData } from './reward.utils';

export async function runBribeRewardsForEpoch() {
  const epoch = moment().utc().startOf('day').subtract(8, 'days');
  const epochDir = getEpochDir(epoch.unix());

  const gauges = await gqlService.getGaugesWithBribes(epoch.unix());
  //  const briberChannelParamsData = await getDistributionInfo(gauges);
  const userData: UserInfo[] = getUsersFullData(epochDir);
  const bribersBribes = associateBribesToBribers(gauges);

  setBribersData(epochDir, bribersBribes);

  for (const briber of bribersBribes) {
    for (const bribe of briber.bribes) {
      const gauge = bribe.gauge;

      bribe.userVotes = getGaugeVoters(userData, gauge);

      const { root, userTreeData } = generateRewardTree(
        bribe.userVotes,
        gauge,
        bribe.token,
        parseFloat(bribe.amount),
      );

      bribe.userTreeData = userTreeData;
      bribe.merkleRoot = root;
    }
  }

  setBribersData(epochDir, bribersBribes);
}

function getGaugeVoters(userData: UserInfo[], gauge: string) {
  return userData
    .reduce((prev, current) => {
      current.votes
        .filter((v) => v.gauge === gauge)
        .forEach((uv) => {
          prev.push({
            user: current.user,
            weightUsed: uv.weightUsed,
            gauge,
            ...current,
          });
        });

      return prev;
    }, [])
    .flat();
}
