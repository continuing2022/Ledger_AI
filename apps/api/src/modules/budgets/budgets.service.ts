import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BudgetPeriod, Prisma, TransactionType } from '@prisma/client';
import { monthRange } from '../../common/date-range';
import { toMinor } from '../../common/money';
import { enumValue, optionalString } from '../../common/parse';
import { CategoriesService } from '../categories/categories.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
  ) {}

  async list(userId: string, month?: string) {
    const { start, end } = monthRange(month);
    const budgets = await this.prisma.budget.findMany({
      where: { userId, month: start },
      include: { category: true },
      orderBy: [{ categoryId: 'asc' }, { createdAt: 'asc' }],
    });

    const enriched = await Promise.all(
      budgets.map(async (budget) => {
        const used = await this.usedAmount(userId, start, end, budget.categoryId);
        return {
          ...budget,
          usedAmountMinor: used,
          usedPercent: budget.amountMinor > 0 ? Math.round((used / budget.amountMinor) * 100) : 0,
          isOverThreshold: budget.amountMinor > 0 ? (used / budget.amountMinor) * 100 >= budget.alertThreshold : false,
        };
      }),
    );

    return enriched;
  }

  async create(userId: string, body: Record<string, unknown>) {
    const name = optionalString(body.name);
    if (!name) {
      throw new BadRequestException('name is required');
    }
    if (body.amountMinor === undefined) {
      throw new BadRequestException('amountMinor is required');
    }
    const categoryId = optionalString(body.categoryId);
    await this.categories.requireOwned(userId, categoryId);
    const month = monthRange(optionalString(body.month)).start;

    return this.prisma.budget.create({
      data: {
        userId,
        name,
        period: body.period ? enumValue(BudgetPeriod, body.period, 'period') : BudgetPeriod.monthly,
        month,
        amountMinor: toMinor(body.amountMinor),
        categoryId,
        alertThreshold:
          typeof body.alertThreshold === 'number' && Number.isInteger(body.alertThreshold) ? body.alertThreshold : 80,
      },
      include: { category: true },
    });
  }

  async update(userId: string, id: string, body: Record<string, unknown>) {
    await this.requireOwned(userId, id);
    const categoryId = optionalString(body.categoryId);
    await this.categories.requireOwned(userId, categoryId);
    return this.prisma.budget.update({
      where: { id },
      data: {
        name: optionalString(body.name),
        period: body.period ? enumValue(BudgetPeriod, body.period, 'period') : undefined,
        month: body.month ? monthRange(optionalString(body.month)).start : undefined,
        amountMinor: body.amountMinor === undefined ? undefined : toMinor(body.amountMinor),
        categoryId,
        alertThreshold:
          typeof body.alertThreshold === 'number' && Number.isInteger(body.alertThreshold)
            ? body.alertThreshold
            : undefined,
      },
      include: { category: true },
    });
  }

  async remove(userId: string, id: string) {
    await this.requireOwned(userId, id);
    await this.prisma.budget.delete({ where: { id } });
    return { deleted: true };
  }

  private async usedAmount(userId: string, start: Date, end: Date, categoryId: string | null) {
    const where: Prisma.TransactionWhereInput = {
      userId,
      deletedAt: null,
      isIncludedInBudget: true,
      type: { in: [TransactionType.expense, TransactionType.refund] },
      transactionDate: { gte: start, lt: end },
      categoryId: categoryId ?? undefined,
    };
    const result = await this.prisma.transaction.aggregate({ where, _sum: { amountMinor: true } });
    return Math.abs(result._sum.amountMinor ?? 0);
  }

  private async requireOwned(userId: string, id: string) {
    const budget = await this.prisma.budget.findFirst({ where: { id, userId } });
    if (!budget) {
      throw new NotFoundException('Budget not found');
    }
  }
}
