import { Controller, Get, Param } from '@nestjs/common';
import { timestamp } from 'rxjs';
import { VoteDataService } from './services/vote-data.service';

@Controller()
export class AppController {
  constructor(private readonly appService: VoteDataService) {}

  @Get('snapshot/:timestamp')
  getSnapshot(@Param('timestamp') timestamp: string) {
    //
  }
}
