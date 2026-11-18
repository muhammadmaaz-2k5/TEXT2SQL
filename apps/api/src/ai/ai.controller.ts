import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import type { PublicAiQueryResponse } from '@datapilot/types';
import { type AuthenticatedRequest, JwtAuthGuard } from '../auth/auth.guard';
import { DEMO_RAW_API_KEY, StoreService } from '../common/store.service';
import { PostgresEngineService } from '../databases/postgres-engine.service';
import { AiPilotService } from './ai-pilot.service';
import {
  AiAskDto,
  BenchmarkIndexDto,
  CreateApiKeyDto,
  GenerateDashboardDto,
  InviteTeamMemberDto,
  OptimizeSqlDto,
  PublicAiQueryDto,
  ShareDashboardDto,
  UpdateDashboardLayoutDto,
  UpdateTeamMemberRoleDto,
} from './ai.dto';

@ApiTags('AI Ask, Optimizer & Dashboards')
@Controller()
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    @Inject(StoreService) private readonly store: StoreService,
    @Inject(PostgresEngineService) private readonly pgEngine: PostgresEngineService,
    @Inject(AiPilotService) private readonly aiPilot: AiPilotService,
  ) {}

  @Post('databases/:id/ask')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Ask a plain-English question against a database (Schema context -> Groq Structured Output -> sql-guard -> Safe Execution)',
  })
  async askDatabase(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: AiAskDto,
  ) {
    const orgId = req.user?.orgId ?? '';
    const userId = req.user?.sub ?? '';
    const conn = await this.store.findDatabaseById(id, orgId);
    if (!conn) {
      throw new NotFoundException('Database connection not found.');
    }

    const userRecord = await this.store.findUserById(userId);
    const userRole = (await this.store.getUserRoleInOrg(userId, orgId)) ?? 'VIEWER';

    return this.aiPilot.askDatabase(
      conn,
      {
        id: userId,
        name: userRecord?.name ?? 'DataPilot User',
        role: userRole,
      },
      {
        prompt: dto.prompt,
        history: dto.history ?? [],
        allowWrite: dto.allowWrite ?? false,
      },
    );
  }

  @Post('databases/:id/optimize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Run EXPLAIN in safe rolled-back sandbox, analyze plan bottlenecks, and suggest B-tree indexes',
  })
  async optimizeDatabaseQuery(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: OptimizeSqlDto,
  ) {
    const orgId = req.user?.orgId ?? '';
    const conn = await this.store.findDatabaseById(id, orgId);
    if (!conn) {
      throw new NotFoundException('Database connection not found.');
    }
    return this.aiPilot.optimizeQuery(conn, {
      sql: dto.sql,
      analyze: dto.analyze ?? true,
    });
  }

  @Post('databases/:id/benchmark-index')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Benchmark a recommended CREATE INDEX statement inside a rolled-back transaction',
  })
  async benchmarkIndex(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: BenchmarkIndexDto,
  ) {
    const orgId = req.user?.orgId ?? '';
    const conn = await this.store.findDatabaseById(id, orgId);
    if (!conn) {
      throw new NotFoundException('Database connection not found.');
    }
    return this.pgEngine.benchmarkIndexInSandbox(conn, {
      sql: dto.sql,
      createIndexSql: dto.createIndexSql,
    });
  }

  @Post('databases/:id/apply-index')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply a recommended CREATE INDEX statement to the schema' })
  async applyIndex(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: BenchmarkIndexDto,
  ) {
    const orgId = req.user?.orgId ?? '';
    const conn = await this.store.findDatabaseById(id, orgId);
    if (!conn) {
      throw new NotFoundException('Database connection not found.');
    }
    return this.pgEngine.applyRecommendedIndex(conn, dto.createIndexSql);
  }

  @Get('history')
  @ApiOperation({
    summary: 'List and search query history across the organization',
  })
  async listHistory(
    @Req() req: AuthenticatedRequest,
    @Query('databaseId') databaseId?: string,
    @Query('search') search?: string,
    @Query('savedOnly') savedOnly?: string,
  ) {
    const orgId = req.user?.orgId ?? '';
    const items = await this.store.listQueryHistory(orgId, {
      databaseId: databaseId || undefined,
      search: search || undefined,
      savedOnly: savedOnly === 'true' || savedOnly === '1',
    });
    return {
      history: items,
    };
  }

  @Patch('history/:id/save')
  @ApiOperation({ summary: 'Toggle bookmark/saved state on a query history item' })
  async toggleSave(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const orgId = req.user?.orgId ?? '';
    const updated = await this.store.toggleSaveQueryHistory(id, orgId);
    if (!updated) {
      throw new NotFoundException('Query history entry not found.');
    }
    return { item: updated };
  }

  @Post('history/:id/share')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a shareable link token for a query history item' })
  async shareHistory(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const orgId = req.user?.orgId ?? '';
    const updated = await this.store.shareQueryHistory(id, orgId);
    if (!updated) {
      throw new NotFoundException('Query history entry not found.');
    }
    return { item: updated };
  }

  // ==========================================================================
  // Dashboards Endpoints
  // ==========================================================================

  @Get('dashboards')
  @ApiOperation({ summary: 'List dashboards for the active organization and hydrate results' })
  async listDashboards(
    @Req() req: AuthenticatedRequest,
    @Query('databaseId') databaseId?: string,
  ) {
    const orgId = req.user?.orgId ?? '';
    const dashboards = await this.store.listDashboards(orgId, databaseId || undefined);
    const hydrated = [];
    for (const d of dashboards) {
      const conn = await this.store.findDatabaseById(d.databaseId, orgId);
      if (conn && d.widgets.some((w) => !w.lastResult)) {
        hydrated.push(await this.aiPilot.hydrateDashboardResults(conn, d));
      } else {
        hydrated.push(d);
      }
    }
    return { dashboards: hydrated };
  }

  @Post('dashboards/generate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Generate a grid of saved queries and charts from a plain-English dashboard prompt',
  })
  async generateDashboard(
    @Req() req: AuthenticatedRequest,
    @Body() dto: GenerateDashboardDto,
  ) {
    const orgId = req.user?.orgId ?? '';
    const conn = await this.store.findDatabaseById(dto.databaseId, orgId);
    if (!conn) {
      throw new NotFoundException('Database connection not found.');
    }
    const dashboard = await this.aiPilot.generateDashboardFromPrompt(conn, {
      prompt: dto.prompt,
      name: dto.name,
    });
    return { dashboard };
  }

  @Patch('dashboards/:id/layout')
  @ApiOperation({ summary: 'Save widget drag/reorder positions, sizes, and chart types' })
  async updateDashboardLayout(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateDashboardLayoutDto,
  ) {
    const orgId = req.user?.orgId ?? '';
    const dashboard = await this.store.findDashboardById(id, orgId);
    if (!dashboard) {
      throw new NotFoundException('Dashboard not found.');
    }

    const patchMap = new Map(dto.widgets.map((w) => [w.id, w]));
    dashboard.widgets = dashboard.widgets
      .map((w) => {
        const patch = patchMap.get(w.id);
        if (!patch) return w;
        return {
          ...w,
          position: patch.position,
          size: patch.size,
          chart: patch.chartType ? { ...w.chart, type: patch.chartType } : w.chart,
        };
      })
      .sort((a, b) => a.position - b.position);

    return { dashboard: await this.store.saveDashboard(dashboard) };
  }

  @Post('dashboards/:id/widgets/:widgetId/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh an individual dashboard widget against PostgreSQL' })
  async refreshWidget(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('widgetId') widgetId: string,
  ) {
    const orgId = req.user?.orgId ?? '';
    const dashboard = await this.store.findDashboardById(id, orgId);
    if (!dashboard) {
      throw new NotFoundException('Dashboard not found.');
    }
    const conn = await this.store.findDatabaseById(dashboard.databaseId, orgId);
    if (!conn) {
      throw new NotFoundException('Database connection not found.');
    }
    const updated = await this.aiPilot.refreshDashboardWidget(conn, dashboard, widgetId);
    return { dashboard: updated };
  }

  @Post('dashboards/:id/share')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Configure role-controlled share link for a dashboard' })
  async shareDashboard(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ShareDashboardDto,
  ) {
    const orgId = req.user?.orgId ?? '';
    const dashboard = await this.store.findDashboardById(id, orgId);
    if (!dashboard) {
      throw new NotFoundException('Dashboard not found.');
    }
    dashboard.shareMinRole = dto.minRole;
    if (dto.revoke) {
      dashboard.shareToken = null;
    } else if (!dashboard.shareToken) {
      dashboard.shareToken = `shr_dash_${randomUUID().slice(0, 8)}`;
    }
    return { dashboard: await this.store.saveDashboard(dashboard) };
  }

  @Delete('dashboards/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a dashboard' })
  async deleteDashboard(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const orgId = req.user?.orgId ?? '';
    const deleted = await this.store.deleteDashboard(id, orgId);
    if (!deleted) {
      throw new NotFoundException('Dashboard not found.');
    }
    return { success: true };
  }

  // ==========================================================================
  // Phase 7: Team RBAC Endpoints
  // ==========================================================================

  @Get('team/members')
  @ApiOperation({ summary: 'List organization team members and their roles' })
  async listTeamMembers(@Req() req: AuthenticatedRequest) {
    const orgId = req.user?.orgId ?? '';
    return {
      members: await this.store.listTeamMembers(orgId),
    };
  }

  @Post('team/members/invite')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Invite a team member by email with a role (OWNER/ADMIN/DEVELOPER/VIEWER)' })
  async inviteTeamMember(
    @Req() req: AuthenticatedRequest,
    @Body() dto: InviteTeamMemberDto,
  ) {
    const orgId = req.user?.orgId ?? '';
    const userId = req.user?.sub ?? '';
    const callerRole = (await this.store.getUserRoleInOrg(userId, orgId)) ?? 'VIEWER';
    if (callerRole !== 'OWNER' && callerRole !== 'ADMIN') {
      throw new ForbiddenException('Only Organization Owners and Admins can invite members.');
    }
    const member = await this.store.inviteTeamMember(orgId, {
      email: dto.email,
      name: dto.name,
      role: dto.role ?? 'DEVELOPER',
    });
    return { member };
  }

  @Patch('team/members/:id/role')
  @ApiOperation({ summary: 'Update a team member role within the organization' })
  async updateTeamMemberRole(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateTeamMemberRoleDto,
  ) {
    const orgId = req.user?.orgId ?? '';
    const userId = req.user?.sub ?? '';
    const callerRole = (await this.store.getUserRoleInOrg(userId, orgId)) ?? 'VIEWER';
    if (callerRole !== 'OWNER' && callerRole !== 'ADMIN') {
      throw new ForbiddenException('Only Organization Owners and Admins can change roles.');
    }
    const updated = await this.store.updateTeamMemberRole(id, orgId, dto.role);
    if (!updated) {
      throw new NotFoundException('Team member not found.');
    }
    return { member: updated };
  }

  @Delete('team/members/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a team member from the organization' })
  async removeTeamMember(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const orgId = req.user?.orgId ?? '';
    const userId = req.user?.sub ?? '';
    const callerRole = (await this.store.getUserRoleInOrg(userId, orgId)) ?? 'VIEWER';
    if (callerRole !== 'OWNER' && callerRole !== 'ADMIN') {
      throw new ForbiddenException('Only Organization Owners and Admins can remove members.');
    }
    const removed = await this.store.removeTeamMember(id, orgId);
    if (!removed) {
      throw new BadRequestException(
        'Cannot remove member (either not found or the last Organization Owner).',
      );
    }
    return { success: true };
  }

  // ==========================================================================
  // Phase 7: API Keys & Public REST Endpoint POST /api/v1/ai/query
  // ==========================================================================

  @Get('api-keys')
  @ApiOperation({ summary: 'List API keys for the active organization' })
  async listApiKeys(@Req() req: AuthenticatedRequest) {
    const orgId = req.user?.orgId ?? '';
    return {
      apiKeys: await this.store.listApiKeys(orgId),
      demoApiKey: orgId === 'org_acme_data_team' ? DEMO_RAW_API_KEY : undefined,
    };
  }

  @Post('api-keys')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generate a new API key (raw secret returned once; SHA-256 hash persisted)',
  })
  async createApiKey(@Req() req: AuthenticatedRequest, @Body() dto: CreateApiKeyDto) {
    const orgId = req.user?.orgId ?? '';
    const userId = req.user?.sub ?? '';
    const callerRole = (await this.store.getUserRoleInOrg(userId, orgId)) ?? 'VIEWER';
    if (callerRole === 'VIEWER') {
      throw new ForbiddenException('Viewers cannot generate API keys.');
    }
    const userRecord = await this.store.findUserById(userId);
    return await this.store.createApiKey(
      orgId,
      userId,
      userRecord?.name ?? 'DataPilot User',
      {
        name: dto.name,
        scopes: dto.scopes ?? ['read'],
      },
    );
  }

  @Delete('api-keys/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an API key' })
  async revokeApiKey(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const orgId = req.user?.orgId ?? '';
    const userId = req.user?.sub ?? '';
    const callerRole = (await this.store.getUserRoleInOrg(userId, orgId)) ?? 'VIEWER';
    if (callerRole === 'VIEWER') {
      throw new ForbiddenException('Viewers cannot revoke API keys.');
    }
    const revoked = await this.store.revokeApiKey(id, orgId);
    if (!revoked) {
      throw new NotFoundException('API key not found.');
    }
    return { apiKey: revoked };
  }

  @Post('ai/query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Public REST API: Translate plain-English prompt to AST-validated SQL, execute safely, and return results + chart spec',
  })
  async publicAiQuery(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PublicAiQueryDto,
  ): Promise<PublicAiQueryResponse> {
    const orgId = req.user?.orgId ?? '';
    const userId = req.user?.sub ?? '';

    if (req.apiKey && dto.allowWrite && !req.apiKey.scopes.includes('write')) {
      throw new ForbiddenException(
        'This API key only has "read" scope. Create a key with "write" scope to allow write queries.',
      );
    }

    const conn = await this.store.findDatabaseById(dto.databaseId, orgId);
    if (!conn) {
      throw new NotFoundException(
        `Database "${dto.databaseId}" not found in organization "${orgId}".`,
      );
    }

    const userRecord = await this.store.findUserById(userId);
    const role = req.apiKey
      ? req.apiKey.scopes.includes('write')
        ? 'DEVELOPER'
        : 'VIEWER'
      : ((await this.store.getUserRoleInOrg(userId, orgId)) ?? 'VIEWER');

    const askRes = await this.aiPilot.askDatabase(
      conn,
      {
        id: userId,
        name: req.apiKey ? `API Key (${req.apiKey.name})` : (userRecord?.name ?? 'API User'),
        role,
      },
      {
        prompt: dto.prompt,
        history: [],
        allowWrite: dto.allowWrite ?? false,
      },
    );

    if (askRes.executionError) {
      throw new BadRequestException(askRes.executionError);
    }

    const exec = askRes.execution;
    const rows =
      exec && !exec.requiresConfirmation
        ? exec.result.rows.slice(0, dto.rowLimit ?? 250)
        : [];
    const columns =
      exec && !exec.requiresConfirmation ? exec.result.columns : [];
    const durationMs =
      exec && !exec.requiresConfirmation ? exec.result.durationMs : 0;

    return {
      requestId: askRes.id,
      databaseId: conn.id,
      databaseName: conn.name,
      prompt: askRes.prompt,
      sql: askRes.structured.sql,
      queryType: askRes.structured.query_type,
      explanation: askRes.structured.explanation,
      chart: askRes.structured.chart,
      columns,
      rows,
      rowCount: rows.length,
      durationMs,
      modelUsed: askRes.modelUsed,
    };
  }
}
