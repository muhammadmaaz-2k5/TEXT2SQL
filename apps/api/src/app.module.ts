import { Module } from '@nestjs/common';
import { AiController } from './ai/ai.controller';
import { AiPilotService } from './ai/ai-pilot.service';
import { AuthController } from './auth/auth.controller';
import { JwtAuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { CacheService } from './common/cache.service';
import { CryptoService } from './common/crypto.service';
import { StoreService } from './common/store.service';
import { DatabasesController } from './databases/databases.controller';
import { PostgresEngineService } from './databases/postgres-engine.service';
import { HealthController } from './health/health.controller';

@Module({
  imports: [],
  controllers: [AuthController, DatabasesController, AiController, HealthController],
  providers: [
    CryptoService,
    CacheService,
    StoreService,
    AuthService,
    JwtAuthGuard,
    PostgresEngineService,
    AiPilotService,
  ],
})
export class AppModule {}
