import { Injectable } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { monthRange } from '../../common/date-range';
import { PrismaService } from '../prisma/prisma.service';

type TrendGranularity = 'day' | 'month';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async monthly(userId: string, month?: string) {
    const { start, end } = monthRange(month);
    const [income, expense, refunds, recentTransactions, budgets, topCategories] =
      await Promise.all([
        this.sumTransactions(userId, start, end, [TransactionType.income]),
        this.sumTransactions(userId, start, end, [TransactionType.expense]),
        this.sumTransactions(userId, start, end, [TransactionType.refund]),
        this.prisma.transaction.findMany({
          where: { userId, deletedAt: null },
          include: { category: true },
          orderBy: { transactionDate: 'desc' },
          take: 6,
        }),
        this.prisma.budget.findMany({ where: { userId, month: start }, include: { category: true } }),
        this.categoryBreakdown(userId, start, end, 5),
      ]);

    const totalExpense = Math.abs(expense) - Math.abs(refunds);

    return {
      month: start.toISOString().slice(0, 7),
      incomeMinor: income,
      expenseMinor: totalExpense,
      balanceMinor: income - totalExpense,
      budgets,
      recentTransactions,
      topCategories,
      aiInsight:
        totalExpense > 0
          ? `本月支出 ${totalExpense / 100} 元，建议优先复盘分类占比最高的消费。`
          : '本月暂无足够消费数据生成建议。',
    };
  }

  async categories(userId: string, month?: string) {
    const { start, end } = monthRange(month);
    return {
      month: start.toISOString().slice(0, 7),
      items: await this.categoryBreakdown(userId, start, end),
    };
  }

  async trend(userId: string, granularityInput = 'month', countInput = '5', endInput?: string) {
    const granularity: TrendGranularity = granularityInput === 'day' ? 'day' : 'month';
    const count = this.clampCount(Number(countInput), granularity);
    const periods = this.trendPeriods(granularity, count, endInput);
    const first = periods[0];
    const last = periods[periods.length - 1];
    const start = first.start;
    const end = last.end;
    const totals = new Map<string, { incomeMinor: number; expenseMinor: number; refundMinor: number }>();

    periods.forEach((period) => {
      totals.set(period.period, { incomeMinor: 0, expenseMinor: 0, refundMinor: 0 });
    });

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        type: { in: [TransactionType.income, TransactionType.expense, TransactionType.refund] },
        transactionDate: { gte: start, lt: end },
      },
      select: { amountMinor: true, transactionDate: true, type: true },
    });

    transactions.forEach((transaction) => {
      const key = this.trendKey(transaction.transactionDate, granularity);
      const bucket = totals.get(key);
      if (!bucket) {
        return;
      }

      if (transaction.type === TransactionType.income) {
        bucket.incomeMinor += Math.abs(transaction.amountMinor);
      } else if (transaction.type === TransactionType.refund) {
        bucket.refundMinor += Math.abs(transaction.amountMinor);
      } else {
        bucket.expenseMinor += Math.abs(transaction.amountMinor);
      }
    });

    return {
      granularity,
      count,
      items: periods.map((period) => {
        const bucket = totals.get(period.period) ?? { incomeMinor: 0, expenseMinor: 0, refundMinor: 0 };
        const expenseMinor = Math.max(0, bucket.expenseMinor - bucket.refundMinor);
        return {
          period: period.period,
          label: period.label,
          incomeMinor: bucket.incomeMinor,
          expenseMinor,
        };
      }),
    };
  }

  private async sumTransactions(userId: string, start: Date, end: Date, types: TransactionType[]) {
    const result = await this.prisma.transaction.aggregate({
      where: { userId, deletedAt: null, type: { in: types }, transactionDate: { gte: start, lt: end } },
      _sum: { amountMinor: true },
    });
    return result._sum.amountMinor ?? 0;
  }

  private async categoryBreakdown(userId: string, start: Date, end: Date, take?: number) {
    const grouped = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        deletedAt: null,
        type: TransactionType.expense,
        transactionDate: { gte: start, lt: end },
      },
      _sum: { amountMinor: true },
      orderBy: { _sum: { amountMinor: 'asc' } },
      take,
    });

    const categoryIds = grouped.map((item) => item.categoryId).filter((id): id is string => Boolean(id));
    const categories = await this.prisma.category.findMany({ where: { userId, id: { in: categoryIds } } });
    const total = grouped.reduce((sum, item) => sum + Math.abs(item._sum.amountMinor ?? 0), 0);

    return grouped.map((item) => {
      const category = categories.find((candidate) => candidate.id === item.categoryId);
      const amountMinor = Math.abs(item._sum.amountMinor ?? 0);
      return {
        categoryId: item.categoryId,
        name: category?.name ?? '未分类',
        color: category?.color ?? '#999999',
        amountMinor,
        percent: total > 0 ? Number(((amountMinor / total) * 100).toFixed(1)) : 0,
      };
    });
  }

  private clampCount(value: number, granularity: TrendGranularity) {
    const fallback = granularity === 'day' ? 14 : 5;
    const max = granularity === 'day' ? 31 : 12;
    const count = Number.isInteger(value) ? value : fallback;
    return Math.max(1, Math.min(max, count));
  }

  private trendPeriods(granularity: TrendGranularity, count: number, endInput?: string) {
    if (granularity === 'day') {
      const endDay = this.parseDay(endInput) ?? this.startOfUtcDay(new Date());
      return Array.from({ length: count }, (_, index) => {
        const day = new Date(endDay);
        day.setUTCDate(endDay.getUTCDate() - (count - 1 - index));
        const next = new Date(day);
        next.setUTCDate(day.getUTCDate() + 1);
        const period = day.toISOString().slice(0, 10);
        return { start: day, end: next, period, label: period.slice(5) };
      });
    }

    const endMonth = this.parseMonth(endInput) ?? this.startOfUtcMonth(new Date());
    return Array.from({ length: count }, (_, index) => {
      const month = new Date(endMonth);
      month.setUTCMonth(endMonth.getUTCMonth() - (count - 1 - index));
      const next = new Date(month);
      next.setUTCMonth(month.getUTCMonth() + 1);
      const period = month.toISOString().slice(0, 7);
      return { start: month, end: next, period, label: period.slice(5) };
    });
  }

  private trendKey(date: Date, granularity: TrendGranularity) {
    const normalized = granularity === 'day' ? this.startOfUtcDay(date) : this.startOfUtcMonth(date);
    return normalized.toISOString().slice(0, granularity === 'day' ? 10 : 7);
  }

  private parseDay(value?: string) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return null;
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private parseMonth(value?: string) {
    if (!value || !/^\d{4}-\d{2}$/.test(value)) {
      return null;
    }

    const date = new Date(`${value}-01T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private startOfUtcDay(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private startOfUtcMonth(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }
}
