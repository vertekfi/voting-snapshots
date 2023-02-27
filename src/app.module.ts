import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { VoteDataService } from './services/rewards/vote-data.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [],
})
export class AppModule {
  constructor() {}
}
