'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Icon } from '@datapilot/ui';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { apiClient } from '@/lib/api';
import { useAppStore } from '@/lib/store';

const SAMPLE_PROMPTS = [
  {
    prompt: 'Monthly revenue and order volume for the last 6 months',
    sql: `SELECT
  DATE_TRUNC('month', created_at) AS month,
  SUM(total_cents) / 100.0 AS revenue_usd,
  COUNT(*) AS order_count
FROM orders
WHERE status = 'completed'
  AND created_at >= NOW() - INTERVAL '6 months'
GROUP BY 1
ORDER BY 1 ASC
LIMIT 500;`,
    explanation:
      'Aggregates completed orders by calendar month over the trailing 6 months, converting cents to USD and counting total orders.',
    kpis: [
      { label: 'Trailing 6M Revenue', value: '$482,910', delta: '+18.4% MoM' },
      { label: 'Completed Orders', value: '6,412', delta: '+11.2% MoM' },
      { label: 'Execution Time', value: '14 ms', delta: 'Read-only AST verified' },
    ],
  },
  {
    prompt: 'Top 5 customer segments by repeat purchase rate',
    sql: `WITH customer_orders AS (
  SELECT customer_id, COUNT(*) AS orders_placed
  FROM orders
  WHERE status = 'completed'
  GROUP BY customer_id
)
SELECT
  c.segment,
  ROUND(100.0 * COUNT(*) FILTER (WHERE co.orders_placed > 1) / COUNT(*), 1) AS repeat_rate_pct,
  COUNT(*) AS total_customers
FROM customers c
JOIN customer_orders co ON co.customer_id = c.id
GROUP BY c.segment
ORDER BY repeat_rate_pct DESC
LIMIT 5;`,
    explanation:
      'Computes the percentage of customers in each segment with two or more completed orders.',
    kpis: [
      { label: 'Top Segment', value: 'Enterprise B2B', delta: '68.4% repeat rate' },
      { label: 'Cohort Size', value: '2,190 accts', delta: 'Zero PII exposed' },
      { label: 'Execution Time', value: '19 ms', delta: 'Read-only AST verified' },
    ],
  },
];

export default function LandingPage() {
  const router = useRouter();
  const resolvedTheme = useAppStore((s) => s.resolvedTheme);
  const setSession = useAppStore((s) => s.setSession);
  const addToast = useAppStore((s) => s.addToast);
  const [selectedPromptIdx, setSelectedPromptIdx] = React.useState(0);
  const [launchingDemo, setLaunchingDemo] = React.useState(false);

  const activeSample = SAMPLE_PROMPTS[selectedPromptIdx] ?? SAMPLE_PROMPTS[0]!;

  const handleLaunchDemo = async () => {
    setLaunchingDemo(true);
    try {
      const session = await apiClient.loginDemo();
      setSession(session.user, session.accessToken);
      addToast({
        title: 'Signed in to Demo Workspace',
        description: 'Connected to Shop Analytics (PostgreSQL 16).',
        variant: 'success',
      });
      router.push('/app/databases');
    } catch (err) {
      addToast({
        title: 'Could not launch demo automatically',
        description: err instanceof Error ? err.message : 'Redirecting to login.',
        variant: 'warning',
      });
      router.push('/login');
    } finally {
      setLaunchingDemo(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--text)]">
      {/* Top Marketing Navigation */}
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <BrandLogo href="/" />

          <nav
            aria-label="Marketing sections"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[var(--text-muted)]"
          >
            <a href="#how-it-works" className="text-[var(--text-muted)] hover:text-[var(--text)] no-underline">
              How it works
            </a>
            <a href="#security" className="text-[var(--text-muted)] hover:text-[var(--text)] no-underline">
              Security
            </a>
            <a href="#pricing" className="text-[var(--text-muted)] hover:text-[var(--text)] no-underline">
              Pricing
            </a>
            <a href="#faq" className="text-[var(--text-muted)] hover:text-[var(--text)] no-underline">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <Link href="/login" className="dp-btn dp-btn--secondary dp-btn--sm no-underline">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="dp-btn dp-btn--primary dp-btn--sm no-underline"
            >
              Create account
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-14 sm:py-20 border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--border)] bg-[var(--surface)] text-xs font-medium mb-6">
              <span className="w-2 h-2 rounded-full bg-accent" />
              <span>Plain English → AST-Validated SQL → Instant Charts</span>
              <Badge variant="readonly" icon="read-only">
                Read-only by default
              </Badge>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-display font-bold tracking-tight leading-[1.1] text-[var(--text)]">
              Talk to your PostgreSQL database with precision.
            </h1>

            <p className="mt-5 text-lg text-[var(--text-muted)] leading-relaxed max-w-2xl">
              DataPilot AI turns natural language questions into schema-aware, AST-validated
              SQL, executes them under a least-privilege role, and renders clean charts and
              plain-English explanations.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                leftIcon="run-query"
                isLoading={launchingDemo}
                onClick={() => void handleLaunchDemo()}
              >
                Open live demo workspace
              </Button>
              <Link href="/signup" className="dp-btn dp-btn--secondary no-underline">
                Connect your database
                <Icon name="arrow-right" size={17} />
              </Link>
            </div>
          </div>

          {/* Interactive English -> SQL -> Chart Flow Preview */}
          <div className="mt-12 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 dp-card p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <Icon name="sparkle" size={18} className="text-accent" />
                  <span className="text-sm font-semibold">Interactive Pilot Flow</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="engine" icon="database">
                    PostgreSQL 16 · shop_analytics
                  </Badge>
                  <Badge variant="readonly" icon="shield-check">
                    Read-only
                  </Badge>
                </div>
              </div>

              {/* Prompt Selector */}
              <div className="mt-4 flex flex-wrap gap-2">
                {SAMPLE_PROMPTS.map((item, idx) => (
                  <button
                    key={item.prompt}
                    type="button"
                    onClick={() => setSelectedPromptIdx(idx)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors text-left ${
                      selectedPromptIdx === idx
                        ? 'border-brand bg-brand-50 text-brand-700 dark:bg-navy-700 dark:text-brand-300 font-medium'
                        : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    &ldquo;{item.prompt}&rdquo;
                  </button>
                ))}
              </div>

              {/* Generated SQL Block */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1.5">
                  <span className="font-mono">Validated SQL (single SELECT statement)</span>
                  <span className="text-success font-medium flex items-center gap-1">
                    <Icon name="check" size={14} /> sql-guard passed
                  </span>
                </div>
                <pre className="dp-code m-0 text-xs sm:text-[13px]">{activeSample.sql}</pre>
              </div>

              {/* Explanation + KPI Output */}
              <p className="mt-4 text-sm text-[var(--text-muted)] mb-4">
                <strong className="text-[var(--text)]">Explanation:</strong>{' '}
                {activeSample.explanation}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-[var(--border)]">
                {activeSample.kpis.map((kpi) => (
                  <div
                    key={kpi.label}
                    className="p-3 rounded-[10px] bg-[var(--surface-2)] border border-[var(--border)] dp-kpi"
                  >
                    <span className="dp-kpi__label">{kpi.label}</span>
                    <span className="text-xl font-display font-bold text-[var(--text)]">
                      {kpi.value}
                    </span>
                    <span className="text-xs font-mono text-success">{kpi.delta}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Supplied Hero Illustration */}
            <div className="lg:col-span-5 dp-card p-4 flex flex-col justify-between">
              <img
                src={
                  resolvedTheme === 'dark'
                    ? '/illustrations/hero-dark.svg'
                    : '/illustrations/hero-light.svg'
                }
                alt="DataPilot AI workspace preview showing schema, SQL editor, and chart output"
                className="w-full h-auto rounded-[10px] border border-[var(--border)]"
              />
              <div className="mt-4 flex items-center justify-between text-xs text-[var(--text-muted)] px-1">
                <span>Schema-aware Groq Structured Outputs</span>
                <span className="font-mono">Timeout: 5,000ms</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-16 sm:py-20 border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <Badge variant="engine" icon="text-to-sql">
              Strict Pipeline
            </Badge>
            <h2 className="mt-3 text-3xl sm:text-4xl font-display font-bold">
              How DataPilot AI executes every question safely
            </h2>
            <p className="mt-2 text-[var(--text-muted)]">
              Model output is never trusted blindly. Every query passes through schema
              pruning, JSON-schema generation, AST parsing, and sandboxed execution.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <Card className="p-4">
              <img
                src={
                  resolvedTheme === 'dark'
                    ? '/illustrations/pipeline-dark.svg'
                    : '/illustrations/pipeline-light.svg'
                }
                alt="DataPilot AI execution pipeline from English prompt to validated SQL and chart"
                className="w-full h-auto rounded-[10px]"
              />
            </Card>
            <Card className="p-4">
              <img
                src={
                  resolvedTheme === 'dark'
                    ? '/illustrations/er-diagram-dark.svg'
                    : '/illustrations/er-diagram-light.svg'
                }
                alt="Entity relationship schema introspection diagram"
                className="w-full h-auto rounded-[10px]"
              />
            </Card>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              {
                step: '01',
                title: 'Schema Context Selection',
                desc: 'Loads only relevant tables, column types, and foreign key relationships from Redis snapshot cache.',
                icon: 'schema-ai' as const,
              },
              {
                step: '02',
                title: 'Groq Structured Output',
                desc: 'Generates strict JSON schema output with SQL, referenced tables, explanation, and chart specification.',
                icon: 'sparkle' as const,
              },
              {
                step: '03',
                title: 'AST SQL Guard',
                desc: 'Parses the AST to enforce single-statement SELECT/EXPLAIN, reject DDL/DML, and cap row limits.',
                icon: 'shield-check' as const,
              },
              {
                step: '04',
                title: 'Isolated Execution',
                desc: 'Runs with a least-privilege role, statement timeout, and cost cap before rendering charts.',
                icon: 'chart-bar' as const,
              },
            ].map((item) => (
              <Card key={item.step} className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-xs font-bold text-brand">
                    STEP {item.step}
                  </span>
                  <Icon name={item.icon} size={18} className="text-[var(--text-muted)]" />
                </div>
                <h3 className="text-base font-display font-bold mb-1.5">{item.title}</h3>
                <p className="text-sm text-[var(--text-muted)] m-0">{item.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section id="security" className="py-16 sm:py-20 border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <Badge variant="readonly" icon="lock">
              Defense in Depth
            </Badge>
            <h2 className="mt-3 text-3xl sm:text-4xl font-display font-bold">
              Built for security-conscious data teams
            </h2>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-5">
            <Card className="p-5">
              <div className="w-9 h-9 rounded-[10px] bg-[var(--surface-2)] flex items-center justify-center mb-3 text-success">
                <Icon name="read-only" size={20} />
              </div>
              <h3 className="text-lg font-display font-bold mb-2">Read-only by default</h3>
              <p className="text-sm text-[var(--text-muted)] m-0">
                DDL, DML, multi-statement batches, and dangerous system functions
                (such as <code>pg_read_file</code> or <code>dblink</code>) are blocked at the
                AST parser layer before touching your database.
              </p>
            </Card>

            <Card className="p-5">
              <div className="w-9 h-9 rounded-[10px] bg-[var(--surface-2)] flex items-center justify-center mb-3 text-brand">
                <Icon name="lock" size={20} />
              </div>
              <h3 className="text-lg font-display font-bold mb-2">
                AES-256-GCM credential vault
              </h3>
              <p className="text-sm text-[var(--text-muted)] m-0">
                Connection strings and database passwords are encrypted at rest with
                AES-256-GCM and unique initialization vectors. Credentials and result rows
                are never written to application logs.
              </p>
            </Card>

            <Card className="p-5">
              <div className="w-9 h-9 rounded-[10px] bg-[var(--surface-2)] flex items-center justify-center mb-3 text-accent">
                <Icon name="role-badge" size={20} />
              </div>
              <h3 className="text-lg font-display font-bold mb-2">
                Organization RBAC &amp; audit trail
              </h3>
              <p className="text-sm text-[var(--text-muted)] m-0">
                Granular Owner, Admin, Developer, and Viewer roles control who can connect
                databases, enable write-mode previews, or provision scoped REST API keys.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-16 sm:py-20 border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl sm:text-4xl font-display font-bold">
              Predictable pricing for every team size
            </h2>
            <p className="mt-2 text-[var(--text-muted)]">
              Start with our managed PostgreSQL sandbox or connect your own warehouse.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                tier: 'Developer',
                price: '$0',
                period: 'forever',
                desc: 'For individual builders and local database exploration.',
                features: [
                  '2 PostgreSQL connections',
                  '100 AI SQL generations / day',
                  'Monaco SQL editor & ER view',
                  '7-day query history',
                ],
                cta: 'Start free',
                highlight: false,
              },
              {
                tier: 'Team',
                price: '$49',
                period: 'per seat / month',
                desc: 'For product and analytics teams sharing dashboards and queries.',
                features: [
                  'Unlimited PostgreSQL connections',
                  'Unlimited AI Ask & Explain plans',
                  'Prompt-generated Dashboards',
                  'Role-based access (Owner/Admin/Dev/Viewer)',
                  'REST API endpoint & API keys',
                ],
                cta: 'Start Team trial',
                highlight: true,
              },
              {
                tier: 'Enterprise',
                price: 'Custom',
                period: 'annual contract',
                desc: 'For organizations requiring dedicated VPC peering and KMS keys.',
                features: [
                  'Customer-managed KMS encryption',
                  'SAML SSO & SCIM provisioning',
                  'Dedicated managed Postgres cluster',
                  'OpenTelemetry audit export',
                ],
                cta: 'Contact engineering',
                highlight: false,
              },
            ].map((plan) => (
              <Card
                key={plan.tier}
                className={`p-6 flex flex-col justify-between ${
                  plan.highlight ? 'border-brand ring-1 ring-brand' : ''
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-display font-bold m-0">{plan.tier}</h3>
                    {plan.highlight && (
                      <Badge variant="engine">Most popular</Badge>
                    )}
                  </div>
                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-4xl font-display font-bold">{plan.price}</span>
                    <span className="text-xs text-[var(--text-muted)]">{plan.period}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">{plan.desc}</p>
                  <ul className="mt-5 space-y-2.5 p-0 list-none text-sm">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-center gap-2">
                        <Icon name="check" size={16} className="text-success shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  href="/signup"
                  className={`mt-6 w-full justify-center no-underline dp-btn ${
                    plan.highlight ? 'dp-btn--primary' : 'dp-btn--secondary'
                  }`}
                >
                  {plan.cta}
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-16 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-display font-bold">Frequently asked questions</h2>
          <div className="mt-8 space-y-4">
            {[
              {
                q: 'Can the AI modify or delete rows in my database?',
                a: 'No by default. Every connection starts in strict Read-only mode. The SQL Guard AST validator rejects INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, and multi-statement queries before execution.',
              },
              {
                q: 'Does the AI model see my database rows?',
                a: 'No. DataPilot sends only the table and column schema definitions (table names, column data types, and foreign key relationships) to the Groq model to generate SQL.',
              },
              {
                q: 'Which LLM powers SQL generation?',
                a: 'DataPilot uses Groq Structured Outputs with strict JSON schema validation. You can configure GROQ_MODEL via environment variables.',
              },
              {
                q: 'How are database credentials stored?',
                a: 'All database passwords and connection strings are encrypted at rest using AES-256-GCM with a 256-bit key from your environment or KMS.',
              },
            ].map((item) => (
              <Card key={item.q} className="p-5">
                <h3 className="text-base font-display font-bold mb-1.5">{item.q}</h3>
                <p className="text-sm text-[var(--text-muted)] m-0">{item.a}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-[var(--border)] bg-[var(--surface)] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--text-muted)]">
          <BrandLogo href="/" />
          <div className="flex items-center gap-6">
            <Link href="/login" className="text-[var(--text-muted)] hover:text-[var(--text)] no-underline">
              Sign in
            </Link>
            <Link href="/signup" className="text-[var(--text-muted)] hover:text-[var(--text)] no-underline">
              Create account
            </Link>
            <Link href="/app/databases" className="text-[var(--text-muted)] hover:text-[var(--text)] no-underline">
              App workspace
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

