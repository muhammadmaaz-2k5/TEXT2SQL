'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TestConnectionResult } from '@datapilot/types';
import { Badge, Button, Card, Icon, Input } from '@datapilot/ui';
import { apiClient } from '@/lib/api';
import { useAppStore } from '@/lib/store';

export default function DatabasesPage() {
  const router = useRouter();
  const databases = useAppStore((s) => s.databases);
  const setDatabases = useAppStore((s) => s.setDatabases);
  const activeDatabaseId = useAppStore((s) => s.activeDatabaseId);
  const setActiveDatabaseId = useAppStore((s) => s.setActiveDatabaseId);
  const resolvedTheme = useAppStore((s) => s.resolvedTheme);
  const addToast = useAppStore((s) => s.addToast);

  const [managedModalOpen, setManagedModalOpen] = React.useState(false);
  const [externalModalOpen, setExternalModalOpen] = React.useState(false);
  const [syncingId, setSyncingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  // Create Managed DB state
  const [managedName, setManagedName] = React.useState('');
  const [managedTemplate, setManagedTemplate] = React.useState<
    'shop_analytics' | 'saas_metrics' | 'blank'
  >('shop_analytics');
  const [managedReadOnly, setManagedReadOnly] = React.useState(true);
  const [isCreatingManaged, setIsCreatingManaged] = React.useState(false);

  // Connect External DB state
  const [extName, setExtName] = React.useState('');
  const [extHost, setExtHost] = React.useState('localhost');
  const [extPort, setExtPort] = React.useState('5433');
  const [extDatabaseName, setExtDatabaseName] = React.useState('shop_analytics');
  const [extUsername, setExtUsername] = React.useState('dp_readonly_shop');
  const [extPassword, setExtPassword] = React.useState('dp_readonly_secret');
  const [extSslMode, setExtSslMode] = React.useState<'disable' | 'prefer' | 'require'>('prefer');
  const [extReadOnly, setExtReadOnly] = React.useState(true);
  const [isTestingConn, setIsTestingConn] = React.useState(false);
  const [testResult, setTestResult] = React.useState<TestConnectionResult | null>(null);
  const [isSavingExternal, setIsSavingExternal] = React.useState(false);

  const handleSyncSchema = async (id: string, name: string) => {
    setSyncingId(id);
    try {
      const snapshot = await apiClient.syncDatabaseSchema(id);
      const { databases: refreshed } = await apiClient.listDatabases();
      setDatabases(refreshed);
      addToast({
        title: `Synced ${name}`,
        description: `Introspected ${snapshot.tables.length} tables and ${snapshot.relations.length} foreign keys.`,
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: `Could not sync ${name}`,
        description: err instanceof Error ? err.message : 'Check connection settings.',
        variant: 'danger',
      });
    } finally {
      setSyncingId(null);
    }
  };

  const handleDeleteDatabase = async (id: string, name: string) => {
    setDeletingId(id);
    try {
      await apiClient.deleteDatabase(id);
      const { databases: refreshed } = await apiClient.listDatabases();
      setDatabases(refreshed);
      addToast({
        title: `Removed ${name}`,
        description: 'Connection credentials deleted from vault.',
        variant: 'info',
      });
    } catch (err) {
      addToast({
        title: 'Could not remove database',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'danger',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateManaged = async (e: React.FormEvent) => {
    e.preventDefault();
    if (managedName.trim().length < 2) {
      addToast({
        title: 'Enter a database name',
        description: 'Database name must be at least 2 characters.',
        variant: 'warning',
      });
      return;
    }

    setIsCreatingManaged(true);
    try {
      const { database } = await apiClient.createManagedDatabase({
        name: managedName.trim(),
        template: managedTemplate,
        readOnlyDefault: managedReadOnly,
      });
      const { databases: refreshed } = await apiClient.listDatabases();
      setDatabases(refreshed);
      setActiveDatabaseId(database.id);
      setManagedModalOpen(false);
      setManagedName('');
      addToast({
        title: `Provisioned ${database.name}`,
        description: `Database ${database.databaseName} is ready with ${database.tableCount} tables.`,
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Managed database provisioning failed',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'danger',
      });
    } finally {
      setIsCreatingManaged(false);
    }
  };

  const handleTestExternal = async () => {
    setIsTestingConn(true);
    setTestResult(null);
    try {
      const res = await apiClient.testConnection({
        engine: 'POSTGRESQL',
        host: extHost.trim(),
        port: Number(extPort) || 5432,
        databaseName: extDatabaseName.trim(),
        username: extUsername.trim(),
        password: extPassword,
        sslMode: extSslMode,
      });
      setTestResult(res);
    } catch (err) {
      setTestResult({
        ok: false,
        latencyMs: 0,
        serverVersion: 'Error',
        tableCount: 0,
        message: err instanceof Error ? err.message : 'Connection test failed.',
      });
    } finally {
      setIsTestingConn(false);
    }
  };

  const handleSaveExternal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testResult?.ok) {
      addToast({
        title: 'Test connection before saving',
        description: 'Run "Test connection" and verify it succeeds before saving.',
        variant: 'warning',
      });
      return;
    }
    if (extName.trim().length < 2) {
      addToast({
        title: 'Enter a connection display name',
        description: 'Provide a descriptive name such as "Production Replica".',
        variant: 'warning',
      });
      return;
    }

    setIsSavingExternal(true);
    try {
      const { database } = await apiClient.connectExternalDatabase({
        name: extName.trim(),
        engine: 'POSTGRESQL',
        host: extHost.trim(),
        port: Number(extPort) || 5432,
        databaseName: extDatabaseName.trim(),
        username: extUsername.trim(),
        password: extPassword,
        sslMode: extSslMode,
        readOnlyDefault: extReadOnly,
      });
      const { databases: refreshed } = await apiClient.listDatabases();
      setDatabases(refreshed);
      setActiveDatabaseId(database.id);
      setExternalModalOpen(false);
      setTestResult(null);
      setExtName('');
      addToast({
        title: `Connected ${database.name}`,
        description: 'Credentials encrypted with AES-256-GCM and stored in vault.',
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Could not save connection',
        description: err instanceof Error ? err.message : 'Check your credentials.',
        variant: 'danger',
      });
    } finally {
      setIsSavingExternal(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold m-0">Databases</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1 m-0">
            Provision managed PostgreSQL instances or connect external databases with
            AES-256-GCM encrypted credentials.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="secondary"
            leftIcon="connect"
            onClick={() => {
              setTestResult(null);
              setExternalModalOpen(true);
            }}
          >
            Connect external DB
          </Button>
          <Button
            variant="primary"
            leftIcon="database-plus"
            onClick={() => setManagedModalOpen(true)}
          >
            Create managed database
          </Button>
        </div>
      </div>

      {databases.length === 0 ? (
        <Card className="p-10 text-center flex flex-col items-center">
          <img
            src={
              resolvedTheme === 'dark'
                ? '/illustrations/empty-no-databases-dark.svg'
                : '/illustrations/empty-no-databases-light.svg'
            }
            alt="No databases connected"
            className="w-56 h-auto mb-4"
          />
          <h2 className="text-lg font-display font-bold mb-1">No databases connected yet</h2>
          <p className="text-sm text-[var(--text-muted)] max-w-md mb-5">
            Create a managed PostgreSQL database in one click or connect an existing
            PostgreSQL instance with encrypted credentials.
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              leftIcon="connect"
              onClick={() => setExternalModalOpen(true)}
            >
              Connect external DB
            </Button>
            <Button
              variant="primary"
              leftIcon="database-plus"
              onClick={() => setManagedModalOpen(true)}
            >
              Create managed PostgreSQL
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {databases.map((db) => {
            const isSelected = db.id === activeDatabaseId;
            return (
              <Card
                key={db.id}
                className={`p-5 flex flex-col justify-between transition-colors ${
                  isSelected ? 'border-brand ring-1 ring-brand/40' : ''
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-[10px] bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-brand shrink-0">
                        <Icon name="database" size={20} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-base font-display font-bold m-0 truncate">
                            {db.name}
                          </h2>
                          {isSelected && <Badge variant="engine">Active</Badge>}
                        </div>
                        <p className="text-xs font-mono text-[var(--text-muted)] m-0 mt-0.5 truncate">
                          {db.username}@{db.host}:{db.port}/{db.databaseName}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="readonly" icon="check">
                        {db.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-[var(--border)] grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-[var(--text-muted)] block">Engine</span>
                      <span className="font-mono font-medium text-[var(--text)] mt-0.5 inline-flex items-center gap-1">
                        {db.engine} {db.isManaged ? '(Managed)' : '(External)'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block">Introspected</span>
                      <span className="font-mono font-medium text-[var(--text)] mt-0.5 block">
                        {db.tableCount} tables
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block">Safety Mode</span>
                      <span className="font-medium text-success mt-0.5 inline-flex items-center gap-1">
                        <Icon name="read-only" size={13} />
                        {db.readOnlyDefault ? 'Read-only' : 'Write'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Synced:{' '}
                      {db.lastSyncedAt
                        ? new Date(db.lastSyncedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        : 'Never'}
                    </span>
                    <button
                      type="button"
                      aria-label={`Sync schema for ${db.name}`}
                      title="Sync schema now"
                      disabled={syncingId === db.id}
                      onClick={() => void handleSyncSchema(db.id, db.name)}
                      className="dp-btn dp-btn--ghost dp-btn--sm h-6 px-2 text-xs"
                    >
                      <Icon name="refresh" size={13} />
                      {syncingId === db.id ? 'Syncing...' : 'Sync'}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {databases.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove ${db.name}`}
                        title="Remove connection"
                        disabled={deletingId === db.id}
                        onClick={() => void handleDeleteDatabase(db.id, db.name)}
                        className="dp-btn dp-btn--ghost dp-btn--sm w-8 h-8 p-0 justify-center text-[var(--text-muted)] hover:text-danger"
                      >
                        <Icon name="destructive" size={15} />
                      </button>
                    )}
                    {!isSelected && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setActiveDatabaseId(db.id);
                          addToast({
                            title: `Active database set to ${db.name}`,
                            variant: 'info',
                          });
                        }}
                      >
                        Set active
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon="schema-designer"
                      onClick={() => {
                        setActiveDatabaseId(db.id);
                        router.push('/app/schema');
                      }}
                    >
                      Explore schema
                    </Button>
                    <Link
                      href="/app/query"
                      onClick={() => setActiveDatabaseId(db.id)}
                      className="dp-btn dp-btn--primary dp-btn--sm no-underline"
                    >
                      <Icon name="ai-chat" size={15} />
                      Ask AI
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal: Create Managed PostgreSQL Database */}
      {managedModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create managed PostgreSQL database"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[1px]"
          onClick={() => setManagedModalOpen(false)}
        >
          <div
            className="w-full max-w-lg dp-card p-6 shadow-[var(--shadow-pop)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <Icon name="database-plus" size={20} className="text-brand" />
                <h2 className="text-lg font-display font-bold m-0">
                  Create Managed PostgreSQL Database
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setManagedModalOpen(false)}
                className="dp-btn dp-btn--ghost dp-btn--sm w-8 h-8 p-0 justify-center"
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <form onSubmit={(e) => void handleCreateManaged(e)} className="mt-5 space-y-4">
              <Input
                label="Database display name"
                placeholder="e.g. E-Commerce Staging or Growth Analytics"
                value={managedName}
                onChange={(e) => setManagedName(e.target.value)}
                hint="Provisions an isolated PostgreSQL 16 database and least-privilege role."
              />

              <div>
                <label className="dp-label">Initial schema template</label>
                <div className="grid grid-cols-1 gap-2.5">
                  {[
                    {
                      id: 'shop_analytics' as const,
                      title: 'Shop Analytics (6 tables + seed data)',
                      desc: 'customers, products, orders, order_items, payments, inventory_events',
                    },
                    {
                      id: 'saas_metrics' as const,
                      title: 'SaaS Subscription Metrics (3 tables + seed data)',
                      desc: 'billing_accounts, subscriptions, invoices',
                    },
                    {
                      id: 'blank' as const,
                      title: 'Blank PostgreSQL database',
                      desc: 'Empty public schema ready for the visual Schema Designer',
                    },
                  ].map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setManagedTemplate(tpl.id)}
                      className={`p-3 rounded-[10px] border text-left transition-colors ${
                        managedTemplate === tpl.id
                          ? 'border-brand bg-brand-50/60 dark:bg-navy-700'
                          : 'border-[var(--border)] bg-[var(--surface-2)] hover:border-brand/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-[var(--text)]">
                          {tpl.title}
                        </span>
                        {managedTemplate === tpl.id && (
                          <Icon name="check" size={16} className="text-brand" />
                        )}
                      </div>
                      <span className="block text-xs font-mono text-[var(--text-muted)] mt-1">
                        {tpl.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between p-3 rounded-[10px] bg-[var(--surface-2)] border border-[var(--border)] cursor-pointer">
                <div>
                  <span className="text-sm font-medium block">Enforce Read-only mode</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    Recommended: blocks DML/DDL in AI Ask and SQL Editor by default.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={managedReadOnly}
                  onChange={(e) => setManagedReadOnly(e.target.checked)}
                  className="h-4 w-4 accent-[#2F5BFF]"
                />
              </label>

              <div className="pt-3 border-t border-[var(--border)] flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setManagedModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  leftIcon="database-plus"
                  isLoading={isCreatingManaged}
                >
                  Provision database
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Connect External PostgreSQL Database */}
      {externalModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Connect external database"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[1px]"
          onClick={() => setExternalModalOpen(false)}
        >
          <div
            className="w-full max-w-xl dp-card p-6 shadow-[var(--shadow-pop)] max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <Icon name="connect" size={20} className="text-brand" />
                <h2 className="text-lg font-display font-bold m-0">
                  Connect External PostgreSQL
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setExternalModalOpen(false)}
                className="dp-btn dp-btn--ghost dp-btn--sm w-8 h-8 p-0 justify-center"
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveExternal(e)} className="mt-5 space-y-4">
              {/* Engine Badges */}
              <div>
                <span className="dp-label">Database engine</span>
                <div className="grid grid-cols-4 gap-2">
                  <div className="p-2.5 rounded-[10px] border border-brand bg-brand-50/60 dark:bg-navy-700 text-center">
                    <span className="text-xs font-semibold block">PostgreSQL</span>
                    <span className="text-[10px] text-success">Supported</span>
                  </div>
                  {['MySQL', 'SQLite', 'CSV Import'].map((eng) => (
                    <div
                      key={eng}
                      className="p-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] text-center opacity-65"
                    >
                      <span className="text-xs font-medium block">{eng}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">Phase 6</span>
                    </div>
                  ))}
                </div>
              </div>

              <Input
                label="Connection display name"
                placeholder="e.g. Analytics Replica (Read-Only)"
                value={extName}
                onChange={(e) => setExtName(e.target.value)}
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <Input
                    label="Host"
                    placeholder="db.internal.company.com"
                    value={extHost}
                    onChange={(e) => {
                      setExtHost(e.target.value);
                      setTestResult(null);
                    }}
                  />
                </div>
                <div>
                  <Input
                    label="Port"
                    type="number"
                    value={extPort}
                    onChange={(e) => {
                      setExtPort(e.target.value);
                      setTestResult(null);
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Database name"
                  placeholder="postgres"
                  value={extDatabaseName}
                  onChange={(e) => {
                    setExtDatabaseName(e.target.value);
                    setTestResult(null);
                  }}
                />
                <div>
                  <label htmlFor="ext-ssl-mode" className="dp-label">
                    SSL mode
                  </label>
                  <select
                    id="ext-ssl-mode"
                    value={extSslMode}
                    onChange={(e) =>
                      setExtSslMode(e.target.value as 'disable' | 'prefer' | 'require')
                    }
                    className="dp-select"
                  >
                    <option value="prefer">prefer (default)</option>
                    <option value="require">require (TLS enforced)</option>
                    <option value="disable">disable</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Username"
                  placeholder="readonly_analyst"
                  value={extUsername}
                  onChange={(e) => {
                    setExtUsername(e.target.value);
                    setTestResult(null);
                  }}
                />
                <Input
                  label="Password"
                  type="password"
                  placeholder="••••••••••••"
                  value={extPassword}
                  onChange={(e) => {
                    setExtPassword(e.target.value);
                    setTestResult(null);
                  }}
                  hint="Encrypted at rest using AES-256-GCM."
                />
              </div>

              {/* Connection Test Banner */}
              {testResult && (
                <div
                  role="status"
                  className={`p-3.5 rounded-[10px] border text-xs flex items-start gap-2.5 ${
                    testResult.ok
                      ? 'border-success/40 bg-success/10 text-[var(--text)]'
                      : 'border-danger/40 bg-danger/10 text-danger'
                  }`}
                >
                  <Icon
                    name={testResult.ok ? 'check' : 'warning'}
                    size={16}
                    className={testResult.ok ? 'text-success shrink-0 mt-0.5' : 'shrink-0 mt-0.5'}
                  />
                  <div className="space-y-1">
                    <p className="font-semibold m-0">
                      {testResult.ok
                        ? `Connection verified in ${testResult.latencyMs} ms`
                        : 'Connection test failed'}
                    </p>
                    <p className="m-0 text-[var(--text-muted)]">{testResult.message}</p>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  leftIcon="refresh"
                  isLoading={isTestingConn}
                  onClick={() => void handleTestExternal()}
                >
                  Test connection
                </Button>

                <div className="flex items-center gap-2.5">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setExternalModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    leftIcon="save"
                    disabled={!testResult?.ok}
                    isLoading={isSavingExternal}
                  >
                    Save connection
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
