import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { VoteDataService } from './services/vote-data.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [VoteDataService],
})
export class AppModule {
  constructor(appService: VoteDataService) {
    appService.doVotingSnapshot();
  }
}
