import type {
  AiAskInput,
  AiAskResponse,
  ApiKeyItem,
  AuthSessionResponse,
  AuthUser,
  ChartType,
  ConnectExternalDatabaseInput,
  CreateApiKeyInput,
  CreateApiKeyResponse,
  CreateManagedDatabaseInput,
  CsvConfirmImportInput,
  CsvImportResultResponse,
  CsvPreviewInput,
  CsvPreviewResponse,
  DashboardItem,
  DashboardWidgetSize,
  DatabaseConnectionItem,
  DatabaseSchemaSnapshot,
  DesignerCreateTableInput,
  ExplainPlanResponse,
  ForgotPasswordInput,
  GenerateDashboardInput,
  GenerateSeedInput,
  InviteTeamMemberInput,
  LoginInput,
  MigrationPreviewResponse,
  OptimizerAnalysisResponse,
  OptimizerBenchmarkResult,
  OrgRole,
  PublicAiQueryInput,
  PublicAiQueryResponse,
  QueryHistoryItem,
  SafeQueryExecutionResponse,
  SchemaAiProposalResponse,
  SeedGeneratorResponse,
  SignupInput,
  TeamMemberItem,
  TestConnectionResult,
  TestExternalConnectionInput,
} from '@datapilot/types';
import { useAppStore } from './store';

function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    return 'https://text2sql-djo8.onrender.com/api/v1';
  }
  return 'http://localhost:4000/api/v1';
}

export class ApiRequestError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.statusCode = statusCode;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const token =
    useAppStore.getState().accessToken ??
    (typeof window !== 'undefined' ? window.localStorage.getItem('dp_access_token') : null);

  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const apiBase = getApiBaseUrl();
  const response = await fetch(`${apiBase}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && !retried && !endpoint.startsWith('/auth/')) {
    try {
      const refreshRes = await fetch(`${apiBase}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (refreshRes.ok) {
        const refreshed = (await refreshRes.json()) as AuthSessionResponse;
        useAppStore.getState().setSession(refreshed.user, refreshed.accessToken);
        return request<T>(endpoint, options, true);
      }
    } catch {
      // Fall through to error handling
    }
  }

  if (!response.ok) {
    let errorMessage = 'Request could not be completed. Check your connection and try again.';
    try {
      const body = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) {
        errorMessage = body.message[0] ?? errorMessage;
      } else if (typeof body.message === 'string') {
        errorMessage = body.message;
      }
    } catch {
      // Use default message
    }
    throw new ApiRequestError(errorMessage, response.status);
  }

  return (await response.json()) as T;
}

export const apiClient = {
  login: (input: LoginInput) =>
    request<AuthSessionResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  loginDemo: () =>
    request<AuthSessionResponse>('/auth/demo', {
      method: 'POST',
    }),
  signup: (input: SignupInput) =>
    request<AuthSessionResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  forgotPassword: (input: ForgotPasswordInput) =>
    request<{ success: boolean; message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  logout: () =>
    request<{ success: boolean }>('/auth/logout', {
      method: 'POST',
    }),
  me: () => request<{ user: AuthUser }>('/auth/me'),
  switchOrganization: (organizationId: string) =>
    request<AuthSessionResponse>('/auth/active-org', {
      method: 'PATCH',
      body: JSON.stringify({ organizationId }),
    }),
  listDatabases: () =>
    request<{ databases: DatabaseConnectionItem[] }>('/databases'),
  testConnection: (input: TestExternalConnectionInput) =>
    request<TestConnectionResult>('/databases/test-connection', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  connectExternalDatabase: (input: ConnectExternalDatabaseInput) =>
    request<{ database: DatabaseConnectionItem; testResult: TestConnectionResult }>(
      '/databases/external',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
  createManagedDatabase: (input: CreateManagedDatabaseInput) =>
    request<{ database: DatabaseConnectionItem }>('/databases/managed', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deleteDatabase: (id: string) =>
    request<{ success: boolean }>(`/databases/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  getDatabaseSchema: (id: string, refresh = false) =>
    request<DatabaseSchemaSnapshot>(
      `/databases/${encodeURIComponent(id)}/schema${refresh ? '?refresh=true' : ''}`,
    ),
  syncDatabaseSchema: (id: string) =>
    request<DatabaseSchemaSnapshot>(
      `/databases/${encodeURIComponent(id)}/schema/sync`,
      {
        method: 'POST',
      },
    ),
  previewMigration: (id: string, input: DesignerCreateTableInput) =>
    request<MigrationPreviewResponse>(
      `/databases/${encodeURIComponent(id)}/schema/preview-migration`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
  applyMigration: (id: string, input: DesignerCreateTableInput) =>
    request<DatabaseSchemaSnapshot>(
      `/databases/${encodeURIComponent(id)}/schema/apply-migration`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
  executeQuery: (
    id: string,
    input: {
      sql: string;
      allowWrite?: boolean;
      confirmedWrite?: boolean;
      rowLimit?: number;
      bypassCache?: boolean;
    },
  ) =>
    request<SafeQueryExecutionResponse>(
      `/databases/${encodeURIComponent(id)}/query`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
  explainQuery: (id: string, input: { sql: string; analyze?: boolean }) =>
    request<ExplainPlanResponse>(`/databases/${encodeURIComponent(id)}/explain`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  formatSql: (input: { sql: string; allowWrite?: boolean }) =>
    request<{
      formattedSql: string;
      validation: {
        valid: boolean;
        statementType: string;
        isReadOnly: boolean;
        referencedTables: string[];
        reason?: string;
      };
    }>('/databases/format-sql', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  askDatabase: (id: string, input: AiAskInput) =>
    request<AiAskResponse>(`/databases/${encodeURIComponent(id)}/ask`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  listHistory: (params?: {
    databaseId?: string;
    search?: string;
    savedOnly?: boolean;
  }) => {
    const query = new URLSearchParams();
    if (params?.databaseId) query.set('databaseId', params.databaseId);
    if (params?.search) query.set('search', params.search);
    if (params?.savedOnly) query.set('savedOnly', 'true');
    const qs = query.toString();
    return request<{ history: QueryHistoryItem[] }>(`/history${qs ? `?${qs}` : ''}`);
  },
  toggleSaveHistory: (historyId: string) =>
    request<{ item: QueryHistoryItem }>(
      `/history/${encodeURIComponent(historyId)}/save`,
      {
        method: 'PATCH',
      },
    ),
  shareHistory: (historyId: string) =>
    request<{ item: QueryHistoryItem }>(
      `/history/${encodeURIComponent(historyId)}/share`,
      {
        method: 'POST',
      },
    ),
  optimizeQuery: (id: string, input: { sql: string; analyze?: boolean }) =>
    request<OptimizerAnalysisResponse>(
      `/databases/${encodeURIComponent(id)}/optimize`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
  benchmarkIndex: (
    id: string,
    input: { sql: string; createIndexSql: string },
  ) =>
    request<OptimizerBenchmarkResult>(
      `/databases/${encodeURIComponent(id)}/benchmark-index`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
  applyIndex: (id: string, input: { sql: string; createIndexSql: string }) =>
    request<DatabaseSchemaSnapshot>(
      `/databases/${encodeURIComponent(id)}/apply-index`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
  listDashboards: (databaseId?: string) =>
    request<{ dashboards: DashboardItem[] }>(
      `/dashboards${databaseId ? `?databaseId=${encodeURIComponent(databaseId)}` : ''}`,
    ),
  generateDashboard: (input: GenerateDashboardInput) =>
    request<{ dashboard: DashboardItem }>('/dashboards/generate', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateDashboardLayout: (
    id: string,
    widgets: Array<{
      id: string;
      position: number;
      size: DashboardWidgetSize;
      chartType?: ChartType;
    }>,
  ) =>
    request<{ dashboard: DashboardItem }>(
      `/dashboards/${encodeURIComponent(id)}/layout`,
      {
        method: 'PATCH',
        body: JSON.stringify({ widgets }),
      },
    ),
  refreshDashboardWidget: (id: string, widgetId: string) =>
    request<{ dashboard: DashboardItem }>(
      `/dashboards/${encodeURIComponent(id)}/widgets/${encodeURIComponent(widgetId)}/refresh`,
      {
        method: 'POST',
      },
    ),
  shareDashboard: (
    id: string,
    input: { minRole: OrgRole; revoke?: boolean },
  ) =>
    request<{ dashboard: DashboardItem }>(
      `/dashboards/${encodeURIComponent(id)}/share`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
  deleteDashboard: (id: string) =>
    request<{ success: boolean }>(`/dashboards/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  proposeSchemaAi: (id: string, description: string) =>
    request<SchemaAiProposalResponse>(
      `/databases/${encodeURIComponent(id)}/schema/ai-propose`,
      {
        method: 'POST',
        body: JSON.stringify({ description }),
      },
    ),
  applySchemaAi: (id: string, ddlSql: string) =>
    request<DatabaseSchemaSnapshot>(
      `/databases/${encodeURIComponent(id)}/schema/ai-apply`,
      {
        method: 'POST',
        body: JSON.stringify({ ddlSql }),
      },
    ),
  generateSeedData: (id: string, input: GenerateSeedInput) =>
    request<SeedGeneratorResponse>(
      `/databases/${encodeURIComponent(id)}/seed`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
  previewCsvImport: (id: string, input: CsvPreviewInput) =>
    request<CsvPreviewResponse>(
      `/databases/${encodeURIComponent(id)}/csv/preview`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
  confirmCsvImport: (id: string, input: CsvConfirmImportInput) =>
    request<CsvImportResultResponse>(
      `/databases/${encodeURIComponent(id)}/csv/import`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
  listTeamMembers: () => request<{ members: TeamMemberItem[] }>('/team/members'),
  inviteTeamMember: (input: InviteTeamMemberInput) =>
    request<{ member: TeamMemberItem }>('/team/members/invite', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateTeamMemberRole: (memberId: string, role: OrgRole) =>
    request<{ member: TeamMemberItem }>(
      `/team/members/${encodeURIComponent(memberId)}/role`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      },
    ),
  removeTeamMember: (memberId: string) =>
    request<{ success: boolean }>(`/team/members/${encodeURIComponent(memberId)}`, {
      method: 'DELETE',
    }),
  listApiKeys: () =>
    request<{ apiKeys: ApiKeyItem[]; demoApiKey?: string }>('/api-keys'),
  createApiKey: (input: CreateApiKeyInput) =>
    request<CreateApiKeyResponse>('/api-keys', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  revokeApiKey: (id: string) =>
    request<{ apiKey: ApiKeyItem }>(`/api-keys/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  publicAiQuery: (input: PublicAiQueryInput, customApiKey?: string) =>
    request<PublicAiQueryResponse>('/ai/query', {
      method: 'POST',
      headers: customApiKey ? { 'x-api-key': customApiKey } : undefined,
      body: JSON.stringify(input),
    }),
};
