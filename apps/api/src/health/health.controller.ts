import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { getSqlGuardStatus } from '@datapilot/sql-guard';

@ApiTags('System & Workspace')
@Controller()
export class HealthController {
  @Get('health')
  @ApiOperation({ summary: 'System health and security guard status' })
  health() {
    return {
      status: 'ok',
      service: 'datapilot-api',
      timestamp: new Date().toISOString(),
      sqlGuard: getSqlGuardStatus(),
      groqModel: process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b',
    };
  }
}
