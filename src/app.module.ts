import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { VoteDataService } from './services/vote-data.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [],
})
export class AppModule {
  constructor() {
    // appService.doVotingSnapshot(new Date('2023-02-02'));
  }
}
