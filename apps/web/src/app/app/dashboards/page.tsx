'use client';

import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  ChartType,
  DashboardItem,
  DashboardWidgetItem,
  DashboardWidgetSize,
  OrgRole,
} from '@datapilot/types';
import {
  Badge,
  Button,
  Card,
  Icon,
  Skeleton,
  chartColors,
  chartTheme,
} from '@datapilot/ui';
import { apiClient } from '@/lib/api';
import { useAppStore } from '@/lib/store';

const DASHBOARD_PROMPT_TEMPLATES = [
  'Sales dashboard with revenue, monthly trend, top customers, failed orders',
  'Product & SKU performance dashboard with top products, regional revenue, and order status',
  'Executive customer lifetime value, segment breakdown, and payment method audit',
];

function WidgetVisualization({ widget }: { widget: DashboardWidgetItem }) {
  const resolvedTheme = useAppStore((s) => s.resolvedTheme);
  const themeColors = resolvedTheme === 'dark' ? chartTheme.dark : chartTheme.light;
  const result = widget.lastResult;

  if (!result || result.rows.length === 0) {
    return (
      <div className="py-10 text-center text-xs text-[var(--text-muted)]">
        No rows returned. Click refresh to execute widget query.
      </div>
    );
  }

  const firstRow = result.rows[0] ?? {};
  const numericCols = result.columns.filter((col) => {
    const val = firstRow[col];
    return (
      typeof val === 'number' ||
      (typeof val === 'string' && !Number.isNaN(Number(val)) && val.trim() !== '')
    );
  });
  const nonNumericCols = result.columns.filter((c) => !numericCols.includes(c));
  const xKey = widget.chart.x ?? nonNumericCols[0] ?? result.columns[0] ?? '';
  const yKeys =
    numericCols.filter((c) => c !== xKey).length > 0
      ? numericCols.filter((c) => c !== xKey)
      : numericCols;

  const data = result.rows.map((r) => {
    const copy: Record<string, unknown> = { ...r };
    for (const yk of yKeys) {
      copy[yk] = Number(r[yk] ?? 0);
    }
    return copy;
  });

  if (widget.chart.type === 'kpi') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
        {(yKeys.length > 0 ? yKeys : result.columns.slice(0, 2)).map((col) => {
          const val = firstRow[col];
          const numVal = Number(val);
          const isUsd = col.toLowerCase().includes('usd') || col.toLowerCase().includes('revenue');
          return (
            <div
              key={col}
              className="p-4 rounded-[10px] bg-[var(--surface-2)] border border-[var(--border)] dp-kpi"
            >
              <span className="dp-kpi__label font-mono text-xs">{col}</span>
              <span className="text-2xl sm:text-3xl font-display font-bold text-[var(--text)]">
                {!Number.isNaN(numVal)
                  ? `${isUsd ? '$' : ''}${numVal.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}`
                  : String(val ?? '—')}
              </span>
              <span className="text-[11px] font-mono text-success">
                Live PostgreSQL metric
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  if (widget.chart.type === 'table' || yKeys.length === 0) {
    return (
      <div className="overflow-x-auto max-h-60 border border-[var(--border)] rounded-[10px]">
        <table className="dp-table">
          <thead>
            <tr>
              {result.columns.map((c) => (
                <th key={c} className="font-mono text-xs">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.slice(0, 8).map((row, idx) => (
              <tr key={idx}>
                {result.columns.map((c) => {
                  const v = row[c];
                  const isFailed = String(v).toLowerCase() === 'failed';
                  return (
                    <td key={c}>
                      {isFailed ? (
                        <Badge variant="danger">failed</Badge>
                      ) : (
                        String(v ?? 'NULL')
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="h-60 w-full pt-2">
      <ResponsiveContainer width="100%" height="100%">
        {widget.chart.type === 'area' ? (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={themeColors.grid} />
            <XAxis dataKey={xKey} stroke={themeColors.axis} fontSize={11} />
            <YAxis stroke={themeColors.axis} fontSize={11} />
            <Tooltip
              contentStyle={{
                backgroundColor: themeColors.tooltipBg,
                color: themeColors.tooltipText,
                borderRadius: 10,
                border: 'none',
              }}
            />
            {yKeys.slice(0, 2).map((yk, i) => (
              <Area
                key={yk}
                type="monotone"
                dataKey={yk}
                stroke={chartColors[i % chartColors.length]}
                fill={chartColors[i % chartColors.length]}
                fillOpacity={0.22}
              />
            ))}
          </AreaChart>
        ) : widget.chart.type === 'line' ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={themeColors.grid} />
            <XAxis dataKey={xKey} stroke={themeColors.axis} fontSize={11} />
            <YAxis stroke={themeColors.axis} fontSize={11} />
            <Tooltip
              contentStyle={{
                backgroundColor: themeColors.tooltipBg,
                color: themeColors.tooltipText,
                borderRadius: 10,
                border: 'none',
              }}
            />
            {yKeys.slice(0, 2).map((yk, i) => (
              <Line
                key={yk}
                type="monotone"
                dataKey={yk}
                stroke={chartColors[i % chartColors.length]}
                strokeWidth={2.5}
              />
            ))}
          </LineChart>
        ) : widget.chart.type === 'pie' ? (
          <PieChart>
            <Tooltip />
            <Pie
              data={data}
              dataKey={yKeys[0] ?? ''}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              outerRadius={80}
              label
            >
              {data.map((_, idx) => (
                <Cell
                  key={`c-${idx}`}
                  fill={chartColors[idx % chartColors.length]}
                />
              ))}
            </Pie>
          </PieChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={themeColors.grid} />
            <XAxis dataKey={xKey} stroke={themeColors.axis} fontSize={11} />
            <YAxis stroke={themeColors.axis} fontSize={11} />
            <Tooltip
              contentStyle={{
                backgroundColor: themeColors.tooltipBg,
                color: themeColors.tooltipText,
                borderRadius: 10,
                border: 'none',
              }}
            />
            {yKeys.slice(0, 2).map((yk, i) => (
              <Bar
                key={yk}
                dataKey={yk}
                fill={chartColors[i % chartColors.length]}
                radius={[6, 6, 0, 0]}
              />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export default function DashboardsPage() {
  const databases = useAppStore((s) => s.databases);
  const activeDatabaseId = useAppStore((s) => s.activeDatabaseId);
  const addToast = useAppStore((s) => s.addToast);

  const activeDb = React.useMemo(
    () => databases.find((d) => d.id === activeDatabaseId) ?? databases[0],
    [databases, activeDatabaseId],
  );

  const [dashboards, setDashboards] = React.useState<DashboardItem[]>([]);
  const [selectedDashId, setSelectedDashId] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);
  const [promptInput, setPromptInput] = React.useState('');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [refreshingWidgetId, setRefreshingWidgetId] = React.useState<string | null>(
    null,
  );
  const [draggedWidgetId, setDraggedWidgetId] = React.useState<string | null>(null);
  const [openSqlWidgetIds, setOpenSqlWidgetIds] = React.useState<
    Record<string, boolean>
  >({});
  const [shareModalOpen, setShareModalOpen] = React.useState(false);
  const [shareRole, setShareRole] = React.useState<OrgRole>('VIEWER');

  const fetchDashboards = React.useCallback(async () => {
    setLoading(true);
    try {
      const { dashboards: list } = await apiClient.listDashboards();
      setDashboards(list);
      setSelectedDashId((prev) =>
        list.some((d) => d.id === prev) ? prev : list[0]?.id ?? '',
      );
    } catch (err) {
      addToast({
        title: 'Could not load dashboards',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  React.useEffect(() => {
    void fetchDashboards();
  }, [fetchDashboards]);

  const activeDashboard = React.useMemo(
    () =>
      dashboards.find((d) => d.id === selectedDashId) ?? dashboards[0] ?? null,
    [dashboards, selectedDashId],
  );

  const handleGenerateDashboard = async (promptText = promptInput) => {
    const trimmed = promptText.trim();
    if (!trimmed || !activeDb) return;
    setIsGenerating(true);
    try {
      const { dashboard } = await apiClient.generateDashboard({
        databaseId: activeDb.id,
        prompt: trimmed,
      });
      setDashboards((prev) => [dashboard, ...prev]);
      setSelectedDashId(dashboard.id);
      setPromptInput('');
      addToast({
        title: `Generated "${dashboard.name}"`,
        description: `${dashboard.widgets.length} live widgets created from prompt.`,
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Dashboard generation failed',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'danger',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpdateWidgets = async (nextWidgets: DashboardWidgetItem[]) => {
    if (!activeDashboard) return;
    const normalized = nextWidgets.map((w, idx) => ({ ...w, position: idx }));
    setDashboards((prev) =>
      prev.map((d) =>
        d.id === activeDashboard.id ? { ...d, widgets: normalized } : d,
      ),
    );
    try {
      const { dashboard } = await apiClient.updateDashboardLayout(
        activeDashboard.id,
        normalized.map((w) => ({
          id: w.id,
          position: w.position,
          size: w.size,
          chartType: w.chart.type,
        })),
      );
      setDashboards((prev) =>
        prev.map((d) => (d.id === dashboard.id ? dashboard : d)),
      );
    } catch {
      void fetchDashboards();
    }
  };

  const handleResizeWidget = (widgetId: string, size: DashboardWidgetSize) => {
    if (!activeDashboard) return;
    const next = activeDashboard.widgets.map((w) =>
      w.id === widgetId ? { ...w, size } : w,
    );
    void handleUpdateWidgets(next);
  };

  const handleChangeWidgetChart = (widgetId: string, chartType: ChartType) => {
    if (!activeDashboard) return;
    const next = activeDashboard.widgets.map((w) =>
      w.id === widgetId ? { ...w, chart: { ...w.chart, type: chartType } } : w,
    );
    void handleUpdateWidgets(next);
  };

  const handleDropWidget = (targetWidgetId: string) => {
    if (!activeDashboard || !draggedWidgetId || draggedWidgetId === targetWidgetId) {
      return;
    }
    const items = [...activeDashboard.widgets];
    const fromIdx = items.findIndex((w) => w.id === draggedWidgetId);
    const toIdx = items.findIndex((w) => w.id === targetWidgetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = items.splice(fromIdx, 1);
    if (moved) {
      items.splice(toIdx, 0, moved);
      void handleUpdateWidgets(items);
    }
    setDraggedWidgetId(null);
  };

  const handleRefreshWidget = async (widgetId: string) => {
    if (!activeDashboard) return;
    setRefreshingWidgetId(widgetId);
    try {
      const { dashboard } = await apiClient.refreshDashboardWidget(
        activeDashboard.id,
        widgetId,
      );
      setDashboards((prev) =>
        prev.map((d) => (d.id === dashboard.id ? dashboard : d)),
      );
      addToast({
        title: 'Widget refreshed',
        variant: 'info',
      });
    } catch (err) {
      addToast({
        title: 'Could not refresh widget',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'danger',
      });
    } finally {
      setRefreshingWidgetId(null);
    }
  };

  const handleShareDashboard = async () => {
    if (!activeDashboard) return;
    try {
      const { dashboard } = await apiClient.shareDashboard(activeDashboard.id, {
        minRole: shareRole,
      });
      setDashboards((prev) =>
        prev.map((d) => (d.id === dashboard.id ? dashboard : d)),
      );
      const url = `${window.location.origin}/app/dashboards?share=${dashboard.shareToken ?? ''}&role=${dashboard.shareMinRole}`;
      await navigator.clipboard.writeText(url);
      addToast({
        title: 'Dashboard share link copied',
        description: `Minimum required role: ${dashboard.shareMinRole}`,
        variant: 'success',
      });
      setShareModalOpen(false);
    } catch (err) {
      addToast({
        title: 'Could not share dashboard',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'danger',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold m-0">
            Dashboards
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1 m-0">
            Generate a grid of validated SQL queries and live charts from a prompt.
            Drag to reorder, resize widgets, and share with role controls.
          </p>
        </div>

        {activeDashboard && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              leftIcon="share"
              onClick={() => {
                setShareRole(activeDashboard.shareMinRole);
                setShareModalOpen(true);
              }}
            >
              Share dashboard
            </Button>
          </div>
        )}
      </div>

      {/* Prompt-to-Dashboard Generator Bar */}
      <div className="space-y-2.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleGenerateDashboard(promptInput);
          }}
          className="dp-prompt"
        >
          <Icon name="sparkle" size={20} className="text-accent shrink-0" />
          <input
            type="text"
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder='Describe a dashboard (e.g. "sales dashboard with revenue, monthly trend, top customers, failed orders")...'
            aria-label="Describe a dashboard to generate"
            disabled={isGenerating}
          />
          <Button
            type="submit"
            variant="primary"
            leftIcon="dashboard"
            isLoading={isGenerating}
            disabled={!promptInput.trim()}
          >
            Generate dashboard
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--text-muted)]">
            Templates:
          </span>
          {DASHBOARD_PROMPT_TEMPLATES.map((tpl) => (
            <button
              key={tpl}
              type="button"
              disabled={isGenerating}
              onClick={() => void handleGenerateDashboard(tpl)}
              className="text-xs px-3 py-1 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-brand transition-colors"
            >
              &ldquo;{tpl}&rdquo;
            </button>
          ))}
        </div>
      </div>

      {/* Dashboard Selector Tabs */}
      {dashboards.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div className="flex flex-wrap items-center gap-2">
            {dashboards.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDashId(d.id)}
                className={`dp-btn dp-btn--sm ${
                  activeDashboard?.id === d.id
                    ? 'dp-btn--primary'
                    : 'dp-btn--secondary'
                }`}
              >
                <Icon name="dashboard" size={15} />
                {d.name}
              </button>
            ))}
          </div>

          {activeDashboard && (
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="engine" icon="database">
                {activeDashboard.databaseName}
              </Badge>
              {activeDashboard.shareToken && (
                <Badge variant="readonly" icon="role-badge">
                  Shared ({activeDashboard.shareMinRole}+)
                </Badge>
              )}
            </div>
          )}
        </div>
      )}

      {/* 12-Column Drag & Resize Widget Grid */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <Skeleton className="lg:col-span-4 h-64" />
          <Skeleton className="lg:col-span-8 h-64" />
          <Skeleton className="lg:col-span-6 h-64" />
          <Skeleton className="lg:col-span-6 h-64" />
        </div>
      ) : activeDashboard ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {activeDashboard.widgets.map((widget) => {
            const colSpanClass =
              widget.size === 'sm'
                ? 'lg:col-span-4'
                : widget.size === 'md'
                  ? 'lg:col-span-6'
                  : 'lg:col-span-12';

            const showSql = Boolean(openSqlWidgetIds[widget.id]);

            return (
              <Card
                key={widget.id}
                draggable
                onDragStart={() => setDraggedWidgetId(widget.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDropWidget(widget.id)}
                className={`${colSpanClass} p-4 flex flex-col justify-between transition-all ${
                  draggedWidgetId === widget.id ? 'opacity-50 border-brand' : ''
                }`}
              >
                <div>
                  {/* Widget Top Bar: Drag Handle, Title, Chart Switcher, Resize, Refresh */}
                  <div className="flex items-start justify-between gap-2 pb-3 border-b border-[var(--border)]">
                    <div className="min-w-0">
                      <h2 className="text-sm font-display font-bold m-0 truncate cursor-move">
                        ⋮⋮ {widget.title}
                      </h2>
                      {widget.subtitle && (
                        <p className="text-[11px] text-[var(--text-muted)] m-0 mt-0.5 truncate">
                          {widget.subtitle}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Chart Type Selector */}
                      <select
                        aria-label={`Chart type for ${widget.title}`}
                        value={widget.chart.type}
                        onChange={(e) =>
                          handleChangeWidgetChart(
                            widget.id,
                            e.target.value as ChartType,
                          )
                        }
                        className="dp-select h-7 text-[11px] px-2 w-auto"
                      >
                        <option value="kpi">KPI</option>
                        <option value="bar">Bar</option>
                        <option value="line">Line</option>
                        <option value="area">Area</option>
                        <option value="pie">Pie</option>
                        <option value="table">Table</option>
                      </select>

                      {/* Widget Size S / M / L */}
                      <div className="inline-flex rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] p-0.5">
                        {(['sm', 'md', 'lg'] as const).map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => handleResizeWidget(widget.id, sz)}
                            title={`Resize widget to ${sz.toUpperCase()}`}
                            className={`px-1.5 py-0.5 text-[10px] font-mono uppercase rounded ${
                              widget.size === sz
                                ? 'bg-brand text-white font-bold'
                                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                            }`}
                          >
                            {sz}
                          </button>
                        ))}
                      </div>

                      {/* Toggle SQL View */}
                      <button
                        type="button"
                        aria-label="Inspect widget SQL"
                        title="Inspect widget SQL"
                        onClick={() =>
                          setOpenSqlWidgetIds((prev) => ({
                            ...prev,
                            [widget.id]: !prev[widget.id],
                          }))
                        }
                        className="dp-btn dp-btn--ghost dp-btn--sm w-7 h-7 p-0 justify-center"
                      >
                        <Icon name="sql-editor" size={14} />
                      </button>

                      {/* Per-Widget Refresh */}
                      <button
                        type="button"
                        aria-label={`Refresh ${widget.title}`}
                        title="Refresh widget"
                        disabled={refreshingWidgetId === widget.id}
                        onClick={() => void handleRefreshWidget(widget.id)}
                        className="dp-btn dp-btn--ghost dp-btn--sm w-7 h-7 p-0 justify-center"
                      >
                        <Icon name="refresh" size={14} />
                      </button>
                    </div>
                  </div>

                  {showSql && (
                    <pre className="dp-code my-3 text-[11px] p-2.5">
                      {widget.sql}
                    </pre>
                  )}

                  {/* Widget Chart / KPI / Table Visualization */}
                  <div className="mt-3">
                    <WidgetVisualization widget={widget} />
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-muted)] font-mono">
                  <span>
                    {widget.lastResult
                      ? `${widget.lastResult.rowCount} rows · ${widget.lastResult.durationMs} ms`
                      : 'Ready'}
                  </span>
                  <span>
                    {widget.refreshedAt
                      ? `Updated ${new Date(widget.refreshedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : 'Cached'}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}

      {/* Role-Controlled Share Modal */}
      {shareModalOpen && activeDashboard && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Share dashboard with role control"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[1px]"
          onClick={() => setShareModalOpen(false)}
        >
          <div
            className="w-full max-w-md dp-card p-6 shadow-[var(--shadow-pop)] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <Icon name="share" size={18} className="text-brand" />
                <h2 className="text-lg font-display font-bold m-0">
                  Share Dashboard by Link
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close share modal"
                onClick={() => setShareModalOpen(false)}
                className="dp-btn dp-btn--ghost dp-btn--sm w-8 h-8 p-0 justify-center"
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <div>
              <label htmlFor="share-role-select" className="dp-label">
                Minimum required organization role
              </label>
              <select
                id="share-role-select"
                value={shareRole}
                onChange={(e) => setShareRole(e.target.value as OrgRole)}
                className="dp-select"
              >
                <option value="VIEWER">Viewer and above (Read-only)</option>
                <option value="DEVELOPER">Developer and above</option>
                <option value="ADMIN">Admin and Owner only</option>
                <option value="OWNER">Owner only</option>
              </select>
            </div>

            <div className="pt-3 border-t border-[var(--border)] flex items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShareModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                leftIcon="copy"
                onClick={() => void handleShareDashboard()}
              >
                Copy role-controlled link
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
