import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const NEON_DB_URL =
  'postgresql://neondb_owner:npg_P5B8JFwneQNm@ep-sweet-smoke-ax065f9w-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const rawUrl = process.env['DATABASE_URL'];
    const dbUrl = !rawUrl || rawUrl.includes('localhost') ? NEON_DB_URL : rawUrl;
    super({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
      log: process.env['NODE_ENV'] === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
