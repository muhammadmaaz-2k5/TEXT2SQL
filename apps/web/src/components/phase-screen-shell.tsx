'use client';

import * as React from 'react';
import Link from 'next/link';
import { Badge, Card, Icon, type IconName } from '@datapilot/ui';
import { useAppStore } from '@/lib/store';

export function PhaseScreenShell({
  title,
  subtitle,
  phaseBadge,
  icon,
  highlights,
  illustrationLight = '/illustrations/empty-no-queries-light.svg',
  illustrationDark = '/illustrations/empty-no-queries-dark.svg',
}: {
  title: string;
  subtitle: string;
  phaseBadge: string;
  icon: IconName;
  highlights: string[];
  illustrationLight?: string;
  illustrationDark?: string;
}) {
  const resolvedTheme = useAppStore((s) => s.resolvedTheme);
  const readOnlyMode = useAppStore((s) => s.readOnlyMode);
  const databases = useAppStore((s) => s.databases);
  const activeDatabaseId = useAppStore((s) => s.activeDatabaseId);
  const activeDb = databases.find((d) => d.id === activeDatabaseId) ?? databases[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant="engine" icon={icon}>
              {phaseBadge}
            </Badge>
            <Badge variant={readOnlyMode ? 'readonly' : 'write'} icon="read-only">
              {readOnlyMode ? 'Read-only enforced' : 'Write preview'}
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold m-0">{title}</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1 m-0">{subtitle}</p>
        </div>

        {activeDb && (
          <div className="dp-card px-3.5 py-2.5 flex items-center gap-2.5 text-xs">
            <Icon name="database" size={16} className="text-brand" />
            <div>
              <span className="text-[var(--text-muted)] block">Target database</span>
              <strong className="font-mono text-[var(--text)]">{activeDb.name}</strong>
            </div>
          </div>
        )}
      </div>

      <Card className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-7 space-y-4">
          <h2 className="text-xl font-display font-bold m-0">
            App Shell route wired &amp; ready for {phaseBadge}
          </h2>
          <p className="text-sm text-[var(--text-muted)] m-0">
            This screen is mounted inside the authenticated App Shell with active
            organization context, keyboard navigation (<code>⌘K</code>), and theme tokens.
          </p>
          <ul className="space-y-2 p-0 list-none text-sm">
            {highlights.map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <Icon name="check" size={16} className="text-success shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="pt-2 flex flex-wrap gap-2.5">
            <Link href="/app/databases" className="dp-btn dp-btn--primary dp-btn--sm no-underline">
              <Icon name="database" size={15} />
              View Databases
            </Link>
            <Link href="/app/settings" className="dp-btn dp-btn--secondary dp-btn--sm no-underline">
              <Icon name="settings" size={15} />
              Inspect Design System
            </Link>
          </div>
        </div>

        <div className="lg:col-span-5 flex justify-center">
          <img
            src={resolvedTheme === 'dark' ? illustrationDark : illustrationLight}
            alt={title}
            className="w-full max-w-xs h-auto rounded-[10px]"
          />
        </div>
      </Card>
    </div>
  );
}

