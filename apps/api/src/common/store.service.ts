import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MongoClient } from 'mongodb';
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

interface MetaStoreShape {
  users: StoredUser[];
  organizations: StoredOrganization[];
  memberships: StoredMembership[];
  refreshTokens: StoredRefreshToken[];
  databases: StoredDatabaseConnection[];
  queryHistory?: QueryHistoryItem[];
  dashboards?: DashboardItem[];
  teamMembers?: TeamMemberItem[];
  apiKeys?: StoredApiKey[];
}

export const DEMO_RAW_API_KEY = 'dp_live_demo_acme_analytics_2026';

@Injectable()
export class StoreService implements OnModuleInit {
  private readonly dataFilePath: string;
  private mongoStatus: 'disabled' | 'connecting' | 'connected' | 'unreachable' = 'disabled';
  private mongoClient: MongoClient | null = null;
  private state: MetaStoreShape = {
    users: [],
    organizations: [],
    memberships: [],
    refreshTokens: [],
    databases: [],
  };

  constructor(@Inject(CryptoService) private readonly crypto: CryptoService) {
    const dataDir = path.resolve(process.cwd(), '../../.data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dataFilePath = path.join(dataDir, 'meta-store.json');
  }

  onModuleInit(): void {
    this.loadOrSeed();
    void this.initMongoSyncIfConfigured();
  }

  getMongoSyncStatus(): { status: string; configured: boolean } {
    const uri = process.env['MONGODB_URI'] ?? '';
    return {
      status: this.mongoStatus,
      configured: uri.startsWith('mongodb'),
    };
  }

  private async initMongoSyncIfConfigured(): Promise<void> {
    const uri = process.env['MONGODB_URI'] ?? '';
    if (!uri.startsWith('mongodb') || process.env['NODE_ENV'] === 'test') {
      return;
    }
    this.mongoStatus = 'connecting';
    try {
      const client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 3500,
        connectTimeoutMS: 3500,
      });
      await client.connect();
      this.mongoClient = client;
      this.mongoStatus = 'connected';
      await client
        .db('datapilot_meta')
        .collection<{ _id: string; updatedAt: string; state: MetaStoreShape }>('workspace_state')
        .updateOne(
          { _id: 'primary_store' },
          {
            $set: {
              updatedAt: new Date().toISOString(),
              state: this.state,
            },
          },
          { upsert: true },
        );
    } catch {
      this.mongoStatus = 'unreachable';
    }
  }

  private loadOrSeed(): void {
    if (fs.existsSync(this.dataFilePath)) {
      try {
        const raw = fs.readFileSync(this.dataFilePath, 'utf8');
        this.state = JSON.parse(raw) as MetaStoreShape;
        let mutated = false;
        if (!this.state.queryHistory || this.state.queryHistory.length === 0) {
          this.state.queryHistory = this.buildDefaultQueryHistory();
          mutated = true;
        }
        if (!this.state.dashboards || this.state.dashboards.length === 0) {
          this.state.dashboards = this.buildDefaultDashboards();
          mutated = true;
        }
        if (!this.state.teamMembers || this.state.teamMembers.length === 0) {
          this.state.teamMembers = this.buildDefaultTeamMembers();
          mutated = true;
        }
        if (!this.state.apiKeys || this.state.apiKeys.length === 0) {
          this.state.apiKeys = this.buildDefaultApiKeys();
          mutated = true;
        }
        if (mutated) {
          this.persist();
        }
        if (this.state.users.length > 0) {
          return;
        }
      } catch {
        // Re-seed if corrupted
      }
    }

    const now = new Date().toISOString();
    const org1Id = 'org_acme_data_team';
    const org2Id = 'org_staging_ops';
    const demoUserId = 'usr_demo_pilot';

    const org1: StoredOrganization = {
      id: org1Id,
      name: 'Acme Data Team',
      slug: 'acme-data-team',
      createdAt: now,
    };

    const org2: StoredOrganization = {
      id: org2Id,
      name: 'Staging Analytics',
      slug: 'staging-analytics',
      createdAt: now,
    };

    const demoUser: StoredUser = {
      id: demoUserId,
      email: 'pilot@datapilot.ai',
      name: 'Alex Rivera',
      passwordHash: this.crypto.hashPassword('DataPilot2026!'),
      avatarUrl: null,
      activeOrganizationId: org1Id,
      createdAt: now,
    };

    const memberships: StoredMembership[] = [
      {
        id: randomUUID(),
        organizationId: org1Id,
        userId: demoUserId,
        role: 'OWNER',
        createdAt: now,
      },
      {
        id: randomUUID(),
        organizationId: org2Id,
        userId: demoUserId,
        role: 'ADMIN',
        createdAt: now,
      },
    ];

    const demoDatabases: StoredDatabaseConnection[] = [
      {
        id: 'db_shop_analytics',
        organizationId: org1Id,
        name: 'Shop Analytics (Demo)',
        engine: 'POSTGRESQL',
        isManaged: true,
        host: process.env.MANAGED_PG_HOST ?? 'localhost',
        port: Number(process.env.MANAGED_PG_PORT ?? 5433),
        databaseName: 'shop_analytics',
        username: 'dp_readonly_shop',
        encryptedPassword: this.crypto.encryptCredential('dp_readonly_secret'),
        sslMode: 'prefer',
        readOnlyDefault: true,
        status: 'CONNECTED',
        tableCount: 6,
        lastSyncedAt: now,
        createdAt: now,
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
        encryptedPassword: this.crypto.encryptCredential('billing_ro_secret'),
        sslMode: 'require',
        readOnlyDefault: true,
        status: 'CONNECTED',
        tableCount: 14,
        lastSyncedAt: now,
        createdAt: now,
      },
    ];

    this.state = {
      users: [demoUser],
      organizations: [org1, org2],
      memberships,
      refreshTokens: [],
      databases: demoDatabases,
      queryHistory: this.buildDefaultQueryHistory(),
      dashboards: this.buildDefaultDashboards(),
      teamMembers: this.buildDefaultTeamMembers(),
      apiKeys: this.buildDefaultApiKeys(),
    };
    this.persist();
  }

  private buildDefaultTeamMembers(): TeamMemberItem[] {
    const now = new Date().toISOString();
    return [
      {
        id: 'tm_alex_owner',
        userId: 'usr_demo_pilot',
        organizationId: 'org_acme_data_team',
        name: 'Alex Rivera',
        email: 'pilot@datapilot.ai',
        role: 'OWNER',
        status: 'ACTIVE',
        joinedAt: now,
      },
      {
        id: 'tm_maya_admin',
        userId: 'usr_maya_lin',
        organizationId: 'org_acme_data_team',
        name: 'Maya Lin',
        email: 'maya.lin@acme.dev',
        role: 'ADMIN',
        status: 'ACTIVE',
        joinedAt: now,
      },
      {
        id: 'tm_jordan_dev',
        userId: 'usr_jordan_vance',
        organizationId: 'org_acme_data_team',
        name: 'Jordan Vance',
        email: 'jordan.vance@acme.dev',
        role: 'DEVELOPER',
        status: 'ACTIVE',
        joinedAt: now,
      },
      {
        id: 'tm_samir_viewer',
        userId: 'usr_samir_patel',
        organizationId: 'org_acme_data_team',
        name: 'Samir Patel',
        email: 'samir.patel@acme.dev',
        role: 'VIEWER',
        status: 'ACTIVE',
        joinedAt: now,
      },
    ];
  }

  private buildDefaultApiKeys(): StoredApiKey[] {
    const now = new Date().toISOString();
    const keyHash = createHash('sha256').update(DEMO_RAW_API_KEY).digest('hex');
    return [
      {
        id: 'ak_demo_primary',
        organizationId: 'org_acme_data_team',
        name: 'Production Analytics Pipeline',
        keyPrefix: `${DEMO_RAW_API_KEY.slice(0, 14)}...`,
        keyHash,
        scopes: ['read'],
        createdByUserId: 'usr_demo_pilot',
        createdByName: 'Alex Rivera',
        requestCount: 42,
        lastUsedAt: now,
        createdAt: now,
        revokedAt: null,
      },
    ];
  }

  private buildDefaultDashboards(): DashboardItem[] {
    const now = new Date().toISOString();
    return [
      {
        id: 'dash_exec_sales',
        organizationId: 'org_acme_data_team',
        databaseId: 'db_shop_analytics',
        databaseName: 'Shop Analytics (Demo)',
        name: 'Executive Sales & Order Health',
        description:
          'Generated from prompt: "sales dashboard with revenue, monthly trend, top customers, failed orders"',
        prompt: 'sales dashboard with revenue, monthly trend, top customers, failed orders',
        shareToken: 'shr_dash_exec_2026',
        shareMinRole: 'VIEWER',
        createdAt: now,
        updatedAt: now,
        widgets: [
          {
            id: 'w_kpi_summary',
            title: 'Completed Revenue & Order Volume',
            subtitle: 'All-time completed orders in USD',
            sql: `SELECT\n  ROUND(SUM(total_cents) / 100.0, 2) AS completed_revenue_usd,\n  COUNT(*) AS completed_orders\nFROM orders\nWHERE status = 'completed'\nLIMIT 10;`,
            chart: {
              type: 'kpi',
              x: null,
              y: ['completed_revenue_usd', 'completed_orders'],
              title: 'Completed Revenue & Order Volume',
            },
            size: 'sm',
            position: 0,
            lastResult: null,
            refreshedAt: null,
          },
          {
            id: 'w_monthly_trend',
            title: 'Monthly Revenue Trend (USD)',
            subtitle: 'Completed order revenue by calendar month',
            sql: `SELECT\n  TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,\n  ROUND(SUM(total_cents) / 100.0, 2) AS revenue_usd,\n  COUNT(*) AS order_count\nFROM orders\nWHERE status = 'completed'\nGROUP BY DATE_TRUNC('month', created_at)\nORDER BY DATE_TRUNC('month', created_at) ASC\nLIMIT 500;`,
            chart: {
              type: 'area',
              x: 'month',
              y: ['revenue_usd'],
              title: 'Monthly Revenue Trend (USD)',
            },
            size: 'md',
            position: 1,
            lastResult: null,
            refreshedAt: null,
          },
          {
            id: 'w_top_customers',
            title: 'Top Customers by Lifetime Value',
            subtitle: 'Ranked by lifetime_value_cents in USD',
            sql: `SELECT\n  full_name,\n  segment,\n  ROUND(lifetime_value_cents / 100.0, 2) AS ltv_usd\nFROM customers\nORDER BY lifetime_value_cents DESC\nLIMIT 6;`,
            chart: {
              type: 'bar',
              x: 'full_name',
              y: ['ltv_usd'],
              title: 'Top Customers by LTV (USD)',
            },
            size: 'md',
            position: 2,
            lastResult: null,
            refreshedAt: null,
          },
          {
            id: 'w_failed_orders',
            title: 'Failed & Recent Orders Audit',
            subtitle: 'Orders requiring payment retry or fulfillment review',
            sql: `SELECT\n  o.id AS order_id,\n  c.full_name,\n  c.email,\n  o.status,\n  ROUND(o.total_cents / 100.0, 2) AS amount_usd,\n  o.shipping_region\nFROM orders o\nJOIN customers c ON c.id = o.customer_id\nORDER BY CASE WHEN o.status = 'failed' THEN 0 ELSE 1 END, o.created_at DESC\nLIMIT 10;`,
            chart: {
              type: 'table',
              x: 'full_name',
              y: ['amount_usd'],
              title: 'Failed & Recent Orders Audit',
            },
            size: 'lg',
            position: 3,
            lastResult: null,
            refreshedAt: null,
          },
        ],
      },
    ];
  }

  private buildDefaultQueryHistory(): QueryHistoryItem[] {
    const now = Date.now();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const today1 = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const today2 = new Date(now - 45 * 60 * 1000).toISOString();

    return [
      {
        id: 'qh_seed_1',
        organizationId: 'org_acme_data_team',
        databaseId: 'db_shop_analytics',
        databaseName: 'Shop Analytics (Demo)',
        userId: 'usr_demo_pilot',
        userName: 'Alex Rivera',
        prompt: 'Show total revenue and completed order count by customer segment',
        sql: `SELECT\n  c.segment,\n  COUNT(o.id) AS completed_orders,\n  ROUND(SUM(o.total_cents) / 100.0, 2) AS revenue_usd\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nWHERE o.status = 'completed'\nGROUP BY c.segment\nORDER BY revenue_usd DESC\nLIMIT 500;`,
        explanation:
          'Joins customers and orders on customer_id, filters to completed orders, and aggregates order count and USD revenue grouped by segment.',
        chart: {
          type: 'bar',
          x: 'segment',
          y: ['revenue_usd', 'completed_orders'],
          title: 'Revenue & Orders by Segment',
        },
        rowCount: 3,
        durationMs: 11,
        isSaved: true,
        shareToken: 'shr_demo_segment_rev',
        createdAt: today2,
      },
      {
        id: 'qh_seed_2',
        organizationId: 'org_acme_data_team',
        databaseId: 'db_shop_analytics',
        databaseName: 'Shop Analytics (Demo)',
        userId: 'usr_demo_pilot',
        userName: 'Alex Rivera',
        prompt: 'Top 5 products by total revenue and units sold',
        sql: `SELECT\n  p.name AS product_name,\n  p.category,\n  SUM(oi.quantity) AS units_sold,\n  ROUND(SUM(oi.quantity * oi.unit_price_cents) / 100.0, 2) AS revenue_usd\nFROM products p\nJOIN order_items oi ON oi.product_id = p.id\nGROUP BY p.id, p.name, p.category\nORDER BY revenue_usd DESC\nLIMIT 5;`,
        explanation:
          'Aggregates order_items joined to products to compute total units sold and revenue in USD for the top 5 products.',
        chart: {
          type: 'bar',
          x: 'product_name',
          y: ['revenue_usd'],
          title: 'Top Products by Revenue (USD)',
        },
        rowCount: 4,
        durationMs: 9,
        isSaved: true,
        shareToken: null,
        createdAt: today1,
      },
      {
        id: 'qh_seed_3',
        organizationId: 'org_acme_data_team',
        databaseId: 'db_shop_analytics',
        databaseName: 'Shop Analytics (Demo)',
        userId: 'usr_demo_pilot',
        userName: 'Alex Rivera',
        prompt: 'Revenue breakdown by shipping region',
        sql: `SELECT\n  shipping_region,\n  COUNT(*) AS total_orders,\n  ROUND(SUM(total_cents) / 100.0, 2) AS regional_revenue_usd\nFROM orders\nWHERE status = 'completed'\nGROUP BY shipping_region\nORDER BY regional_revenue_usd DESC\nLIMIT 500;`,
        explanation:
          'Groups completed orders by shipping_region to compare order count and revenue across regions.',
        chart: {
          type: 'pie',
          x: 'shipping_region',
          y: ['regional_revenue_usd'],
          title: 'Revenue by Shipping Region',
        },
        rowCount: 3,
        durationMs: 7,
        isSaved: false,
        shareToken: null,
        createdAt: yesterday,
      },
    ];
  }

  private persist(): void {
    fs.writeFileSync(this.dataFilePath, JSON.stringify(this.state, null, 2), 'utf8');
  }

  findUserByEmail(email: string): StoredUser | undefined {
    const normalized = email.trim().toLowerCase();
    return this.state.users.find((u) => u.email.toLowerCase() === normalized);
  }

  findUserById(id: string): StoredUser | undefined {
    return this.state.users.find((u) => u.id === id);
  }

  buildAuthUser(user: StoredUser): AuthUser {
    const memberships = this.state.memberships.filter((m) => m.userId === user.id);
    const organizations: OrganizationSummary[] = memberships
      .map((m) => {
        const org = this.state.organizations.find((o) => o.id === m.organizationId);
        if (!org) return null;
        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          role: m.role,
          createdAt: org.createdAt,
        };
      })
      .filter((item): item is OrganizationSummary => item !== null);

    const activeOrganizationId =
      organizations.find((o) => o.id === user.activeOrganizationId)?.id ??
      organizations[0]?.id ??
      '';

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

  createUserWithOrganization(input: {
    name: string;
    email: string;
    passwordHash: string;
    organizationName: string;
  }): AuthUser {
    const now = new Date().toISOString();
    const orgId = `org_${randomUUID().slice(0, 8)}`;
    const userId = `usr_${randomUUID().slice(0, 8)}`;
    const baseSlug = input.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const slug = `${baseSlug || 'workspace'}-${randomUUID().slice(0, 4)}`;

    const org: StoredOrganization = {
      id: orgId,
      name: input.organizationName.trim(),
      slug,
      createdAt: now,
    };

    const user: StoredUser = {
      id: userId,
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      passwordHash: input.passwordHash,
      avatarUrl: null,
      activeOrganizationId: orgId,
      createdAt: now,
    };

    const membership: StoredMembership = {
      id: randomUUID(),
      organizationId: orgId,
      userId,
      role: 'OWNER',
      createdAt: now,
    };

    const defaultDemoDb: StoredDatabaseConnection = {
      id: `db_${randomUUID().slice(0, 8)}`,
      organizationId: orgId,
      name: 'Shop Analytics (Demo)',
      engine: 'POSTGRESQL',
      isManaged: true,
      host: process.env.MANAGED_PG_HOST ?? 'localhost',
      port: Number(process.env.MANAGED_PG_PORT ?? 5433),
      databaseName: 'shop_analytics',
      username: 'dp_readonly_shop',
      encryptedPassword: this.crypto.encryptCredential('dp_readonly_secret'),
      sslMode: 'prefer',
      readOnlyDefault: true,
      status: 'CONNECTED',
      tableCount: 6,
      lastSyncedAt: now,
      createdAt: now,
    };

    this.state.organizations.push(org);
    this.state.users.push(user);
    this.state.memberships.push(membership);
    this.state.databases.push(defaultDemoDb);
    this.persist();

    return this.buildAuthUser(user);
  }

  switchActiveOrganization(userId: string, organizationId: string): AuthUser | null {
    const user = this.findUserById(userId);
    if (!user) return null;
    const isMember = this.state.memberships.some(
      (m) => m.userId === userId && m.organizationId === organizationId,
    );
    if (!isMember) return null;
    user.activeOrganizationId = organizationId;
    this.persist();
    return this.buildAuthUser(user);
  }

  saveRefreshToken(userId: string, token: string, expiresAt: number): void {
    this.state.refreshTokens = this.state.refreshTokens.filter(
      (rt) => rt.expiresAt > Date.now() && !rt.revoked,
    );
    this.state.refreshTokens.push({
      id: randomUUID(),
      userId,
      token,
      expiresAt,
      revoked: false,
    });
    this.persist();
  }

  consumeRefreshToken(token: string): StoredUser | null {
    const record = this.state.refreshTokens.find(
      (rt) => rt.token === token && !rt.revoked && rt.expiresAt > Date.now(),
    );
    if (!record) return null;
    record.revoked = true;
    this.persist();
    return this.findUserById(record.userId) ?? null;
  }

  revokeRefreshToken(token: string): void {
    const record = this.state.refreshTokens.find((rt) => rt.token === token);
    if (record) {
      record.revoked = true;
      this.persist();
    }
  }

  listDatabasesForOrg(organizationId: string): DatabaseConnectionItem[] {
    return this.state.databases
      .filter((db) => db.organizationId === organizationId)
      .map(({ encryptedPassword: _ignored, ...publicItem }) => publicItem);
  }

  findDatabaseById(id: string, organizationId: string): StoredDatabaseConnection | undefined {
    return this.state.databases.find(
      (db) => db.id === id && db.organizationId === organizationId,
    );
  }

  getUserRoleInOrg(userId: string, organizationId: string): OrgRole | null {
    const m = this.state.memberships.find(
      (mem) => mem.userId === userId && mem.organizationId === organizationId,
    );
    return m?.role ?? null;
  }

  createDatabaseConnection(
    conn: Omit<StoredDatabaseConnection, 'id' | 'createdAt'>,
  ): DatabaseConnectionItem {
    const record: StoredDatabaseConnection = {
      ...conn,
      id: `db_${randomUUID().slice(0, 8)}`,
      createdAt: new Date().toISOString(),
    };
    this.state.databases.unshift(record);
    this.persist();
    const { encryptedPassword: _ignored, ...publicItem } = record;
    return publicItem;
  }

  updateDatabaseSyncMeta(
    id: string,
    organizationId: string,
    update: {
      tableCount?: number;
      status?: DatabaseConnectionItem['status'];
      lastSyncedAt?: string;
      readOnlyDefault?: boolean;
    },
  ): DatabaseConnectionItem | null {
    const db = this.findDatabaseById(id, organizationId);
    if (!db) return null;
    if (update.tableCount !== undefined) db.tableCount = update.tableCount;
    if (update.status !== undefined) db.status = update.status;
    if (update.lastSyncedAt !== undefined) db.lastSyncedAt = update.lastSyncedAt;
    if (update.readOnlyDefault !== undefined) db.readOnlyDefault = update.readOnlyDefault;
    this.persist();
    const { encryptedPassword: _ignored, ...publicItem } = db;
    return publicItem;
  }

  deleteDatabaseConnection(id: string, organizationId: string): boolean {
    const before = this.state.databases.length;
    this.state.databases = this.state.databases.filter(
      (db) => !(db.id === id && db.organizationId === organizationId),
    );
    if (this.state.databases.length !== before) {
      this.persist();
      return true;
    }
    return false;
  }

  recordQueryHistory(
    entry: Omit<QueryHistoryItem, 'id' | 'createdAt' | 'isSaved' | 'shareToken'>,
  ): QueryHistoryItem {
    if (!this.state.queryHistory) {
      this.state.queryHistory = [];
    }
    const item: QueryHistoryItem = {
      ...entry,
      id: `qh_${randomUUID().slice(0, 8)}`,
      isSaved: false,
      shareToken: null,
      createdAt: new Date().toISOString(),
    };
    this.state.queryHistory.unshift(item);
    if (this.state.queryHistory.length > 300) {
      this.state.queryHistory = this.state.queryHistory.slice(0, 300);
    }
    this.persist();
    return item;
  }

  listQueryHistory(
    organizationId: string,
    filters?: {
      databaseId?: string;
      search?: string;
      savedOnly?: boolean;
    },
  ): QueryHistoryItem[] {
    const all = (this.state.queryHistory ?? []).filter(
      (h) => h.organizationId === organizationId,
    );
    return all.filter((item) => {
      if (filters?.databaseId && item.databaseId !== filters.databaseId) {
        return false;
      }
      if (filters?.savedOnly && !item.isSaved) {
        return false;
      }
      if (filters?.search && filters.search.trim().length > 0) {
        const q = filters.search.trim().toLowerCase();
        const matchPrompt = item.prompt?.toLowerCase().includes(q) ?? false;
        const matchSql = item.sql.toLowerCase().includes(q);
        const matchExp = item.explanation?.toLowerCase().includes(q) ?? false;
        const matchDb = item.databaseName.toLowerCase().includes(q);
        return matchPrompt || matchSql || matchExp || matchDb;
      }
      return true;
    });
  }

  toggleSaveQueryHistory(id: string, organizationId: string): QueryHistoryItem | null {
    const item = (this.state.queryHistory ?? []).find(
      (h) => h.id === id && h.organizationId === organizationId,
    );
    if (!item) return null;
    item.isSaved = !item.isSaved;
    this.persist();
    return item;
  }

  shareQueryHistory(id: string, organizationId: string): QueryHistoryItem | null {
    const item = (this.state.queryHistory ?? []).find(
      (h) => h.id === id && h.organizationId === organizationId,
    );
    if (!item) return null;
    if (!item.shareToken) {
      item.shareToken = `shr_${randomUUID().slice(0, 10)}`;
      this.persist();
    }
    return item;
  }

  listDashboards(organizationId: string, databaseId?: string): DashboardItem[] {
    const all = (this.state.dashboards ?? []).filter(
      (d) => d.organizationId === organizationId,
    );
    if (databaseId) {
      return all.filter((d) => d.databaseId === databaseId);
    }
    return all;
  }

  findDashboardById(id: string, organizationId: string): DashboardItem | undefined {
    return (this.state.dashboards ?? []).find(
      (d) => d.id === id && d.organizationId === organizationId,
    );
  }

  saveDashboard(dashboard: DashboardItem): DashboardItem {
    if (!this.state.dashboards) {
      this.state.dashboards = [];
    }
    const existingIdx = this.state.dashboards.findIndex((d) => d.id === dashboard.id);
    if (existingIdx >= 0) {
      this.state.dashboards[existingIdx] = {
        ...dashboard,
        updatedAt: new Date().toISOString(),
      };
    } else {
      this.state.dashboards.unshift(dashboard);
    }
    this.persist();
    return dashboard;
  }

  deleteDashboard(id: string, organizationId: string): boolean {
    if (!this.state.dashboards) return false;
    const before = this.state.dashboards.length;
    this.state.dashboards = this.state.dashboards.filter(
      (d) => !(d.id === id && d.organizationId === organizationId),
    );
    if (this.state.dashboards.length !== before) {
      this.persist();
      return true;
    }
    return false;
  }

  // ============================================================================
  // Phase 7: Team RBAC & Member Invitations
  // ============================================================================

  listTeamMembers(organizationId: string): TeamMemberItem[] {
    if (!this.state.teamMembers) {
      this.state.teamMembers = this.buildDefaultTeamMembers();
    }
    const items = this.state.teamMembers.filter(
      (m) => m.organizationId === organizationId,
    );
    // Ensure all membership records for this org also appear in teamMembers
    for (const mem of this.state.memberships.filter((m) => m.organizationId === organizationId)) {
      if (!items.some((i) => i.userId === mem.userId)) {
        const u = this.findUserById(mem.userId);
        if (u) {
          const added: TeamMemberItem = {
            id: `tm_${mem.id.slice(0, 8)}`,
            userId: u.id,
            organizationId,
            name: u.name,
            email: u.email,
            role: mem.role,
            status: 'ACTIVE',
            joinedAt: mem.createdAt,
          };
          this.state.teamMembers.push(added);
          items.push(added);
        }
      }
    }
    return items;
  }

  inviteTeamMember(
    organizationId: string,
    input: InviteTeamMemberInput,
  ): TeamMemberItem {
    if (!this.state.teamMembers) {
      this.state.teamMembers = this.buildDefaultTeamMembers();
    }
    const cleanEmail = input.email.trim().toLowerCase();
    const existing = this.state.teamMembers.find(
      (m) =>
        m.organizationId === organizationId &&
        m.email.toLowerCase() === cleanEmail,
    );
    if (existing) {
      existing.role = input.role;
      this.persist();
      return existing;
    }

    const derivedName =
      input.name?.trim() ||
      cleanEmail
        .split('@')[0]!
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

    const member: TeamMemberItem = {
      id: `tm_${randomUUID().slice(0, 8)}`,
      userId: `usr_inv_${randomUUID().slice(0, 6)}`,
      organizationId,
      name: derivedName,
      email: cleanEmail,
      role: input.role,
      status: 'INVITED',
      joinedAt: new Date().toISOString(),
    };

    this.state.teamMembers.push(member);
    this.persist();
    return member;
  }

  updateTeamMemberRole(
    memberId: string,
    organizationId: string,
    role: OrgRole,
  ): TeamMemberItem | null {
    const members = this.listTeamMembers(organizationId);
    const target = members.find((m) => m.id === memberId);
    if (!target) return null;

    target.role = role;
    const underlyingMembership = this.state.memberships.find(
      (m) => m.organizationId === organizationId && m.userId === target.userId,
    );
    if (underlyingMembership) {
      underlyingMembership.role = role;
    }
    this.persist();
    return target;
  }

  removeTeamMember(memberId: string, organizationId: string): boolean {
    if (!this.state.teamMembers) return false;
    const target = this.state.teamMembers.find(
      (m) => m.id === memberId && m.organizationId === organizationId,
    );
    if (!target) return false;
    // Prevent removing the last OWNER
    const owners = this.state.teamMembers.filter(
      (m) => m.organizationId === organizationId && m.role === 'OWNER',
    );
    if (target.role === 'OWNER' && owners.length <= 1) {
      return false;
    }
    this.state.teamMembers = this.state.teamMembers.filter((m) => m.id !== memberId);
    this.state.memberships = this.state.memberships.filter(
      (m) => !(m.organizationId === organizationId && m.userId === target.userId),
    );
    this.persist();
    return true;
  }

  // ============================================================================
  // Phase 7: API Keys & SHA-256 Token Verification
  // ============================================================================

  listApiKeys(organizationId: string): ApiKeyItem[] {
    if (!this.state.apiKeys) {
      this.state.apiKeys = this.buildDefaultApiKeys();
    }
    return this.state.apiKeys
      .filter((k) => k.organizationId === organizationId)
      .map(({ keyHash: _ignored, ...publicKey }) => publicKey);
  }

  createApiKey(
    organizationId: string,
    userId: string,
    userName: string,
    input: CreateApiKeyInput,
  ): CreateApiKeyResponse {
    if (!this.state.apiKeys) {
      this.state.apiKeys = this.buildDefaultApiKeys();
    }
    const rawSecretKey = `dp_live_${randomBytes(18).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawSecretKey).digest('hex');
    const now = new Date().toISOString();

    const stored: StoredApiKey = {
      id: `ak_${randomUUID().slice(0, 8)}`,
      organizationId,
      name: input.name.trim(),
      keyPrefix: `${rawSecretKey.slice(0, 14)}...`,
      keyHash,
      scopes: input.scopes.length > 0 ? input.scopes : ['read'],
      createdByUserId: userId,
      createdByName: userName,
      requestCount: 0,
      lastUsedAt: null,
      createdAt: now,
      revokedAt: null,
    };

    this.state.apiKeys.unshift(stored);
    this.persist();

    const { keyHash: _ignored, ...apiKey } = stored;
    return {
      apiKey,
      rawSecretKey,
    };
  }

  revokeApiKey(keyId: string, organizationId: string): ApiKeyItem | null {
    if (!this.state.apiKeys) return null;
    const found = this.state.apiKeys.find(
      (k) => k.id === keyId && k.organizationId === organizationId,
    );
    if (!found) return null;
    found.revokedAt = new Date().toISOString();
    this.persist();
    const { keyHash: _ignored, ...publicKey } = found;
    return publicKey;
  }

  verifyApiKey(rawKey: string): StoredApiKey | null {
    if (!this.state.apiKeys) {
      this.state.apiKeys = this.buildDefaultApiKeys();
    }
    const clean = rawKey.trim();
    if (!clean.startsWith('dp_live_')) return null;
    const hash = createHash('sha256').update(clean).digest('hex');
    const found = this.state.apiKeys.find(
      (k) => k.keyHash === hash && k.revokedAt === null,
    );
    if (!found) return null;
    found.requestCount += 1;
    found.lastUsedAt = new Date().toISOString();
    this.persist();
    return found;
  }
}

