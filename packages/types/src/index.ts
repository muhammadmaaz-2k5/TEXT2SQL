import { z } from 'zod';

// ============================================================================
// Roles & Organizations
// ============================================================================

export const OrgRoleSchema = z.enum(['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER']);
export type OrgRole = z.infer<typeof OrgRoleSchema>;

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
  createdAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  activeOrganizationId: string;
  organizations: OrganizationSummary[];
  createdAt: string;
}

// ============================================================================
// Authentication Contracts
// ============================================================================

export const LoginInputSchema = z.object({
  email: z.string().email('Enter a valid work email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const SignupInputSchema = z.object({
  name: z.string().min(2, 'Enter your full name.').max(80),
  email: z.string().email('Enter a valid work email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password must be under 128 characters.'),
  organizationName: z
    .string()
    .min(2, 'Enter an organization or team name.')
    .max(80),
});
export type SignupInput = z.infer<typeof SignupInputSchema>;

export const ForgotPasswordInputSchema = z.object({
  email: z.string().email('Enter the email address associated with your account.'),
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordInputSchema>;

export const SwitchOrganizationInputSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required.'),
});
export type SwitchOrganizationInput = z.infer<typeof SwitchOrganizationInputSchema>;

export interface AuthSessionResponse {
  user: AuthUser;
  accessToken: string;
  expiresIn: number;
}

// ============================================================================
// Database Connections & Schema Introspection
// ============================================================================

export const DatabaseEngineSchema = z.enum(['POSTGRESQL', 'MYSQL', 'SQLITE', 'CSV']);
export type DatabaseEngine = z.infer<typeof DatabaseEngineSchema>;

export const ConnectionStatusSchema = z.enum([
  'CONNECTED',
  'DISCONNECTED',
  'ERROR',
  'PROVISIONING',
]);
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;

export const SslModeSchema = z.enum(['disable', 'prefer', 'require']);
export type SslMode = z.infer<typeof SslModeSchema>;

export interface DatabaseConnectionItem {
  id: string;
  organizationId: string;
  name: string;
  engine: DatabaseEngine;
  isManaged: boolean;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  sslMode: SslMode;
  readOnlyDefault: boolean;
  status: ConnectionStatus;
  tableCount: number;
  lastSyncedAt: string | null;
  createdAt: string;
}

export const CreateManagedDatabaseInputSchema = z.object({
  name: z
    .string()
    .min(2, 'Enter a descriptive database name (at least 2 characters).')
    .max(64),
  template: z.enum(['blank', 'shop_analytics', 'saas_metrics']).default('blank'),
  readOnlyDefault: z.boolean().default(true),
});
export type CreateManagedDatabaseInput = z.infer<typeof CreateManagedDatabaseInputSchema>;

export const TestExternalConnectionInputSchema = z.object({
  engine: DatabaseEngineSchema.default('POSTGRESQL'),
  host: z.string().min(1, 'Enter the database hostname or IP address.'),
  port: z.coerce.number().int().min(1).max(65535).default(5432),
  databaseName: z.string().min(1, 'Enter the database name.'),
  username: z.string().min(1, 'Enter the database username.'),
  password: z.string().min(1, 'Enter the database password.'),
  sslMode: SslModeSchema.default('prefer'),
});
export type TestExternalConnectionInput = z.infer<typeof TestExternalConnectionInputSchema>;

export const ConnectExternalDatabaseInputSchema = TestExternalConnectionInputSchema.extend({
  name: z
    .string()
    .min(2, 'Enter a display name for this connection.')
    .max(64),
  readOnlyDefault: z.boolean().default(true),
});
export type ConnectExternalDatabaseInput = z.infer<typeof ConnectExternalDatabaseInputSchema>;

export interface TestConnectionResult {
  ok: boolean;
  latencyMs: number;
  serverVersion: string;
  tableCount: number;
  message: string;
}

export interface SchemaColumn {
  name: string;
  dataType: string;
  isNullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  referencesTable?: string;
  referencesColumn?: string;
}

export interface SchemaIndex {
  name: string;
  columns: string[];
  isUnique: boolean;
}

export interface SchemaTable {
  name: string;
  schema: string;
  rowCountEstimate: number;
  columns: SchemaColumn[];
  indexes: SchemaIndex[];
}

export interface SchemaRelation {
  id: string;
  constraintName: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
}

export interface DatabaseSchemaSnapshot {
  databaseId: string;
  databaseName: string;
  engine: DatabaseEngine;
  syncedAt: string;
  cached: boolean;
  tables: SchemaTable[];
  relations: SchemaRelation[];
}

// ============================================================================
// Schema Designer & Migration Contracts
// ============================================================================

export const DesignerColumnInputSchema = z.object({
  name: z
    .string()
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Column name must be a valid SQL identifier.'),
  dataType: z.enum([
    'uuid',
    'serial',
    'bigserial',
    'integer',
    'bigint',
    'numeric(12,2)',
    'text',
    'varchar(255)',
    'boolean',
    'timestamptz',
    'date',
    'jsonb',
  ]),
  isNullable: z.boolean().default(true),
  isPrimaryKey: z.boolean().default(false),
  isUnique: z.boolean().default(false),
  defaultValue: z.string().optional(),
  referencesTable: z.string().optional(),
  referencesColumn: z.string().optional(),
});
export type DesignerColumnInput = z.infer<typeof DesignerColumnInputSchema>;

export const DesignerIndexInputSchema = z.object({
  name: z
    .string()
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Index name must be a valid SQL identifier.'),
  columns: z.array(z.string().min(1)).min(1, 'Select at least one column for the index.'),
  isUnique: z.boolean().default(false),
});
export type DesignerIndexInput = z.infer<typeof DesignerIndexInputSchema>;

export const DesignerCreateTableInputSchema = z.object({
  tableName: z
    .string()
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Table name must be a valid SQL identifier.'),
  columns: z.array(DesignerColumnInputSchema).min(1, 'Add at least one column.'),
  indexes: z.array(DesignerIndexInputSchema).default([]),
});
export type DesignerCreateTableInput = z.infer<typeof DesignerCreateTableInputSchema>;

export interface MigrationPreviewResponse {
  sql: string;
  statementsCount: number;
  warnings: string[];
}

// ============================================================================
// AI & Query Execution Contracts
// ============================================================================

export const ChartTypeSchema = z.enum([
  'bar',
  'line',
  'area',
  'pie',
  'scatter',
  'kpi',
  'table',
]);
export type ChartType = z.infer<typeof ChartTypeSchema>;

export const ChartSpecSchema = z.object({
  type: ChartTypeSchema,
  x: z.string().nullable(),
  y: z.array(z.string()),
  title: z.string().optional(),
});
export type ChartSpec = z.infer<typeof ChartSpecSchema>;

export const StructuredAiSqlSchema = z.object({
  sql: z.string(),
  query_type: z.enum(['SELECT', 'EXPLAIN', 'INSERT', 'UPDATE', 'DELETE', 'DDL']),
  tables: z.array(z.string()),
  explanation: z.string(),
  chart: ChartSpecSchema,
});
export type StructuredAiSql = z.infer<typeof StructuredAiSqlSchema>;

export interface QueryExecutionResult {
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  truncated: boolean;
  readOnly: boolean;
}

export const ExecuteSqlInputSchema = z.object({
  sql: z.string().min(1, 'Enter a SQL statement to execute.'),
  allowWrite: z.boolean().default(false),
  confirmedWrite: z.boolean().default(false),
  rowLimit: z.number().int().min(1).max(2000).optional(),
});
export type ExecuteSqlInput = z.infer<typeof ExecuteSqlInputSchema>;

export interface WriteImpactPreviewResponse {
  requiresConfirmation: true;
  statementType: 'INSERT' | 'UPDATE' | 'DELETE';
  estimatedAffectedRows: number;
  estimatedCost: number;
  sanitizedSql: string;
  warnings: string[];
}

export interface ExecutedQueryResponse {
  requiresConfirmation: false;
  result: QueryExecutionResult;
  validation: {
    statementType: string;
    referencedTables: string[];
    limitApplied: number | null;
    warnings: string[];
    cached: boolean;
  };
}

export type SafeQueryExecutionResponse =
  | WriteImpactPreviewResponse
  | ExecutedQueryResponse;

export interface ExplainPlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Alias'?: string;
  'Index Name'?: string;
  'Startup Cost'?: number;
  'Total Cost'?: number;
  'Plan Rows'?: number;
  'Plan Width'?: number;
  'Actual Startup Time'?: number;
  'Actual Total Time'?: number;
  'Actual Rows'?: number;
  'Actual Loops'?: number;
  'Filter'?: string;
  'Index Cond'?: string;
  'Hash Cond'?: string;
  Plans?: ExplainPlanNode[];
}

export interface ExplainPlanResponse {
  sql: string;
  analyzed: boolean;
  planningTimeMs: number;
  executionTimeMs: number | null;
  totalCost: number;
  planRoot: ExplainPlanNode;
  bottlenecks: string[];
}

// ============================================================================
// Phase 4: Conversational AI Ask & Query History Contracts
// ============================================================================

export const ConversationTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  prompt: z.string(),
  sql: z.string().optional(),
  explanation: z.string().optional(),
});
export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;

export const AiAskInputSchema = z.object({
  prompt: z
    .string()
    .min(2, 'Enter a question in plain English.')
    .max(2000, 'Question must be under 2,000 characters.'),
  history: z.array(ConversationTurnSchema).max(12).default([]),
  allowWrite: z.boolean().default(false),
});
export type AiAskInput = z.infer<typeof AiAskInputSchema>;

export interface AiAskResponse {
  id: string;
  databaseId: string;
  prompt: string;
  structured: StructuredAiSql;
  prunedTables: string[];
  execution: SafeQueryExecutionResponse | null;
  executionError?: string;
  modelUsed: string;
  retried: boolean;
  createdAt: string;
}

export interface QueryHistoryItem {
  id: string;
  organizationId: string;
  databaseId: string;
  databaseName: string;
  userId: string;
  userName: string;
  prompt: string | null;
  sql: string;
  explanation: string | null;
  chart: ChartSpec | null;
  rowCount: number;
  durationMs: number;
  isSaved: boolean;
  shareToken: string | null;
  createdAt: string;
}

// ============================================================================
// Phase 5: Query Optimizer & Dashboards Contracts
// ============================================================================

export interface OptimizerIndexSuggestion {
  indexName: string;
  tableName: string;
  columns: string[];
  createIndexSql: string;
  rationale: string;
}

export interface OptimizerBenchmarkResult {
  indexSql: string;
  beforeCost: number;
  afterCost: number;
  beforeTimeMs: number | null;
  afterTimeMs: number | null;
  usedIndexInPlan: boolean;
}

export interface OptimizerAnalysisResponse {
  sql: string;
  plan: ExplainPlanResponse;
  aiSummary: string;
  bottlenecks: string[];
  indexSuggestions: OptimizerIndexSuggestion[];
  benchmarked: boolean;
  benchmark?: OptimizerBenchmarkResult;
  disclaimer: string;
}

export const DashboardWidgetSizeSchema = z.enum(['sm', 'md', 'lg']);
export type DashboardWidgetSize = z.infer<typeof DashboardWidgetSizeSchema>;

export interface DashboardWidgetItem {
  id: string;
  title: string;
  subtitle?: string;
  sql: string;
  chart: ChartSpec;
  size: DashboardWidgetSize;
  position: number;
  lastResult: QueryExecutionResult | null;
  refreshedAt: string | null;
}

export interface DashboardItem {
  id: string;
  organizationId: string;
  databaseId: string;
  databaseName: string;
  name: string;
  description: string;
  prompt: string;
  shareToken: string | null;
  shareMinRole: OrgRole;
  widgets: DashboardWidgetItem[];
  createdAt: string;
  updatedAt: string;
}

export const GenerateDashboardInputSchema = z.object({
  databaseId: z.string().min(1),
  prompt: z
    .string()
    .min(3, 'Describe the dashboard you want to generate.')
    .max(1000),
  name: z.string().max(80).optional(),
});
export type GenerateDashboardInput = z.infer<typeof GenerateDashboardInputSchema>;

// ============================================================================
// Phase 6: Schema AI, Realistic Seed Generator & CSV Import Contracts
// ============================================================================

export const SchemaAiGenerateInputSchema = z.object({
  description: z
    .string()
    .min(3, 'Describe your business or domain (e.g., "online bookstore").')
    .max(1000),
});
export type SchemaAiGenerateInput = z.infer<typeof SchemaAiGenerateInputSchema>;

export interface SchemaAiTableProposal {
  tableName: string;
  description: string;
  columns: DesignerColumnInput[];
  indexes: DesignerIndexInput[];
}

export interface SchemaAiProposalResponse {
  description: string;
  summary: string;
  tables: SchemaAiTableProposal[];
  ddlSql: string;
  modelUsed: string;
}

export const GenerateSeedInputSchema = z.object({
  tableName: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Valid table name required.'),
  rowCount: z.number().int().min(1).max(500).default(20),
  previewOnly: z.boolean().default(false),
});
export type GenerateSeedInput = z.infer<typeof GenerateSeedInputSchema>;

export interface SeedGeneratorResponse {
  tableName: string;
  rowCount: number;
  applied: boolean;
  durationMs: number;
  sampleRows: Record<string, unknown>[];
  insertSqlPreview: string;
  schema?: DatabaseSchemaSnapshot;
}

export type InferredPostgresColumnType =
  | 'integer'
  | 'numeric(12,2)'
  | 'boolean'
  | 'timestamptz'
  | 'text';

export interface CsvColumnInference {
  originalHeader: string;
  columnName: string;
  inferredType: InferredPostgresColumnType;
  nullable: boolean;
  sampleValues: string[];
}

export const CsvPreviewInputSchema = z.object({
  tableName: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,48}$/, 'Table name must be lowercase snake_case (e.g., imported_leads).'),
  csvContent: z.string().min(5, 'Paste or upload non-empty CSV data.'),
});
export type CsvPreviewInput = z.infer<typeof CsvPreviewInputSchema>;

export interface CsvPreviewResponse {
  tableName: string;
  totalRows: number;
  columns: CsvColumnInference[];
  sampleRows: Record<string, string>[];
  createTableSql: string;
}

export const CsvConfirmImportInputSchema = z.object({
  tableName: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,48}$/, 'Table name must be lowercase snake_case.'),
  csvContent: z.string().min(5),
  columnTypes: z.record(z.string(), z.string()).optional(),
});
export type CsvConfirmImportInput = z.infer<typeof CsvConfirmImportInputSchema>;

export interface CsvImportResultResponse {
  tableName: string;
  importedRows: number;
  columnsCreated: number;
  durationMs: number;
  schema: DatabaseSchemaSnapshot;
}

// ============================================================================
// Phase 7: Team RBAC, API Keys & Public REST Endpoint (POST /api/v1/ai/query)
// ============================================================================

export interface TeamMemberItem {
  id: string;
  userId: string;
  organizationId: string;
  name: string;
  email: string;
  role: OrgRole;
  status: 'ACTIVE' | 'INVITED';
  joinedAt: string;
}

export const InviteTeamMemberInputSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  name: z.string().min(2).max(80).optional(),
  role: OrgRoleSchema.default('DEVELOPER'),
});
export type InviteTeamMemberInput = z.infer<typeof InviteTeamMemberInputSchema>;

export interface ApiKeyItem {
  id: string;
  organizationId: string;
  name: string;
  keyPrefix: string;
  scopes: Array<'read' | 'write'>;
  createdByUserId: string;
  createdByName: string;
  requestCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export const CreateApiKeyInputSchema = z.object({
  name: z
    .string()
    .min(2, 'Enter a descriptive name for the API key.')
    .max(64),
  scopes: z.array(z.enum(['read', 'write'])).min(1).default(['read']),
});
export type CreateApiKeyInput = z.infer<typeof CreateApiKeyInputSchema>;

export interface CreateApiKeyResponse {
  apiKey: ApiKeyItem;
  rawSecretKey: string;
}

export const PublicAiQueryInputSchema = z.object({
  databaseId: z.string().min(1, 'Specify a target databaseId.'),
  prompt: z.string().min(2, 'Enter a natural language question.').max(2000),
  allowWrite: z.boolean().default(false),
  rowLimit: z.number().int().min(1).max(2000).default(250),
});
export type PublicAiQueryInput = z.infer<typeof PublicAiQueryInputSchema>;

export interface PublicAiQueryResponse {
  requestId: string;
  databaseId: string;
  databaseName: string;
  prompt: string;
  sql: string;
  queryType: string;
  explanation: string;
  chart: ChartSpec;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  modelUsed: string;
}





