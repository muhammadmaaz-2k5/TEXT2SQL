'use client';

import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  LineChart,
} from 'recharts';
import type {
  ChartType,
  ExplainPlanNode,
  ExplainPlanResponse,
  QueryExecutionResult,
} from '@datapilot/types';
import {
  Badge,
  Button,
  Icon,
  type IconName,
  Input,
  chartColors,
  chartTheme,
} from '@datapilot/ui';
import { useAppStore } from '@/lib/store';

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function ExplainPlanTreeView({ node, depth = 0 }: { node: ExplainPlanNode; depth?: number }) {
  const isSeqScan = node['Node Type'] === 'Seq Scan';
  return (
    <div className={depth > 0 ? 'ml-5 pl-4 border-l border-[var(--border)] mt-2.5' : ''}>
      <div
        className={`p-3 rounded-[10px] border bg-[var(--surface-2)] flex flex-wrap items-center justify-between gap-2 ${
          isSeqScan ? 'border-warning/60' : 'border-[var(--border)]'
        }`}
      >
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Badge variant={isSeqScan ? 'write' : 'engine'} icon="explain-plan">
              {node['Node Type']}
            </Badge>
            {node['Relation Name'] && (
              <span className="font-mono text-xs font-semibold text-[var(--text)]">
                on {node['Relation Name']}
              </span>
            )}
            {node['Index Name'] && (
              <span className="font-mono text-xs text-success">
                using {node['Index Name']}
              </span>
            )}
          </div>
          {(node.Filter || node['Index Cond'] || node['Hash Cond']) && (
            <p className="text-[11px] font-mono text-[var(--text-muted)] m-0">
              {node.Filter ? `Filter: ${node.Filter}` : ''}
              {node['Index Cond'] ? `Index Cond: ${node['Index Cond']}` : ''}
              {node['Hash Cond'] ? `Hash Cond: ${node['Hash Cond']}` : ''}
            </p>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div>
            <span className="text-[var(--text-muted)] block text-[10px]">Cost</span>
            <span>
              {(node['Startup Cost'] ?? 0).toFixed(2)}..
              {(node['Total Cost'] ?? 0).toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-[var(--text-muted)] block text-[10px]">Plan Rows</span>
            <span>{node['Plan Rows'] ?? 0}</span>
          </div>
          {node['Actual Total Time'] !== undefined && (
            <div>
              <span className="text-[var(--text-muted)] block text-[10px]">Actual Time</span>
              <span className="text-brand font-semibold">
                {node['Actual Total Time'].toFixed(3)} ms
              </span>
            </div>
          )}
          {node['Actual Rows'] !== undefined && (
            <div>
              <span className="text-[var(--text-muted)] block text-[10px]">Actual Rows</span>
              <span>{node['Actual Rows']}</span>
            </div>
          )}
        </div>
      </div>

      {node.Plans?.map((child, idx) => (
        <ExplainPlanTreeView key={idx} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function QueryResultsView({
  result,
  explainPlan,
  activeTab,
  onTabChange,
  onRunExplain,
  isExplaining = false,
  defaultChartType,
}: {
  result: QueryExecutionResult | null;
  explainPlan: ExplainPlanResponse | null;
  activeTab: 'results' | 'chart' | 'explain';
  onTabChange: (tab: 'results' | 'chart' | 'explain') => void;
  onRunExplain?: () => void;
  isExplaining?: boolean;
  defaultChartType?: ChartType;
}) {
  const resolvedTheme = useAppStore((s) => s.resolvedTheme);
  const addToast = useAppStore((s) => s.addToast);

  const [rowFilter, setRowFilter] = React.useState('');
  const [sortCol, setSortCol] = React.useState<string | null>(null);
  const [sortAsc, setSortAsc] = React.useState(true);
  const [chartType, setChartType] = React.useState<ChartType>(defaultChartType ?? 'bar');

  React.useEffect(() => {
    if (defaultChartType) {
      setChartType(defaultChartType);
    }
  }, [defaultChartType]);

  const filteredRows = React.useMemo(() => {
    if (!result) return [];
    let list = [...result.rows];
    const q = rowFilter.trim().toLowerCase();
    if (q) {
      list = list.filter((row) =>
        Object.values(row).some((val) =>
          formatCellValue(val).toLowerCase().includes(q),
        ),
      );
    }
    if (sortCol) {
      list.sort((a, b) => {
        const va = a[sortCol];
        const vb = b[sortCol];
        if (typeof va === 'number' && typeof vb === 'number') {
          return sortAsc ? va - vb : vb - va;
        }
        const sa = formatCellValue(va);
        const sb = formatCellValue(vb);
        return sortAsc ? sa.localeCompare(sb) : sb.localeCompare(sa);
      });
    }
    return list;
  }, [result, rowFilter, sortCol, sortAsc]);

  // Infer X axis and numeric Y columns for Chart view
  const chartMeta = React.useMemo(() => {
    if (!result || result.rows.length === 0 || result.columns.length === 0) {
      return { xKey: '', yKeys: [] as string[], data: [] as Record<string, unknown>[] };
    }
    const firstRow = result.rows[0] ?? {};
    const numericCols = result.columns.filter((col) => {
      const val = firstRow[col];
      return typeof val === 'number' || (typeof val === 'string' && !Number.isNaN(Number(val)) && val.trim() !== '');
    });
    const nonNumericCols = result.columns.filter((c) => !numericCols.includes(c));
    const xKey = nonNumericCols[0] ?? result.columns[0] ?? '';
    const yKeys =
      numericCols.filter((c) => c !== xKey).length > 0
        ? numericCols.filter((c) => c !== xKey)
        : numericCols;

    const normalizedData = result.rows.map((r) => {
      const copy: Record<string, unknown> = { ...r };
      for (const yk of yKeys) {
        copy[yk] = Number(r[yk] ?? 0);
      }
      return copy;
    });

    return { xKey, yKeys, data: normalizedData };
  }, [result]);

  const handleDownloadCsv = () => {
    if (!result || result.columns.length === 0) return;
    const header = result.columns.join(',');
    const lines = result.rows.map((row) =>
      result.columns
        .map((col) => {
          const raw = formatCellValue(row[col]).replace(/"/g, '""');
          return `"${raw}"`;
        })
        .join(','),
    );
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `datapilot-query-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast({
      title: 'Exported CSV',
      description: `${result.rowCount} rows downloaded.`,
      variant: 'success',
    });
  };

  const handleCopyJson = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(JSON.stringify(result.rows, null, 2));
    addToast({
      title: 'Copied JSON to clipboard',
      description: `${result.rowCount} rows copied.`,
      variant: 'info',
    });
  };

  const themeColors = resolvedTheme === 'dark' ? chartTheme.dark : chartTheme.light;

  return (
    <div className="dp-card p-0 overflow-hidden">
      {/* Top Bar: Tabs + Execution Metrics + Export Controls */}
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]/50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {[
            { id: 'results' as const, label: 'Results', icon: 'table-view' as IconName },
            { id: 'chart' as const, label: 'Chart', icon: 'chart-bar' as IconName },
            { id: 'explain' as const, label: 'Explain plan', icon: 'explain-plan' as IconName },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                onTabChange(tab.id);
                if (tab.id === 'explain' && !explainPlan && onRunExplain) {
                  onRunExplain();
                }
              }}
              className={`dp-btn dp-btn--sm h-8 px-3 ${
                activeTab === tab.id ? 'dp-btn--primary' : 'dp-btn--ghost'
              }`}
            >
              <Icon name={tab.icon} size={15} />
              {tab.label}
            </button>
          ))}
        </div>

        {result && (
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <Badge variant={result.readOnly ? 'readonly' : 'write'} icon="shield-check">
              {result.readOnly ? 'Read-only' : 'Write committed'}
            </Badge>
            <span className="font-mono text-[var(--text-muted)]">
              {result.rowCount} {result.rowCount === 1 ? 'row' : 'rows'}
              {result.truncated ? ' (limit reached)' : ''}
            </span>
            <span className="font-mono text-brand font-semibold">
              {result.durationMs} ms
            </span>
            <button
              type="button"
              onClick={handleDownloadCsv}
              aria-label="Download results as CSV"
              className="dp-btn dp-btn--secondary dp-btn--sm h-7 px-2.5 text-xs"
            >
              <Icon name="download" size={14} />
              CSV
            </button>
            <button
              type="button"
              onClick={() => void handleCopyJson()}
              aria-label="Copy results as JSON"
              className="dp-btn dp-btn--secondary dp-btn--sm h-7 px-2.5 text-xs"
            >
              <Icon name="copy" size={14} />
              JSON
            </button>
          </div>
        )}
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === 'results' && (
          <>
            {!result ? (
              <div className="py-12 text-center flex flex-col items-center">
                <img
                  src={
                    resolvedTheme === 'dark'
                      ? '/illustrations/empty-no-queries-dark.svg'
                      : '/illustrations/empty-no-queries-light.svg'
                  }
                  alt="Run a query to view results"
                  className="w-48 h-auto mb-3"
                />
                <p className="text-sm font-medium text-[var(--text)] mb-1">
                  Ready to run your SQL query
                </p>
                <p className="text-xs text-[var(--text-muted)] m-0">
                  Press <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)]">⌘ Enter</kbd> or click <strong>Run query</strong>.
                </p>
              </div>
            ) : result.rows.length === 0 ? (
              <div className="py-12 text-center flex flex-col items-center">
                <img
                  src={
                    resolvedTheme === 'dark'
                      ? '/illustrations/empty-no-results-dark.svg'
                      : '/illustrations/empty-no-results-light.svg'
                  }
                  alt="No rows returned"
                  className="w-44 h-auto mb-3"
                />
                <p className="text-sm font-medium text-[var(--text)] m-0">
                  Query executed in {result.durationMs} ms and returned 0 rows.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="w-full max-w-xs">
                    <Input
                      placeholder="Filter result rows..."
                      value={rowFilter}
                      onChange={(e) => setRowFilter(e.target.value)}
                      aria-label="Filter result rows"
                      className="h-8 text-xs"
                    />
                  </div>
                  <span className="text-xs text-[var(--text-muted)] font-mono">
                    Showing {filteredRows.length} of {result.rowCount} rows
                  </span>
                </div>

                <div className="overflow-x-auto max-h-[420px] border border-[var(--border)] rounded-[10px]">
                  <table className="dp-table">
                    <thead>
                      <tr>
                        <th className="w-10 text-center text-[var(--text-muted)]">#</th>
                        {result.columns.map((col) => (
                          <th
                            key={col}
                            onClick={() => {
                              if (sortCol === col) {
                                setSortAsc(!sortAsc);
                              } else {
                                setSortCol(col);
                                setSortAsc(true);
                              }
                            }}
                            className="cursor-pointer select-none hover:text-brand"
                          >
                            <span className="inline-flex items-center gap-1 font-mono text-xs">
                              {col}
                              {sortCol === col && (
                                <span>{sortAsc ? '↑' : '↓'}</span>
                              )}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          <td className="text-center text-[var(--text-muted)] text-xs">
                            {rIdx + 1}
                          </td>
                          {result.columns.map((col) => {
                            const val = row[col];
                            const isNull = val === null || val === undefined;
                            return (
                              <td key={col}>
                                {isNull ? (
                                  <span className="px-1.5 py-0.5 rounded text-[11px] bg-[var(--surface-2)] text-[var(--text-muted)]">
                                    NULL
                                  </span>
                                ) : (
                                  formatCellValue(val)
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'chart' && (
          <>
            {!result || chartMeta.yKeys.length === 0 ? (
              <div className="py-12 text-center text-sm text-[var(--text-muted)]">
                Run a query with at least one numeric metric column to render a chart.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Chart Type Switcher */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {(
                      [
                        { type: 'bar', label: 'Bar', icon: 'chart-bar' },
                        { type: 'line', label: 'Line', icon: 'chart-line' },
                        { type: 'area', label: 'Area', icon: 'chart-area' },
                        { type: 'pie', label: 'Pie', icon: 'chart-pie' },
                        { type: 'scatter', label: 'Scatter', icon: 'chart-scatter' },
                        { type: 'kpi', label: 'KPI Tile', icon: 'kpi' },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => setChartType(item.type)}
                        className={`dp-btn dp-btn--sm h-8 px-2.5 text-xs ${
                          chartType === item.type ? 'dp-btn--primary' : 'dp-btn--secondary'
                        }`}
                      >
                        <Icon name={item.icon} size={14} />
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs font-mono text-[var(--text-muted)]">
                    X: {chartMeta.xKey} · Y: {chartMeta.yKeys.join(', ')}
                  </span>
                </div>

                {chartType === 'kpi' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-4">
                    {chartMeta.yKeys.map((yk) => {
                      const sum = chartMeta.data.reduce(
                        (acc, r) => acc + Number(r[yk] ?? 0),
                        0,
                      );
                      return (
                        <div
                          key={yk}
                          className="p-5 rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)] dp-kpi"
                        >
                          <span className="dp-kpi__label font-mono">{yk}</span>
                          <span className="dp-kpi__value">
                            {sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-xs text-success font-mono">
                            Across {chartMeta.data.length} rows
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-80 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      {chartType === 'bar' ? (
                        <BarChart data={chartMeta.data}>
                          <CartesianGrid strokeDasharray="3 3" stroke={themeColors.grid} />
                          <XAxis dataKey={chartMeta.xKey} stroke={themeColors.axis} fontSize={12} />
                          <YAxis stroke={themeColors.axis} fontSize={12} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: themeColors.tooltipBg,
                              color: themeColors.tooltipText,
                              borderRadius: 10,
                              border: 'none',
                            }}
                          />
                          {chartMeta.yKeys.map((yk, idx) => (
                            <Bar
                              key={yk}
                              dataKey={yk}
                              fill={chartColors[idx % chartColors.length]}
                              radius={[6, 6, 0, 0]}
                            />
                          ))}
                        </BarChart>
                      ) : chartType === 'line' ? (
                        <LineChart data={chartMeta.data}>
                          <CartesianGrid strokeDasharray="3 3" stroke={themeColors.grid} />
                          <XAxis dataKey={chartMeta.xKey} stroke={themeColors.axis} fontSize={12} />
                          <YAxis stroke={themeColors.axis} fontSize={12} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: themeColors.tooltipBg,
                              color: themeColors.tooltipText,
                              borderRadius: 10,
                              border: 'none',
                            }}
                          />
                          {chartMeta.yKeys.map((yk, idx) => (
                            <Line
                              key={yk}
                              type="monotone"
                              dataKey={yk}
                              stroke={chartColors[idx % chartColors.length]}
                              strokeWidth={2.5}
                            />
                          ))}
                        </LineChart>
                      ) : chartType === 'area' ? (
                        <AreaChart data={chartMeta.data}>
                          <CartesianGrid strokeDasharray="3 3" stroke={themeColors.grid} />
                          <XAxis dataKey={chartMeta.xKey} stroke={themeColors.axis} fontSize={12} />
                          <YAxis stroke={themeColors.axis} fontSize={12} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: themeColors.tooltipBg,
                              color: themeColors.tooltipText,
                              borderRadius: 10,
                              border: 'none',
                            }}
                          />
                          {chartMeta.yKeys.map((yk, idx) => (
                            <Area
                              key={yk}
                              type="monotone"
                              dataKey={yk}
                              stroke={chartColors[idx % chartColors.length]}
                              fill={chartColors[idx % chartColors.length]}
                              fillOpacity={0.22}
                            />
                          ))}
                        </AreaChart>
                      ) : chartType === 'pie' ? (
                        <PieChart>
                          <Tooltip />
                          <Pie
                            data={chartMeta.data}
                            dataKey={chartMeta.yKeys[0] ?? ''}
                            nameKey={chartMeta.xKey}
                            cx="50%"
                            cy="50%"
                            outerRadius={110}
                            label
                          >
                            {chartMeta.data.map((_, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={chartColors[index % chartColors.length]}
                              />
                            ))}
                          </Pie>
                        </PieChart>
                      ) : (
                        <ScatterChart>
                          <CartesianGrid strokeDasharray="3 3" stroke={themeColors.grid} />
                          <XAxis
                            dataKey={chartMeta.xKey}
                            name={chartMeta.xKey}
                            stroke={themeColors.axis}
                            fontSize={12}
                          />
                          <YAxis
                            dataKey={chartMeta.yKeys[0] ?? ''}
                            name={chartMeta.yKeys[0] ?? ''}
                            stroke={themeColors.axis}
                            fontSize={12}
                          />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                          <Scatter
                            name={chartMeta.yKeys[0] ?? 'Metric'}
                            data={chartMeta.data}
                            fill={chartColors[0]}
                          />
                        </ScatterChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === 'explain' && (
          <div className="space-y-4">
            {isExplaining ? (
              <div className="py-10 text-center text-sm text-[var(--text-muted)]">
                Running <code>EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)</code> in read-only
                sandbox...
              </div>
            ) : !explainPlan ? (
              <div className="py-10 text-center space-y-3">
                <p className="text-sm text-[var(--text-muted)] m-0">
                  Inspect the PostgreSQL query execution tree and cost breakdown.
                </p>
                {onRunExplain && (
                  <Button
                    size="sm"
                    variant="primary"
                    leftIcon="explain-plan"
                    onClick={onRunExplain}
                  >
                    Run EXPLAIN plan
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-[10px] bg-[var(--surface-2)] border border-[var(--border)] text-xs font-mono">
                  <span>Planning time: {explainPlan.planningTimeMs} ms</span>
                  {explainPlan.executionTimeMs !== null && (
                    <span className="text-brand font-semibold">
                      Execution time: {explainPlan.executionTimeMs} ms
                    </span>
                  )}
                  <span>Total cost: {explainPlan.totalCost}</span>
                  <Badge variant="readonly" icon="shield-check">
                    Rolled-back read-only transaction
                  </Badge>
                </div>

                {explainPlan.bottlenecks.length > 0 && (
                  <div className="space-y-1.5">
                    {explainPlan.bottlenecks.map((b, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-[10px] border border-warning/40 bg-warning/10 text-xs flex items-center gap-2"
                      >
                        <Icon name="optimize" size={15} className="text-warning shrink-0" />
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>
                )}

                <ExplainPlanTreeView node={explainPlan.planRoot} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

