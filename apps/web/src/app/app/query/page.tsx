'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type {
  AiAskResponse,
  ChartType,
  ConversationTurn,
  ExplainPlanResponse,
} from '@datapilot/types';
import { Badge, Button, Card, Icon } from '@datapilot/ui';
import { QueryResultsView } from '@/components/query-results-view';
import { apiClient } from '@/lib/api';
import { useAppStore } from '@/lib/store';

const STARTER_PROMPTS = [
  'Show total revenue and completed order count by customer segment',
  'Monthly revenue trend and order volume over time',
  'Top products by total revenue and units sold',
  'Revenue share breakdown by shipping region',
  'Top customers ordered by lifetime value in USD',
  'Payment transaction volume by payment method and status',
];

interface ChatTurnState {
  response: AiAskResponse;
  editableSql: string;
  isEditingSql: boolean;
  isReRunning: boolean;
  activeTab: 'results' | 'chart' | 'explain';
  explainPlan: ExplainPlanResponse | null;
  isExplaining: boolean;
}

export default function QueryAskPage() {
  const router = useRouter();
  const databases = useAppStore((s) => s.databases);
  const activeDatabaseId = useAppStore((s) => s.activeDatabaseId);
  const readOnlyMode = useAppStore((s) => s.readOnlyMode);
  const addToast = useAppStore((s) => s.addToast);

  const activeDb = React.useMemo(
    () => databases.find((d) => d.id === activeDatabaseId) ?? databases[0],
    [databases, activeDatabaseId],
  );

  // Per-database conversation state
  const [threadsByDb, setThreadsByDb] = React.useState<Record<string, ChatTurnState[]>>(
    {},
  );
  const [promptInput, setPromptInput] = React.useState('');
  const [isAsking, setIsAsking] = React.useState(false);

  const currentThread = React.useMemo(
    () => (activeDb ? threadsByDb[activeDb.id] ?? [] : []),
    [threadsByDb, activeDb],
  );

  const updateTurn = (
    dbId: string,
    turnId: string,
    updater: (prev: ChatTurnState) => ChatTurnState,
  ) => {
    setThreadsByDb((prev) => ({
      ...prev,
      [dbId]: (prev[dbId] ?? []).map((t) =>
        t.response.id === turnId ? updater(t) : t,
      ),
    }));
  };

  const handleAsk = async (questionText = promptInput) => {
    const trimmed = questionText.trim();
    if (!trimmed || !activeDb) return;

    setIsAsking(true);
    setPromptInput('');

    // Build prior conversation context
    const history: ConversationTurn[] = [];
    for (const item of currentThread.slice(-5)) {
      history.push({
        role: 'user',
        prompt: item.response.prompt,
      });
      history.push({
        role: 'assistant',
        prompt: item.response.prompt,
        sql: item.editableSql,
        explanation: item.response.structured.explanation,
      });
    }

    try {
      const aiResponse = await apiClient.askDatabase(activeDb.id, {
        prompt: trimmed,
        history,
        allowWrite: !readOnlyMode,
      });

      const autoTab: 'results' | 'chart' =
        aiResponse.structured.chart.type === 'table' ? 'results' : 'chart';

      const newTurn: ChatTurnState = {
        response: aiResponse,
        editableSql: aiResponse.structured.sql,
        isEditingSql: Boolean(aiResponse.executionError),
        isReRunning: false,
        activeTab: autoTab,
        explainPlan: null,
        isExplaining: false,
      };

      setThreadsByDb((prev) => ({
        ...prev,
        [activeDb.id]: [...(prev[activeDb.id] ?? []), newTurn],
      }));
    } catch (err) {
      addToast({
        title: 'AI query generation could not complete',
        description:
          err instanceof Error
            ? err.message
            : 'Check your connection or open the SQL Editor.',
        variant: 'danger',
      });
      setPromptInput(trimmed);
    } finally {
      setIsAsking(false);
    }
  };

  const handleReRunEditedSql = async (turn: ChatTurnState) => {
    if (!activeDb) return;
    updateTurn(activeDb.id, turn.response.id, (t) => ({
      ...t,
      isReRunning: true,
    }));

    try {
      const execRes = await apiClient.executeQuery(activeDb.id, {
        sql: turn.editableSql,
        allowWrite: !readOnlyMode,
        confirmedWrite: false,
        bypassCache: true,
      });

      updateTurn(activeDb.id, turn.response.id, (t) => ({
        ...t,
        isReRunning: false,
        isEditingSql: false,
        response: {
          ...t.response,
          execution: execRes,
          executionError: undefined,
        },
      }));
      addToast({
        title: 'Updated SQL executed',
        variant: 'success',
      });
    } catch (err) {
      updateTurn(activeDb.id, turn.response.id, (t) => ({
        ...t,
        isReRunning: false,
        response: {
          ...t.response,
          executionError:
            err instanceof Error ? err.message : 'Execution failed.',
        },
      }));
    }
  };

  const handleExplainTurn = async (turn: ChatTurnState) => {
    if (!activeDb) return;
    updateTurn(activeDb.id, turn.response.id, (t) => ({
      ...t,
      activeTab: 'explain',
      isExplaining: true,
    }));

    try {
      const plan = await apiClient.explainQuery(activeDb.id, {
        sql: turn.editableSql,
        analyze: true,
      });
      updateTurn(activeDb.id, turn.response.id, (t) => ({
        ...t,
        explainPlan: plan,
        isExplaining: false,
      }));
    } catch (err) {
      updateTurn(activeDb.id, turn.response.id, (t) => ({
        ...t,
        isExplaining: false,
      }));
      addToast({
        title: 'Could not run EXPLAIN plan',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'danger',
      });
    }
  };

  // Auto-run first starter prompt on initial visit so the screen is immediately impressive
  const autoSeededRef = React.useRef<Record<string, boolean>>({});
  React.useEffect(() => {
    if (
      activeDb?.id &&
      !autoSeededRef.current[activeDb.id] &&
      (threadsByDb[activeDb.id]?.length ?? 0) === 0
    ) {
      autoSeededRef.current[activeDb.id] = true;
      void handleAsk(STARTER_PROMPTS[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDb?.id]);

  return (
    <div className="space-y-6">
      {/* Header with Persistent Read-Only Mode Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <Badge variant="engine" icon="database">
              {activeDb?.name ?? 'PostgreSQL'}
            </Badge>
            <Badge
              variant={readOnlyMode ? 'readonly' : 'write'}
              icon={readOnlyMode ? 'read-only' : 'write-access'}
            >
              {readOnlyMode ? 'Read-only mode' : 'Write mode'}
            </Badge>
            <Badge variant="neutral" icon="sparkle">
              Groq Structured Outputs
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold m-0">
            Ask your database
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1 m-0">
            Ask questions in plain English. Get AST-validated SQL, plain-English
            explanations, and interactive charts.
          </p>
        </div>

        {currentThread.length > 0 && activeDb && (
          <Button
            size="sm"
            variant="secondary"
            leftIcon="plus"
            onClick={() =>
              setThreadsByDb((prev) => ({
                ...prev,
                [activeDb.id]: [],
              }))
            }
          >
            New conversation
          </Button>
        )}
      </div>

      {/* Starter Prompt Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-[var(--text-muted)] mr-1">
          Try asking:
        </span>
        {STARTER_PROMPTS.map((sample) => (
          <button
            key={sample}
            type="button"
            disabled={isAsking}
            onClick={() => void handleAsk(sample)}
            className="text-xs px-3 py-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-brand transition-colors text-left"
          >
            &ldquo;{sample}&rdquo;
          </button>
        ))}
      </div>

      {/* Prompt Input Bar (dp-prompt from components.css) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleAsk(promptInput);
        }}
        className="dp-prompt sticky top-16 z-20"
      >
        <Icon name="sparkle" size={20} className="text-accent shrink-0" />
        <input
          type="text"
          value={promptInput}
          onChange={(e) => setPromptInput(e.target.value)}
          placeholder={
            currentThread.length > 0
              ? 'Ask a follow-up question (e.g. "Filter that to Enterprise B2B only")...'
              : 'Ask a question in plain English (e.g. "Monthly revenue and order count")...'
          }
          aria-label="Ask your database a question in plain English"
          disabled={isAsking}
        />
        <Badge variant="readonly" icon="read-only" className="hidden sm:inline-flex">
          Read-only
        </Badge>
        <Button
          type="submit"
          variant="primary"
          leftIcon="run-query"
          isLoading={isAsking}
          disabled={!promptInput.trim()}
        >
          Ask Pilot
        </Button>
      </form>

      {/* Conversation Thread */}
      <div className="space-y-8">
        {currentThread.map((turn, idx) => {
          const { response } = turn;
          const execResult =
            response.execution && !response.execution.requiresConfirmation
              ? response.execution.result
              : null;

          return (
            <div key={response.id} className="space-y-4">
              {/* User Question Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-brand text-white text-xs font-bold inline-flex items-center justify-center shrink-0">
                    Q{idx + 1}
                  </span>
                  <h2 className="text-lg font-display font-bold m-0">
                    {response.prompt}
                  </h2>
                </div>
                <span className="text-xs font-mono text-[var(--text-muted)] shrink-0">
                  {new Date(response.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              {/* AI Pilot Card: Explanation + Editable SQL */}
              <Card className="p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="engine" icon="explain">
                      Pilot Explanation
                    </Badge>
                    <Badge variant="readonly" icon="shield-check">
                      sql-guard verified ({response.structured.query_type})
                    </Badge>
                    <span className="text-xs font-mono text-[var(--text-muted)]">
                      Schema tables: {response.prunedTables.join(', ')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {response.retried && (
                      <Badge variant="write">Auto-retried 1x</Badge>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon="sql-editor"
                      onClick={() =>
                        activeDb &&
                        updateTurn(activeDb.id, response.id, (t) => ({
                          ...t,
                          isEditingSql: !t.isEditingSql,
                        }))
                      }
                    >
                      {turn.isEditingSql ? 'Hide SQL editor' : 'Edit SQL'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon="terminal"
                      onClick={() =>
                        router.push(
                          `/app/editor?sql=${encodeURIComponent(turn.editableSql)}`,
                        )
                      }
                    >
                      Open in SQL Editor
                    </Button>
                  </div>
                </div>

                {/* Plain-English Explanation */}
                <p className="text-sm text-[var(--text)] leading-relaxed m-0">
                  {response.structured.explanation}
                </p>

                {/* Generated SQL (Syntax Highlighted or Inline Editable) */}
                {turn.isEditingSql ? (
                  <div className="space-y-2.5">
                    <textarea
                      value={turn.editableSql}
                      onChange={(e) =>
                        activeDb &&
                        updateTurn(activeDb.id, response.id, (t) => ({
                          ...t,
                          editableSql: e.target.value,
                        }))
                      }
                      rows={6}
                      aria-label="Edit generated SQL"
                      className="dp-textarea font-mono text-xs bg-[var(--code-bg)] text-[var(--code-text)]"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        leftIcon="run-query"
                        isLoading={turn.isReRunning}
                        onClick={() => void handleReRunEditedSql(turn)}
                      >
                        Run edited SQL
                      </Button>
                    </div>
                  </div>
                ) : (
                  <pre className="dp-code m-0 text-xs">{turn.editableSql}</pre>
                )}

                {response.executionError && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-[10px] border border-danger/40 bg-danger/10 text-xs text-danger flex items-start gap-2.5"
                  >
                    <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-semibold">
                        Execution stopped — edit the SQL above to retry
                      </strong>
                      <span>{response.executionError}</span>
                    </div>
                  </div>
                )}
              </Card>

              {/* Results Table + Auto-Chosen Chart + Explain Plan */}
              <QueryResultsView
                result={execResult}
                explainPlan={turn.explainPlan}
                activeTab={turn.activeTab}
                onTabChange={(newTab) =>
                  activeDb &&
                  updateTurn(activeDb.id, response.id, (t) => ({
                    ...t,
                    activeTab: newTab,
                  }))
                }
                onRunExplain={() => void handleExplainTurn(turn)}
                isExplaining={turn.isExplaining}
                defaultChartType={response.structured.chart.type as ChartType}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
