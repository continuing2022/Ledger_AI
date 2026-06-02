import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [TransactionsModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
