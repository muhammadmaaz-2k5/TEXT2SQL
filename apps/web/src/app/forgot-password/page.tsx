'use client';

import * as React from 'react';
import Link from 'next/link';
import { ForgotPasswordInputSchema } from '@datapilot/types';
import { Button, Card, Icon, Input } from '@datapilot/ui';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { apiClient } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  const [submittedMessage, setSubmittedMessage] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(undefined);

    const parsed = ForgotPasswordInputSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.flatten().fieldErrors.email?.[0]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiClient.forgotPassword(parsed.data);
      setSubmittedMessage(response.message);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not send reset link. Verify your email address and try again.',
      );
    } finally {
      setIsLoading(false);
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
          <h1 className="text-2xl font-display font-bold mb-1.5">Reset your password</h1>
          <p className="text-sm text-[var(--text-muted)] mb-6">
            Enter your work email and we will send a single-use password reset link.
          </p>

          {submittedMessage ? (
            <div className="p-4 rounded-[10px] border border-success/40 bg-success/10 text-sm text-[var(--text)] space-y-3">
              <div className="flex items-center gap-2 text-success font-semibold">
                <Icon name="check" size={18} />
                <span>Reset instructions queued</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] m-0">{submittedMessage}</p>
              <Link
                href="/login"
                className="dp-btn dp-btn--secondary dp-btn--sm no-underline mt-2"
              >
                Return to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
              <Input
                label="Account email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={error}
                placeholder="you@company.com"
              />
              <Button
                type="submit"
                variant="primary"
                isLoading={isLoading}
                className="w-full justify-center"
              >
                Send reset link
              </Button>
            </form>
          )}

          <p className="mt-6 text-center text-xs text-[var(--text-muted)] m-0">
            Remembered your password?{' '}
            <Link href="/login" className="font-medium text-brand no-underline hover:underline">
              Back to sign in
            </Link>
          </p>
        </Card>
      </main>

      <footer className="text-center text-xs text-[var(--text-muted)]">
        DataPilot AI Security
      </footer>
    </div>
  );
}

