'use client';

import Link from 'next/link';
import { Card, Icon } from '@datapilot/ui';
import { useAppStore } from '@/lib/store';

export default function NotFoundPage() {
  const resolvedTheme = useAppStore((s) => s.resolvedTheme);
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] text-[var(--text)] p-6">
      <Card className="max-w-md w-full p-8 text-center flex flex-col items-center">
        <img
          src={
            resolvedTheme === 'dark'
              ? '/illustrations/empty-not-found-dark.svg'
              : '/illustrations/empty-not-found-light.svg'
          }
          alt="Page not found"
          className="w-56 h-auto mb-5"
        />
        <h1 className="text-2xl font-display font-bold mb-2">Page not found</h1>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          The page you requested does not exist or has moved. Return to your workspace to
          continue.
        </p>
        <div className="flex items-center gap-3">
          <Link href="/" className="dp-btn dp-btn--secondary no-underline">
            Home
          </Link>
          <Link href="/app/databases" className="dp-btn dp-btn--primary no-underline">
            <Icon name="database" size={16} />
            Open workspace
          </Link>
        </div>
      </Card>
    </div>
  );
}

