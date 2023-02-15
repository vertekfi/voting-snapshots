import { Controller, Get, Param } from '@nestjs/common';
import { timestamp } from 'rxjs';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('snapshot/:timestamp')
  getSnapshot(@Param('timestamp') timestamp: string) {
    //
  }
}
