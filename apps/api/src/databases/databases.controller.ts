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
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { formatSql, validateSql } from '@datapilot/sql-guard';
import type { DesignerCreateTableInput } from '@datapilot/types';
import { type AuthenticatedRequest, JwtAuthGuard } from '../auth/auth.guard';
import { CacheService } from '../common/cache.service';
import { CryptoService } from '../common/crypto.service';
import { StoreService } from '../common/store.service';
import {
  ConnectExternalDatabaseDto,
  CreateManagedDatabaseDto,
  CsvConfirmImportDto,
  CsvPreviewDto,
  DesignerCreateTableDto,
  ExecuteSqlDto,
  ExplainSqlDto,
  FormatSqlDto,
  GenerateSeedDataDto,
  SchemaAiApplyDto,
  SchemaAiProposeDto,
  TestExternalConnectionDto,
} from './databases.dto';
import { PostgresEngineService } from './postgres-engine.service';

@ApiTags('Databases & Schema Introspection')
@Controller('databases')
@UseGuards(JwtAuthGuard)
export class DatabasesController {
  constructor(
    @Inject(StoreService) private readonly store: StoreService,
    @Inject(CryptoService) private readonly crypto: CryptoService,
    @Inject(CacheService) private readonly cache: CacheService,
    @Inject(PostgresEngineService) private readonly pgEngine: PostgresEngineService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List database connections for the active organization' })
  listDatabases(@Req() req: AuthenticatedRequest) {
    const orgId = req.user?.orgId ?? '';
    return {
      databases: this.store.listDatabasesForOrg(orgId),
    };
  }

  @Post('test-connection')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test a PostgreSQL connection before saving credentials' })
  async testConnection(@Body() dto: TestExternalConnectionDto) {
    return this.pgEngine.testConnection({
      engine: dto.engine ?? 'POSTGRESQL',
      host: dto.host,
      port: dto.port,
      databaseName: dto.databaseName,
      username: dto.username,
      password: dto.password,
      sslMode: dto.sslMode ?? 'prefer',
    });
  }

  @Post('external')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Test and save an external PostgreSQL connection with AES-256-GCM encryption',
  })
  async connectExternal(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ConnectExternalDatabaseDto,
  ) {
    const orgId = req.user?.orgId ?? '';
    const testResult = await this.pgEngine.testConnection({
      engine: dto.engine ?? 'POSTGRESQL',
      host: dto.host,
      port: dto.port,
      databaseName: dto.databaseName,
      username: dto.username,
      password: dto.password,
      sslMode: dto.sslMode ?? 'prefer',
    });

    if (!testResult.ok) {
      throw new BadRequestException(testResult.message);
    }

    const encryptedPassword = this.crypto.encryptCredential(dto.password);
    const created = this.store.createDatabaseConnection({
      organizationId: orgId,
      name: dto.name.trim(),
      engine: dto.engine ?? 'POSTGRESQL',
      isManaged: false,
      host: dto.host.trim(),
      port: dto.port,
      databaseName: dto.databaseName.trim(),
      username: dto.username.trim(),
      encryptedPassword,
      sslMode: dto.sslMode ?? 'prefer',
      readOnlyDefault: dto.readOnlyDefault ?? true,
      status: 'CONNECTED',
      tableCount: testResult.tableCount,
      lastSyncedAt: new Date().toISOString(),
    });

    return {
      database: created,
      testResult,
    };
  }

  @Post('managed')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Provision an isolated managed PostgreSQL database with least-privilege role and optional template',
  })
  async createManaged(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateManagedDatabaseDto,
  ) {
    const orgId = req.user?.orgId ?? '';
    const slug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const dbName = `dp_${slug || 'db'}_${randomUUID().slice(0, 4)}`;
    const username = `ro_${slug.slice(0, 12) || 'user'}`;
    const generatedSecret = randomUUID().replace(/-/g, '');
    const template = dto.template ?? 'shop_analytics';

    await this.pgEngine.ensureLocalPgDatabase(dbName, template);

    const created = this.store.createDatabaseConnection({
      organizationId: orgId,
      name: dto.name.trim(),
      engine: 'POSTGRESQL',
      isManaged: true,
      host: process.env.MANAGED_PG_HOST ?? 'localhost',
      port: Number(process.env.MANAGED_PG_PORT ?? 5433),
      databaseName: dbName,
      username,
      encryptedPassword: this.crypto.encryptCredential(generatedSecret),
      sslMode: 'prefer',
      readOnlyDefault: dto.readOnlyDefault ?? true,
      status: 'CONNECTED',
      tableCount: template === 'shop_analytics' ? 6 : template === 'saas_metrics' ? 3 : 0,
      lastSyncedAt: new Date().toISOString(),
    });

    // Introspect immediately so cache and exact tableCount are populated
    const stored = this.store.findDatabaseById(created.id, orgId);
    if (stored) {
      await this.pgEngine.getSchemaSnapshot(stored, true);
    }

    return {
      database: this.store.listDatabasesForOrg(orgId).find((d) => d.id === created.id) ?? created,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a database connection from the organization' })
  deleteDatabase(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const orgId = req.user?.orgId ?? '';
    const removed = this.store.deleteDatabaseConnection(id, orgId);
    if (!removed) {
      throw new NotFoundException('Database connection not found.');
    }
    this.cache.del(`schema:${id}`);
    return { success: true };
  }

  @Get(':id/schema')
  @ApiOperation({ summary: 'Get cached or freshly introspected PostgreSQL schema snapshot' })
  async getSchema(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('refresh') refresh?: string,
  ) {
    const orgId = req.user?.orgId ?? '';
    const conn = this.store.findDatabaseById(id, orgId);
    if (!conn) {
      throw new NotFoundException('Database connection not found.');
    }
    const force = refresh === 'true' || refresh === '1';
    return this.pgEngine.getSchemaSnapshot(conn, force);
  }

  @Post(':id/schema/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Force re-introspect PostgreSQL schema and refresh Redis snapshot' })
  async syncSchema(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const orgId = req.user?.orgId ?? '';
    const conn = this.store.findDatabaseById(id, orgId);
    if (!conn) {
      throw new NotFoundException('Database connection not found.');
    }
    return this.pgEngine.getSchemaSnapshot(conn, true);
  }

  @Post(':id/schema/preview-migration')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate reviewed SQL migration script from visual Schema Designer definition',
  })
  previewMigration(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: DesignerCreateTableDto,
  ) {
    const orgId = req.user?.orgId ?? '';
    const conn = this.store.findDatabaseById(id, orgId);
    if (!conn) {
      throw new NotFoundException('Database connection not found.');
    }
    const normalized: DesignerCreateTableInput = {
      tableName: dto.tableName,
      columns: dto.columns.map((c) => ({
        name: c.name,
        dataType: c.dataType,
        isNullable: c.isNullable ?? true,
        isPrimaryKey: c.isPrimaryKey ?? false,
        isUnique: c.isUnique ?? false,
        defaultValue: c.defaultValue,
        referencesTable: c.referencesTable,
        referencesColumn: c.referencesColumn,
      })),
      indexes: (dto.indexes ?? []).map((idx) => ({
        name: idx.name,
        columns: idx.columns,
        isUnique: idx.isUnique ?? false,
      })),
    };
    return this.pgEngine.previewCreateTableMigration(normalized);
  }

  @Post(':id/schema/apply-migration')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Apply reviewed Schema Designer migration inside a PostgreSQL transaction',
  })
  async applyMigration(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: DesignerCreateTableDto,
  ) {
    const orgId = req.user?.orgId ?? '';
    const conn = this.store.findDatabaseById(id, orgId);
    if (!conn) {
      throw new NotFoundException('Database connection not found.');
    }
    const normalized: DesignerCreateTableInput = {
      tableName: dto.tableName,
      columns: dto.columns.map((c) => ({
        name: c.name,
        dataType: c.dataType,
        isNullable: c.isNullable ?? true,
        isPrimaryKey: c.isPrimaryKey ?? false,
        isUnique: c.isUnique ?? false,
        defaultValue: c.defaultValue,
        referencesTable: c.referencesTable,
        referencesColumn: c.referencesColumn,
      })),
      indexes: (dto.indexes ?? []).map((idx) => ({
        name: idx.name,
        columns: idx.columns,
        isUnique: idx.isUnique ?? false,
      })),
    };
    return this.pgEngine.applyCreateTableMigration(conn, normalized);
  }

  @Post('format-sql')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Format SQL and run @datapilot/sql-guard AST validation' })
  formatAndValidateSql(@Body() dto: FormatSqlDto) {
    const formatted = formatSql(dto.sql);
    const validation = validateSql(formatted, {
      allowWrite: dto.allowWrite ?? false,
    });
    return {
      formattedSql: formatted,
      validation,
    };
  }

  @Post(':id/query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Validate SQL with sql-guard, check RBAC & cost cap, and execute safely with statement timeout and row limit',
  })
  async executeQuery(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ExecuteSqlDto,
  ) {
    const orgId = req.user?.orgId ?? '';
    const userId = req.user?.sub ?? '';
    const conn = this.store.findDatabaseById(id, orgId);
    if (!conn) {
      throw new NotFoundException('Database connection not found.');
    }

    const userRole = this.store.getUserRoleInOrg(userId, orgId) ?? 'VIEWER';
    const response = await this.pgEngine.executeSafeQuery(conn, userRole, {
      sql: dto.sql,
      allowWrite: dto.allowWrite,
      confirmedWrite: dto.confirmedWrite,
      rowLimit: dto.rowLimit,
      bypassCache: dto.bypassCache,
    });

    if (!response.requiresConfirmation && !response.validation.cached) {
      const userRecord = this.store.findUserById(userId);
      this.store.recordQueryHistory({
        organizationId: orgId,
        databaseId: conn.id,
        databaseName: conn.name,
        userId,
        userName: userRecord?.name ?? 'DataPilot User',
        prompt: null,
        sql: response.result.sql,
        explanation: `Executed ${response.validation.statementType} statement in SQL Editor.`,
        chart: null,
        rowCount: response.result.rowCount,
        durationMs: response.result.durationMs,
      });
    }

    return response;
  }

  @Post(':id/explain')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Run EXPLAIN (or EXPLAIN ANALYZE in a read-only rolled-back sandbox) and return the execution plan tree',
  })
  async explainQuery(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ExplainSqlDto,
  ) {
    const orgId = req.user?.orgId ?? '';
    const conn = this.store.findDatabaseById(id, orgId);
    if (!conn) {
      throw new NotFoundException('Database connection not found.');
    }
    return this.pgEngine.explainQuery(conn, {
      sql: dto.sql,
      analyze: dto.analyze,
    });
  }

  @Post(':id/schema/ai-propose')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Phase 6: Propose normalized PostgreSQL tables, columns, foreign keys, and indexes from a business description',
  })
  proposeSchemaAi(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SchemaAiProposeDto,
  ) {
    const orgId = req.user?.orgId ?? '';
    const conn = this.store.findDatabaseById(id, orgId);
    if (!conn) {
      throw new NotFoundException('Database connection not found.');
    }
    return this.pgEngine.proposeSchemaFromBusinessDescription(dto.description.trim());
  }

  @Post(':id/schema/ai-apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Phase 6: Apply a reviewed Schema AI multi-table migration inside a transaction',
  })
  async applySchemaAi(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SchemaAiApplyDto,
  ) {
    const orgId = req.user?.orgId ?? '';
    const userId = req.user?.sub ?? '';
    const role = this.store.getUserRoleInOrg(userId, orgId) ?? 'VIEWER';
    if (role === 'VIEWER') {
      throw new ForbiddenException('Viewer role cannot apply schema migrations.');
    }
    const conn = this.store.findDatabaseById(id, orgId);
    if (!conn) {
      throw new NotFoundException('Database connection not found.');
    }
    return this.pgEngine.applySchemaAiMigration(conn, dto.ddlSql);
  }

  @Post(':id/seed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Phase 6: Generate realistic seed data for a table with row-count controls (1-500 rows) and foreign key integrity',
  })
  async generateSeedData(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: GenerateSeedDataDto,
  ) {
    const orgId = req.user?.orgId ?? '';
    const userId = req.user?.sub ?? '';
    const role = this.store.getUserRoleInOrg(userId, orgId) ?? 'VIEWER';
    if (role === 'VIEWER' && !dto.previewOnly) {
      throw new ForbiddenException('Viewer role cannot insert seed data.');
    }
    const conn = this.store.findDatabaseById(id, orgId);
    if (!conn) {
      throw new NotFoundException('Database connection not found.');
    }
    return this.pgEngine.generateRealisticSeedData(conn, {
      tableName: dto.tableName.trim(),
      rowCount: dto.rowCount ?? 20,
      previewOnly: dto.previewOnly ?? false,
    });
  }

  @Post(':id/csv/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Phase 6: Infer PostgreSQL column types and preview rows from CSV data before import',
  })
  previewCsvImport(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CsvPreviewDto,
  ) {
    const orgId = req.user?.orgId ?? '';
    const conn = this.store.findDatabaseById(id, orgId);
    if (!conn) {
      throw new NotFoundException('Database connection not found.');
    }
    return this.pgEngine.previewCsvImport({
      tableName: dto.tableName.trim(),
      csvContent: dto.csvContent,
    });
  }

  @Post(':id/csv/import')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Phase 6: Confirm and import CSV data into a new PostgreSQL table inside a transaction',
  })
  async confirmCsvImport(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CsvConfirmImportDto,
  ) {
    const orgId = req.user?.orgId ?? '';
    const userId = req.user?.sub ?? '';
    const role = this.store.getUserRoleInOrg(userId, orgId) ?? 'VIEWER';
    if (role === 'VIEWER') {
      throw new ForbiddenException('Viewer role cannot import CSV tables.');
    }
    const conn = this.store.findDatabaseById(id, orgId);
    if (!conn) {
      throw new NotFoundException('Database connection not found.');
    }
    return this.pgEngine.confirmCsvImport(conn, {
      tableName: dto.tableName.trim(),
      csvContent: dto.csvContent,
      columnTypes: dto.columnTypes,
    });
  }
}

