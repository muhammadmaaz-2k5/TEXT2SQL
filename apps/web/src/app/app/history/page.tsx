'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type {
  ChartType,
  ExplainPlanResponse,
  QueryExecutionResult,
  QueryHistoryItem,
} from '@datapilot/types';
import { Badge, Button, Card, Icon, Input, Skeleton } from '@datapilot/ui';
import { QueryResultsView } from '@/components/query-results-view';
import { apiClient } from '@/lib/api';
import { useAppStore } from '@/lib/store';

function formatDayGroupLabel(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (isToday) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) return 'Yesterday';

  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function HistoryPage() {
  const router = useRouter();
  const databases = useAppStore((s) => s.databases);
  const resolvedTheme = useAppStore((s) => s.resolvedTheme);
  const addToast = useAppStore((s) => s.addToast);

  const [historyItems, setHistoryItems] = React.useState<QueryHistoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [selectedDbFilter, setSelectedDbFilter] = React.useState<string>('');
  const [savedOnly, setSavedOnly] = React.useState(false);

  // Active expanded drawer per history item (for Run again / Explain)
  const [expandedItemId, setExpandedItemId] = React.useState<string | null>(null);
  const [runningItemId, setRunningItemId] = React.useState<string | null>(null);
  const [explainingItemId, setExplainingItemId] = React.useState<string | null>(null);
  const [resultsByItemId, setResultsByItemId] = React.useState<
    Record<string, QueryExecutionResult>
  >({});
  const [explainsByItemId, setExplainsByItemId] = React.useState<
    Record<string, ExplainPlanResponse>
  >({});
  const [tabByItemId, setTabByItemId] = React.useState<
    Record<string, 'results' | 'chart' | 'explain'>
  >({});

  const fetchHistory = React.useCallback(async () => {
    setLoading(true);
    try {
      const { history } = await apiClient.listHistory({
        databaseId: selectedDbFilter || undefined,
        search: search.trim() || undefined,
        savedOnly,
      });
      setHistoryItems(history);
    } catch (err) {
      addToast({
        title: 'Could not load query history',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [addToast, savedOnly, search, selectedDbFilter]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchHistory();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [fetchHistory]);

  // Group chronologically by day
  const groupedByDay = React.useMemo(() => {
    const groups: Array<{ dayLabel: string; items: QueryHistoryItem[] }> = [];
    const map = new Map<string, QueryHistoryItem[]>();
    for (const item of historyItems) {
      const label = formatDayGroupLabel(item.createdAt);
      const list = map.get(label);
      if (list) {
        list.push(item);
      } else {
        const newList = [item];
        map.set(label, newList);
        groups.push({ dayLabel: label, items: newList });
      }
    }
    return groups;
  }, [historyItems]);

  const handleRunAgain = async (item: QueryHistoryItem) => {
    setExpandedItemId(item.id);
    setRunningItemId(item.id);
    setTabByItemId((prev) => ({
      ...prev,
      [item.id]: item.chart && item.chart.type !== 'table' ? 'chart' : 'results',
    }));

    try {
      const execRes = await apiClient.executeQuery(item.databaseId, {
        sql: item.sql,
        allowWrite: false,
      });
      if (!execRes.requiresConfirmation) {
        setResultsByItemId((prev) => ({
          ...prev,
          [item.id]: execRes.result,
        }));
      }
    } catch (err) {
      addToast({
        title: 'Run again failed',
        description: err instanceof Error ? err.message : 'Check query syntax.',
        variant: 'danger',
      });
    } finally {
      setRunningItemId(null);
    }
  };

  const handleExplainItem = async (item: QueryHistoryItem) => {
    setExpandedItemId(item.id);
    setExplainingItemId(item.id);
    setTabByItemId((prev) => ({
      ...prev,
      [item.id]: 'explain',
    }));

    try {
      const plan = await apiClient.explainQuery(item.databaseId, {
        sql: item.sql,
        analyze: true,
      });
      setExplainsByItemId((prev) => ({
        ...prev,
        [item.id]: plan,
      }));
    } catch (err) {
      addToast({
        title: 'Could not run EXPLAIN',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'danger',
      });
    } finally {
      setExplainingItemId(null);
    }
  };

  const handleToggleSave = async (item: QueryHistoryItem) => {
    // Optimistic update
    setHistoryItems((prev) =>
      prev.map((h) => (h.id === item.id ? { ...h, isSaved: !h.isSaved } : h)),
    );
    try {
      const { item: updated } = await apiClient.toggleSaveHistory(item.id);
      addToast({
        title: updated.isSaved ? 'Saved to bookmarks' : 'Removed from bookmarks',
        variant: 'info',
      });
    } catch {
      void fetchHistory();
    }
  };

  const handleShare = async (item: QueryHistoryItem) => {
    try {
      const { item: updated } = await apiClient.shareHistory(item.id);
      setHistoryItems((prev) =>
        prev.map((h) => (h.id === item.id ? updated : h)),
      );
      const shareUrl = `${window.location.origin}/app/editor?sql=${encodeURIComponent(
        updated.sql,
      )}&share=${updated.shareToken ?? ''}`;
      await navigator.clipboard.writeText(shareUrl);
      addToast({
        title: 'Share link copied to clipboard',
        description: `Token: ${updated.shareToken}`,
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Could not generate share link',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'danger',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold m-0">
            Query History
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1 m-0">
            Searchable log of AI questions and SQL executions grouped by day.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSavedOnly(false)}
            className={`dp-btn dp-btn--sm ${
              !savedOnly ? 'dp-btn--primary' : 'dp-btn--secondary'
            }`}
          >
            <Icon name="history" size={15} />
            All queries
          </button>
          <button
            type="button"
            onClick={() => setSavedOnly(true)}
            className={`dp-btn dp-btn--sm ${
              savedOnly ? 'dp-btn--primary' : 'dp-btn--secondary'
            }`}
          >
            <Icon name="bookmark" size={15} />
            Saved bookmarks
          </button>
        </div>
      </div>

      {/* Search & Database Filter Bar */}
      <Card className="p-4 flex flex-col sm:flex-row items-center gap-3">
        <div className="flex-1 w-full">
          <Input
            placeholder="Search by plain-English prompt, SQL keyword, or table..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search query history"
          />
        </div>
        <div className="w-full sm:w-64">
          <select
            aria-label="Filter history by database"
            value={selectedDbFilter}
            onChange={(e) => setSelectedDbFilter(e.target.value)}
            className="dp-select"
          >
            <option value="">All databases</option>
            {databases.map((db) => (
              <option key={db.id} value={db.id}>
                {db.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Chronological Day Groups */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : groupedByDay.length === 0 ? (
        <Card className="p-10 text-center flex flex-col items-center">
          <img
            src={
              resolvedTheme === 'dark'
                ? '/illustrations/empty-no-queries-dark.svg'
                : '/illustrations/empty-no-queries-light.svg'
            }
            alt="No matching query history"
            className="w-52 h-auto mb-4"
          />
          <h2 className="text-lg font-display font-bold mb-1">
            No matching queries found
          </h2>
          <p className="text-sm text-[var(--text-muted)] max-w-md mb-4">
            Ask a question in Ask AI or execute a query in the SQL Editor to populate
            your history.
          </p>
          <Button
            variant="primary"
            leftIcon="ai-chat"
            onClick={() => router.push('/app/query')}
          >
            Ask your database
          </Button>
        </Card>
      ) : (
        <div className="space-y-8">
          {groupedByDay.map((group) => (
            <div key={group.dayLabel} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {group.dayLabel}
                </span>
                <div className="flex-1 border-t border-[var(--border)]" />
                <span className="text-xs font-mono text-[var(--text-muted)]">
                  {group.items.length} {group.items.length === 1 ? 'query' : 'queries'}
                </span>
              </div>

              <div className="space-y-3">
                {group.items.map((item) => {
                  const isExpanded = expandedItemId === item.id;
                  return (
                    <Card key={item.id} className="p-5 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="engine" icon="database">
                              {item.databaseName}
                            </Badge>
                            {item.chart && (
                              <Badge variant="neutral" icon="chart-bar">
                                Chart: {item.chart.type}
                              </Badge>
                            )}
                            <span className="text-xs font-mono text-[var(--text-muted)]">
                              {item.rowCount} rows · {item.durationMs} ms ·{' '}
                              {new Date(item.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>

                          <h3 className="text-base font-display font-bold m-0 pt-1">
                            {item.prompt ?? 'Ad-hoc SQL Editor Execution'}
                          </h3>
                          {item.explanation && (
                            <p className="text-xs text-[var(--text-muted)] m-0">
                              {item.explanation}
                            </p>
                          )}
                        </div>

                        {/* Action Bar: Run again, Edit, Explain, Save, Share */}
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            variant="primary"
                            leftIcon="run-query"
                            isLoading={runningItemId === item.id}
                            onClick={() => void handleRunAgain(item)}
                          >
                            Run again
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            leftIcon="sql-editor"
                            onClick={() =>
                              router.push(
                                `/app/editor?sql=${encodeURIComponent(item.sql)}`,
                              )
                            }
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            leftIcon="explain-plan"
                            isLoading={explainingItemId === item.id}
                            onClick={() => void handleExplainItem(item)}
                          >
                            Explain
                          </Button>
                          <Button
                            size="sm"
                            variant={item.isSaved ? 'accent' : 'secondary'}
                            leftIcon="bookmark"
                            onClick={() => void handleToggleSave(item)}
                          >
                            {item.isSaved ? 'Saved' : 'Save'}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            leftIcon="share"
                            onClick={() => void handleShare(item)}
                          >
                            Share
                          </Button>
                        </div>
                      </div>

                      <pre className="dp-code m-0 text-xs">{item.sql}</pre>

                      {isExpanded && (
                        <div className="pt-2">
                          <QueryResultsView
                            result={resultsByItemId[item.id] ?? null}
                            explainPlan={explainsByItemId[item.id] ?? null}
                            activeTab={tabByItemId[item.id] ?? 'results'}
                            onTabChange={(nextTab) =>
                              setTabByItemId((prev) => ({
                                ...prev,
                                [item.id]: nextTab,
                              }))
                            }
                            onRunExplain={() => void handleExplainItem(item)}
                            isExplaining={explainingItemId === item.id}
                            defaultChartType={
                              (item.chart?.type as ChartType | undefined) ?? 'bar'
                            }
                          />
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
