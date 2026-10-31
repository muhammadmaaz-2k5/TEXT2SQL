'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoginInputSchema } from '@datapilot/types';
import { Button, Card, Icon, Input } from '@datapilot/ui';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { apiClient } from '@/lib/api';
import { useAppStore } from '@/lib/store';

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAppStore((s) => s.setSession);
  const addToast = useAppStore((s) => s.addToast);

  const [email, setEmail] = React.useState('pilot@datapilot.ai');
  const [password, setPassword] = React.useState('DataPilot2026!');
  const [fieldErrors, setFieldErrors] = React.useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isDemoLoading, setIsDemoLoading] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const parsed = LoginInputSchema.safeParse({ email, password });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        email: flat.email?.[0],
        password: flat.password?.[0],
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await apiClient.login(parsed.data);
      setSession(session.user, session.accessToken);
      addToast({
        title: `Welcome back, ${session.user.name}`,
        description: 'Session secured with httpOnly cookies.',
        variant: 'success',
      });
      router.push('/app/databases');
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Could not verify credentials. Check your email and password.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoSignIn = async () => {
    setFormError(null);
    setIsDemoLoading(true);
    try {
      const session = await apiClient.loginDemo();
      setSession(session.user, session.accessToken);
      addToast({
        title: 'Signed in to Demo Workspace',
        description: 'Organization: Acme Data Team (Owner)',
        variant: 'success',
      });
      router.push('/app/databases');
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Demo sign-in failed. Ensure the API server is running.',
      );
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[var(--bg)] text-[var(--text)] p-4 sm:p-6">
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between">
        <BrandLogo href="/" />
        <ThemeToggle />
      </header>

      <main className="w-full max-w-md mx-auto my-8">
        <Card className="p-6 sm:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-display font-bold mb-1.5">Sign in to DataPilot</h1>
            <p className="text-sm text-[var(--text-muted)] m-0">
              Connect to your organization&apos;s databases and saved dashboards.
            </p>
          </div>

          {formError && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-[10px] border border-danger/40 bg-danger/10 text-xs text-danger flex items-start gap-2.5"
            >
              <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* 1-Click Demo Workspace Button */}
          <div className="mb-5">
            <Button
              type="button"
              variant="accent"
              leftIcon="sparkle"
              isLoading={isDemoLoading}
              onClick={() => void handleDemoSignIn()}
              className="w-full justify-center font-semibold"
            >
              Continue with Demo Workspace (1-click)
            </Button>
          </div>

          <div className="relative flex items-center justify-center my-5">
            <div className="border-t border-[var(--border)] w-full" />
            <span className="bg-[var(--surface)] px-3 text-xs text-[var(--text-muted)] shrink-0">
              or sign in with email
            </span>
            <div className="border-t border-[var(--border)] w-full" />
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
            <Input
              label="Work email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldErrors.email}
              placeholder="you@company.com"
            />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="dp-label m-0">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-brand no-underline hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={fieldErrors.password}
                placeholder="••••••••••••"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              className="w-full justify-center mt-2"
            >
              Sign in
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-[var(--text-muted)] m-0">
            New to DataPilot?{' '}
            <Link href="/signup" className="font-medium text-brand no-underline hover:underline">
              Create an organization account
            </Link>
          </p>
        </Card>
      </main>

      <footer className="text-center text-xs text-[var(--text-muted)]">
        Protected by JWT httpOnly cookies &amp; AES-256-GCM credential encryption.
      </footer>
    </div>
  );
}

