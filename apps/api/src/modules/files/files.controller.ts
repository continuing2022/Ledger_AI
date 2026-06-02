import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import type { RequestUser } from '../../common/request-user';
import { FilesService } from './files.service';

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('presign-upload')
  presignUpload(@CurrentUser() user: RequestUser, @Body() body: Record<string, unknown>) {
    return this.files.presignUpload(user.id, body);
  }

  @Get(':id/presign-download')
  presignDownload(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.files.presignDownload(user.id, id);
  }
}
