'use client';

import * as React from 'react';
import {
  Badge,
  Button,
  Card,
  Icon,
  Input,
  chartColors,
  iconNames,
} from '@datapilot/ui';
import { useAppStore } from '@/lib/store';

export default function SettingsPage() {
  const user = useAppStore((s) => s.user);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const readOnlyMode = useAppStore((s) => s.readOnlyMode);
  const setReadOnlyMode = useAppStore((s) => s.setReadOnlyMode);
  const addToast = useAppStore((s) => s.addToast);
  const [iconFilter, setIconFilter] = React.useState('');

  const filteredIcons = React.useMemo(() => {
    const q = iconFilter.trim().toLowerCase();
    if (!q) return iconNames;
    return iconNames.filter((name) => name.toLowerCase().includes(q));
  }, [iconFilter]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold m-0">
          Workspace Settings &amp; Design System
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1 m-0">
          Configure appearance, safety defaults, and inspect the wired DataPilot asset pack.
        </p>
      </div>

      {/* Appearance & Execution Guard Preferences */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-display font-bold m-0">Theme Preference</h2>
              <p className="text-xs text-[var(--text-muted)] m-0 mt-0.5">
                Respects <code>prefers-color-scheme</code> with manual override.
              </p>
            </div>
            <Badge variant="engine">{theme.toUpperCase()}</Badge>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {(['light', 'dark', 'system'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setTheme(mode);
                  addToast({
                    title: `Theme set to ${mode}`,
                    variant: 'info',
                  });
                }}
                className={`dp-btn justify-center capitalize ${
                  theme === mode ? 'dp-btn--primary' : 'dp-btn--secondary'
                }`}
              >
                <Icon
                  name={mode === 'light' ? 'sun' : mode === 'dark' ? 'moon' : 'settings'}
                  size={16}
                />
                {mode}
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-display font-bold m-0">
                Default Query Execution Mode
              </h2>
              <p className="text-xs text-[var(--text-muted)] m-0 mt-0.5">
                Read-only blocks all DDL/DML statements at the AST parser level.
              </p>
            </div>
            <Badge variant={readOnlyMode ? 'readonly' : 'write'} icon="read-only">
              {readOnlyMode ? 'Read-only' : 'Write enabled'}
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant={readOnlyMode ? 'primary' : 'secondary'}
              size="sm"
              leftIcon="read-only"
              onClick={() => {
                setReadOnlyMode(true);
                addToast({
                  title: 'Strict Read-only mode enabled',
                  description: 'Only SELECT and EXPLAIN queries are permitted.',
                  variant: 'success',
                });
              }}
            >
              Enforce Read-only (Recommended)
            </Button>
            <Button
              variant={!readOnlyMode ? 'danger' : 'secondary'}
              size="sm"
              leftIcon="write-access"
              onClick={() => {
                setReadOnlyMode(false);
                addToast({
                  title: 'Write preview mode enabled',
                  description: 'Write queries still require transaction impact confirmation.',
                  variant: 'warning',
                });
              }}
            >
              Allow Write Preview
            </Button>
          </div>
        </Card>
      </div>

      {/* Design System Verification Showcase */}
      <Card className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-4">
          <div>
            <h2 className="text-lg font-display font-bold m-0">
              DataPilot Asset Pack &amp; Token Verification
            </h2>
            <p className="text-xs text-[var(--text-muted)] m-0 mt-0.5">
              Loaded from <code>styles/tokens.css</code>, <code>tailwind.preset.js</code>,{' '}
              <code>chart-theme.ts</code>, and <code>Icon.tsx</code> ({iconNames.length}{' '}
              icons).
            </p>
          </div>
          <Badge variant="readonly" icon="shield-check">
            WCAG AA Verified
          </Badge>
        </div>

        {/* Palette Swatches */}
        <div>
          <h3 className="text-sm font-display font-bold mb-3">
            Brand, Semantic &amp; Chart Palette
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            {chartColors.map((hex, i) => (
              <div
                key={hex}
                className="p-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] flex items-center gap-2.5"
              >
                <span
                  className="w-6 h-6 rounded-[6px] shrink-0 border border-black/10"
                  style={{ backgroundColor: hex }}
                />
                <div className="min-w-0">
                  <span className="block text-[11px] font-semibold">Chart {i + 1}</span>
                  <span className="block text-[11px] font-mono text-[var(--text-muted)]">
                    {hex}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Typography Specimens */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-[10px] bg-[var(--surface-2)] border border-[var(--border)]">
            <span className="text-xs font-mono text-[var(--text-muted)]">
              --font-display (Bricolage Grotesque)
            </span>
            <p className="font-display text-xl font-bold mt-1 mb-0">
              Talk to your database.
            </p>
          </div>
          <div className="p-4 rounded-[10px] bg-[var(--surface-2)] border border-[var(--border)]">
            <span className="text-xs font-mono text-[var(--text-muted)]">
              --font-body (IBM Plex Sans)
            </span>
            <p className="font-sans text-sm mt-1 mb-0">
              Calm, precise, high-signal interface text for data teams.
            </p>
          </div>
          <div className="p-4 rounded-[10px] bg-[var(--surface-2)] border border-[var(--border)]">
            <span className="text-xs font-mono text-[var(--text-muted)]">
              --font-mono (JetBrains Mono)
            </span>
            <p className="font-mono text-sm mt-1 mb-0">
              SELECT count(*) FROM orders WHERE total &gt; 100;
            </p>
          </div>
        </div>

        {/* 72 Custom Icons Explorer */}
        <div className="pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-display font-bold m-0">
              Supplied Icon Sprite ({filteredIcons.length} of {iconNames.length})
            </h3>
            <div className="w-full sm:w-64">
              <Input
                placeholder="Filter 72 icons..."
                value={iconFilter}
                onChange={(e) => setIconFilter(e.target.value)}
                aria-label="Filter icons"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2 max-h-64 overflow-y-auto p-1">
            {filteredIcons.map((name) => (
              <div
                key={name}
                title={name}
                className="p-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] flex flex-col items-center justify-center gap-1.5 text-center"
              >
                <Icon name={name} size={18} />
                <span className="text-[10px] font-mono text-[var(--text-muted)] truncate w-full">
                  {name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {user && (
        <Card className="p-5 flex items-center justify-between">
          <div className="text-xs text-[var(--text-muted)]">
            Signed in as <strong className="text-[var(--text)]">{user.email}</strong> · User
            ID: <code>{user.id}</code>
          </div>
          <Badge variant="readonly">Session Active</Badge>
        </Card>
      )}
    </div>
  );
}

