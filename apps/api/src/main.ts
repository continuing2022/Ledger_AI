import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const origins = (config.get<string>('CORS_ORIGIN') ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins.length > 0 ? origins : true,
    credentials: true,
  });

  app.setGlobalPrefix('api', {
    exclude: ['health'],
  });

  const port = Number(config.get<string>('PORT') ?? 3000);
  const host = config.get<string>('HOST') ?? '0.0.0.0';
  await app.listen(port, host);
  console.log(`API listening on http://${host}:${port}`);
}

void bootstrap();
