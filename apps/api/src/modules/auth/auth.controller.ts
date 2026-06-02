import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import type { RequestUser } from '../../common/request-user';

@Controller('auth')
export class AuthController {
  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return user;
  }
}
