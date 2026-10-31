'use client';

import * as React from 'react';
import type { ApiKeyItem, PublicAiQueryResponse } from '@datapilot/types';
import { Badge, Button, Card, Icon, Input, Skeleton } from '@datapilot/ui';
import { apiClient } from '@/lib/api';
import { useAppStore } from '@/lib/store';

export default function ApiKeysPage() {
  const databases = useAppStore((s) => s.databases);
  const activeDatabaseId = useAppStore((s) => s.activeDatabaseId);
  const addToast = useAppStore((s) => s.addToast);

  const activeDb = React.useMemo(
    () => databases.find((d) => d.id === activeDatabaseId) ?? databases[0],
    [databases, activeDatabaseId],
  );

  const [apiKeys, setApiKeys] = React.useState<ApiKeyItem[]>([]);
  const [demoApiKey, setDemoApiKey] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);

  // Create API key state
  const [keyName, setKeyName] = React.useState('');
  const [allowWriteScope, setAllowWriteScope] = React.useState(false);
  const [newlyCreatedSecret, setNewlyCreatedSecret] = React.useState<string | null>(
    null,
  );
  const [isCreating, setIsCreating] = React.useState(false);

  // Docs & Live Playground state
  const [codeLang, setCodeLang] = React.useState<'curl' | 'typescript' | 'python'>(
    'curl',
  );
  const [playgroundDbId, setPlaygroundDbId] = React.useState<string>(
    activeDb?.id ?? 'db_shop_analytics',
  );
  const [playgroundPrompt, setPlaygroundPrompt] = React.useState(
    'Show total revenue and completed order count by customer segment',
  );
  const [playgroundApiKey, setPlaygroundApiKey] = React.useState('');
  const [playgroundResponse, setPlaygroundResponse] =
    React.useState<PublicAiQueryResponse | null>(null);
  const [isTestingEndpoint, setIsTestingEndpoint] = React.useState(false);

  const loadKeys = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.listApiKeys();
      setApiKeys(res.apiKeys);
      if (res.demoApiKey) {
        setDemoApiKey(res.demoApiKey);
        setPlaygroundApiKey((prev) => prev || res.demoApiKey || '');
      }
    } catch (err) {
      addToast({
        title: 'Failed to load API keys',
        description: err instanceof Error ? err.message : 'Check workspace connection.',
        variant: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  React.useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  React.useEffect(() => {
    if (activeDb?.id) {
      setPlaygroundDbId(activeDb.id);
    }
  }, [activeDb?.id]);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;
    setIsCreating(true);
    try {
      const res = await apiClient.createApiKey({
        name: keyName.trim(),
        scopes: allowWriteScope ? ['read', 'write'] : ['read'],
      });
      setApiKeys((prev) => [res.apiKey, ...prev]);
      setNewlyCreatedSecret(res.rawSecretKey);
      setPlaygroundApiKey(res.rawSecretKey);
      setKeyName('');
      setAllowWriteScope(false);
      addToast({
        title: `Created API key "${res.apiKey.name}"`,
        description: 'Copy your secret key now. Only its SHA-256 hash is stored.',
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Could not create API key',
        description: err instanceof Error ? err.message : 'Verify your role permissions.',
        variant: 'danger',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevokeKey = async (keyItem: ApiKeyItem) => {
    try {
      const { apiKey: updated } = await apiClient.revokeApiKey(keyItem.id);
      setApiKeys((prev) => prev.map((k) => (k.id === keyItem.id ? updated : k)));
      addToast({
        title: `Revoked API key "${keyItem.name}"`,
        description: 'Requests using this key will immediately return 401 Unauthorized.',
        variant: 'info',
      });
    } catch (err) {
      addToast({
        title: 'Could not revoke API key',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'danger',
      });
    }
  };

  const handleCopyText = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    addToast({
      title: `Copied ${label}`,
      description: 'Copied to clipboard.',
      variant: 'info',
    });
  };

  const handleRunPlayground = async () => {
    setIsTestingEndpoint(true);
    try {
      const res = await apiClient.publicAiQuery(
        {
          databaseId: playgroundDbId,
          prompt: playgroundPrompt.trim(),
          allowWrite: false,
          rowLimit: 25,
        },
        playgroundApiKey.trim() || undefined,
      );
      setPlaygroundResponse(res);
      void loadKeys();
      addToast({
        title: 'POST /api/v1/ai/query succeeded',
        description: `Returned ${res.rowCount} rows in ${res.durationMs}ms.`,
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: 'API request failed',
        description: err instanceof Error ? err.message : 'Check API key and database ID.',
        variant: 'danger',
      });
    } finally {
      setIsTestingEndpoint(false);
    }
  };

  const displayKeyForDocs =
    newlyCreatedSecret || playgroundApiKey || demoApiKey || 'dp_live_your_api_key_here';

  const codeSnippet = React.useMemo(() => {
    if (codeLang === 'curl') {
      return `curl -X POST "http://localhost:4000/api/v1/ai/query" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${displayKeyForDocs}" \\
  -d '{
    "databaseId": "${playgroundDbId}",
    "prompt": "${playgroundPrompt.replace(/"/g, '\\"')}",
    "allowWrite": false,
    "rowLimit": 100
  }'`;
    }
    if (codeLang === 'typescript') {
      return `const response = await fetch('http://localhost:4000/api/v1/ai/query', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': '${displayKeyForDocs}',
  },
  body: JSON.stringify({
    databaseId: '${playgroundDbId}',
    prompt: '${playgroundPrompt.replace(/'/g, "\\'")}',
    allowWrite: false,
    rowLimit: 100,
  }),
});

const data = await response.json();
console.log(data.sql, data.rows);`;
    }
    return `import requests

resp = requests.post(
    "http://localhost:4000/api/v1/ai/query",
    headers={"x-api-key": "${displayKeyForDocs}"},
    json={
        "databaseId": "${playgroundDbId}",
        "prompt": "${playgroundPrompt.replace(/"/g, '\\"')}",
        "allowWrite": False,
        "rowLimit": 100,
    },
    timeout=10,
)
payload = resp.json()
print("Validated SQL:", payload["sql"])
print("Rows:", payload["rows"])`;
  }, [codeLang, displayKeyForDocs, playgroundDbId, playgroundPrompt]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="engine" icon="api-key">
              SHA-256 Hashed Keys
            </Badge>
            <Badge variant="readonly" icon="api">
              POST /api/v1/ai/query
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold m-0">
            API Keys &amp; Public REST Endpoint Docs
          </h1>
          <p className="text-sm text-[var(--text-muted)] m-0 mt-1">
            Issue scoped API keys and integrate plain-English to validated SQL into your
            internal tools or backend services.
          </p>
        </div>
      </div>

      {/* Newly Created Secret Key Banner */}
      {newlyCreatedSecret && (
        <div className="p-4 rounded-[12px] border-2 border-accent bg-accent/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text)]">
              <Icon name="api-key" size={15} className="text-accent" />
              Save your new secret API key now — it will not be shown again
            </div>
            <code className="font-mono text-xs sm:text-sm font-semibold block break-all text-[var(--text)]">
              {newlyCreatedSecret}
            </code>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="primary"
              leftIcon="copy"
              onClick={() => void handleCopyText(newlyCreatedSecret, 'API secret key')}
            >
              Copy secret key
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setNewlyCreatedSecret(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Top Grid: Create Key + Active Keys Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <Card className="lg:col-span-4 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
            <Icon name="api-key" size={18} className="text-brand" />
            <div>
              <h2 className="text-base font-display font-bold m-0">Create API Key</h2>
              <p className="text-xs text-[var(--text-muted)] m-0">
                Only the SHA-256 hash is stored at rest.
              </p>
            </div>
          </div>

          <form onSubmit={(e) => void handleCreateKey(e)} className="space-y-4">
            <Input
              label="Key name / description"
              required
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="e.g. Retool Internal Dashboard"
            />

            <div className="p-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] space-y-2">
              <span className="text-xs font-semibold block">Key Scopes</span>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked disabled />
                <span>
                  <strong>read</strong> — Execute SELECT / EXPLAIN queries via AI
                </span>
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowWriteScope}
                  onChange={(e) => setAllowWriteScope(e.target.checked)}
                />
                <span>
                  <strong>write</strong> — Allow transactional write statements
                </span>
              </label>
            </div>

            <Button
              type="submit"
              variant="primary"
              leftIcon="plus"
              isLoading={isCreating}
              className="w-full justify-center"
            >
              Generate API key
            </Button>
          </form>
        </Card>

        <Card className="lg:col-span-8 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
            <div>
              <h2 className="text-base font-display font-bold m-0">
                Organization API Keys ({apiKeys.length})
              </h2>
              <p className="text-xs text-[var(--text-muted)] m-0">
                Pass via <code className="font-mono">x-api-key</code> or{' '}
                <code className="font-mono">Authorization: Bearer</code> header.
              </p>
            </div>
            {demoApiKey && (
              <button
                type="button"
                onClick={() => void handleCopyText(demoApiKey, 'demo API key')}
                className="dp-btn dp-btn--secondary dp-btn--sm h-8 text-xs font-mono"
              >
                <Icon name="copy" size={13} />
                Copy demo key: {demoApiKey.slice(0, 16)}...
              </button>
            )}
          </div>

          {loading ? (
            <div className="space-y-2.5">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Key Prefix</th>
                    <th>Scopes</th>
                    <th>Requests</th>
                    <th>Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map((k) => {
                    const isRevoked = Boolean(k.revokedAt);
                    return (
                      <tr key={k.id}>
                        <td className="font-sans">
                          <div className="font-semibold text-xs text-[var(--text)]">
                            {k.name}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)]">
                            Created by {k.createdByName}
                          </div>
                        </td>
                        <td className="font-mono text-xs">{k.keyPrefix}</td>
                        <td>
                          <div className="flex gap-1">
                            {k.scopes.map((s) => (
                              <Badge
                                key={s}
                                variant={s === 'write' ? 'write' : 'readonly'}
                              >
                                {s}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="font-mono text-xs">{k.requestCount}</td>
                        <td>
                          <Badge variant={isRevoked ? 'danger' : 'readonly'}>
                            {isRevoked ? 'REVOKED' : 'ACTIVE'}
                          </Badge>
                        </td>
                        <td className="text-right">
                          {!isRevoked && (
                            <button
                              type="button"
                              onClick={() => void handleRevokeKey(k)}
                              className="dp-btn dp-btn--ghost dp-btn--sm text-danger h-7 px-2"
                            >
                              <Icon name="close" size={13} />
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Bottom Section: REST Endpoint Documentation + Interactive Playground */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Endpoint Reference & Code Snippets */}
        <Card className="lg:col-span-6 p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="engine">POST</Badge>
                <code className="font-mono text-sm font-bold">/api/v1/ai/query</code>
              </div>
              <p className="text-xs text-[var(--text-muted)] m-0 mt-1">
                Translates plain English to AST-validated SQL, executes with timeout and
                row limits, and returns structured rows + chart spec.
              </p>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <div className="font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Request Body Parameters (application/json)
            </div>
            <div className="rounded-[10px] border border-[var(--border)] overflow-hidden">
              <table className="dp-table text-xs">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Type</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-mono font-semibold">databaseId *</td>
                    <td className="font-mono">string</td>
                    <td className="font-sans">
                      Target database ID (e.g. <code>db_shop_analytics</code>)
                    </td>
                  </tr>
                  <tr>
                    <td className="font-mono font-semibold">prompt *</td>
                    <td className="font-mono">string</td>
                    <td className="font-sans">
                      Plain-English question (2–2,000 characters)
                    </td>
                  </tr>
                  <tr>
                    <td className="font-mono font-semibold">allowWrite</td>
                    <td className="font-mono">boolean</td>
                    <td className="font-sans">
                      Defaults to <code>false</code> (Read-Only SELECT/EXPLAIN enforced)
                    </td>
                  </tr>
                  <tr>
                    <td className="font-mono font-semibold">rowLimit</td>
                    <td className="font-mono">integer</td>
                    <td className="font-sans">Max rows returned (1–2,000, default 250)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="inline-flex rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] p-0.5">
                {(['curl', 'typescript', 'python'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setCodeLang(lang)}
                    className={`px-2.5 py-1 rounded-[6px] text-xs font-mono transition-colors ${
                      codeLang === lang
                        ? 'bg-brand text-white font-semibold'
                        : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void handleCopyText(codeSnippet, `${codeLang} snippet`)}
                className="dp-btn dp-btn--ghost dp-btn--sm h-7 text-xs"
              >
                <Icon name="copy" size={13} />
                Copy snippet
              </button>
            </div>
            <pre className="dp-code m-0 text-xs overflow-x-auto">{codeSnippet}</pre>
          </div>
        </Card>

        {/* Right: Interactive Live Endpoint Tester */}
        <Card className="lg:col-span-6 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div>
              <h2 className="text-base font-display font-bold m-0">
                Interactive API Playground
              </h2>
              <p className="text-xs text-[var(--text-muted)] m-0">
                Send a live request to <code className="font-mono">POST /api/v1/ai/query</code>{' '}
                and inspect the JSON payload.
              </p>
            </div>
            <Badge variant="readonly" icon="shield-check">
              Live Execution
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="dp-label" htmlFor="pg-db-select">
                databaseId
              </label>
              <select
                id="pg-db-select"
                value={playgroundDbId}
                onChange={(e) => setPlaygroundDbId(e.target.value)}
                className="dp-select text-xs font-mono"
              >
                {databases.map((db) => (
                  <option key={db.id} value={db.id}>
                    {db.id} ({db.name})
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="x-api-key header"
              value={playgroundApiKey}
              onChange={(e) => setPlaygroundApiKey(e.target.value)}
              placeholder="dp_live_..."
            />
          </div>

          <div>
            <label className="dp-label" htmlFor="pg-prompt-input">
              Plain-English prompt
            </label>
            <textarea
              id="pg-prompt-input"
              rows={2}
              value={playgroundPrompt}
              onChange={(e) => setPlaygroundPrompt(e.target.value)}
              className="dp-input text-xs py-2"
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="primary"
              leftIcon="run-query"
              isLoading={isTestingEndpoint}
              onClick={() => void handleRunPlayground()}
            >
              Send live POST /api/v1/ai/query
            </Button>
          </div>

          {playgroundResponse && (
            <div className="space-y-3 pt-3 border-t border-[var(--border)]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono font-semibold text-success">
                  200 OK · {playgroundResponse.rowCount} rows ·{' '}
                  {playgroundResponse.durationMs}ms
                </span>
                <span className="font-mono text-[var(--text-muted)]">
                  reqId: {playgroundResponse.requestId}
                </span>
              </div>
              <pre className="dp-code m-0 text-xs max-h-72 overflow-y-auto">
                {JSON.stringify(playgroundResponse, null, 2)}
              </pre>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
