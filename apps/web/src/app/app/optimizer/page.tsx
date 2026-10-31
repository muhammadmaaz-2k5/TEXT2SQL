'use client';

import * as React from 'react';
import type {
  OptimizerAnalysisResponse,
  OptimizerBenchmarkResult,
} from '@datapilot/types';
import { Badge, Button, Card, Icon } from '@datapilot/ui';
import { ExplainPlanTreeView } from '@/components/query-results-view';
import { apiClient } from '@/lib/api';
import { useAppStore } from '@/lib/store';

const OPTIMIZER_SAMPLE_QUERIES = [
  {
    label: 'Filter customers by country_code & segment (Seq Scan)',
    sql: `SELECT
  c.full_name,
  c.email,
  c.segment,
  c.country_code,
  ROUND(c.lifetime_value_cents / 100.0, 2) AS ltv_usd
FROM customers c
WHERE c.country_code = 'US'
  AND c.segment = 'Enterprise B2B'
ORDER BY c.lifetime_value_cents DESC;`,
  },
  {
    label: 'Join orders & payments filtered by payment_method',
    sql: `SELECT
  o.id AS order_id,
  o.shipping_region,
  p.payment_method,
  p.amount_cents
FROM orders o
JOIN payments p ON p.order_id = o.id
WHERE p.payment_method = 'card'
ORDER BY p.amount_cents DESC;`,
  },
  {
    label: 'Product category aggregation with sort',
    sql: `SELECT
  p.category,
  COUNT(oi.id) AS line_items,
  SUM(oi.quantity * oi.unit_price_cents) AS gross_cents
FROM products p
JOIN order_items oi ON oi.product_id = p.id
WHERE p.category = 'Infrastructure'
GROUP BY p.category
ORDER BY gross_cents DESC;`,
  },
];

export default function OptimizerPage() {
  const databases = useAppStore((s) => s.databases);
  const activeDatabaseId = useAppStore((s) => s.activeDatabaseId);
  const addToast = useAppStore((s) => s.addToast);

  const activeDb = React.useMemo(
    () => databases.find((d) => d.id === activeDatabaseId) ?? databases[0],
    [databases, activeDatabaseId],
  );

  const [sql, setSql] = React.useState(OPTIMIZER_SAMPLE_QUERIES[0]!.sql);
  const [analyzeMode, setAnalyzeMode] = React.useState(true);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [analysis, setAnalysis] = React.useState<OptimizerAnalysisResponse | null>(
    null,
  );
  const [benchmarksBySql, setBenchmarksBySql] = React.useState<
    Record<string, OptimizerBenchmarkResult>
  >({});
  const [benchmarkingIdx, setBenchmarkingIdx] = React.useState<string | null>(
    null,
  );
  const [applyingIdx, setApplyingIdx] = React.useState<string | null>(null);

  const handleRunOptimizer = React.useCallback(
    async (queryToAnalyze = sql) => {
      if (!activeDb) return;
      setIsAnalyzing(true);
      try {
        const res = await apiClient.optimizeQuery(activeDb.id, {
          sql: queryToAnalyze,
          analyze: analyzeMode,
        });
        setAnalysis(res);
      } catch (err) {
        addToast({
          title: 'Optimizer analysis failed',
          description:
            err instanceof Error
              ? err.message
              : 'Verify the query is a valid read-only SELECT statement.',
          variant: 'danger',
        });
      } finally {
        setIsAnalyzing(false);
      }
    },
    [activeDb, analyzeMode, sql, addToast],
  );

  // Run initial analysis automatically on mount
  const autoRanRef = React.useRef(false);
  React.useEffect(() => {
    if (activeDb?.id && !autoRanRef.current) {
      autoRanRef.current = true;
      void handleRunOptimizer(OPTIMIZER_SAMPLE_QUERIES[0]!.sql);
    }
  }, [activeDb?.id, handleRunOptimizer]);

  const handleBenchmarkIndex = async (createIndexSql: string) => {
    if (!activeDb) return;
    setBenchmarkingIdx(createIndexSql);
    try {
      const bench = await apiClient.benchmarkIndex(activeDb.id, {
        sql,
        createIndexSql,
      });
      setBenchmarksBySql((prev) => ({
        ...prev,
        [createIndexSql]: bench,
      }));
      addToast({
        title: 'Sandbox benchmark complete',
        description: `Measured cost before (${bench.beforeCost}) vs after (${bench.afterCost}) in rolled-back transaction.`,
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Benchmark failed',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'danger',
      });
    } finally {
      setBenchmarkingIdx(null);
    }
  };

  const handleApplyIndex = async (createIndexSql: string, indexName: string) => {
    if (!activeDb) return;
    setApplyingIdx(createIndexSql);
    try {
      await apiClient.applyIndex(activeDb.id, {
        sql,
        createIndexSql,
      });
      addToast({
        title: `Created index ${indexName}`,
        description: 'Index committed to PostgreSQL schema and cache refreshed.',
        variant: 'success',
      });
      await handleRunOptimizer(sql);
    } catch (err) {
      addToast({
        title: 'Could not create index',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'danger',
      });
    } finally {
      setApplyingIdx(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <Badge variant="engine" icon="database">
              {activeDb?.name ?? 'PostgreSQL'}
            </Badge>
            <Badge variant="readonly" icon="shield-check">
              Safe Rolled-Back Sandbox
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold m-0">
            Query Optimizer &amp; Explain Plans
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1 m-0">
            Inspect PostgreSQL execution plan trees, identify sequential scan and sort
            bottlenecks, and benchmark candidate indexes safely.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Load sample query for optimization"
            defaultValue="0"
            onChange={(e) => {
              const sample = OPTIMIZER_SAMPLE_QUERIES[Number(e.target.value)];
              if (sample) {
                setSql(sample.sql);
                void handleRunOptimizer(sample.sql);
              }
            }}
            className="dp-select h-9 text-xs w-auto pr-7"
          >
            {OPTIMIZER_SAMPLE_QUERIES.map((s, i) => (
              <option key={s.label} value={i}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* SQL Input Card */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Query to Analyze
          </span>

          <div className="flex items-center gap-3">
            <label className="text-xs flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={analyzeMode}
                onChange={(e) => setAnalyzeMode(e.target.checked)}
                className="accent-[#2F5BFF]"
              />
              <span>
                Run <code>EXPLAIN ANALYZE</code> (inside <code>BEGIN READ ONLY ... ROLLBACK</code>)
              </span>
            </label>
            <Button
              size="sm"
              variant="primary"
              leftIcon="optimize"
              isLoading={isAnalyzing}
              onClick={() => void handleRunOptimizer(sql)}
            >
              Analyze &amp; explain plan
            </Button>
          </div>
        </div>

        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          rows={6}
          aria-label="SQL query to analyze with EXPLAIN"
          className="dp-textarea font-mono text-xs bg-[var(--code-bg)] text-[var(--code-text)]"
        />
      </Card>

      {analysis && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Execution Plan Tree */}
          <Card className="lg:col-span-7 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
              <div>
                <h2 className="text-base font-display font-bold m-0">
                  Execution Plan Tree
                </h2>
                <p className="text-xs text-[var(--text-muted)] m-0 mt-0.5">
                  Rendered from PostgreSQL <code>EXPLAIN (FORMAT JSON)</code>.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span>Cost: {analysis.plan.totalCost}</span>
                <span>Plan: {analysis.plan.planningTimeMs} ms</span>
                {analysis.plan.executionTimeMs !== null && (
                  <span className="text-brand font-semibold">
                    Exec: {analysis.plan.executionTimeMs} ms
                  </span>
                )}
              </div>
            </div>

            <ExplainPlanTreeView node={analysis.plan.planRoot} />
          </Card>

          {/* Right Column: AI Bottleneck Explanation & Index Suggestions */}
          <div className="lg:col-span-5 space-y-4">
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div className="flex items-center gap-2">
                  <Icon name="sparkle" size={18} className="text-accent" />
                  <h2 className="text-base font-display font-bold m-0">
                    AI Bottleneck Analysis
                  </h2>
                </div>
                <Badge variant="neutral">Honest Metrics</Badge>
              </div>

              <p className="text-sm text-[var(--text)] leading-relaxed m-0">
                {analysis.aiSummary}
              </p>

              {analysis.bottlenecks.length > 0 && (
                <div className="space-y-2">
                  {analysis.bottlenecks.map((b, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-[10px] border border-warning/40 bg-warning/10 text-xs flex items-start gap-2"
                    >
                      <Icon
                        name="warning"
                        size={15}
                        className="text-warning shrink-0 mt-0.5"
                      />
                      <span>{b}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3 rounded-[10px] bg-[var(--surface-2)] border border-[var(--border)] text-[11px] text-[var(--text-muted)]">
                <strong className="text-[var(--text)]">Benchmark Policy:</strong>{' '}
                {analysis.disclaimer}
              </div>
            </Card>

            {/* Suggested Indexes Card */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-display font-bold m-0 flex items-center gap-2">
                  <Icon name="index" size={18} className="text-brand" />
                  Suggested Indexes ({analysis.indexSuggestions.length})
                </h3>
              </div>

              {analysis.indexSuggestions.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] m-0">
                  All filtered and joined columns in this query are already covered by
                  existing primary or secondary indexes.
                </p>
              ) : (
                <div className="space-y-4">
                  {analysis.indexSuggestions.map((sug) => {
                    const bench = benchmarksBySql[sug.createIndexSql];
                    return (
                      <div
                        key={sug.indexName}
                        className="p-4 rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)] space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-brand">
                            {sug.indexName}
                          </span>
                          <Badge variant="engine">
                            {sug.tableName} ({sug.columns.join(', ')})
                          </Badge>
                        </div>

                        <p className="text-xs text-[var(--text-muted)] m-0">
                          {sug.rationale}
                        </p>

                        <pre className="dp-code m-0 text-xs py-2.5 px-3">
                          {sug.createIndexSql}
                        </pre>

                        {bench && (
                          <div className="p-3 rounded-[10px] border border-success/40 bg-success/10 text-xs font-mono space-y-1">
                            <div className="flex items-center justify-between font-sans font-semibold text-success">
                              <span>Sandbox Benchmark Result (Rolled Back)</span>
                              <Icon name="check" size={14} />
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Planner Cost:</span>
                              <span>
                                {bench.beforeCost} →{' '}
                                <strong>{bench.afterCost}</strong>
                              </span>
                            </div>
                            {bench.beforeTimeMs !== null &&
                              bench.afterTimeMs !== null && (
                                <div className="flex items-center justify-between">
                                  <span>Execution Time:</span>
                                  <span>
                                    {bench.beforeTimeMs} ms →{' '}
                                    <strong>{bench.afterTimeMs} ms</strong>
                                  </span>
                                </div>
                              )}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            leftIcon="gauge"
                            isLoading={benchmarkingIdx === sug.createIndexSql}
                            onClick={() =>
                              void handleBenchmarkIndex(sug.createIndexSql)
                            }
                          >
                            Benchmark in sandbox
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            leftIcon="plus"
                            isLoading={applyingIdx === sug.createIndexSql}
                            onClick={() =>
                              void handleApplyIndex(
                                sug.createIndexSql,
                                sug.indexName,
                              )
                            }
                          >
                            Create index on schema
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
