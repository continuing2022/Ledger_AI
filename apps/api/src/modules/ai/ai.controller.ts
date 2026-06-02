import { Body, Controller, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import type { RequestUser } from '../../common/request-user';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('parse-transaction')
  parseTransaction(@CurrentUser() user: RequestUser, @Body() body: Record<string, unknown>) {
    return this.ai.parseTransaction(user.id, body);
  }

  @Post('jobs/:id/confirm')
  confirm(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.ai.confirm(user.id, id, body);
  }
}
