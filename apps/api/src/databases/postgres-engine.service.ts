import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Client } from 'pg';
import { validateSql } from '@datapilot/sql-guard';
import type {
  CsvColumnInference,
  CsvConfirmImportInput,
  CsvImportResultResponse,
  CsvPreviewInput,
  CsvPreviewResponse,
  DatabaseSchemaSnapshot,
  DesignerCreateTableInput,
  ExplainPlanNode,
  ExplainPlanResponse,
  GenerateSeedInput,
  InferredPostgresColumnType,
  MigrationPreviewResponse,
  OptimizerBenchmarkResult,
  OrgRole,
  SafeQueryExecutionResponse,
  SchemaAiProposalResponse,
  SchemaAiTableProposal,
  SchemaColumn,
  SchemaIndex,
  SchemaRelation,
  SchemaTable,
  SeedGeneratorResponse,
  TestConnectionResult,
  TestExternalConnectionInput,
} from '@datapilot/types';
import { CacheService } from '../common/cache.service';
import { CryptoService } from '../common/crypto.service';
import { StoreService, type StoredDatabaseConnection } from '../common/store.service';

interface GenericQueryResult<R> {
  rows: R[];
}

interface QueryExecutor {
  query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<GenericQueryResult<R>>;
  exec(sql: string): Promise<void>;
}

const SHOP_ANALYTICS_SEED_SQL = `
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  segment VARCHAR(64) NOT NULL DEFAULT 'Self-Serve',
  country_code VARCHAR(8) NOT NULL DEFAULT 'US',
  lifetime_value_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  price_cents INTEGER NOT NULL,
  stock_quantity INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'completed',
  total_cents INTEGER NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  shipping_region VARCHAR(64) NOT NULL DEFAULT 'North America',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider VARCHAR(64) NOT NULL DEFAULT 'stripe',
  payment_method VARCHAR(32) NOT NULL DEFAULT 'card',
  amount_cents INTEGER NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'succeeded',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_events (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  delta_quantity INTEGER NOT NULL,
  reason VARCHAR(64) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);

INSERT INTO customers (email, full_name, segment, country_code, lifetime_value_cents, created_at)
SELECT * FROM (VALUES
  ('elena.rostova@velo.io', 'Elena Rostova', 'Enterprise B2B', 'US', 485000, NOW() - INTERVAL '150 days'),
  ('marcus.chen@kinetix.co', 'Marcus Chen', 'Enterprise B2B', 'CA', 392000, NOW() - INTERVAL '120 days'),
  ('aria.patel@lumina.ai', 'Aria Patel', 'Mid-Market', 'GB', 184000, NOW() - INTERVAL '95 days'),
  ('david.kim@apexcloud.dev', 'David Kim', 'Mid-Market', 'US', 219000, NOW() - INTERVAL '80 days'),
  ('sofia.silva@nova.br', 'Sofia Silva', 'Self-Serve', 'BR', 64000, NOW() - INTERVAL '60 days'),
  ('lucas.weber@stratos.de', 'Lucas Weber', 'Enterprise B2B', 'DE', 512000, NOW() - INTERVAL '45 days'),
  ('hannah.abbott@meridian.uk', 'Hannah Abbott', 'Self-Serve', 'GB', 45000, NOW() - INTERVAL '30 days'),
  ('noah.bennett@verve.io', 'Noah Bennett', 'Mid-Market', 'AU', 149000, NOW() - INTERVAL '15 days')
) AS v(email, full_name, segment, country_code, lifetime_value_cents, created_at)
WHERE NOT EXISTS (SELECT 1 FROM customers LIMIT 1);

INSERT INTO products (sku, name, category, price_cents, stock_quantity, is_active)
SELECT * FROM (VALUES
  ('DP-PRO-SEAT', 'DataPilot Team Seat (Monthly)', 'Subscriptions', 4900, 999, TRUE),
  ('DP-ENT-NODE', 'Dedicated Query Executor Node', 'Infrastructure', 49900, 120, TRUE),
  ('DP-AI-PACK', 'High-Volume AI SQL Token Pack', 'Add-ons', 12900, 500, TRUE),
  ('DP-AUDIT-VAULT', 'Compliance & Audit Log Retention', 'Security', 29900, 250, TRUE),
  ('DP-CONNECT-PG', 'Enterprise VPC Postgres Connector', 'Connectors', 19900, 340, TRUE)
) AS v(sku, name, category, price_cents, stock_quantity, is_active)
WHERE NOT EXISTS (SELECT 1 FROM products LIMIT 1);

INSERT INTO orders (customer_id, status, total_cents, currency, shipping_region, created_at)
SELECT * FROM (VALUES
  (1, 'completed', 98900, 'USD', 'North America', NOW() - INTERVAL '5 months'),
  (2, 'completed', 149700, 'USD', 'North America', NOW() - INTERVAL '4 months'),
  (3, 'completed', 62700, 'USD', 'Europe', NOW() - INTERVAL '3 months'),
  (4, 'completed', 112600, 'USD', 'North America', NOW() - INTERVAL '2 months'),
  (6, 'completed', 199600, 'USD', 'Europe', NOW() - INTERVAL '1 month'),
  (1, 'completed', 128800, 'USD', 'North America', NOW() - INTERVAL '20 days'),
  (5, 'failed', 19900, 'USD', 'LATAM', NOW() - INTERVAL '12 days'),
  (8, 'completed', 79700, 'USD', 'APAC', NOW() - INTERVAL '4 days')
) AS v(customer_id, status, total_cents, currency, shipping_region, created_at)
WHERE NOT EXISTS (SELECT 1 FROM orders LIMIT 1);

INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents)
SELECT * FROM (VALUES
  (1, 2, 1, 49900),
  (1, 1, 10, 4900),
  (2, 2, 3, 49900),
  (3, 4, 1, 29900),
  (3, 3, 2, 12900),
  (4, 2, 2, 49900),
  (4, 3, 1, 12900),
  (5, 2, 4, 49900),
  (6, 4, 3, 29900),
  (6, 1, 8, 4900),
  (8, 2, 1, 49900),
  (8, 4, 1, 29900)
) AS v(order_id, product_id, quantity, unit_price_cents)
WHERE NOT EXISTS (SELECT 1 FROM order_items LIMIT 1);

INSERT INTO payments (order_id, provider, payment_method, amount_cents, status, processed_at)
SELECT * FROM (VALUES
  (1, 'stripe', 'card', 98900, 'succeeded', NOW() - INTERVAL '5 months'),
  (2, 'stripe', 'ach_debit', 149700, 'succeeded', NOW() - INTERVAL '4 months'),
  (3, 'stripe', 'card', 62700, 'succeeded', NOW() - INTERVAL '3 months'),
  (4, 'stripe', 'wire', 112600, 'succeeded', NOW() - INTERVAL '2 months'),
  (5, 'stripe', 'sepa_debit', 199600, 'succeeded', NOW() - INTERVAL '1 month'),
  (6, 'stripe', 'card', 128800, 'succeeded', NOW() - INTERVAL '20 days'),
  (7, 'stripe', 'card', 19900, 'failed', NOW() - INTERVAL '12 days'),
  (8, 'stripe', 'card', 79700, 'succeeded', NOW() - INTERVAL '4 days')
) AS v(order_id, provider, payment_method, amount_cents, status, processed_at)
WHERE NOT EXISTS (SELECT 1 FROM payments LIMIT 1);

CREATE TABLE IF NOT EXISTS pakistan (
  id SERIAL PRIMARY KEY,
  country_code VARCHAR(8) NOT NULL UNIQUE DEFAULT 'PK',
  country_name VARCHAR(120) NOT NULL DEFAULT 'Islamic Republic of Pakistan',
  federal_capital VARCHAR(100) NOT NULL DEFAULT 'Islamabad',
  currency VARCHAR(16) NOT NULL DEFAULT 'PKR',
  total_regions INTEGER NOT NULL DEFAULT 7,
  population_millions NUMERIC(10,2) NOT NULL DEFAULT 241.49,
  gdp_billion_usd NUMERIC(10,2) NOT NULL DEFAULT 374.90,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS regions (
  id SERIAL PRIMARY KEY,
  pakistan_id INTEGER NOT NULL REFERENCES pakistan(id) ON DELETE CASCADE,
  region_code VARCHAR(16) NOT NULL UNIQUE,
  region_name VARCHAR(120) NOT NULL,
  region_type VARCHAR(64) NOT NULL DEFAULT 'Province',
  capital_city VARCHAR(100) NOT NULL,
  districts_count INTEGER NOT NULL DEFAULT 1,
  population_millions NUMERIC(10,2) NOT NULL,
  area_sq_km INTEGER NOT NULL,
  gdp_billion_usd NUMERIC(10,2) NOT NULL,
  completed_orders INTEGER NOT NULL DEFAULT 0,
  revenue_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_regions_pakistan_id ON regions(pakistan_id);
CREATE INDEX IF NOT EXISTS idx_regions_region_name ON regions(region_name);

INSERT INTO pakistan (country_code, country_name, federal_capital, currency, total_regions, population_millions, gdp_billion_usd)
SELECT 'PK', 'Islamic Republic of Pakistan', 'Islamabad', 'PKR', 7, 241.49, 374.90
WHERE NOT EXISTS (SELECT 1 FROM pakistan WHERE country_code = 'PK');

INSERT INTO regions (pakistan_id, region_code, region_name, region_type, capital_city, districts_count, population_millions, area_sq_km, gdp_billion_usd, completed_orders, revenue_usd)
SELECT * FROM (VALUES
  (1, 'PK-PB', 'Punjab', 'Province', 'Lahore', 41, 127.68, 205344, 198.50, 420, 184500.00),
  (1, 'PK-SD', 'Sindh', 'Province', 'Karachi', 30, 55.69, 140914, 102.40, 315, 152800.00),
  (1, 'PK-KP', 'Khyber Pakhtunkhwa', 'Province', 'Peshawar', 38, 40.85, 101741, 38.20, 180, 74200.00),
  (1, 'PK-BA', 'Balochistan', 'Province', 'Quetta', 36, 14.89, 347190, 18.60, 75, 31400.00),
  (1, 'PK-IS', 'Islamabad Capital Territory', 'Federal Capital', 'Islamabad', 1, 2.36, 906, 9.80, 160, 68900.00),
  (1, 'PK-GB', 'Gilgit-Baltistan', 'Autonomous Territory', 'Gilgit', 14, 1.95, 72971, 3.10, 45, 19200.00),
  (1, 'PK-JK', 'Azad Jammu & Kashmir', 'Autonomous Territory', 'Muzaffarabad', 10, 4.35, 13297, 4.30, 65, 24600.00)
) AS v(pakistan_id, region_code, region_name, region_type, capital_city, districts_count, population_millions, area_sq_km, gdp_billion_usd, completed_orders, revenue_usd)
WHERE NOT EXISTS (SELECT 1 FROM regions LIMIT 1);

UPDATE orders SET shipping_region = 'Punjab' WHERE id IN (1, 2) AND shipping_region = 'North America';
UPDATE orders SET shipping_region = 'Sindh' WHERE id IN (4, 6) AND shipping_region = 'North America';
UPDATE orders SET shipping_region = 'Khyber Pakhtunkhwa' WHERE id IN (3, 5) AND shipping_region = 'Europe';
UPDATE orders SET shipping_region = 'Balochistan' WHERE id = 7 AND shipping_region = 'LATAM';
UPDATE orders SET shipping_region = 'Islamabad Capital Territory' WHERE id = 8 AND shipping_region = 'APAC';
`;

const BILLING_WAREHOUSE_SEED_SQL = `
CREATE TABLE IF NOT EXISTS billing_accounts (
  id SERIAL PRIMARY KEY,
  organization_slug VARCHAR(120) NOT NULL UNIQUE,
  plan_tier VARCHAR(64) NOT NULL DEFAULT 'Team',
  mrr_cents INTEGER NOT NULL DEFAULT 4900,
  billing_email VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  seats INTEGER NOT NULL DEFAULT 5,
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
  amount_due_cents INTEGER NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'paid',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_account_id ON subscriptions(account_id);
CREATE INDEX IF NOT EXISTS idx_invoices_account_id ON invoices(account_id);

INSERT INTO billing_accounts (organization_slug, plan_tier, mrr_cents, billing_email)
SELECT * FROM (VALUES
  ('acme-data-team', 'Team', 49000, 'finance@acme.dev'),
  ('kinetix-analytics', 'Enterprise', 249000, 'ap@kinetix.co'),
  ('lumina-labs', 'Team', 24500, 'billing@lumina.ai')
) AS v(organization_slug, plan_tier, mrr_cents, billing_email)
WHERE NOT EXISTS (SELECT 1 FROM billing_accounts LIMIT 1);
`;

@Injectable()
export class PostgresEngineService implements OnModuleInit {
  private readonly pgliteInstances = new Map<string, PGlite>();
  private readonly pgliteBaseDir: string;

  constructor(
    @Inject(StoreService) private readonly store: StoreService,
    @Inject(CryptoService) private readonly crypto: CryptoService,
    @Inject(CacheService) private readonly cache: CacheService,
  ) {
    this.pgliteBaseDir = path.resolve(process.cwd(), '../../.data/pg-databases');
    if (!fs.existsSync(this.pgliteBaseDir)) {
      fs.mkdirSync(this.pgliteBaseDir, { recursive: true });
    }
  }

  async onModuleInit(): Promise<void> {
    // Lazy on-demand initialization: do not block port binding or spike container memory on boot
  }

  async ensureLocalPgDatabase(
    databaseName: string,
    template: 'blank' | 'shop_analytics' | 'saas_metrics' = 'blank',
  ): Promise<PGlite> {
    const safeName = databaseName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const existing = this.pgliteInstances.get(safeName);
    if (existing) {
      return existing;
    }

    // Keep active in-memory instances capped to 2 to stay well under container memory limits
    if (this.pgliteInstances.size >= 2) {
      const oldestKey = this.pgliteInstances.keys().next().value;
      if (oldestKey) {
        try {
          await this.pgliteInstances.get(oldestKey)?.close();
        } catch {
          // ignore close errors
        }
        this.pgliteInstances.delete(oldestKey);
      }
    }

    const dbDir = path.join(this.pgliteBaseDir, safeName);
    const pg = new PGlite(dbDir);
    await pg.waitReady;

    if (template === 'shop_analytics') {
      await pg.exec(SHOP_ANALYTICS_SEED_SQL);
    } else if (template === 'saas_metrics') {
      await pg.exec(BILLING_WAREHOUSE_SEED_SQL);
    }

    this.pgliteInstances.set(safeName, pg);
    return pg;
  }

  private async getExecutor(conn: StoredDatabaseConnection): Promise<{
    executor: QueryExecutor;
    close: () => Promise<void>;
  }> {
    // Try external TCP connection first if it's an external non-demo host or if port is reachable
    const isBuiltInDemoHost =
      conn.isManaged ||
      conn.host === 'warehouse.internal.acme.dev' ||
      conn.databaseName === 'shop_analytics' ||
      conn.databaseName === 'billing_prod';

    if (!isBuiltInDemoHost) {
      const password = this.crypto.decryptCredential(conn.encryptedPassword);
      const client = new Client({
        host: conn.host,
        port: conn.port,
        database: conn.databaseName,
        user: conn.username,
        password,
        ssl: conn.sslMode === 'require' ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 4000,
      });
      await client.connect();
      return {
        executor: {
          query: async <R = Record<string, unknown>>(sql: string, params?: unknown[]) => {
            const res = await client.query(sql, params);
            return { rows: res.rows as R[] };
          },
          exec: async (sql: string) => {
            await client.query(sql);
          },
        },
        close: async () => {
          await client.end();
        },
      };
    }

    // Use embedded real PostgreSQL 16 (PGlite) for managed & pre-seeded databases
    const template =
      conn.databaseName === 'shop_analytics'
        ? 'shop_analytics'
        : conn.databaseName === 'billing_prod'
          ? 'saas_metrics'
          : 'blank';
    const pg = await this.ensureLocalPgDatabase(conn.databaseName, template);
    return {
      executor: {
        query: async <R = Record<string, unknown>>(sql: string, params?: unknown[]) => {
          const res = await pg.query<R>(sql, params);
          return { rows: res.rows };
        },
        exec: async (sql: string) => {
          await pg.exec(sql);
        },
      },
      close: async () => {
        // Keep embedded instance alive in memory pool
      },
    };
  }

  /**
   * Tests a PostgreSQL connection before saving.
   * Supports testing both real external PostgreSQL servers and local/managed instances.
   */
  async testConnection(input: TestExternalConnectionInput): Promise<TestConnectionResult> {
    const start = Date.now();

    // If testing local managed or demo database on this machine without Docker running
    if (
      (input.host === 'localhost' || input.host === '127.0.0.1') &&
      (input.databaseName === 'shop_analytics' ||
        input.databaseName === 'billing_prod' ||
        input.port === 5433)
    ) {
      const pg = await this.ensureLocalPgDatabase(
        input.databaseName,
        input.databaseName === 'shop_analytics' ? 'shop_analytics' : 'blank',
      );
      const verRes = await pg.query<{ version: string }>('SELECT version();');
      const countRes = await pg.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';`,
      );
      const latencyMs = Math.max(1, Date.now() - start);
      const versionStr = verRes.rows[0]?.version?.split(',')[0] ?? 'PostgreSQL 16.4';
      const tableCount = Number(countRes.rows[0]?.count ?? 0);
      return {
        ok: true,
        latencyMs,
        serverVersion: versionStr,
        tableCount,
        message: `Connected to ${versionStr} (${tableCount} tables in public schema).`,
      };
    }

    const client = new Client({
      host: input.host,
      port: input.port,
      database: input.databaseName,
      user: input.username,
      password: input.password,
      ssl: input.sslMode === 'require' ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 4500,
    });

    try {
      await client.connect();
      const verRes = await client.query<{ version: string }>('SELECT version();');
      const countRes = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';`,
      );
      const latencyMs = Math.max(1, Date.now() - start);
      const versionStr = verRes.rows[0]?.version?.split(',')[0] ?? 'PostgreSQL';
      const tableCount = Number(countRes.rows[0]?.count ?? 0);
      return {
        ok: true,
        latencyMs,
        serverVersion: versionStr,
        tableCount,
        message: `Connected to ${versionStr} (${tableCount} tables found).`,
      };
    } catch (err) {
      const latencyMs = Math.max(1, Date.now() - start);
      const rawMessage = err instanceof Error ? err.message : 'Connection refused';
      return {
        ok: false,
        latencyMs,
        serverVersion: 'Unreachable',
        tableCount: 0,
        message: `Connection failed (${rawMessage}). Verify the hostname (${input.host}:${input.port}), database name, credentials, and SSL mode.`,
      };
    } finally {
      try {
        await client.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Introspects PostgreSQL tables, columns, primary keys, foreign keys, indexes, and row estimates.
   */
  async getSchemaSnapshot(
    conn: StoredDatabaseConnection,
    forceRefresh = false,
  ): Promise<DatabaseSchemaSnapshot> {
    const cacheKey = `schema:${conn.id}`;
    if (!forceRefresh) {
      const cached = this.cache.get<DatabaseSchemaSnapshot>(cacheKey);
      if (cached) {
        return { ...cached, cached: true };
      }
    }

    const { executor, close } = await this.getExecutor(conn);
    try {
      // 1. Fetch tables
      const tablesRes = await executor.query<{
        table_name: string;
        table_schema: string;
      }>(`
        SELECT table_name, table_schema
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name ASC;
      `);

      // 2. Fetch columns
      const columnsRes = await executor.query<{
        table_name: string;
        column_name: string;
        data_type: string;
        udt_name: string;
        is_nullable: string;
        column_default: string | null;
      }>(`
        SELECT
          table_name,
          column_name,
          data_type,
          udt_name,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name ASC, ordinal_position ASC;
      `);

      // 3. Fetch primary keys
      const pkRes = await executor.query<{
        table_name: string;
        column_name: string;
      }>(`
        SELECT
          tc.table_name,
          kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = 'public';
      `);

      // 4. Fetch foreign keys
      const fkRes = await executor.query<{
        constraint_name: string;
        source_table: string;
        source_column: string;
        target_table: string;
        target_column: string;
      }>(`
        SELECT
          tc.constraint_name,
          tc.table_name AS source_table,
          kcu.column_name AS source_column,
          ccu.table_name AS target_table,
          ccu.column_name AS target_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public';
      `);

      // 5. Fetch indexes
      const idxRes = await executor.query<{
        tablename: string;
        indexname: string;
        indexdef: string;
      }>(`
        SELECT tablename, indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname;
      `);

      const pkSet = new Set(pkRes.rows.map((r) => `${r.table_name}.${r.column_name}`));
      const fkMap = new Map<
        string,
        { targetTable: string; targetColumn: string; constraintName: string }
      >();
      const relations: SchemaRelation[] = [];

      for (const fk of fkRes.rows) {
        fkMap.set(`${fk.source_table}.${fk.source_column}`, {
          targetTable: fk.target_table,
          targetColumn: fk.target_column,
          constraintName: fk.constraint_name,
        });
        relations.push({
          id: `${fk.source_table}.${fk.source_column}->${fk.target_table}.${fk.target_column}`,
          constraintName: fk.constraint_name,
          sourceTable: fk.source_table,
          sourceColumn: fk.source_column,
          targetTable: fk.target_table,
          targetColumn: fk.target_column,
        });
      }

      const tables: SchemaTable[] = [];

      for (const t of tablesRes.rows) {
        // Exact row count for small/medium tables
        let rowCountEstimate = 0;
        try {
          const safeTable = `"${t.table_name.replace(/"/g, '""')}"`;
          const cnt = await executor.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM ${safeTable};`,
          );
          rowCountEstimate = Number(cnt.rows[0]?.count ?? 0);
        } catch {
          rowCountEstimate = 0;
        }

        const tableCols: SchemaColumn[] = columnsRes.rows
          .filter((c) => c.table_name === t.table_name)
          .map((c) => {
            const key = `${t.table_name}.${c.column_name}`;
            const fkInfo = fkMap.get(key);
            return {
              name: c.column_name,
              dataType:
                c.data_type === 'USER-DEFINED' ? c.udt_name : c.data_type,
              isNullable: c.is_nullable === 'YES',
              defaultValue: c.column_default,
              isPrimaryKey: pkSet.has(key),
              isForeignKey: Boolean(fkInfo),
              referencesTable: fkInfo?.targetTable,
              referencesColumn: fkInfo?.targetColumn,
            };
          });

        const tableIndexes: SchemaIndex[] = idxRes.rows
          .filter((idx) => idx.tablename === t.table_name)
          .map((idx) => {
            const matchCols = /\(([^)]+)\)/.exec(idx.indexdef);
            const cols = matchCols?.[1]
              ? matchCols[1].split(',').map((s) => s.trim())
              : [];
            return {
              name: idx.indexname,
              columns: cols,
              isUnique: idx.indexdef.toUpperCase().includes('UNIQUE INDEX'),
            };
          });

        tables.push({
          name: t.table_name,
          schema: t.table_schema,
          rowCountEstimate,
          columns: tableCols,
          indexes: tableIndexes,
        });
      }

      const syncedAt = new Date().toISOString();
      const snapshot: DatabaseSchemaSnapshot = {
        databaseId: conn.id,
        databaseName: conn.databaseName,
        engine: conn.engine,
        syncedAt,
        cached: false,
        tables,
        relations,
      };

      this.cache.set(cacheKey, snapshot, 300);
      this.store.updateDatabaseSyncMeta(conn.id, conn.organizationId, {
        tableCount: tables.length,
        lastSyncedAt: syncedAt,
        status: 'CONNECTED',
      });

      return snapshot;
    } finally {
      await close();
    }
  }

  /**
   * Builds a clean, reviewed PostgreSQL DDL migration script from the Schema Designer input.
   */
  previewCreateTableMigration(input: DesignerCreateTableInput): MigrationPreviewResponse {
    const ident = (name: string): string => {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        throw new BadRequestException(
          `Identifier "${name}" is invalid. Use letters, numbers, and underscores only.`,
        );
      }
      return name;
    };

    const tableName = ident(input.tableName);
    const colLines: string[] = [];
    const warnings: string[] = [];
    const pkCols = input.columns.filter((c) => c.isPrimaryKey).map((c) => ident(c.name));

    if (pkCols.length === 0) {
      warnings.push(
        `Table "${tableName}" has no primary key column selected. Adding a primary key is recommended for indexing and replication.`,
      );
    }

    for (const col of input.columns) {
      const colName = ident(col.name);
      const parts: string[] = [`  ${colName} ${col.dataType.toUpperCase()}`];

      if (col.isPrimaryKey && pkCols.length === 1) {
        parts.push('PRIMARY KEY');
      } else if (!col.isNullable) {
        parts.push('NOT NULL');
      }

      if (col.isUnique && !col.isPrimaryKey) {
        parts.push('UNIQUE');
      }

      if (col.defaultValue && col.defaultValue.trim().length > 0) {
        const cleanDefault = col.defaultValue.trim();
        if (/^[a-zA-Z0-9_()' -]+$/.test(cleanDefault)) {
          parts.push(`DEFAULT ${cleanDefault}`);
        }
      }

      if (col.referencesTable && col.referencesColumn) {
        const refTable = ident(col.referencesTable);
        const refCol = ident(col.referencesColumn);
        parts.push(`REFERENCES ${refTable}(${refCol}) ON DELETE CASCADE`);
      }

      colLines.push(parts.join(' '));
    }

    if (pkCols.length > 1) {
      colLines.push(`  PRIMARY KEY (${pkCols.join(', ')})`);
    }

    const statements: string[] = [
      `CREATE TABLE ${tableName} (\n${colLines.join(',\n')}\n);`,
    ];

    for (const idx of input.indexes ?? []) {
      const idxName = ident(idx.name);
      const idxCols = idx.columns.map(ident).join(', ');
      const uniqueKw = idx.isUnique ? 'UNIQUE ' : '';
      statements.push(
        `CREATE ${uniqueKw}INDEX ${idxName} ON ${tableName} (${idxCols});`,
      );
    }

    return {
      sql: `-- DataPilot Schema Designer Migration\nBEGIN;\n\n${statements.join('\n\n')}\n\nCOMMIT;`,
      statementsCount: statements.length,
      warnings,
    };
  }

  /**
   * Applies a reviewed Schema Designer migration inside a transaction and refreshes the schema snapshot.
   */
  async applyCreateTableMigration(
    conn: StoredDatabaseConnection,
    input: DesignerCreateTableInput,
  ): Promise<DatabaseSchemaSnapshot> {
    const preview = this.previewCreateTableMigration(input);
    const { executor, close } = await this.getExecutor(conn);
    try {
      await executor.exec(preview.sql);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Migration failed';
      throw new BadRequestException(
        `PostgreSQL rejected the migration: ${msg}. Review column types and table names.`,
      );
    } finally {
      await close();
    }

    this.cache.del(`schema:${conn.id}`);
    return this.getSchemaSnapshot(conn, true);
  }

  /**
   * Ensures the `pakistan` main table and `regions` child table are created and populated
   * on the target database connection, and updates legacy regional labels to Pakistan regions.
   */
  async ensurePakistanRegionsSchema(
    conn: StoredDatabaseConnection,
  ): Promise<DatabaseSchemaSnapshot> {
    const sql = `
      BEGIN;
      CREATE TABLE IF NOT EXISTS pakistan (
        id SERIAL PRIMARY KEY,
        country_code VARCHAR(8) NOT NULL UNIQUE DEFAULT 'PK',
        country_name VARCHAR(120) NOT NULL DEFAULT 'Islamic Republic of Pakistan',
        federal_capital VARCHAR(100) NOT NULL DEFAULT 'Islamabad',
        currency VARCHAR(16) NOT NULL DEFAULT 'PKR',
        total_regions INTEGER NOT NULL DEFAULT 7,
        population_millions NUMERIC(10,2) NOT NULL DEFAULT 241.49,
        gdp_billion_usd NUMERIC(10,2) NOT NULL DEFAULT 374.90,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS regions (
        id SERIAL PRIMARY KEY,
        pakistan_id INTEGER NOT NULL REFERENCES pakistan(id) ON DELETE CASCADE,
        region_code VARCHAR(16) NOT NULL UNIQUE,
        region_name VARCHAR(120) NOT NULL,
        region_type VARCHAR(64) NOT NULL DEFAULT 'Province',
        capital_city VARCHAR(100) NOT NULL,
        districts_count INTEGER NOT NULL DEFAULT 1,
        population_millions NUMERIC(10,2) NOT NULL,
        area_sq_km INTEGER NOT NULL,
        gdp_billion_usd NUMERIC(10,2) NOT NULL,
        completed_orders INTEGER NOT NULL DEFAULT 0,
        revenue_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_regions_pakistan_id ON regions(pakistan_id);
      CREATE INDEX IF NOT EXISTS idx_regions_region_name ON regions(region_name);

      INSERT INTO pakistan (country_code, country_name, federal_capital, currency, total_regions, population_millions, gdp_billion_usd)
      SELECT 'PK', 'Islamic Republic of Pakistan', 'Islamabad', 'PKR', 7, 241.49, 374.90
      WHERE NOT EXISTS (SELECT 1 FROM pakistan WHERE country_code = 'PK');

      INSERT INTO regions (pakistan_id, region_code, region_name, region_type, capital_city, districts_count, population_millions, area_sq_km, gdp_billion_usd, completed_orders, revenue_usd)
      SELECT * FROM (VALUES
        (1, 'PK-PB', 'Punjab', 'Province', 'Lahore', 41, 127.68, 205344, 198.50, 420, 184500.00),
        (1, 'PK-SD', 'Sindh', 'Province', 'Karachi', 30, 55.69, 140914, 102.40, 315, 152800.00),
        (1, 'PK-KP', 'Khyber Pakhtunkhwa', 'Province', 'Peshawar', 38, 40.85, 101741, 38.20, 180, 74200.00),
        (1, 'PK-BA', 'Balochistan', 'Province', 'Quetta', 36, 14.89, 347190, 18.60, 75, 31400.00),
        (1, 'PK-IS', 'Islamabad Capital Territory', 'Federal Capital', 'Islamabad', 1, 2.36, 906, 9.80, 160, 68900.00),
        (1, 'PK-GB', 'Gilgit-Baltistan', 'Autonomous Territory', 'Gilgit', 14, 1.95, 72971, 3.10, 45, 19200.00),
        (1, 'PK-JK', 'Azad Jammu & Kashmir', 'Autonomous Territory', 'Muzaffarabad', 10, 4.35, 13297, 4.30, 65, 24600.00)
      ) AS v(pakistan_id, region_code, region_name, region_type, capital_city, districts_count, population_millions, area_sq_km, gdp_billion_usd, completed_orders, revenue_usd)
      WHERE NOT EXISTS (SELECT 1 FROM regions LIMIT 1);
      COMMIT;
    `;
    const { executor, close } = await this.getExecutor(conn);
    try {
      await executor.exec(sql);
      try {
        await executor.exec(`
          UPDATE orders SET shipping_region = 'Punjab' WHERE id IN (1, 2) AND shipping_region = 'North America';
          UPDATE orders SET shipping_region = 'Sindh' WHERE id IN (4, 6) AND shipping_region = 'North America';
          UPDATE orders SET shipping_region = 'Khyber Pakhtunkhwa' WHERE id IN (3, 5) AND shipping_region = 'Europe';
          UPDATE orders SET shipping_region = 'Balochistan' WHERE id = 7 AND shipping_region = 'LATAM';
          UPDATE orders SET shipping_region = 'Islamabad Capital Territory' WHERE id = 8 AND shipping_region = 'APAC';
        `);
      } catch {
        // Ignore if orders table is not present in custom databases
      }
    } finally {
      await close();
    }
    this.cache.del(`schema:${conn.id}`);
    return this.getSchemaSnapshot(conn, true);
  }

  /**
   * Validates SQL via @datapilot/sql-guard, enforces RBAC & cost cap,
   * previews write impact, and executes inside a sandboxed transaction.
   */
  async executeSafeQuery(
    conn: StoredDatabaseConnection,
    userRole: OrgRole,
    input: {
      sql: string;
      allowWrite?: boolean;
      confirmedWrite?: boolean;
      rowLimit?: number;
      bypassCache?: boolean;
    },
  ): Promise<SafeQueryExecutionResponse> {
    const defaultRowLimit = Number(process.env.QUERY_DEFAULT_ROW_LIMIT ?? 500);
    const maxRowLimit = Number(process.env.QUERY_MAX_ROW_LIMIT ?? 2000);
    const maxCostCap = Number(process.env.QUERY_MAX_COST_CAP ?? 100000);
    const timeoutMs = Number(process.env.QUERY_STATEMENT_TIMEOUT_MS ?? 5000);

    const validation = validateSql(input.sql, {
      allowWrite: input.allowWrite ?? false,
      defaultRowLimit: input.rowLimit ?? defaultRowLimit,
      maxRowLimit,
    });

    if (!validation.valid) {
      throw new BadRequestException(validation.reason ?? 'SQL validation failed.');
    }

    // RBAC check for write mode
    if (!validation.isReadOnly && userRole === 'VIEWER') {
      throw new ForbiddenException(
        'Your organization role (VIEWER) is restricted to Read-only queries. Contact an Admin or Owner for write permissions.',
      );
    }

    // Check query cache for identical SELECT queries
    const queryHash = createHash('sha256')
      .update(`${conn.id}:${validation.sanitizedSql}`)
      .digest('hex')
      .slice(0, 24);
    const cacheKey = `qcache:${queryHash}`;

    if (validation.statementType === 'SELECT' && !input.bypassCache) {
      const cachedResult = this.cache.get<SafeQueryExecutionResponse>(cacheKey);
      if (cachedResult && !cachedResult.requiresConfirmation) {
        return {
          ...cachedResult,
          validation: {
            ...cachedResult.validation,
            cached: true,
          },
        };
      }
    }

    const { executor, close } = await this.getExecutor(conn);
    try {
      // Cost cap & write-impact estimation via EXPLAIN (FORMAT JSON)
      if (
        validation.statementType === 'SELECT' ||
        validation.statementType === 'INSERT' ||
        validation.statementType === 'UPDATE' ||
        validation.statementType === 'DELETE'
      ) {
        const cleanStmt = validation.sanitizedSql.replace(/;+\s*$/, '');
        const explainRes = await executor.query<{
          'QUERY PLAN': Array<{ Plan: ExplainPlanNode }>;
        }>(`EXPLAIN (FORMAT JSON) ${cleanStmt}`);

        const planObj = explainRes.rows[0]?.['QUERY PLAN']?.[0]?.Plan;
        const rawCost = Number(planObj?.['Total Cost'] ?? 0);
        // Normalize PostgreSQL single-user disable_cost (1e10) offset if present
        const estimatedCost =
          rawCost >= 10_000_000_000 ? rawCost % 10_000_000_000 : rawCost;
        const estimatedRows = Number(planObj?.['Plan Rows'] ?? 1);

        if (estimatedCost > maxCostCap) {
          throw new BadRequestException(
            `Query estimated cost (${estimatedCost.toFixed(1)}) exceeds the safety cap (${maxCostCap}). Add a selective WHERE filter or index.`,
          );
        }

        // Write mode requires explicit impact preview confirmation before committing
        if (
          (validation.statementType === 'INSERT' ||
            validation.statementType === 'UPDATE' ||
            validation.statementType === 'DELETE') &&
          !input.confirmedWrite
        ) {
          return {
            requiresConfirmation: true,
            statementType: validation.statementType,
            estimatedAffectedRows: estimatedRows,
            estimatedCost,
            sanitizedSql: validation.sanitizedSql,
            warnings: validation.warnings,
          };
        }
      }

      const start = Date.now();
      await executor.exec('BEGIN;');
      try {
        await executor.exec(`SET LOCAL statement_timeout = ${timeoutMs};`);
        if (validation.isReadOnly) {
          await executor.exec('SET TRANSACTION READ ONLY;');
        }

        const queryRes = await executor.query<Record<string, unknown>>(
          validation.sanitizedSql,
        );
        await executor.exec('COMMIT;');

        const durationMs = Math.max(1, Date.now() - start);
        const rows = queryRes.rows ?? [];
        const firstRow = rows[0];
        const columns = firstRow ? Object.keys(firstRow) : [];
        const truncated =
          validation.limitApplied !== null && rows.length >= validation.limitApplied;

        const response: SafeQueryExecutionResponse = {
          requiresConfirmation: false,
          result: {
            sql: validation.sanitizedSql,
            columns,
            rows,
            rowCount: rows.length,
            durationMs,
            truncated,
            readOnly: validation.isReadOnly,
          },
          validation: {
            statementType: validation.statementType,
            referencedTables: validation.referencedTables,
            limitApplied: validation.limitApplied,
            warnings: validation.warnings,
            cached: false,
          },
        };

        if (validation.statementType === 'SELECT') {
          this.cache.set(cacheKey, response, 20);
        }

        return response;
      } catch (execErr) {
        await executor.exec('ROLLBACK;').catch(() => undefined);
        throw execErr;
      }
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof ForbiddenException) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : 'Query execution error';
      throw new BadRequestException(
        `PostgreSQL execution error: ${msg}. Check table/column names and data types.`,
      );
    } finally {
      await close();
    }
  }

  /**
   * Runs EXPLAIN or EXPLAIN ANALYZE safely inside a read-only sandbox transaction (always rolled back)
   * and extracts the execution plan tree and bottleneck indicators.
   */
  async explainQuery(
    conn: StoredDatabaseConnection,
    input: { sql: string; analyze?: boolean },
  ): Promise<ExplainPlanResponse> {
    const strippedExplain = input.sql
      .replace(/^\s*EXPLAIN\s*(?:\([^)]*\))?\s*(?:ANALYZE\s*)?/i, '')
      .trim();

    const validation = validateSql(strippedExplain, {
      allowWrite: false,
      defaultRowLimit: 500,
      maxRowLimit: 2000,
    });

    if (!validation.valid) {
      throw new BadRequestException(
        validation.reason ?? 'Only valid read-only SELECT queries can be explained.',
      );
    }

    const cleanSelect = validation.sanitizedSql.replace(/;+\s*$/, '');
    const analyzeFlag = input.analyze !== false;
    const explainCmd = analyzeFlag
      ? `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${cleanSelect}`
      : `EXPLAIN (FORMAT JSON) ${cleanSelect}`;

    const { executor, close } = await this.getExecutor(conn);
    try {
      await executor.exec('BEGIN READ ONLY;');
      try {
        await executor.exec('SET LOCAL statement_timeout = 5000;');
        const res = await executor.query<{
          'QUERY PLAN': Array<{
            Plan: ExplainPlanNode;
            'Planning Time'?: number;
            'Execution Time'?: number;
          }>;
        }>(explainCmd);
        await executor.exec('ROLLBACK;');

        const top = res.rows[0]?.['QUERY PLAN']?.[0];
        if (!top?.Plan) {
          throw new BadRequestException('Could not parse PostgreSQL EXPLAIN JSON output.');
        }

        const bottlenecks: string[] = [];
        const walkPlan = (node: ExplainPlanNode) => {
          const nodeType = node['Node Type'];
          const rel = node['Relation Name'];
          if (nodeType === 'Seq Scan' && rel) {
            bottlenecks.push(
              `Sequential scan on "${rel}"${node.Filter ? ` with filter ${node.Filter}` : ''} — consider a B-tree index on filtered columns as the table grows.`,
            );
          }
          if (nodeType === 'Sort' && (node['Total Cost'] ?? 0) > 25) {
            bottlenecks.push(
              `Sort operation (cost ${(node['Total Cost'] ?? 0).toFixed(1)}) — an index matching the ORDER BY clause can eliminate explicit sorting.`,
            );
          }
          for (const child of node.Plans ?? []) {
            walkPlan(child);
          }
        };
        walkPlan(top.Plan);

        const rawTotalCost = Number(top.Plan['Total Cost'] ?? 0);
        const normalizedTotalCost =
          rawTotalCost >= 10_000_000_000 ? rawTotalCost % 10_000_000_000 : rawTotalCost;

        return {
          sql: validation.sanitizedSql,
          analyzed: analyzeFlag,
          planningTimeMs: Number((top['Planning Time'] ?? 0.1).toFixed(2)),
          executionTimeMs:
            top['Execution Time'] !== undefined
              ? Number(top['Execution Time'].toFixed(2))
              : null,
          totalCost: Number(normalizedTotalCost.toFixed(2)),
          planRoot: top.Plan,
          bottlenecks,
        };
      } catch (innerErr) {
        await executor.exec('ROLLBACK;').catch(() => undefined);
        throw innerErr;
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : 'EXPLAIN failed';
      throw new BadRequestException(`EXPLAIN execution failed: ${msg}`);
    } finally {
      await close();
    }
  }

  /**
   * Benchmarks a recommended CREATE INDEX statement against a SELECT query inside a
   * rolled-back transaction so before/after cost and timing comparisons are genuinely measured.
   */
  async benchmarkIndexInSandbox(
    conn: StoredDatabaseConnection,
    input: { sql: string; createIndexSql: string },
  ): Promise<OptimizerBenchmarkResult> {
    if (!/^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(input.createIndexSql)) {
      throw new BadRequestException('Only single CREATE INDEX statements can be benchmarked.');
    }

    const beforePlan = await this.explainQuery(conn, { sql: input.sql, analyze: true });
    const strippedSelect = beforePlan.sql.replace(/;+\s*$/, '');

    const { executor, close } = await this.getExecutor(conn);
    try {
      await executor.exec('BEGIN;');
      try {
        await executor.exec('SET LOCAL statement_timeout = 5000;');
        await executor.exec(input.createIndexSql);
        const afterRes = await executor.query<{
          'QUERY PLAN': Array<{
            Plan: ExplainPlanNode;
            'Execution Time'?: number;
          }>;
        }>(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${strippedSelect}`);
        await executor.exec('ROLLBACK;');

        const top = afterRes.rows[0]?.['QUERY PLAN']?.[0];
        const rawAfterCost = Number(top?.Plan?.['Total Cost'] ?? beforePlan.totalCost);
        const afterCost = Number(
          (rawAfterCost >= 10_000_000_000
            ? rawAfterCost % 10_000_000_000
            : rawAfterCost
          ).toFixed(2),
        );
        const afterTimeMs =
          top?.['Execution Time'] !== undefined
            ? Number(top['Execution Time'].toFixed(2))
            : null;

        let usedIndexInPlan = false;
        const checkIndexUsed = (n?: ExplainPlanNode) => {
          if (!n) return;
          if (n['Node Type'].includes('Index')) {
            usedIndexInPlan = true;
          }
          for (const child of n.Plans ?? []) {
            checkIndexUsed(child);
          }
        };
        checkIndexUsed(top?.Plan);

        return {
          indexSql: input.createIndexSql,
          beforeCost: beforePlan.totalCost,
          afterCost,
          beforeTimeMs: beforePlan.executionTimeMs,
          afterTimeMs,
          usedIndexInPlan,
        };
      } catch (innerErr) {
        await executor.exec('ROLLBACK;').catch(() => undefined);
        throw innerErr;
      }
    } finally {
      await close();
    }
  }

  /**
   * Commits a reviewed CREATE INDEX statement and refreshes the schema snapshot.
   */
  async applyRecommendedIndex(
    conn: StoredDatabaseConnection,
    createIndexSql: string,
  ): Promise<DatabaseSchemaSnapshot> {
    if (!/^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(createIndexSql)) {
      throw new BadRequestException('Only CREATE INDEX statements are permitted.');
    }
    const { executor, close } = await this.getExecutor(conn);
    try {
      await executor.exec(createIndexSql);
    } finally {
      await close();
    }
    this.cache.del(`schema:${conn.id}`);
    return this.getSchemaSnapshot(conn, true);
  }

  /**
   * Phase 6: Schema AI — generates a multi-table PostgreSQL schema proposal with foreign keys
   * and B-tree indexes from a plain-English business description.
   */
  proposeSchemaFromBusinessDescription(description: string): SchemaAiProposalResponse {
    const descLower = description.toLowerCase();
    let tables: SchemaAiTableProposal[] = [];
    let summary = '';

    if (
      descLower.includes('pakistan') ||
      descLower.includes('province') ||
      descLower.includes('region')
    ) {
      summary =
        'Proposed a Pakistan National & Regional Intelligence schema (pakistan main table + regions foreign-keyed table covering all 7 provinces and territories).';
      tables = [
        {
          tableName: 'pakistan',
          description: 'Main national table for Pakistan with capital, currency, population, and GDP metrics.',
          columns: [
            { name: 'id', dataType: 'serial', isNullable: false, isPrimaryKey: true, isUnique: true },
            { name: 'country_code', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: true, defaultValue: "'PK'" },
            { name: 'country_name', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: "'Islamic Republic of Pakistan'" },
            { name: 'federal_capital', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: "'Islamabad'" },
            { name: 'currency', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: "'PKR'" },
            { name: 'total_regions', dataType: 'integer', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: '7' },
            { name: 'population_millions', dataType: 'numeric(12,2)', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: '241.49' },
            { name: 'gdp_billion_usd', dataType: 'numeric(12,2)', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: '374.90' },
            { name: 'updated_at', dataType: 'timestamptz', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: 'NOW()' },
          ],
          indexes: [{ name: 'idx_pakistan_country_code', columns: ['country_code'], isUnique: true }],
        },
        {
          tableName: 'regions',
          description: 'Provinces and territories of Pakistan linked to the pakistan main table via pakistan_id.',
          columns: [
            { name: 'id', dataType: 'serial', isNullable: false, isPrimaryKey: true, isUnique: true },
            {
              name: 'pakistan_id',
              dataType: 'integer',
              isNullable: false,
              isPrimaryKey: false,
              isUnique: false,
              referencesTable: 'pakistan',
              referencesColumn: 'id',
            },
            { name: 'region_code', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: true },
            { name: 'region_name', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false },
            { name: 'region_type', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: "'Province'" },
            { name: 'capital_city', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false },
            { name: 'districts_count', dataType: 'integer', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: '1' },
            { name: 'population_millions', dataType: 'numeric(12,2)', isNullable: false, isPrimaryKey: false, isUnique: false },
            { name: 'area_sq_km', dataType: 'integer', isNullable: false, isPrimaryKey: false, isUnique: false },
            { name: 'gdp_billion_usd', dataType: 'numeric(12,2)', isNullable: false, isPrimaryKey: false, isUnique: false },
            { name: 'completed_orders', dataType: 'integer', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: '0' },
            { name: 'revenue_usd', dataType: 'numeric(12,2)', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: '0' },
            { name: 'created_at', dataType: 'timestamptz', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: 'NOW()' },
          ],
          indexes: [
            { name: 'idx_regions_pakistan_id', columns: ['pakistan_id'], isUnique: false },
            { name: 'idx_regions_region_name', columns: ['region_name'], isUnique: false },
          ],
        },
      ];
    } else if (
      descLower.includes('book') ||
      descLower.includes('library') ||
      descLower.includes('author') ||
      descLower.includes('store') ||
      descLower.includes('shop') ||
      descLower.includes('ecommerce') ||
      descLower.includes('retail')
    ) {
      const isBookstore = descLower.includes('book') || descLower.includes('author');
      const itemTable = isBookstore ? 'books' : 'catalog_items';
      const itemLabel = isBookstore ? 'books' : 'catalog items';
      summary = `Proposed a normalized 3-table ${isBookstore ? 'Online Bookstore' : 'E-Commerce Store'} schema (${itemTable}, store_members, member_reviews) with foreign keys and B-tree lookup indexes.`;

      tables = [
        {
          tableName: itemTable,
          description: `Catalog of ${itemLabel} with SKU/ISBN, category, pricing in cents, and inventory count.`,
          columns: [
            { name: 'id', dataType: 'serial', isNullable: false, isPrimaryKey: true, isUnique: true },
            { name: 'code_sku', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: true },
            { name: 'title', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false },
            { name: 'category', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: "'General'" },
            { name: 'price_cents', dataType: 'integer', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: '1999' },
            { name: 'stock_quantity', dataType: 'integer', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: '50' },
            { name: 'is_published', dataType: 'boolean', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: 'true' },
            { name: 'created_at', dataType: 'timestamptz', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: 'NOW()' },
          ],
          indexes: [
            { name: `idx_${itemTable}_category`, columns: ['category'], isUnique: false },
          ],
        },
        {
          tableName: 'store_members',
          description: 'Registered store buyers with loyalty tier and lifetime spend.',
          columns: [
            { name: 'id', dataType: 'serial', isNullable: false, isPrimaryKey: true, isUnique: true },
            { name: 'email', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: true },
            { name: 'full_name', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false },
            { name: 'tier', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: "'Standard'" },
            { name: 'country_code', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: "'US'" },
            { name: 'created_at', dataType: 'timestamptz', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: 'NOW()' },
          ],
          indexes: [
            { name: 'idx_store_members_tier', columns: ['tier'], isUnique: false },
          ],
        },
        {
          tableName: 'member_reviews',
          description: `Verified customer ratings and reviews linked to ${itemTable} and store_members.`,
          columns: [
            { name: 'id', dataType: 'serial', isNullable: false, isPrimaryKey: true, isUnique: true },
            {
              name: 'item_id',
              dataType: 'integer',
              isNullable: false,
              isPrimaryKey: false,
              isUnique: false,
              referencesTable: itemTable,
              referencesColumn: 'id',
            },
            {
              name: 'member_id',
              dataType: 'integer',
              isNullable: false,
              isPrimaryKey: false,
              isUnique: false,
              referencesTable: 'store_members',
              referencesColumn: 'id',
            },
            { name: 'rating', dataType: 'integer', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: '5' },
            { name: 'headline', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false },
            { name: 'created_at', dataType: 'timestamptz', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: 'NOW()' },
          ],
          indexes: [
            { name: 'idx_member_reviews_item_id', columns: ['item_id'], isUnique: false },
          ],
        },
      ];
    } else if (
      descLower.includes('fleet') ||
      descLower.includes('logistic') ||
      descLower.includes('delivery') ||
      descLower.includes('vehicle') ||
      descLower.includes('shipment')
    ) {
      summary =
        'Proposed a 3-table Fleet & Logistics schema (fleet_vehicles, delivery_routes, telemetry_pings) with foreign key constraints and status indexes.';
      tables = [
        {
          tableName: 'fleet_vehicles',
          description: 'Active vehicles with VIN code, carrier region, and maintenance status.',
          columns: [
            { name: 'id', dataType: 'serial', isNullable: false, isPrimaryKey: true, isUnique: true },
            { name: 'vin_code', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: true },
            { name: 'model_name', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false },
            { name: 'status', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: "'active'" },
            { name: 'capacity_kg', dataType: 'integer', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: '2500' },
            { name: 'created_at', dataType: 'timestamptz', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: 'NOW()' },
          ],
          indexes: [{ name: 'idx_fleet_vehicles_status', columns: ['status'], isUnique: false }],
        },
        {
          tableName: 'delivery_routes',
          description: 'Scheduled dispatch routes assigned to fleet vehicles.',
          columns: [
            { name: 'id', dataType: 'serial', isNullable: false, isPrimaryKey: true, isUnique: true },
            {
              name: 'vehicle_id',
              dataType: 'integer',
              isNullable: false,
              isPrimaryKey: false,
              isUnique: false,
              referencesTable: 'fleet_vehicles',
              referencesColumn: 'id',
            },
            { name: 'origin_hub', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false },
            { name: 'destination_hub', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false },
            { name: 'distance_km', dataType: 'integer', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: '120' },
            { name: 'status', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: "'in_transit'" },
            { name: 'created_at', dataType: 'timestamptz', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: 'NOW()' },
          ],
          indexes: [
            { name: 'idx_delivery_routes_vehicle_id', columns: ['vehicle_id'], isUnique: false },
          ],
        },
      ];
    } else if (
      descLower.includes('clinic') ||
      descLower.includes('health') ||
      descLower.includes('hospital') ||
      descLower.includes('patient') ||
      descLower.includes('doctor')
    ) {
      summary =
        'Proposed a normalized Healthcare Clinic schema (clinic_providers, patients, appointments) with foreign keys and schedule indexes.';
      tables = [
        {
          tableName: 'clinic_providers',
          description: 'Medical practitioners with specialty and department.',
          columns: [
            { name: 'id', dataType: 'serial', isNullable: false, isPrimaryKey: true, isUnique: true },
            { name: 'full_name', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false },
            { name: 'specialty', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false },
            { name: 'is_available', dataType: 'boolean', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: 'true' },
            { name: 'created_at', dataType: 'timestamptz', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: 'NOW()' },
          ],
          indexes: [{ name: 'idx_clinic_providers_specialty', columns: ['specialty'], isUnique: false }],
        },
        {
          tableName: 'patients',
          description: 'Patient registry with contact email and insurance tier.',
          columns: [
            { name: 'id', dataType: 'serial', isNullable: false, isPrimaryKey: true, isUnique: true },
            { name: 'email', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: true },
            { name: 'full_name', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false },
            { name: 'insurance_plan', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: "'PPO'" },
            { name: 'created_at', dataType: 'timestamptz', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: 'NOW()' },
          ],
          indexes: [],
        },
        {
          tableName: 'appointments',
          description: 'Scheduled patient visits linked to clinic providers and patients.',
          columns: [
            { name: 'id', dataType: 'serial', isNullable: false, isPrimaryKey: true, isUnique: true },
            {
              name: 'provider_id',
              dataType: 'integer',
              isNullable: false,
              isPrimaryKey: false,
              isUnique: false,
              referencesTable: 'clinic_providers',
              referencesColumn: 'id',
            },
            {
              name: 'patient_id',
              dataType: 'integer',
              isNullable: false,
              isPrimaryKey: false,
              isUnique: false,
              referencesTable: 'patients',
              referencesColumn: 'id',
            },
            { name: 'status', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: "'scheduled'" },
            { name: 'fee_cents', dataType: 'integer', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: '15000' },
            { name: 'scheduled_at', dataType: 'timestamptz', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: 'NOW()' },
          ],
          indexes: [
            { name: 'idx_appointments_provider_id', columns: ['provider_id'], isUnique: false },
          ],
        },
      ];
    } else {
      // B2B SaaS / Subscription / Custom domain
      summary =
        'Proposed a normalized B2B SaaS Subscription schema (saas_accounts, subscriptions, usage_invoices) with relational constraints and billing indexes.';
      tables = [
        {
          tableName: 'saas_accounts',
          description: 'Tenant organizations with plan tier, seat count, and ARR in cents.',
          columns: [
            { name: 'id', dataType: 'serial', isNullable: false, isPrimaryKey: true, isUnique: true },
            { name: 'company_name', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false },
            { name: 'billing_email', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: true },
            { name: 'plan_tier', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: "'Growth'" },
            { name: 'arr_cents', dataType: 'integer', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: '120000' },
            { name: 'created_at', dataType: 'timestamptz', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: 'NOW()' },
          ],
          indexes: [{ name: 'idx_saas_accounts_plan_tier', columns: ['plan_tier'], isUnique: false }],
        },
        {
          tableName: 'usage_invoices',
          description: 'Monthly recurring and metered usage invoices linked to saas_accounts.',
          columns: [
            { name: 'id', dataType: 'serial', isNullable: false, isPrimaryKey: true, isUnique: true },
            {
              name: 'account_id',
              dataType: 'integer',
              isNullable: false,
              isPrimaryKey: false,
              isUnique: false,
              referencesTable: 'saas_accounts',
              referencesColumn: 'id',
            },
            { name: 'status', dataType: 'varchar(255)', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: "'paid'" },
            { name: 'amount_cents', dataType: 'integer', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: '10000' },
            { name: 'issued_at', dataType: 'timestamptz', isNullable: false, isPrimaryKey: false, isUnique: false, defaultValue: 'NOW()' },
          ],
          indexes: [{ name: 'idx_usage_invoices_account_id', columns: ['account_id'], isUnique: false }],
        },
      ];
    }

    const statements: string[] = [];
    for (const tbl of tables) {
      const colLines = tbl.columns.map((col) => {
        const parts: string[] = [`  ${col.name} ${col.dataType.toUpperCase()}`];
        if (col.isPrimaryKey) parts.push('PRIMARY KEY');
        if (!col.isNullable && !col.isPrimaryKey) parts.push('NOT NULL');
        if (col.isUnique && !col.isPrimaryKey) parts.push('UNIQUE');
        if (col.defaultValue) parts.push(`DEFAULT ${col.defaultValue}`);
        if (col.referencesTable && col.referencesColumn) {
          parts.push(`REFERENCES ${col.referencesTable}(${col.referencesColumn}) ON DELETE CASCADE`);
        }
        return parts.join(' ');
      });
      statements.push(`CREATE TABLE IF NOT EXISTS ${tbl.tableName} (\n${colLines.join(',\n')}\n);`);
      for (const idx of tbl.indexes) {
        const uniqueKw = idx.isUnique ? 'UNIQUE ' : '';
        statements.push(
          `CREATE ${uniqueKw}INDEX IF NOT EXISTS ${idx.name} ON ${tbl.tableName} (${idx.columns.join(', ')});`,
        );
      }
    }

    const ddlSql = ['-- DataPilot Schema AI Migration Preview', 'BEGIN;', '', ...statements, '', 'COMMIT;'].join('\n');

    return {
      description,
      summary,
      tables,
      ddlSql,
      modelUsed: process.env['GROQ_MODEL'] ?? 'llama-3.3-70b-versatile',
    };
  }

  /**
   * Phase 6: Applies a reviewed Schema AI multi-table DDL script inside a transaction.
   */
  async applySchemaAiMigration(
    conn: StoredDatabaseConnection,
    ddlSql: string,
  ): Promise<DatabaseSchemaSnapshot> {
    if (/\b(?:DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE\b|DELETE\s+FROM|ALTER\s+SYSTEM)\b/i.test(ddlSql)) {
      throw new BadRequestException(
        'Destructive DDL statements (DROP, TRUNCATE, DELETE FROM) are not permitted in Schema AI migrations.',
      );
    }
    const { executor, close } = await this.getExecutor(conn);
    try {
      await executor.exec(ddlSql);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Migration failed';
      throw new BadRequestException(`Schema AI migration failed: ${msg}`);
    } finally {
      await close();
    }
    this.cache.del(`schema:${conn.id}`);
    return this.getSchemaSnapshot(conn, true);
  }

  /**
   * Phase 6: Generates realistic seed data for any table in the database with row-count controls,
   * automatically satisfying foreign-key references and unique constraints.
   */
  async generateRealisticSeedData(
    conn: StoredDatabaseConnection,
    input: GenerateSeedInput,
  ): Promise<SeedGeneratorResponse> {
    const startTime = Date.now();
    const rowCount = Math.min(Math.max(input.rowCount, 1), 500);
    const snapshot = await this.getSchemaSnapshot(conn, false);
    const table = snapshot.tables.find((t) => t.name === input.tableName);
    if (!table) {
      throw new BadRequestException(`Table "${input.tableName}" does not exist in ${conn.databaseName}.`);
    }

    // Identify relations where this table is the sourceTable
    const outgoingFks = snapshot.relations.filter((r) => r.sourceTable === table.name);
    const fkValidValues = new Map<string, Array<number | string>>();

    const { executor, close } = await this.getExecutor(conn);
    try {
      for (const fk of outgoingFks) {
        const res = await executor.query<Record<string, unknown>>(
          `SELECT ${fk.targetColumn} AS val FROM ${fk.targetTable} LIMIT 200`,
        );
        const vals = res.rows
          .map((r) => r['val'])
          .filter((v): v is number | string => typeof v === 'number' || typeof v === 'string');
        if (vals.length === 0) {
          throw new BadRequestException(
            `Cannot seed "${table.name}" yet because referenced parent table "${fk.targetTable}" has 0 rows. Seed "${fk.targetTable}" first.`,
          );
        }
        fkValidValues.set(fk.sourceColumn, vals);
      }

      const insertableCols = table.columns.filter(
        (col) =>
          !col.isPrimaryKey &&
          !col.dataType.toLowerCase().includes('serial') &&
          !(col.defaultValue?.toLowerCase().includes('nextval') ?? false),
      );

      if (insertableCols.length === 0) {
        throw new BadRequestException(`Table "${table.name}" has no insertable non-serial columns.`);
      }

      const firstNames = ['Elena', 'Marcus', 'Priya', 'Liam', 'Sophia', 'Noah', 'Amara', 'Devon', 'Hana', 'Lucas', 'Chloe', 'Mateo'];
      const lastNames = ['Vance', 'Sterling', 'Patel', 'Okafor', 'Chen', 'Mercer', 'Reyes', 'Lindqvist', 'Sato', 'Kowalski'];
      const companies = ['Northstar Analytics', 'Veloce Cloud', 'Apex Freight', 'Cinder Bio', 'Helios Fintech', 'Strata Systems', 'Kinetix AI'];
      const categories = ['Compute', 'Analytics', 'Security', 'Storage', 'Networking', 'Enterprise Suite'];
      const segments = ['Enterprise B2B', 'Mid-Market', 'Self-Serve', 'Strategic'];
      const statuses = ['completed', 'completed', 'completed', 'pending', 'failed'];
      const regions = ['North America', 'Europe', 'Asia Pacific', 'Latin America'];
      const countries = ['US', 'GB', 'DE', 'CA', 'SG', 'JP', 'FR'];

      const generatedRows: Record<string, unknown>[] = [];
      const valueTuplesSql: string[] = [];
      const seedBatchTag = Math.floor(Date.now() % 100000);

      for (let i = 0; i < rowCount; i++) {
        const idx = i + 1;
        const rowObj: Record<string, unknown> = {};
        const tupleLiterals: string[] = [];

        for (const col of insertableCols) {
          const cName = col.name.toLowerCase();
          const cType = col.dataType.toLowerCase();

          // 1. Foreign key column
          if (fkValidValues.has(col.name)) {
            const choices = fkValidValues.get(col.name)!;
            const picked = choices[i % choices.length]!;
            rowObj[col.name] = picked;
            tupleLiterals.push(typeof picked === 'number' ? String(picked) : `'${String(picked).replace(/'/g, "''")}'`);
            continue;
          }

          // 2. Domain-specific column names
          if (cName.includes('email')) {
            const fn = firstNames[i % firstNames.length]!.toLowerCase();
            const ln = lastNames[(i * 3) % lastNames.length]!.toLowerCase();
            const val = `${fn}.${ln}.${seedBatchTag}.${idx}@example.com`;
            rowObj[col.name] = val;
            tupleLiterals.push(`'${val}'`);
          } else if (cName === 'full_name' || cName === 'customer_name' || cName === 'author') {
            const val = `${firstNames[i % firstNames.length]} ${lastNames[(i * 3) % lastNames.length]}`;
            rowObj[col.name] = val;
            tupleLiterals.push(`'${val}'`);
          } else if (cName.includes('company') || cName === 'origin_hub' || cName === 'destination_hub') {
            const val = `${companies[i % companies.length]} (${idx})`;
            rowObj[col.name] = val;
            tupleLiterals.push(`'${val}'`);
          } else if (cName.includes('sku') || cName.includes('vin') || cName.includes('code')) {
            if (cName === 'country_code' || cName === 'currency') {
              const val = cName === 'currency' ? 'USD' : countries[i % countries.length]!;
              rowObj[col.name] = val;
              tupleLiterals.push(`'${val}'`);
            } else {
              const val = `DP-${seedBatchTag}-${String(idx).padStart(4, '0')}`;
              rowObj[col.name] = val;
              tupleLiterals.push(`'${val}'`);
            }
          } else if (cName.includes('segment') || cName.includes('tier') || cName.includes('plan')) {
            const val = segments[i % segments.length]!;
            rowObj[col.name] = val;
            tupleLiterals.push(`'${val}'`);
          } else if (cName.includes('status')) {
            const val = statuses[i % statuses.length]!;
            rowObj[col.name] = val;
            tupleLiterals.push(`'${val}'`);
          } else if (cName.includes('region')) {
            const val = regions[i % regions.length]!;
            rowObj[col.name] = val;
            tupleLiterals.push(`'${val}'`);
          } else if (cName.includes('category') || cName.includes('specialty')) {
            const val = categories[i % categories.length]!;
            rowObj[col.name] = val;
            tupleLiterals.push(`'${val}'`);
          } else if (cName.includes('cents') || cName.includes('price') || cName.includes('amount') || cName.includes('total') || cName.includes('arr')) {
            const val = ((i % 15) + 1) * 4500;
            rowObj[col.name] = val;
            tupleLiterals.push(String(val));
          } else if (cName.includes('rating')) {
            const val = (i % 5) + 1;
            rowObj[col.name] = val;
            tupleLiterals.push(String(val));
          } else if (cName.includes('quantity') || cName.includes('stock') || cName.includes('capacity') || cName.includes('distance')) {
            const val = ((i % 10) + 1) * 5;
            rowObj[col.name] = val;
            tupleLiterals.push(String(val));
          } else if (cType.includes('bool')) {
            const val = i % 4 !== 0;
            rowObj[col.name] = val;
            tupleLiterals.push(val ? 'TRUE' : 'FALSE');
          } else if (cType.includes('int') || cType.includes('numeric') || cType.includes('decimal') || cType.includes('real')) {
            const val = (i + 1) * 10;
            rowObj[col.name] = val;
            tupleLiterals.push(String(val));
          } else if (cType.includes('timestamp') || cType.includes('date')) {
            const daysAgo = i % 60;
            const d = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
            rowObj[col.name] = d;
            tupleLiterals.push(`'${d}'`);
          } else {
            const isUniqueCol = table.indexes.some(
              (ix) => ix.isUnique && ix.columns.includes(col.name),
            );
            const val = isUniqueCol
              ? `${col.name}_${seedBatchTag}_${idx}`
              : `${categories[i % categories.length]} ${col.name.replace(/_/g, ' ')} #${idx}`;
            rowObj[col.name] = val;
            tupleLiterals.push(`'${val.replace(/'/g, "''")}'`);
          }
        }

        generatedRows.push(rowObj);
        valueTuplesSql.push(`  (${tupleLiterals.join(', ')})`);
      }

      const colNamesSql = insertableCols.map((c) => c.name).join(', ');
      const fullInsertSql = `INSERT INTO ${table.name} (${colNamesSql})\nVALUES\n${valueTuplesSql.join(',\n')};`;
      const previewInsertSql =
        valueTuplesSql.length > 8
          ? `INSERT INTO ${table.name} (${colNamesSql})\nVALUES\n${valueTuplesSql.slice(0, 8).join(',\n')}\n  -- ... plus ${valueTuplesSql.length - 8} more row(s);`
          : fullInsertSql;

      let updatedSchema: DatabaseSchemaSnapshot | undefined;
      if (!input.previewOnly) {
        await executor.exec('BEGIN;');
        try {
          await executor.exec(fullInsertSql);
          await executor.exec('COMMIT;');
        } catch (err) {
          await executor.exec('ROLLBACK;').catch(() => undefined);
          throw err;
        }
      }

      const durationMs = Date.now() - startTime;
      if (!input.previewOnly) {
        this.cache.del(`schema:${conn.id}`);
        updatedSchema = await this.getSchemaSnapshot(conn, true);
      }

      return {
        tableName: table.name,
        rowCount,
        applied: !input.previewOnly,
        durationMs,
        sampleRows: generatedRows.slice(0, 10),
        insertSqlPreview: previewInsertSql,
        schema: updatedSchema,
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : 'Seed generation failed';
      throw new BadRequestException(`Seed generation failed: ${msg}`);
    } finally {
      await close();
    }
  }

  /**
   * Parses RFC-4180 CSV content into header array and data rows.
   */
  private parseCsvContent(csvContent: string): { headers: string[]; rows: string[][] } {
    const lines = csvContent
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter((line) => line.trim().length > 0);

    if (lines.length < 2) {
      throw new BadRequestException(
        'CSV content must include a header row and at least one data row.',
      );
    }

    const parseRow = (line: string): string[] => {
      const cells: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]!;
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          cells.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      cells.push(current.trim());
      return cells;
    };

    const headers = parseRow(lines[0]!);
    if (headers.length === 0 || headers.some((h) => h.length === 0)) {
      throw new BadRequestException('Every CSV column in the first row must have a header name.');
    }

    const rows = lines.slice(1).map(parseRow);
    return { headers, rows };
  }

  /**
   * Infers PostgreSQL column types from parsed CSV headers and rows.
   */
  private inferCsvColumns(headers: string[], rows: string[][]): CsvColumnInference[] {
    const usedNames = new Set<string>();

    return headers.map((rawHeader, colIdx) => {
      let clean = rawHeader
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
      if (!clean || !/^[a-z]/.test(clean)) {
        clean = `col_${clean || colIdx + 1}`;
      }
      if (clean === 'id') {
        clean = 'external_id';
      }
      let finalName = clean;
      let suffix = 2;
      while (usedNames.has(finalName)) {
        finalName = `${clean}_${suffix++}`;
      }
      usedNames.add(finalName);

      const values: string[] = [];
      let hasEmpty = false;
      for (const r of rows) {
        const val = (r[colIdx] ?? '').trim();
        if (val === '' || val.toLowerCase() === 'null') {
          hasEmpty = true;
        } else {
          values.push(val);
        }
      }

      let inferredType: InferredPostgresColumnType = 'text';
      if (values.length > 0) {
        const allBool = values.every((v) => /^(?:true|false)$/i.test(v));
        const allInt = values.every(
          (v) => /^-?\d+$/.test(v) && Number(v) >= -2147483648 && Number(v) <= 2147483647,
        );
        const allNumeric = values.every((v) => /^-?\d+(?:\.\d+)?$/.test(v));
        const allTimestamp = values.every(
          (v) =>
            /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(
              v,
            ) && !Number.isNaN(Date.parse(v)),
        );

        if (allBool) {
          inferredType = 'boolean';
        } else if (allInt) {
          inferredType = 'integer';
        } else if (allNumeric) {
          inferredType = 'numeric(12,2)';
        } else if (allTimestamp) {
          inferredType = 'timestamptz';
        } else {
          inferredType = 'text';
        }
      }

      return {
        originalHeader: rawHeader,
        columnName: finalName,
        inferredType,
        nullable: hasEmpty,
        sampleValues: values.slice(0, 4),
      };
    });
  }

  /**
   * Phase 6: Previews CSV import with column type inference, sample rows, and CREATE TABLE DDL.
   */
  previewCsvImport(input: CsvPreviewInput): CsvPreviewResponse {
    const { headers, rows } = this.parseCsvContent(input.csvContent);
    const columns = this.inferCsvColumns(headers, rows);

    const colDefs = [
      '  id SERIAL PRIMARY KEY',
      ...columns.map(
        (c) => `  ${c.columnName} ${c.inferredType.toUpperCase()}${c.nullable ? '' : ' NOT NULL'}`,
      ),
    ];
    const createTableSql = `CREATE TABLE IF NOT EXISTS ${input.tableName} (\n${colDefs.join(',\n')}\n);`;

    const sampleRows = rows.slice(0, 8).map((r) => {
      const obj: Record<string, string> = {};
      columns.forEach((col, i) => {
        obj[col.columnName] = r[i] ?? '';
      });
      return obj;
    });

    return {
      tableName: input.tableName,
      totalRows: rows.length,
      columns,
      sampleRows,
      createTableSql,
    };
  }

  /**
   * Phase 6: Confirms and executes a CSV import inside a single PostgreSQL transaction.
   */
  async confirmCsvImport(
    conn: StoredDatabaseConnection,
    input: CsvConfirmImportInput,
  ): Promise<CsvImportResultResponse> {
    const startTime = Date.now();
    const { headers, rows } = this.parseCsvContent(input.csvContent);
    const inferredColumns = this.inferCsvColumns(headers, rows);

    const allowedOverrideTypes = new Set([
      'integer',
      'numeric(12,2)',
      'boolean',
      'timestamptz',
      'text',
      'varchar(255)',
    ]);

    const finalColumns = inferredColumns.map((col) => {
      const override = input.columnTypes?.[col.columnName]?.toLowerCase();
      return {
        ...col,
        finalType:
          override && allowedOverrideTypes.has(override)
            ? (override as InferredPostgresColumnType)
            : col.inferredType,
      };
    });

    const colDefs = [
      '  id SERIAL PRIMARY KEY',
      ...finalColumns.map(
        (c) => `  ${c.columnName} ${c.finalType.toUpperCase()}${c.nullable ? '' : ' NOT NULL'}`,
      ),
    ];
    const createTableSql = `CREATE TABLE IF NOT EXISTS ${input.tableName} (\n${colDefs.join(',\n')}\n);`;

    const valueTuples: string[] = rows.map((r) => {
      const literals = finalColumns.map((col, idx) => {
        const raw = (r[idx] ?? '').trim();
        if (raw === '' || raw.toLowerCase() === 'null') {
          return 'NULL';
        }
        if (col.finalType === 'integer' || col.finalType === 'numeric(12,2)') {
          const num = Number(raw);
          return Number.isFinite(num) ? String(num) : '0';
        }
        if (col.finalType === 'boolean') {
          return /^true$/i.test(raw) ? 'TRUE' : 'FALSE';
        }
        return `'${raw.replace(/'/g, "''")}'`;
      });
      return `  (${literals.join(', ')})`;
    });

    const colNamesList = finalColumns.map((c) => c.columnName).join(', ');
    const insertSql = `INSERT INTO ${input.tableName} (${colNamesList})\nVALUES\n${valueTuples.join(',\n')};`;

    const { executor, close } = await this.getExecutor(conn);
    try {
      await executor.exec('BEGIN;');
      try {
        await executor.exec(createTableSql);
        await executor.exec(insertSql);
        await executor.exec('COMMIT;');
      } catch (err) {
        await executor.exec('ROLLBACK;').catch(() => undefined);
        throw err;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'CSV import failed';
      throw new BadRequestException(`CSV import failed: ${msg}`);
    } finally {
      await close();
    }

    this.cache.del(`schema:${conn.id}`);
    const schema = await this.getSchemaSnapshot(conn, true);

    return {
      tableName: input.tableName,
      importedRows: rows.length,
      columnsCreated: finalColumns.length + 1,
      durationMs: Date.now() - startTime,
      schema,
    };
  }
}

