'use client';

import * as React from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';

export function BrandLogo({
  href = '/',
  collapsed = false,
  withTagline = false,
}: {
  href?: string;
  collapsed?: boolean;
  withTagline?: boolean;
}) {
  const resolvedTheme = useAppStore((s) => s.resolvedTheme);

  const horizontalSrc =
    resolvedTheme === 'dark'
      ? withTagline
        ? '/logo/datapilot-logo-tagline-dark.svg'
        : '/logo/datapilot-logo-horizontal-dark.svg'
      : withTagline
        ? '/logo/datapilot-logo-tagline-light.svg'
        : '/logo/datapilot-logo-horizontal-light.svg';

  const markSrc =
    resolvedTheme === 'dark'
      ? '/logo/datapilot-mark-transparent-dark.svg'
      : '/logo/datapilot-mark-transparent-light.svg';

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2.5 no-underline focus-visible:rounded-[10px]"
      aria-label="DataPilot AI home"
    >
      {collapsed ? (
        <img
          src={markSrc}
          alt="DataPilot AI"
          width={32}
          height={32}
          className="h-8 w-8 shrink-0"
        />
      ) : (
        <img
          src={horizontalSrc}
          alt="DataPilot AI"
          width={withTagline ? 200 : 156}
          height={withTagline ? 42 : 32}
          className={withTagline ? 'h-9 w-auto' : 'h-7 w-auto'}
        />
      )}
    </Link>
  );
}

