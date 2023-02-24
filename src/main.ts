import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from 'dotenv';
import { jobScheduler } from './services/job-scheduler.service';

async function bootstrap() {
  // App service will load env vars itself
  if (process.env.NODE_ENV !== 'production') {
    config();
  }

  jobScheduler.init();

  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 4545;
  await app.listen(port, () => {
    console.log('Listening on: ' + port);
  });
}

bootstrap();
