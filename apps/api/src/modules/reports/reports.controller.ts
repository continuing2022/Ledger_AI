import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import type { RequestUser } from '../../common/request-user';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('monthly')
  monthly(@CurrentUser() user: RequestUser, @Query('month') month?: string) {
    return this.reports.monthly(user.id, month);
  }

  @Get('categories')
  categories(@CurrentUser() user: RequestUser, @Query('month') month?: string) {
    return this.reports.categories(user.id, month);
  }

  @Get('trend')
  trend(
    @CurrentUser() user: RequestUser,
    @Query('granularity') granularity?: string,
    @Query('count') count?: string,
    @Query('end') end?: string,
  ) {
    return this.reports.trend(user.id, granularity, count, end);
  }
}
