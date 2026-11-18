import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import type {
  ApiKeyItem,
  AuthUser,
  CreateApiKeyInput,
  CreateApiKeyResponse,
  DashboardItem,
  DatabaseConnectionItem,
  InviteTeamMemberInput,
  OrgRole,
  OrganizationSummary,
  QueryHistoryItem,
  TeamMemberItem,
} from '@datapilot/types';
import { CryptoService } from './crypto.service';
import { PrismaService } from './prisma.service';

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  avatarUrl: string | null;
  activeOrganizationId: string;
  createdAt: string;
}

export interface StoredOrganization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface StoredMembership {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  createdAt: string;
}

export interface StoredRefreshToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: number;
  revoked: boolean;
}

export interface StoredDatabaseConnection extends DatabaseConnectionItem {
  encryptedPassword: string;
}

export interface StoredApiKey extends ApiKeyItem {
  keyHash: string;
}

export const DEMO_RAW_API_KEY = 'dp_live_demo_acme_analytics_2026';

@Injectable()
export class StoreService implements OnModuleInit {
  constructor(
    @Inject(CryptoService) private readonly crypto: CryptoService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedIfEmpty();
  }

  // ============================================================================
  // Seeding
  // ============================================================================

  private async seedIfEmpty(): Promise<void> {
    const count = await this.prisma.user.count();
    if (count > 0) return;

    const now = new Date();
    const org1Id = 'org_acme_data_team';
    const org2Id = 'org_staging_ops';
    const demoUserId = 'usr_demo_pilot';

    await this.prisma.organization.createMany({
      data: [
        { id: org1Id, name: 'Acme Data Team', slug: 'acme-data-team', createdAt: now, updatedAt: now },
        { id: org2Id, name: 'Staging Analytics', slug: 'staging-analytics', createdAt: now, updatedAt: now },
      ],
    });

    await this.prisma.user.create({
      data: {
        id: demoUserId,
        email: 'pilot@datapilot.ai',
        name: 'Alex Rivera',
        passwordHash: this.crypto.hashPassword('DataPilot2026!'),
        activeOrganizationId: org1Id,
        createdAt: now,
        updatedAt: now,
      },
    });

    await this.prisma.organizationMember.createMany({
      data: [
        { organizationId: org1Id, userId: demoUserId, role: 'OWNER', createdAt: now },
        { organizationId: org2Id, userId: demoUserId, role: 'ADMIN', createdAt: now },
      ],
    });

    // Demo databases
    const encPwd1 = this.crypto.encryptCredential('dp_readonly_secret');
    const encPwd2 = this.crypto.encryptCredential('billing_ro_secret');
    await this.prisma.databaseConnection.createMany({
      data: [
        {
          id: 'db_shop_analytics',
          organizationId: org1Id,
          name: 'Shop Analytics (Demo)',
          engine: 'POSTGRESQL',
          isManaged: true,
          host: process.env['MANAGED_PG_HOST'] ?? 'localhost',
          port: Number(process.env['MANAGED_PG_PORT'] ?? 5433),
          databaseName: 'shop_analytics',
          username: 'dp_readonly_shop',
          encryptedCredential: encPwd1,
          sslMode: 'prefer',
          readOnlyDefault: true,
          status: 'CONNECTED',
          tableCount: 6,
          lastSyncedAt: now,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'db_billing_warehouse',
          organizationId: org1Id,
          name: 'Stripe Billing Warehouse',
          engine: 'POSTGRESQL',
          isManaged: false,
          host: 'warehouse.internal.acme.dev',
          port: 5432,
          databaseName: 'billing_prod',
          username: 'analyst_ro',
          encryptedCredential: encPwd2,
          sslMode: 'require',
          readOnlyDefault: true,
          status: 'CONNECTED',
          tableCount: 14,
          lastSyncedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    // Demo query history
    await this.prisma.queryHistory.createMany({
      data: [
        {
          id: 'qh_seed_1',
          organizationId: org1Id,
          databaseId: 'db_shop_analytics',
          userId: demoUserId,
          prompt: 'Show total revenue and completed order count by customer segment',
          sql: `SELECT\n  c.segment,\n  COUNT(o.id) AS completed_orders,\n  ROUND(SUM(o.total_cents) / 100.0, 2) AS revenue_usd\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nWHERE o.status = 'completed'\nGROUP BY c.segment\nORDER BY revenue_usd DESC\nLIMIT 500;`,
          explanation: 'Joins customers and orders on customer_id, filters to completed orders, and aggregates order count and USD revenue grouped by segment.',
          chartSpecJson: JSON.stringify({ type: 'bar', x: 'segment', y: ['revenue_usd', 'completed_orders'], title: 'Revenue & Orders by Segment' }),
          rowCount: 3,
          durationMs: 11,
          isSaved: true,
          createdAt: new Date(Date.now() - 45 * 60 * 1000),
        },
        {
          id: 'qh_seed_2',
          organizationId: org1Id,
          databaseId: 'db_shop_analytics',
          userId: demoUserId,
          prompt: 'Top 5 products by total revenue and units sold',
          sql: `SELECT\n  p.name AS product_name,\n  p.category,\n  SUM(oi.quantity) AS units_sold,\n  ROUND(SUM(oi.quantity * oi.unit_price_cents) / 100.0, 2) AS revenue_usd\nFROM products p\nJOIN order_items oi ON oi.product_id = p.id\nGROUP BY p.id, p.name, p.category\nORDER BY revenue_usd DESC\nLIMIT 5;`,
          explanation: 'Aggregates order_items joined to products to compute total units sold and revenue in USD for the top 5 products.',
          chartSpecJson: JSON.stringify({ type: 'bar', x: 'product_name', y: ['revenue_usd'], title: 'Top Products by Revenue (USD)' }),
          rowCount: 4,
          durationMs: 9,
          isSaved: true,
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
        {
          id: 'qh_seed_3',
          organizationId: org1Id,
          databaseId: 'db_shop_analytics',
          userId: demoUserId,
          prompt: 'Revenue breakdown by shipping region',
          sql: `SELECT\n  shipping_region,\n  COUNT(*) AS total_orders,\n  ROUND(SUM(total_cents) / 100.0, 2) AS regional_revenue_usd\nFROM orders\nWHERE status = 'completed'\nGROUP BY shipping_region\nORDER BY regional_revenue_usd DESC\nLIMIT 500;`,
          explanation: 'Groups completed orders by shipping_region to compare order count and revenue across regions.',
          chartSpecJson: JSON.stringify({ type: 'pie', x: 'shipping_region', y: ['regional_revenue_usd'], title: 'Revenue by Shipping Region' }),
          rowCount: 3,
          durationMs: 7,
          isSaved: false,
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      ],
    });

    // Demo dashboard
    const widgetsJson = JSON.stringify([
      {
        id: 'w_kpi_summary',
        title: 'Completed Revenue & Order Volume',
        subtitle: 'All-time completed orders in USD',
        sql: `SELECT\n  ROUND(SUM(total_cents) / 100.0, 2) AS completed_revenue_usd,\n  COUNT(*) AS completed_orders\nFROM orders\nWHERE status = 'completed'\nLIMIT 10;`,
        chart: { type: 'kpi', x: null, y: ['completed_revenue_usd', 'completed_orders'], title: 'Completed Revenue & Order Volume' },
        size: 'sm', position: 0, lastResult: null, refreshedAt: null,
      },
      {
        id: 'w_monthly_trend',
        title: 'Monthly Revenue Trend (USD)',
        subtitle: 'Completed order revenue by calendar month',
        sql: `SELECT\n  TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,\n  ROUND(SUM(total_cents) / 100.0, 2) AS revenue_usd,\n  COUNT(*) AS order_count\nFROM orders\nWHERE status = 'completed'\nGROUP BY DATE_TRUNC('month', created_at)\nORDER BY DATE_TRUNC('month', created_at) ASC\nLIMIT 500;`,
        chart: { type: 'area', x: 'month', y: ['revenue_usd'], title: 'Monthly Revenue Trend (USD)' },
        size: 'md', position: 1, lastResult: null, refreshedAt: null,
      },
    ]);

    await this.prisma.dashboard.create({
      data: {
        id: 'dash_exec_sales',
        organizationId: org1Id,
        databaseId: 'db_shop_analytics',
        name: 'Executive Sales & Order Health',
        description: 'Generated from prompt: "sales dashboard with revenue, monthly trend, top customers, failed orders"',
        shareToken: 'shr_dash_exec_2026',
        widgetsJson,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Demo API key
    const keyHash = createHash('sha256').update(DEMO_RAW_API_KEY).digest('hex');
    await this.prisma.apiKey.create({
      data: {
        id: 'ak_demo_primary',
        organizationId: org1Id,
        name: 'Production Analytics Pipeline',
        keyPrefix: `${DEMO_RAW_API_KEY.slice(0, 14)}...`,
        keyHash,
        createdAt: now,
      },
    });
  }

  // ============================================================================
  // Mongo sync status shim (for health endpoint compat)
  // ============================================================================
  getMongoSyncStatus(): { status: string; configured: boolean } {
    return { status: 'disabled', configured: false };
  }

  // ============================================================================
  // User helpers
  // ============================================================================

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    const u = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    return u ? this.toStoredUser(u) : null;
  }

  async findUserById(id: string): Promise<StoredUser | null> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    return u ? this.toStoredUser(u) : null;
  }

  private toStoredUser(u: { id: string; email: string; name: string; passwordHash: string | null; avatarUrl: string | null; activeOrganizationId: string | null; createdAt: Date }): StoredUser {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      passwordHash: u.passwordHash ?? '',
      avatarUrl: u.avatarUrl,
      activeOrganizationId: u.activeOrganizationId ?? '',
      createdAt: u.createdAt.toISOString(),
    };
  }

  async buildAuthUser(user: StoredUser): Promise<AuthUser> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId: user.id },
      include: { organization: true },
    });

    const organizations: OrganizationSummary[] = memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role as OrgRole,
      createdAt: m.organization.createdAt.toISOString(),
    }));

    const activeOrganizationId =
      organizations.find((o) => o.id === user.activeOrganizationId)?.id ??
      organizations[0]?.id ?? '';

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      activeOrganizationId,
      organizations,
      createdAt: user.createdAt,
    };
  }

  async createUserWithOrganization(input: {
    name: string;
    email: string;
    passwordHash: string;
    organizationName: string;
  }): Promise<AuthUser> {
    const now = new Date();
    const orgId = `org_${randomUUID().slice(0, 8)}`;
    const userId = `usr_${randomUUID().slice(0, 8)}`;
    const baseSlug = input.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const slug = `${baseSlug || 'workspace'}-${randomUUID().slice(0, 4)}`;

    await this.prisma.organization.create({
      data: { id: orgId, name: input.organizationName.trim(), slug, createdAt: now, updatedAt: now },
    });

    await this.prisma.user.create({
      data: {
        id: userId,
        email: input.email.trim().toLowerCase(),
        name: input.name.trim(),
        passwordHash: input.passwordHash,
        activeOrganizationId: orgId,
        createdAt: now,
        updatedAt: now,
      },
    });

    await this.prisma.organizationMember.create({
      data: { organizationId: orgId, userId, role: 'OWNER', createdAt: now },
    });

    // Add demo database connection for new org
    const encPwd = this.crypto.encryptCredential('dp_readonly_secret');
    await this.prisma.databaseConnection.create({
      data: {
        id: `db_${randomUUID().slice(0, 8)}`,
        organizationId: orgId,
        name: 'Shop Analytics (Demo)',
        engine: 'POSTGRESQL',
        isManaged: true,
        host: process.env['MANAGED_PG_HOST'] ?? 'localhost',
        port: Number(process.env['MANAGED_PG_PORT'] ?? 5433),
        databaseName: 'shop_analytics',
        username: 'dp_readonly_shop',
        encryptedCredential: encPwd,
        sslMode: 'prefer',
        readOnlyDefault: true,
        status: 'CONNECTED',
        tableCount: 6,
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });

    const user = await this.findUserById(userId);
    return this.buildAuthUser(user!);
  }

  async switchActiveOrganization(userId: string, organizationId: string): Promise<AuthUser | null> {
    const member = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!member) return null;
    await this.prisma.user.update({ where: { id: userId }, data: { activeOrganizationId: organizationId } });
    const user = await this.findUserById(userId);
    return user ? this.buildAuthUser(user) : null;
  }

  // ============================================================================
  // Refresh Tokens
  // ============================================================================

  async saveRefreshToken(userId: string, token: string, expiresAt: number): Promise<void> {
    // Clean expired tokens for this user
    await this.prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(expiresAt),
      },
    });
  }

  async consumeRefreshToken(token: string): Promise<StoredUser | null> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!record || record.revokedAt !== null || record.expiresAt < new Date()) return null;
    await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
    return this.findUserById(record.userId);
  }

  async revokeRefreshToken(token: string): Promise<void> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await this.prisma.refreshToken.updateMany({ where: { tokenHash }, data: { revokedAt: new Date() } });
  }

  // ============================================================================
  // Database Connections
  // ============================================================================

  async listDatabasesForOrg(organizationId: string): Promise<DatabaseConnectionItem[]> {
    const dbs = await this.prisma.databaseConnection.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return dbs.map((db) => this.toDbConnectionItem(db));
  }

  async findDatabaseById(id: string, organizationId: string): Promise<StoredDatabaseConnection | undefined> {
    const db = await this.prisma.databaseConnection.findFirst({ where: { id, organizationId } });
    if (!db) return undefined;
    return {
      ...this.toDbConnectionItem(db),
      encryptedPassword: db.encryptedCredential,
    };
  }

  private toDbConnectionItem(db: {
    id: string; organizationId: string; name: string; engine: string; isManaged: boolean;
    host: string; port: number; databaseName: string; username: string; sslMode: string;
    readOnlyDefault: boolean; status: string; tableCount: number; lastSyncedAt: Date | null; createdAt: Date;
  }): DatabaseConnectionItem {
    return {
      id: db.id,
      organizationId: db.organizationId,
      name: db.name,
      engine: db.engine as DatabaseConnectionItem['engine'],
      isManaged: db.isManaged,
      host: db.host,
      port: db.port,
      databaseName: db.databaseName,
      username: db.username,
      sslMode: db.sslMode as DatabaseConnectionItem['sslMode'],
      readOnlyDefault: db.readOnlyDefault,
      status: db.status as DatabaseConnectionItem['status'],
      tableCount: db.tableCount,
      lastSyncedAt: db.lastSyncedAt?.toISOString() ?? null,
      createdAt: db.createdAt.toISOString(),
    };
  }

  async getUserRoleInOrg(userId: string, organizationId: string): Promise<OrgRole | null> {
    const m = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    return (m?.role as OrgRole) ?? null;
  }

  async createDatabaseConnection(conn: Omit<StoredDatabaseConnection, 'id' | 'createdAt'>): Promise<DatabaseConnectionItem> {
    const now = new Date();
    const db = await this.prisma.databaseConnection.create({
      data: {
        id: `db_${randomUUID().slice(0, 8)}`,
        organizationId: conn.organizationId,
        name: conn.name,
        engine: conn.engine,
        isManaged: conn.isManaged,
        host: conn.host,
        port: conn.port,
        databaseName: conn.databaseName,
        username: conn.username,
        encryptedCredential: conn.encryptedPassword,
        sslMode: conn.sslMode,
        readOnlyDefault: conn.readOnlyDefault,
        status: conn.status,
        tableCount: conn.tableCount,
        lastSyncedAt: conn.lastSyncedAt ? new Date(conn.lastSyncedAt) : null,
        createdAt: now,
        updatedAt: now,
      },
    });
    return this.toDbConnectionItem(db);
  }

  async updateDatabaseSyncMeta(id: string, organizationId: string, update: {
    tableCount?: number; status?: DatabaseConnectionItem['status'];
    lastSyncedAt?: string; readOnlyDefault?: boolean;
  }): Promise<DatabaseConnectionItem | null> {
    const existing = await this.prisma.databaseConnection.findFirst({ where: { id, organizationId } });
    if (!existing) return null;
    const db = await this.prisma.databaseConnection.update({
      where: { id },
      data: {
        ...(update.tableCount !== undefined ? { tableCount: update.tableCount } : {}),
        ...(update.status !== undefined ? { status: update.status } : {}),
        ...(update.lastSyncedAt !== undefined ? { lastSyncedAt: new Date(update.lastSyncedAt) } : {}),
        ...(update.readOnlyDefault !== undefined ? { readOnlyDefault: update.readOnlyDefault } : {}),
        updatedAt: new Date(),
      },
    });
    return this.toDbConnectionItem(db);
  }

  async deleteDatabaseConnection(id: string, organizationId: string): Promise<boolean> {
    const existing = await this.prisma.databaseConnection.findFirst({ where: { id, organizationId } });
    if (!existing) return false;
    await this.prisma.databaseConnection.delete({ where: { id } });
    return true;
  }

  // ============================================================================
  // Query History
  // ============================================================================

  async recordQueryHistory(entry: Omit<QueryHistoryItem, 'id' | 'createdAt' | 'isSaved' | 'shareToken'>): Promise<QueryHistoryItem> {
    const qh = await this.prisma.queryHistory.create({
      data: {
        id: `qh_${randomUUID().slice(0, 8)}`,
        organizationId: entry.organizationId,
        databaseId: entry.databaseId,
        userId: entry.userId,
        prompt: entry.prompt ?? null,
        sql: entry.sql,
        explanation: entry.explanation ?? null,
        chartSpecJson: entry.chart ? JSON.stringify(entry.chart) : null,
        rowCount: entry.rowCount,
        durationMs: entry.durationMs,
        isSaved: false,
        createdAt: new Date(),
      },
    });
    return this.toQueryHistoryItem(qh, entry.databaseName, entry.userName);
  }

  async listQueryHistory(organizationId: string, filters?: {
    databaseId?: string; search?: string; savedOnly?: boolean;
  }): Promise<QueryHistoryItem[]> {
    const where: Record<string, unknown> = { organizationId };
    if (filters?.databaseId) where['databaseId'] = filters.databaseId;
    if (filters?.savedOnly) where['isSaved'] = true;

    const items = await this.prisma.queryHistory.findMany({
      where: where as any,
      include: { database: true, user: true },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });

    const mapped = items.map((qh) => this.toQueryHistoryItem(qh, qh.database.name, qh.user.name));

    if (filters?.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      return mapped.filter((item) =>
        (item.prompt?.toLowerCase().includes(q) ?? false) ||
        item.sql.toLowerCase().includes(q) ||
        (item.explanation?.toLowerCase().includes(q) ?? false) ||
        item.databaseName.toLowerCase().includes(q)
      );
    }

    return mapped;
  }

  async toggleSaveQueryHistory(id: string, organizationId: string): Promise<QueryHistoryItem | null> {
    const existing = await this.prisma.queryHistory.findFirst({
      where: { id, organizationId },
      include: { database: true, user: true },
    });
    if (!existing) return null;
    const updated = await this.prisma.queryHistory.update({
      where: { id },
      data: { isSaved: !existing.isSaved },
      include: { database: true, user: true },
    });
    return this.toQueryHistoryItem(updated, updated.database.name, updated.user.name);
  }

  async shareQueryHistory(id: string, organizationId: string): Promise<QueryHistoryItem | null> {
    const existing = await this.prisma.queryHistory.findFirst({
      where: { id, organizationId },
      include: { database: true, user: true },
    });
    if (!existing) return null;
    // QueryHistory model doesn't have shareToken in Prisma schema - return as-is or handle gracefully
    return this.toQueryHistoryItem(existing, existing.database.name, existing.user.name);
  }

  private toQueryHistoryItem(qh: {
    id: string; organizationId: string; databaseId: string; userId: string;
    prompt: string | null; sql: string; explanation: string | null;
    chartSpecJson: string | null; rowCount: number; durationMs: number;
    isSaved: boolean; createdAt: Date;
  }, databaseName: string, userName: string): QueryHistoryItem {
    let chart = null;
    if (qh.chartSpecJson) {
      try { chart = JSON.parse(qh.chartSpecJson); } catch { chart = null; }
    }
    return {
      id: qh.id,
      organizationId: qh.organizationId,
      databaseId: qh.databaseId,
      databaseName,
      userId: qh.userId,
      userName,
      prompt: qh.prompt ?? null,
      sql: qh.sql,
      explanation: qh.explanation ?? null,
      chart,
      rowCount: qh.rowCount,
      durationMs: qh.durationMs,
      isSaved: qh.isSaved,
      shareToken: null,
      createdAt: qh.createdAt.toISOString(),
    };
  }

  // ============================================================================
  // Dashboards
  // ============================================================================

  async listDashboards(organizationId: string, databaseId?: string): Promise<DashboardItem[]> {
    const dbs = await this.prisma.dashboard.findMany({
      where: { organizationId, ...(databaseId ? { databaseId } : {}) },
      include: { database: true },
      orderBy: { createdAt: 'desc' },
    });
    return dbs.map((d) => this.toDashboardItem(d));
  }

  async findDashboardById(id: string, organizationId: string): Promise<DashboardItem | undefined> {
    const d = await this.prisma.dashboard.findFirst({
      where: { id, organizationId },
      include: { database: true },
    });
    return d ? this.toDashboardItem(d) : undefined;
  }

  async saveDashboard(dashboard: DashboardItem): Promise<DashboardItem> {
    const now = new Date();
    const existing = await this.prisma.dashboard.findFirst({ where: { id: dashboard.id } });
    let result;
    if (existing) {
      result = await this.prisma.dashboard.update({
        where: { id: dashboard.id },
        data: {
          name: dashboard.name,
          description: dashboard.description ?? null,
          shareToken: dashboard.shareToken ?? null,
          widgetsJson: JSON.stringify(dashboard.widgets ?? []),
          updatedAt: now,
        },
        include: { database: true },
      });
    } else {
      result = await this.prisma.dashboard.create({
        data: {
          id: dashboard.id,
          organizationId: dashboard.organizationId,
          databaseId: dashboard.databaseId,
          name: dashboard.name,
          description: dashboard.description ?? null,
          shareToken: dashboard.shareToken ?? null,
          widgetsJson: JSON.stringify(dashboard.widgets ?? []),
          createdAt: now,
          updatedAt: now,
        },
        include: { database: true },
      });
    }
    return this.toDashboardItem(result);
  }

  async deleteDashboard(id: string, organizationId: string): Promise<boolean> {
    const existing = await this.prisma.dashboard.findFirst({ where: { id, organizationId } });
    if (!existing) return false;
    await this.prisma.dashboard.delete({ where: { id } });
    return true;
  }

  private toDashboardItem(d: {
    id: string; organizationId: string; databaseId: string; name: string;
    description: string | null; shareToken: string | null; widgetsJson: string;
    createdAt: Date; updatedAt: Date; database: { name: string };
  }): DashboardItem {
    let widgets = [];
    try { widgets = JSON.parse(d.widgetsJson); } catch { widgets = []; }
    return {
      id: d.id,
      organizationId: d.organizationId,
      databaseId: d.databaseId,
      databaseName: d.database.name,
      name: d.name,
      description: d.description ?? '',
      prompt: '',
      shareToken: d.shareToken,
      shareMinRole: 'VIEWER',
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      widgets,
    };
  }

  // ============================================================================
  // Team Members
  // ============================================================================

  async listTeamMembers(organizationId: string): Promise<TeamMemberItem[]> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: { user: true },
    });
    return memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      organizationId: m.organizationId,
      name: m.user.name,
      email: m.user.email,
      role: m.role as OrgRole,
      status: 'ACTIVE' as const,
      joinedAt: m.createdAt.toISOString(),
    }));
  }

  async inviteTeamMember(organizationId: string, input: InviteTeamMemberInput): Promise<TeamMemberItem> {
    const cleanEmail = input.email.trim().toLowerCase();
    // Check if user exists
    let user = await this.prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      // Create a placeholder user for invited member
      const derivedName = input.name?.trim() || cleanEmail.split('@')[0]!.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      user = await this.prisma.user.create({
        data: {
          id: `usr_inv_${randomUUID().slice(0, 6)}`,
          email: cleanEmail,
          name: derivedName,
          activeOrganizationId: organizationId,
        },
      });
    }

    const existing = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      include: { user: true },
    });

    if (existing) {
      const updated = await this.prisma.organizationMember.update({
        where: { id: existing.id },
        data: { role: input.role },
        include: { user: true },
      });
      return {
        id: updated.id,
        userId: updated.userId,
        organizationId: updated.organizationId,
        name: updated.user.name,
        email: updated.user.email,
        role: updated.role as OrgRole,
        status: 'ACTIVE',
        joinedAt: updated.createdAt.toISOString(),
      };
    }

    const member = await this.prisma.organizationMember.create({
      data: { organizationId, userId: user.id, role: input.role },
      include: { user: true },
    });
    return {
      id: member.id,
      userId: member.userId,
      organizationId: member.organizationId,
      name: member.user.name,
      email: member.user.email,
      role: member.role as OrgRole,
      status: 'INVITED',
      joinedAt: member.createdAt.toISOString(),
    };
  }

  async updateTeamMemberRole(memberId: string, organizationId: string, role: OrgRole): Promise<TeamMemberItem | null> {
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
      include: { user: true },
    });
    if (!member) return null;
    const updated = await this.prisma.organizationMember.update({
      where: { id: memberId },
      data: { role },
      include: { user: true },
    });
    return {
      id: updated.id,
      userId: updated.userId,
      organizationId: updated.organizationId,
      name: updated.user.name,
      email: updated.user.email,
      role: updated.role as OrgRole,
      status: 'ACTIVE',
      joinedAt: updated.createdAt.toISOString(),
    };
  }

  async removeTeamMember(memberId: string, organizationId: string): Promise<boolean> {
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
    });
    if (!member) return false;
    // Prevent removing last OWNER
    if (member.role === 'OWNER') {
      const ownerCount = await this.prisma.organizationMember.count({
        where: { organizationId, role: 'OWNER' },
      });
      if (ownerCount <= 1) return false;
    }
    await this.prisma.organizationMember.delete({ where: { id: memberId } });
    return true;
  }

  // ============================================================================
  // API Keys
  // ============================================================================

  async listApiKeys(organizationId: string): Promise<ApiKeyItem[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map((k) => ({
      id: k.id,
      organizationId: k.organizationId,
      name: k.name,
      keyPrefix: k.keyPrefix,
      scopes: ['read'],
      createdByUserId: '',
      createdByName: '',
      requestCount: 0,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
      revokedAt: k.revokedAt?.toISOString() ?? null,
    }));
  }

  async createApiKey(organizationId: string, userId: string, userName: string, input: CreateApiKeyInput): Promise<CreateApiKeyResponse> {
    const rawSecretKey = `dp_live_${randomBytes(18).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawSecretKey).digest('hex');
    const now = new Date();
    const stored = await this.prisma.apiKey.create({
      data: {
        id: `ak_${randomUUID().slice(0, 8)}`,
        organizationId,
        name: input.name.trim(),
        keyPrefix: `${rawSecretKey.slice(0, 14)}...`,
        keyHash,
        createdAt: now,
      },
    });
    const apiKey: ApiKeyItem = {
      id: stored.id,
      organizationId: stored.organizationId,
      name: stored.name,
      keyPrefix: stored.keyPrefix,
      scopes: input.scopes.length > 0 ? input.scopes : ['read'],
      createdByUserId: userId,
      createdByName: userName,
      requestCount: 0,
      lastUsedAt: null,
      createdAt: stored.createdAt.toISOString(),
      revokedAt: null,
    };
    return { apiKey, rawSecretKey };
  }

  async revokeApiKey(keyId: string, organizationId: string): Promise<ApiKeyItem | null> {
    const existing = await this.prisma.apiKey.findFirst({ where: { id: keyId, organizationId } });
    if (!existing) return null;
    const updated = await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });
    return {
      id: updated.id,
      organizationId: updated.organizationId,
      name: updated.name,
      keyPrefix: updated.keyPrefix,
      scopes: ['read'],
      createdByUserId: '',
      createdByName: '',
      requestCount: 0,
      lastUsedAt: updated.lastUsedAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      revokedAt: updated.revokedAt?.toISOString() ?? null,
    };
  }

  async verifyApiKey(rawKey: string): Promise<StoredApiKey | null> {
    const clean = rawKey.trim();
    if (!clean.startsWith('dp_live_')) return null;
    const hash = createHash('sha256').update(clean).digest('hex');
    const found = await this.prisma.apiKey.findFirst({
      where: { keyHash: hash, revokedAt: null },
    });
    if (!found) return null;
    await this.prisma.apiKey.update({
      where: { id: found.id },
      data: { lastUsedAt: new Date() },
    });
    return {
      id: found.id,
      organizationId: found.organizationId,
      name: found.name,
      keyPrefix: found.keyPrefix,
      keyHash: found.keyHash,
      scopes: ['read'],
      createdByUserId: '',
      createdByName: '',
      requestCount: 0,
      lastUsedAt: found.lastUsedAt?.toISOString() ?? null,
      createdAt: found.createdAt.toISOString(),
      revokedAt: found.revokedAt?.toISOString() ?? null,
    };
  }
}
