import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OSS from 'ali-oss';
import { randomUUID } from 'crypto';
import { optionalString } from '../../common/parse';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async presignUpload(userId: string, body: Record<string, unknown>) {
    const fileName = optionalString(body.fileName);
    const mimeType = optionalString(body.mimeType);
    const sizeBytes = typeof body.sizeBytes === 'number' && Number.isInteger(body.sizeBytes) ? body.sizeBytes : undefined;
    if (!fileName || !mimeType || !sizeBytes) {
      throw new BadRequestException('fileName, mimeType and sizeBytes are required');
    }
    if (!mimeType.startsWith('image/')) {
      throw new BadRequestException('Only image uploads are supported');
    }
    if (sizeBytes > 8 * 1024 * 1024) {
      throw new BadRequestException('File size must be 8MB or less');
    }

    const transactionId = optionalString(body.transactionId);
    await this.assertTarget(userId, transactionId);

    const objectKey = `users/${userId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeFileName(fileName)}`;
    const attachment = await this.prisma.attachment.create({
      data: { userId, transactionId, objectKey, fileName, mimeType, sizeBytes },
    });

    return {
      attachment,
      uploadUrl: this.signedUrl(objectKey, 'PUT', mimeType),
      downloadUrl: this.signedUrl(objectKey, 'GET'),
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      expiresInSeconds: 900,
      storageConfigured: true,
    };
  }

  async presignDownload(userId: string, id: string) {
    const attachment = await this.prisma.attachment.findFirst({ where: { id, userId } });
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    return {
      attachment,
      downloadUrl: this.signedUrl(attachment.objectKey, 'GET'),
      method: 'GET',
      expiresInSeconds: 900,
      storageConfigured: true,
    };
  }

  private async assertTarget(userId: string, transactionId?: string) {
    if (transactionId) {
      const exists = await this.prisma.transaction.findFirst({ where: { id: transactionId, userId, deletedAt: null } });
      if (!exists) {
        throw new NotFoundException('Transaction not found');
      }
    }
  }

  private signedUrl(objectKey: string, method: 'GET' | 'PUT', contentType?: string) {
    const options: OSS.SignatureUrlOptions = { expires: 900, method };
    if (contentType) {
      options['Content-Type'] = contentType;
    }
    return this.ossClient().signatureUrl(objectKey, options);
  }

  private ossClient() {
    const region = this.config.get<string>('ALIYUN_OSS_REGION');
    const bucket = this.config.get<string>('ALIYUN_OSS_BUCKET');
    const accessKeyId = this.config.get<string>('ALIYUN_OSS_ACCESS_KEY_ID');
    const accessKeySecret = this.config.get<string>('ALIYUN_OSS_ACCESS_KEY_SECRET');
    if (!region || !bucket || !accessKeyId || !accessKeySecret) {
      throw new BadRequestException('Aliyun OSS is not configured');
    }

    const endpoint = this.config.get<string>('ALIYUN_OSS_ENDPOINT');
    const stsToken = this.config.get<string>('ALIYUN_OSS_STS_TOKEN');
    return new OSS({
      accessKeyId,
      accessKeySecret,
      bucket,
      endpoint: endpoint || undefined,
      region,
      secure: true,
      stsToken: stsToken || undefined,
    });
  }
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
}
