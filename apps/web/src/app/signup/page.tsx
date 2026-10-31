'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SignupInputSchema } from '@datapilot/types';
import { Button, Card, Icon, Input } from '@datapilot/ui';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { apiClient } from '@/lib/api';
import { useAppStore } from '@/lib/store';

export default function SignupPage() {
  const router = useRouter();
  const setSession = useAppStore((s) => s.setSession);
  const addToast = useAppStore((s) => s.addToast);

  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [organizationName, setOrganizationName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<{
    name?: string;
    email?: string;
    organizationName?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const parsed = SignupInputSchema.safeParse({
      name,
      email,
      organizationName,
      password,
    });

    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        name: flat.name?.[0],
        email: flat.email?.[0],
        organizationName: flat.organizationName?.[0],
        password: flat.password?.[0],
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await apiClient.signup(parsed.data);
      setSession(session.user, session.accessToken);
      addToast({
        title: 'Workspace provisioned',
        description: `Created ${parsed.data.organizationName} with Shop Analytics demo DB.`,
        variant: 'success',
      });
      router.push('/app/databases');
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Account creation could not be completed. Check your inputs and try again.',
      );
    } finally {
      setIsSubmitting(false);
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
            <h1 className="text-2xl font-display font-bold mb-1.5">
              Create your DataPilot workspace
            </h1>
            <p className="text-sm text-[var(--text-muted)] m-0">
              Includes a pre-seeded Shop Analytics PostgreSQL database so you can run
              queries immediately.
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

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
            <Input
              label="Full name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={fieldErrors.name}
              placeholder="Alex Rivera"
            />

            <Input
              label="Work email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldErrors.email}
              placeholder="alex@company.com"
            />

            <Input
              label="Organization name"
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              error={fieldErrors.organizationName}
              placeholder="Acme Analytics"
            />

            <Input
              label="Password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
              hint="Minimum 8 characters."
              placeholder="Create a strong password"
            />

            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              className="w-full justify-center mt-2"
            >
              Create account &amp; workspace
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-[var(--text-muted)] m-0">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-brand no-underline hover:underline">
              Sign in
            </Link>
          </p>
        </Card>
      </main>

      <footer className="text-center text-xs text-[var(--text-muted)]">
        Read-only mode enforced by default on all new database connections.
      </footer>
    </div>
  );
}

