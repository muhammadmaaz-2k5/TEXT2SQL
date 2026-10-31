'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Icon, type IconName } from '@datapilot/ui';
import { useAppStore } from '@/lib/store';

interface CommandAction {
  id: string;
  label: string;
  category: 'Navigation' | 'Database' | 'Workspace';
  icon: IconName;
  shortcut?: string;
  onSelect: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const open = useAppStore((s) => s.commandPaletteOpen);
  const setOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const resolvedTheme = useAppStore((s) => s.resolvedTheme);
  const setTheme = useAppStore((s) => s.setTheme);
  const databases = useAppStore((s) => s.databases);
  const setActiveDatabaseId = useAppStore((s) => s.setActiveDatabaseId);
  const addToast = useAppStore((s) => s.addToast);

  const [query, setQuery] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(!open);
      } else if (event.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, setOpen]);

  React.useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const actions = React.useMemo<CommandAction[]>(() => {
    const navItems: CommandAction[] = [
      {
        id: 'nav-databases',
        label: 'Go to Databases',
        category: 'Navigation',
        icon: 'database',
        shortcut: 'G D',
        onSelect: () => router.push('/app/databases'),
      },
      {
        id: 'nav-ask',
        label: 'Ask AI (Plain English to SQL)',
        category: 'Navigation',
        icon: 'ai-chat',
        shortcut: 'G A',
        onSelect: () => router.push('/app/query'),
      },
      {
        id: 'nav-sql-editor',
        label: 'Open SQL Editor',
        category: 'Navigation',
        icon: 'sql-editor',
        shortcut: 'G E',
        onSelect: () => router.push('/app/editor'),
      },
      {
        id: 'nav-schema',
        label: 'Open Schema Designer & ER Canvas',
        category: 'Navigation',
        icon: 'schema-designer',
        shortcut: 'G S',
        onSelect: () => router.push('/app/schema'),
      },
      {
        id: 'nav-schema-ai',
        label: 'Schema AI: Describe Business to Generate Tables',
        category: 'Navigation',
        icon: 'schema-ai',
        onSelect: () => router.push('/app/schema?tab=schema-ai'),
      },
      {
        id: 'nav-seed',
        label: 'Realistic Seed Data Generator (1-500 rows)',
        category: 'Navigation',
        icon: 'seed',
        onSelect: () => router.push('/app/schema?tab=seed'),
      },
      {
        id: 'nav-csv-import',
        label: 'CSV Import with PostgreSQL Type Inference',
        category: 'Navigation',
        icon: 'csv-upload',
        onSelect: () => router.push('/app/schema?tab=csv-import'),
      },
      {
        id: 'nav-optimizer',
        label: 'Open Query Optimizer & Explain Plans',
        category: 'Navigation',
        icon: 'optimize',
        onSelect: () => router.push('/app/optimizer'),
      },
      {
        id: 'nav-dashboards',
        label: 'Go to Dashboards',
        category: 'Navigation',
        icon: 'dashboard',
        onSelect: () => router.push('/app/dashboards'),
      },
      {
        id: 'nav-history',
        label: 'Search Query History',
        category: 'Navigation',
        icon: 'history',
        onSelect: () => router.push('/app/history'),
      },
      {
        id: 'nav-api-keys',
        label: 'Manage API Keys & REST Endpoint',
        category: 'Navigation',
        icon: 'api-key',
        onSelect: () => router.push('/app/api-keys'),
      },
      {
        id: 'nav-team',
        label: 'Manage Team & Organization Roles',
        category: 'Navigation',
        icon: 'users',
        onSelect: () => router.push('/app/team'),
      },
      {
        id: 'nav-settings',
        label: 'Workspace Settings & Design System',
        category: 'Navigation',
        icon: 'settings',
        onSelect: () => router.push('/app/settings'),
      },
    ];

    const dbItems: CommandAction[] = databases.map((db) => ({
      id: `db-${db.id}`,
      label: `Switch active database to ${db.name}`,
      category: 'Database',
      icon: 'connect',
      onSelect: () => {
        setActiveDatabaseId(db.id);
        addToast({
          title: `Active database set to ${db.name}`,
          description: `Mode: ${db.readOnlyDefault ? 'Read-only enforced' : 'Write enabled'}`,
          variant: 'info',
        });
      },
    }));

    const workspaceItems: CommandAction[] = [
      {
        id: 'ws-theme',
        label:
          resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        category: 'Workspace',
        icon: resolvedTheme === 'dark' ? 'sun' : 'moon',
        onSelect: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
      },
    ];

    return [...navItems, ...dbItems, ...workspaceItems];
  }, [databases, resolvedTheme, router, setActiveDatabaseId, setTheme, addToast]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) || a.category.toLowerCase().includes(q),
    );
  }, [actions, query]);

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  const handleListKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(filtered.length, 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex(
        (prev) => (prev - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1),
      );
    } else if (event.key === 'Enter' && filtered[selectedIndex]) {
      event.preventDefault();
      filtered[selectedIndex].onSelect();
      setOpen(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Global command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/50 backdrop-blur-[1px]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-[var(--surface)] border border-[var(--border)] rounded-[16px] shadow-[var(--shadow-pop)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleListKeyDown}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
          <Icon name="search" size={18} className="text-[var(--text-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to screen, switch database, or run an action..."
            aria-label="Search commands"
            className="w-full bg-transparent border-0 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <kbd className="px-2 py-0.5 text-xs rounded bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]">
            Esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">
              No matching commands for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => {
                    item.onSelect();
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[10px] text-left text-sm transition-colors ${
                    isSelected
                      ? 'bg-brand-50 text-brand-700 dark:bg-navy-700 dark:text-brand-300'
                      : 'text-[var(--text)] hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon name={item.icon} size={17} className="shrink-0" />
                    <span className="truncate font-medium">{item.label}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <Badge variant="neutral">{item.category}</Badge>
                    {item.shortcut && (
                      <kbd className="text-[11px] font-mono text-[var(--text-muted)]">
                        {item.shortcut}
                      </kbd>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

