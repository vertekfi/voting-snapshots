import { Controller, Get, Param } from '@nestjs/common';
import { timestamp } from 'rxjs';
import { VoteDataService } from './services/rewards/vote-data.service';

@Controller()
export class AppController {
  constructor() {}

  @Get('snapshot/:timestamp')
  getSnapshot(@Param('timestamp') timestamp: string) {
    //
  }
}
