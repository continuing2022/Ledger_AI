import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoryType } from '@prisma/client';
import { enumValue, optionalString } from '../../common/parse';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, type?: string) {
    return this.prisma.category.findMany({
      where: { userId, type: type ? enumValue(CategoryType, type, 'type') : undefined },
      orderBy: [{ isArchived: 'asc' }, { type: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(userId: string, body: Record<string, unknown>) {
    const name = optionalString(body.name);
    if (!name) {
      throw new BadRequestException('name is required');
    }

    await this.requireOwned(userId, optionalString(body.parentId));
    return this.prisma.category.create({
      data: {
        userId,
        name,
        type: enumValue(CategoryType, body.type, 'type'),
        icon: optionalString(body.icon),
        color: optionalString(body.color) ?? '#111111',
        parentId: optionalString(body.parentId),
      },
    });
  }

  async update(userId: string, id: string, body: Record<string, unknown>) {
    await this.requireOwned(userId, id);
    await this.requireOwned(userId, optionalString(body.parentId));
    return this.prisma.category.update({
      where: { id },
      data: {
        name: optionalString(body.name),
        type: body.type ? enumValue(CategoryType, body.type, 'type') : undefined,
        icon: optionalString(body.icon),
        color: optionalString(body.color),
        parentId: optionalString(body.parentId),
        isArchived: typeof body.isArchived === 'boolean' ? body.isArchived : undefined,
      },
    });
  }

  async requireOwned(userId: string, id?: string | null) {
    if (!id) {
      return;
    }
    const category = await this.prisma.category.findFirst({ where: { id, userId } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
  }
}
