import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env'), override: true });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());

  // OpenTelemetry trace context & structured request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const traceId = (req.headers['x-trace-id'] as string | undefined) ?? randomUUID();
    res.setHeader('x-trace-id', traceId);
    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      console.log(
        JSON.stringify({
          level: 'info',
          service: process.env.OTEL_SERVICE_NAME ?? 'datapilot-api',
          traceId,
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs,
          timestamp: new Date().toISOString(),
        }),
      );
    });
    next();
  });

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('DataPilot AI API')
    .setDescription(
      'Multi-tenant Text-to-SQL, schema intelligence, and safe query execution API.',
    )
    .setVersion('1.0.0')
    .addCookieAuth('dp_access_token')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  console.log(
    JSON.stringify({
      level: 'info',
      msg: `DataPilot API listening on http://localhost:${port}/api/v1 (Docs: http://localhost:${port}/api/docs)`,
    }),
  );
}

void bootstrap();

