import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { validationExceptionFactory } from './common/validation';
import type { Env } from './config/env';

export const API_PREFIX = 'api/v1';

/** Shared app configuration, used by main.ts and e2e tests so both behave the same. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  (app as NestExpressApplication).set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  const origins = config.get('CORS_ORIGINS', { infer: true });
  if (origins.length > 0) {
    app.enableCors({
      origin: origins,
      credentials: true,
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
      exposedHeaders: ['Retry-After'],
    });
  }
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Coffee Roaster CRM API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, swaggerConfig));
}
