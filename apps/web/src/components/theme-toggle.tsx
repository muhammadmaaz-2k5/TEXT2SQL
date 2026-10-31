'use client';

import * as React from 'react';
import { Icon } from '@datapilot/ui';
import { useAppStore } from '@/lib/store';

export function ThemeToggle() {
  const resolvedTheme = useAppStore((s) => s.resolvedTheme);
  const setTheme = useAppStore((s) => s.setTheme);

  const toggle = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
      }
      title={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="dp-btn dp-btn--secondary dp-btn--sm w-9 h-9 p-0 justify-center"
    >
      <Icon name={resolvedTheme === 'dark' ? 'sun' : 'moon'} size={17} />
    </button>
  );
}

