'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Icon } from '@datapilot/ui';
import { type ThemeMode, useAppStore } from '@/lib/store';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  );

  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const setResolvedTheme = useAppStore((s) => s.setResolvedTheme);
  const toasts = useAppStore((s) => s.toasts);
  const removeToast = useAppStore((s) => s.removeToast);

  React.useEffect(() => {
    const saved = window.localStorage.getItem('dp_theme') as ThemeMode | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      setTheme(saved);
    }
  }, [setTheme]);

  React.useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const resolved: 'light' | 'dark' =
        theme === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : theme;
      root.setAttribute('data-theme', resolved);
      if (resolved === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
      setResolvedTheme(resolved);
    };

    applyTheme();
    mediaQuery.addEventListener('change', applyTheme);
    return () => mediaQuery.removeEventListener('change', applyTheme);
  }, [theme, setResolvedTheme]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Accessible Toast Region */}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((toast) => {
          const borderAccent =
            toast.variant === 'success'
              ? 'border-l-4 border-l-success'
              : toast.variant === 'danger'
                ? 'border-l-4 border-l-danger'
                : toast.variant === 'warning'
                  ? 'border-l-4 border-l-warning'
                  : 'border-l-4 border-l-brand';
          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto dp-card p-3.5 flex items-start justify-between gap-3 shadow-md ${borderAccent}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text)] m-0">{toast.title}</p>
                {toast.description && (
                  <p className="text-xs text-[var(--text-muted)] mt-1 m-0">
                    {toast.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => removeToast(toast.id)}
                className="dp-btn dp-btn--ghost dp-btn--sm p-1 h-6 w-6 justify-center"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </QueryClientProvider>
  );
}

