'use client';

import * as React from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { formatSql, validateSql } from '@datapilot/sql-guard';
import type {
  DatabaseSchemaSnapshot,
  ExplainPlanResponse,
  QueryExecutionResult,
  WriteImpactPreviewResponse,
} from '@datapilot/types';
import {
  Badge,
  Button,
  Card,
  Icon,
  Input,
  Skeleton,
  monacoDarkTheme,
  monacoLightTheme,
} from '@datapilot/ui';
import { QueryResultsView } from '@/components/query-results-view';
import { apiClient } from '@/lib/api';
import { useAppStore } from '@/lib/store';

const SAMPLE_SQL_SNIPPETS = [
  {
    label: 'Revenue by customer segment',
    sql: `SELECT
  c.segment,
  COUNT(o.id) AS completed_orders,
  ROUND(SUM(o.total_cents) / 100.0, 2) AS total_revenue_usd
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'completed'
GROUP BY c.segment
ORDER BY total_revenue_usd DESC
LIMIT 50;`,
  },
  {
    label: 'Top products by revenue',
    sql: `SELECT
  p.sku,
  p.name,
  p.category,
  SUM(oi.quantity) AS units_sold,
  ROUND(SUM(oi.quantity * oi.unit_price_cents) / 100.0, 2) AS product_revenue_usd
FROM products p
JOIN order_items oi ON oi.product_id = p.id
GROUP BY p.id, p.sku, p.name, p.category
ORDER BY product_revenue_usd DESC
LIMIT 25;`,
  },
  {
    label: 'Recent orders with customer email',
    sql: `SELECT
  o.id AS order_id,
  c.full_name,
  c.email,
  o.status,
  ROUND(o.total_cents / 100.0, 2) AS amount_usd,
  o.shipping_region,
  o.created_at
FROM orders o
JOIN customers c ON c.id = o.customer_id
ORDER BY o.created_at DESC
LIMIT 50;`,
  },
  {
    label: 'Test sql-guard: Blocked DROP TABLE',
    sql: `SELECT * FROM customers;\nDROP TABLE customers;`,
  },
];

export default function SqlEditorPage() {
  const databases = useAppStore((s) => s.databases);
  const activeDatabaseId = useAppStore((s) => s.activeDatabaseId);
  const resolvedTheme = useAppStore((s) => s.resolvedTheme);
  const readOnlyMode = useAppStore((s) => s.readOnlyMode);
  const setReadOnlyMode = useAppStore((s) => s.setReadOnlyMode);
  const addToast = useAppStore((s) => s.addToast);

  const activeDb = React.useMemo(
    () => databases.find((d) => d.id === activeDatabaseId) ?? databases[0],
    [databases, activeDatabaseId],
  );

  const [sql, setSql] = React.useState<string>(SAMPLE_SQL_SNIPPETS[0]!.sql);
  const [schema, setSchema] = React.useState<DatabaseSchemaSnapshot | null>(null);
  const [schemaLoading, setSchemaLoading] = React.useState(true);
  const [schemaFilter, setSchemaFilter] = React.useState('');
  const [schemaSidebarOpen, setSchemaSidebarOpen] = React.useState(true);

  const [isRunning, setIsRunning] = React.useState(false);
  const [isExplaining, setIsExplaining] = React.useState(false);
  const [executionError, setExecutionError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<QueryExecutionResult | null>(null);
  const [explainPlan, setExplainPlan] = React.useState<ExplainPlanResponse | null>(null);
  const [activeOutputTab, setActiveOutputTab] = React.useState<
    'results' | 'chart' | 'explain'
  >('results');
  const [writePreview, setWritePreview] =
    React.useState<WriteImpactPreviewResponse | null>(null);

  const monacoRef = React.useRef<Parameters<OnMount>[1] | null>(null);
  const completionDisposableRef = React.useRef<{ dispose: () => void } | null>(null);

  // Live client-side AST validation
  const liveValidation = React.useMemo(
    () =>
      validateSql(sql, {
        allowWrite: !readOnlyMode,
        defaultRowLimit: 500,
        maxRowLimit: 2000,
      }),
    [sql, readOnlyMode],
  );

  // Fetch schema snapshot for autocomplete & explorer sidebar
  React.useEffect(() => {
    if (!activeDb?.id) return;
    let mounted = true;
    setSchemaLoading(true);
    apiClient
      .getDatabaseSchema(activeDb.id, false)
      .then((snap) => {
        if (mounted) setSchema(snap);
      })
      .catch(() => {
        // Ignore background schema error
      })
      .finally(() => {
        if (mounted) setSchemaLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [activeDb?.id]);

  // Run initial default query or URL ?sql= query on mount so the user sees live results immediately
  const hasAutoRunRef = React.useRef(false);
  React.useEffect(() => {
    if (activeDb?.id && !hasAutoRunRef.current) {
      hasAutoRunRef.current = true;
      const params = new URLSearchParams(window.location.search);
      const urlSql = params.get('sql');
      if (urlSql && urlSql.trim().length > 0) {
        setSql(urlSql);
        void handleRunQuery(urlSql, false);
      } else {
        void handleRunQuery(SAMPLE_SQL_SNIPPETS[0]!.sql, false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDb?.id]);

  // Update Monaco theme when light/dark mode changes
  React.useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(
        resolvedTheme === 'dark' ? 'datapilot-dark' : 'datapilot-light',
      );
    }
  }, [resolvedTheme]);

  // Update schema-aware SQL autocomplete when schema snapshot loads
  React.useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco || !schema) return;

    completionDisposableRef.current?.dispose();
    completionDisposableRef.current = monaco.languages.registerCompletionItemProvider(
      'sql',
      {
        provideCompletionItems: (model, position) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const suggestions: Array<{
            label: string;
            kind: number;
            insertText: string;
            detail?: string;
            range: typeof range;
          }> = [];

          for (const table of schema.tables) {
            suggestions.push({
              label: table.name,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: table.name,
              detail: `Table (${table.rowCountEstimate} rows)`,
              range,
            });

            for (const col of table.columns) {
              suggestions.push({
                label: `${table.name}.${col.name}`,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: `${table.name}.${col.name}`,
                detail: `${col.dataType}${col.isPrimaryKey ? ' · PK' : ''}`,
                range,
              });
              suggestions.push({
                label: col.name,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: col.name,
                detail: `${table.name}.${col.name} (${col.dataType})`,
                range,
              });
            }
          }

          return { suggestions };
        },
      },
    );

    return () => {
      completionDisposableRef.current?.dispose();
    };
  }, [schema]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;
    monaco.editor.defineTheme(
      'datapilot-light',
      monacoLightTheme as Parameters<typeof monaco.editor.defineTheme>[1],
    );
    monaco.editor.defineTheme(
      'datapilot-dark',
      monacoDarkTheme as Parameters<typeof monaco.editor.defineTheme>[1],
    );
    monaco.editor.setTheme(
      resolvedTheme === 'dark' ? 'datapilot-dark' : 'datapilot-light',
    );

    // Cmd/Ctrl + Enter to run query
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      const currentVal = editor.getValue();
      void handleRunQuery(currentVal, false);
    });
  };

  const handleFormatSql = () => {
    const formatted = formatSql(sql);
    setSql(formatted);
    addToast({
      title: 'SQL formatted',
      variant: 'info',
    });
  };

  const handleRunQuery = async (sqlToExecute = sql, confirmedWrite = false) => {
    if (!activeDb) return;
    setExecutionError(null);
    setIsRunning(true);

    try {
      const response = await apiClient.executeQuery(activeDb.id, {
        sql: sqlToExecute,
        allowWrite: !readOnlyMode,
        confirmedWrite,
        bypassCache: confirmedWrite,
      });

      if (response.requiresConfirmation) {
        setWritePreview(response);
        return;
      }

      setWritePreview(null);
      setResult(response.result);
      if (activeOutputTab === 'explain') {
        setActiveOutputTab('results');
      }
    } catch (err) {
      setExecutionError(
        err instanceof Error
          ? err.message
          : 'Query failed validation or execution. Check syntax and permissions.',
      );
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunExplain = async () => {
    if (!activeDb) return;
    setExecutionError(null);
    setIsExplaining(true);
    setActiveOutputTab('explain');
    try {
      const plan = await apiClient.explainQuery(activeDb.id, {
        sql,
        analyze: true,
      });
      setExplainPlan(plan);
    } catch (err) {
      setExecutionError(
        err instanceof Error ? err.message : 'Could not run EXPLAIN on this query.',
      );
    } finally {
      setIsExplaining(false);
    }
  };

  const filteredTables = React.useMemo(() => {
    if (!schema) return [];
    const q = schemaFilter.trim().toLowerCase();
    if (!q) return schema.tables;
    return schema.tables.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.columns.some((c) => c.name.toLowerCase().includes(q)),
    );
  }, [schema, schemaFilter]);

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="engine" icon="database">
              {activeDb?.name ?? 'PostgreSQL'}
            </Badge>
            <Badge
              variant={readOnlyMode ? 'readonly' : 'write'}
              icon={readOnlyMode ? 'read-only' : 'write-access'}
            >
              {readOnlyMode ? 'Read-only enforced' : 'Write mode enabled'}
            </Badge>
            {liveValidation.valid ? (
              <Badge variant="readonly" icon="shield-check">
                sql-guard: {liveValidation.statementType} valid
              </Badge>
            ) : (
              <Badge variant="danger" icon="warning">
                sql-guard blocked
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-display font-bold m-0">SQL Editor</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Load sample SQL query"
            defaultValue=""
            onChange={(e) => {
              const idx = Number(e.target.value);
              const snippet = SAMPLE_SQL_SNIPPETS[idx];
              if (snippet) {
                setSql(snippet.sql);
                setExecutionError(null);
              }
            }}
            className="dp-select h-9 text-xs w-auto pr-7"
          >
            <option value="" disabled>
              Load sample query...
            </option>
            {SAMPLE_SQL_SNIPPETS.map((s, idx) => (
              <option key={s.label} value={idx}>
                {s.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setReadOnlyMode(!readOnlyMode)}
            className="dp-btn dp-btn--secondary dp-btn--sm h-9"
            title="Toggle Read-only or Write mode"
          >
            <Icon name={readOnlyMode ? 'lock' : 'write-access'} size={15} />
            {readOnlyMode ? 'Read-only' : 'Write enabled'}
          </button>

          <button
            type="button"
            onClick={() => setSchemaSidebarOpen((prev) => !prev)}
            className="dp-btn dp-btn--secondary dp-btn--sm h-9"
          >
            <Icon name="schema-designer" size={15} />
            {schemaSidebarOpen ? 'Hide schema' : 'Show schema'}
          </button>
        </div>
      </div>

      {/* Main Split: Schema Explorer Sidebar + Monaco Editor & Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {schemaSidebarOpen && (
          <Card className="lg:col-span-3 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Schema Explorer
              </span>
              <span className="text-[11px] font-mono text-[var(--text-muted)]">
                {schema?.tables.length ?? 0} tables
              </span>
            </div>

            <Input
              placeholder="Search tables & columns..."
              value={schemaFilter}
              onChange={(e) => setSchemaFilter(e.target.value)}
              aria-label="Search schema tables and columns"
              className="h-8 text-xs"
            />

            {schemaLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {filteredTables.map((table) => (
                  <div
                    key={table.name}
                    className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)]/50 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-mono text-xs font-bold flex items-center gap-1.5 truncate">
                        <Icon name="table" size={14} className="text-brand shrink-0" />
                        {table.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const previewSql = `SELECT *\nFROM ${table.name}\nLIMIT 100;`;
                          setSql(previewSql);
                          void handleRunQuery(previewSql, false);
                        }}
                        className="text-[11px] font-medium text-brand hover:underline shrink-0"
                      >
                        Query
                      </button>
                    </div>
                    <div className="space-y-1 pl-1">
                      {table.columns.map((col) => (
                        <button
                          key={col.name}
                          type="button"
                          onClick={() =>
                            setSql((prev) => `${prev.replace(/;+\s*$/, '')} -- ${table.name}.${col.name}`)
                          }
                          className="w-full flex items-center justify-between text-[11px] font-mono text-left hover:text-brand py-0.5"
                        >
                          <span className="truncate flex items-center gap-1">
                            <Icon
                              name={
                                col.isPrimaryKey
                                  ? 'primary-key'
                                  : col.isForeignKey
                                    ? 'foreign-key'
                                    : 'column'
                              }
                              size={11}
                              className={
                                col.isPrimaryKey
                                  ? 'text-accent'
                                  : col.isForeignKey
                                    ? 'text-brand'
                                    : 'text-[var(--text-muted)]'
                              }
                            />
                            {col.name}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {col.dataType}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Editor + Results Column */}
        <div
          className={`space-y-4 ${
            schemaSidebarOpen ? 'lg:col-span-9' : 'lg:col-span-12'
          }`}
        >
          {/* Monaco Editor Card */}
          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-2)]/60 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  leftIcon={isRunning ? 'stop' : 'run-query'}
                  isLoading={isRunning}
                  onClick={() => void handleRunQuery(sql, false)}
                >
                  Run query (⌘↵)
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon="format"
                  onClick={handleFormatSql}
                >
                  Format
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon="explain-plan"
                  isLoading={isExplaining}
                  onClick={() => void handleRunExplain()}
                >
                  Explain
                </Button>
              </div>

              <div className="text-xs font-mono text-[var(--text-muted)] flex items-center gap-3">
                <span>Timeout: 5,000ms</span>
                <span>Max rows: 2,000</span>
              </div>
            </div>

            <div className="h-64 w-full border-b border-[var(--border)]">
              <Editor
                height="100%"
                defaultLanguage="sql"
                value={sql}
                onChange={(val) => setSql(val ?? '')}
                onMount={handleEditorMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: '"JetBrains Mono", ui-monospace, Consolas, monospace',
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  padding: { top: 14, bottom: 14 },
                  automaticLayout: true,
                  tabSize: 2,
                }}
              />
            </div>

            {/* Live sql-guard or Execution Error Banner */}
            {(executionError || !liveValidation.valid) && (
              <div
                role="alert"
                className="p-3.5 bg-danger/10 border-t border-danger/30 text-xs text-danger flex items-start gap-2.5"
              >
                <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-semibold">
                    {executionError ? 'Execution blocked' : 'sql-guard validation warning'}
                  </strong>
                  <span>{executionError ?? liveValidation.reason}</span>
                </div>
              </div>
            )}
          </Card>

          {/* Results / Chart / Explain Plan Viewer */}
          <QueryResultsView
            result={result}
            explainPlan={explainPlan}
            activeTab={activeOutputTab}
            onTabChange={setActiveOutputTab}
            onRunExplain={() => void handleRunExplain()}
            isExplaining={isExplaining}
          />
        </div>
      </div>

      {/* Write Mode Impact Preview & Confirmation Modal */}
      {writePreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm write query execution"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[1px]"
          onClick={() => setWritePreview(null)}
        >
          <div
            className="w-full max-w-lg dp-card p-6 shadow-[var(--shadow-pop)] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2 text-warning">
                <Icon name="warning" size={20} />
                <h2 className="text-lg font-display font-bold text-[var(--text)] m-0">
                  Confirm Write Query Impact
                </h2>
              </div>
              <Badge variant="write">{writePreview.statementType}</Badge>
            </div>

            <p className="text-sm text-[var(--text-muted)] m-0">
              You are about to execute a data-modifying{' '}
              <strong>{writePreview.statementType}</strong> statement inside a PostgreSQL
              transaction. Review the estimated impact before committing:
            </p>

            <div className="grid grid-cols-2 gap-3 p-3 rounded-[10px] bg-[var(--surface-2)] border border-[var(--border)] text-xs font-mono">
              <div>
                <span className="text-[var(--text-muted)] block">
                  Estimated Affected Rows
                </span>
                <strong className="text-base text-[var(--text)]">
                  ~{writePreview.estimatedAffectedRows} rows
                </strong>
              </div>
              <div>
                <span className="text-[var(--text-muted)] block">Planner Cost</span>
                <strong className="text-base text-[var(--text)]">
                  {writePreview.estimatedCost.toFixed(2)}
                </strong>
              </div>
            </div>

            {writePreview.warnings.map((w, idx) => (
              <div
                key={idx}
                className="p-3 rounded-[10px] border border-danger/40 bg-danger/10 text-xs text-danger flex items-start gap-2"
              >
                <Icon name="destructive" size={16} className="shrink-0 mt-0.5" />
                <span>{w}</span>
              </div>
            ))}

            <pre className="dp-code m-0 text-xs">{writePreview.sanitizedSql}</pre>

            <div className="pt-3 border-t border-[var(--border)] flex items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setWritePreview(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                leftIcon="check"
                isLoading={isRunning}
                onClick={() => void handleRunQuery(writePreview.sanitizedSql, true)}
              >
                Confirm &amp; commit transaction
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
