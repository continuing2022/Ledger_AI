import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TransactionSource, TransactionType } from '@prisma/client';
import { monthRange, parseDate } from '../../common/date-range';
import { toMinor } from '../../common/money';
import { enumValue, intParam, optionalString, optionalStringArray } from '../../common/parse';
import { CategoriesService } from '../categories/categories.service';
import { PrismaService } from '../prisma/prisma.service';

const includeRelations = {
  category: true,
  attachments: true,
} satisfies Prisma.TransactionInclude;

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
  ) {}

  async list(userId: string, query: Record<string, string | undefined>) {
    const page = intParam(query.page, 1, 1, 10_000);
    const pageSize = intParam(query.pageSize, 30, 1, 200);
    const { start, end } = monthRange(query.month);
    const keyword = query.keyword?.trim();

    const where: Prisma.TransactionWhereInput = {
      userId,
      deletedAt: null,
      transactionDate: { gte: start, lt: end },
      type: query.type ? enumValue(TransactionType, query.type, 'type') : undefined,
      categoryId: query.categoryId,
      OR: keyword
        ? [
            { merchant: { contains: keyword, mode: 'insensitive' } },
            { description: { contains: keyword, mode: 'insensitive' } },
            { tags: { has: keyword } },
          ]
        : undefined,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        include: includeRelations,
        orderBy: { transactionDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { items, page, pageSize, total };
  }

  async create(userId: string, body: Record<string, unknown>) {
    const data = await this.toMutationData(userId, body, true);
    return this.prisma.transaction.create({
      data: { ...data, userId } as Prisma.TransactionUncheckedCreateInput,
      include: includeRelations,
    });
  }

  async get(userId: string, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId, deletedAt: null },
      include: includeRelations,
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  async update(userId: string, id: string, body: Record<string, unknown>) {
    await this.get(userId, id);
    const data = await this.toMutationData(userId, body, false);
    return this.prisma.transaction.update({ where: { id }, data, include: includeRelations });
  }

  async softDelete(userId: string, id: string) {
    await this.get(userId, id);
    return this.prisma.transaction.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: includeRelations,
    });
  }

  private async toMutationData(userId: string, body: Record<string, unknown>, requireCore: boolean) {
    const categoryId = optionalString(body.categoryId);
    await this.categories.requireOwned(userId, categoryId);

    if (requireCore && body.amountMinor === undefined) {
      throw new BadRequestException('amountMinor is required');
    }

    return {
      type: body.type ? enumValue(TransactionType, body.type, 'type') : requireCore ? TransactionType.expense : undefined,
      amountMinor: body.amountMinor === undefined ? undefined : toMinor(body.amountMinor),
      transactionDate: body.transactionDate ? parseDate(body.transactionDate) : requireCore ? new Date() : undefined,
      merchant: optionalString(body.merchant),
      description: optionalString(body.description),
      categoryId,
      tags: optionalStringArray(body.tags),
      isIncludedInBudget:
        typeof body.isIncludedInBudget === 'boolean'
          ? body.isIncludedInBudget
          : requireCore
            ? true
            : undefined,
      source: body.source ? enumValue(TransactionSource, body.source, 'source') : requireCore ? TransactionSource.manual : undefined,
    } satisfies Prisma.TransactionUncheckedCreateInput | Prisma.TransactionUncheckedUpdateInput;
  }
}
