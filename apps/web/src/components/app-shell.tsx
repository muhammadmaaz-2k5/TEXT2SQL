'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Badge, Button, Icon, type IconName, Skeleton } from '@datapilot/ui';
import { BrandLogo } from './brand-logo';
import { CommandPalette } from './command-palette';
import { ThemeToggle } from './theme-toggle';
import { apiClient } from '@/lib/api';
import { useAppStore } from '@/lib/store';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  badge?: string;
}

const PRIMARY_NAV: NavItem[] = [
  { href: '/app/databases', label: 'Databases', icon: 'database' },
  { href: '/app/query', label: 'Query (Ask AI)', icon: 'ai-chat', badge: 'Pilot' },
  { href: '/app/editor', label: 'SQL editor', icon: 'sql-editor' },
  { href: '/app/dashboards', label: 'Dashboards', icon: 'dashboard' },
  { href: '/app/history', label: 'History', icon: 'history' },
  { href: '/app/schema', label: 'Schema', icon: 'schema-designer' },
  { href: '/app/optimizer', label: 'Optimizer', icon: 'optimize' },
  { href: '/app/api-keys', label: 'API keys', icon: 'api-key' },
  { href: '/app/team', label: 'Team', icon: 'users' },
  { href: '/app/settings', label: 'Settings', icon: 'settings' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const user = useAppStore((s) => s.user);
  const setSession = useAppStore((s) => s.setSession);
  const databases = useAppStore((s) => s.databases);
  const setDatabases = useAppStore((s) => s.setDatabases);
  const activeDatabaseId = useAppStore((s) => s.activeDatabaseId);
  const setActiveDatabaseId = useAppStore((s) => s.setActiveDatabaseId);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const mobileNavOpen = useAppStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useAppStore((s) => s.setMobileNavOpen);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const readOnlyMode = useAppStore((s) => s.readOnlyMode);
  const addToast = useAppStore((s) => s.addToast);

  const [authChecking, setAuthChecking] = React.useState(true);
  const [orgMenuOpen, setOrgMenuOpen] = React.useState(false);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    async function bootstrapSession() {
      try {
        const { user: fetchedUser } = await apiClient.me();
        if (!active) return;
        setSession(fetchedUser, window.localStorage.getItem('dp_access_token'));
        const { databases: dbList } = await apiClient.listDatabases();
        if (active) setDatabases(dbList);
      } catch {
        // Automatically initialize Demo session if unauthenticated so first-run is frictionless
        try {
          const demoSession = await apiClient.loginDemo();
          if (!active) return;
          setSession(demoSession.user, demoSession.accessToken);
          const { databases: dbList } = await apiClient.listDatabases();
          if (active) setDatabases(dbList);
        } catch {
          if (active) router.push('/login');
        }
      } finally {
        if (active) setAuthChecking(false);
      }
    }
    void bootstrapSession();
    return () => {
      active = false;
    };
  }, [router, setDatabases, setSession]);

  const activeOrg = React.useMemo(
    () =>
      user?.organizations.find((o) => o.id === user.activeOrganizationId) ??
      user?.organizations[0],
    [user],
  );

  const activeDatabase = React.useMemo(
    () => databases.find((d) => d.id === activeDatabaseId) ?? databases[0],
    [databases, activeDatabaseId],
  );

  const handleSwitchOrg = async (orgId: string) => {
    setOrgMenuOpen(false);
    if (!user || orgId === user.activeOrganizationId) return;
    try {
      const updatedSession = await apiClient.switchOrganization(orgId);
      setSession(updatedSession.user, updatedSession.accessToken);
      const { databases: dbList } = await apiClient.listDatabases();
      setDatabases(dbList);
      const switchedOrg = updatedSession.user.organizations.find((o) => o.id === orgId);
      addToast({
        title: `Switched to ${switchedOrg?.name ?? 'organization'}`,
        description: `Role: ${switchedOrg?.role ?? 'MEMBER'}`,
        variant: 'info',
      });
    } catch (err) {
      addToast({
        title: 'Could not switch organization',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'danger',
      });
    }
  };

  const handleLogout = async () => {
    setUserMenuOpen(false);
    try {
      await apiClient.logout();
    } catch {
      // Ignore logout network error
    }
    setSession(null, null);
    addToast({
      title: 'Signed out',
      description: 'Your session cookies have been cleared.',
      variant: 'info',
    });
    router.push('/login');
  };

  const renderSidebarLinks = (isMobile = false) => (
    <nav className="dp-nav flex flex-col gap-1 px-3 py-4 flex-1" aria-label="Primary">
      {PRIMARY_NAV.map((item) => {
        const isCurrent =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isCurrent ? 'page' : undefined}
            onClick={() => {
              if (isMobile) setMobileNavOpen(false);
            }}
            title={sidebarCollapsed && !isMobile ? item.label : undefined}
            className={`flex items-center justify-between gap-2.5 ${
              sidebarCollapsed && !isMobile ? 'justify-center px-2' : ''
            }`}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Icon name={item.icon} size={18} className="shrink-0" />
              {(!sidebarCollapsed || isMobile) && (
                <span className="truncate">{item.label}</span>
              )}
            </span>
            {(!sidebarCollapsed || isMobile) && item.badge && (
              <span className="px-1.5 py-0.5 text-[11px] font-semibold rounded-full bg-accent/20 text-[#B54708] dark:text-accent-300">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-[var(--bg)] text-[var(--text)]">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-[width] duration-150 shrink-0 ${
          sidebarCollapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div
          className={`h-14 flex items-center justify-between border-b border-[var(--border)] px-3.5 ${
            sidebarCollapsed ? 'justify-center' : ''
          }`}
        >
          <BrandLogo href="/app/databases" collapsed={sidebarCollapsed} />
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="dp-btn dp-btn--ghost dp-btn--sm w-7 h-7 p-0 justify-center"
            >
              <Icon name="menu" size={16} />
            </button>
          )}
        </div>

        {renderSidebarLinks(false)}

        <div className="p-3 border-t border-[var(--border)]">
          {sidebarCollapsed ? (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="dp-btn dp-btn--ghost dp-btn--sm w-full justify-center p-0"
            >
              <Icon name="chevron-right" size={16} />
            </button>
          ) : (
            <div className="rounded-[10px] bg-[var(--surface-2)] p-3 border border-[var(--border)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--text)] flex items-center gap-1.5">
                  <Icon name="shield-check" size={15} className="text-success" />
                  SQL Guard Active
                </span>
                <Badge variant={readOnlyMode ? 'readonly' : 'write'}>
                  {readOnlyMode ? 'Read-only' : 'Write'}
                </Badge>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-1.5 mb-0 leading-relaxed">
                AST validation &amp; statement timeouts enforced on every query.
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileNavOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className="fixed inset-0 z-50 md:hidden flex bg-black/50"
          onClick={() => setMobileNavOpen(false)}
        >
          <div
            className="w-64 max-w-[82vw] bg-[var(--surface)] h-full flex flex-col border-r border-[var(--border)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-14 flex items-center justify-between px-4 border-b border-[var(--border)]">
              <BrandLogo href="/app/databases" />
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileNavOpen(false)}
                className="dp-btn dp-btn--ghost dp-btn--sm w-8 h-8 p-0 justify-center"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            {renderSidebarLinks(true)}
          </div>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 border-b border-[var(--border)] bg-[var(--surface)] px-3 sm:px-6 flex items-center justify-between gap-2 sticky top-0 z-30">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden dp-btn dp-btn--secondary dp-btn--sm w-9 h-9 p-0 justify-center shrink-0"
            >
              <Icon name="menu" size={18} />
            </button>

            {/* Organization Switcher */}
            <div className="relative">
              <button
                type="button"
                aria-label="Switch organization"
                aria-expanded={orgMenuOpen}
                onClick={() => {
                  setOrgMenuOpen((prev) => !prev);
                  setUserMenuOpen(false);
                }}
                className="dp-btn dp-btn--secondary dp-btn--sm px-2.5 sm:px-3"
              >
                <Icon name="organization" size={16} className="text-brand shrink-0" />
                <span className="truncate max-w-[110px] sm:max-w-[160px] font-medium">
                  {authChecking ? 'Loading...' : activeOrg?.name ?? 'Workspace'}
                </span>
                <Icon name="chevron-down" size={14} className="text-[var(--text-muted)]" />
              </button>

              {orgMenuOpen && user && (
                <div
                  role="menu"
                  className="absolute left-0 mt-1.5 w-64 rounded-[12px] bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-md)] p-1.5 z-40"
                >
                  <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Organizations
                  </div>
                  {user.organizations.map((org) => {
                    const isCurrent = org.id === user.activeOrganizationId;
                    return (
                      <button
                        key={org.id}
                        type="button"
                        role="menuitem"
                        onClick={() => void handleSwitchOrg(org.id)}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-[8px] text-sm text-left ${
                          isCurrent
                            ? 'bg-brand-50 text-brand-700 dark:bg-navy-700 dark:text-brand-300 font-medium'
                            : 'hover:bg-[var(--surface-2)] text-[var(--text)]'
                        }`}
                      >
                        <span className="truncate">{org.name}</span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          <Badge variant="neutral">{org.role}</Badge>
                          {isCurrent && <Icon name="check" size={14} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Active Database Selector */}
            {databases.length > 0 && (
              <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-[var(--border)]">
                <Icon name="database" size={15} className="text-[var(--text-muted)]" />
                <select
                  aria-label="Active database connection"
                  value={activeDatabase?.id ?? ''}
                  onChange={(e) => setActiveDatabaseId(e.target.value)}
                  className="bg-transparent text-sm font-medium text-[var(--text)] outline-none cursor-pointer pr-1"
                >
                  {databases.map((db) => (
                    <option
                      key={db.id}
                      value={db.id}
                      className="bg-[var(--surface)] text-[var(--text)]"
                    >
                      {db.name}
                    </option>
                  ))}
                </select>
                <Badge variant={readOnlyMode ? 'readonly' : 'write'} icon="read-only">
                  {readOnlyMode ? 'Read-only' : 'Write mode'}
                </Badge>
              </div>
            )}
          </div>

          {/* Right Controls: Command Palette, Theme Toggle, User Menu */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              aria-label="Open command palette (Ctrl+K or Cmd+K)"
              className="dp-btn dp-btn--secondary dp-btn--sm px-2.5 text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <Icon name="search" size={15} />
              <span className="hidden sm:inline text-xs">Search or jump...</span>
              <kbd className="hidden sm:inline-block ml-2 px-1.5 py-0.5 text-[11px] font-mono bg-[var(--surface-2)] border border-[var(--border)] rounded">
                ⌘K
              </kbd>
            </button>

            <ThemeToggle />

            {/* User Menu */}
            <div className="relative">
              <button
                type="button"
                aria-label="Open user account menu"
                aria-expanded={userMenuOpen}
                onClick={() => {
                  setUserMenuOpen((prev) => !prev);
                  setOrgMenuOpen(false);
                }}
                className="dp-btn dp-btn--secondary dp-btn--sm pl-2 pr-2.5 gap-2"
              >
                <span className="w-6 h-6 rounded-full bg-brand text-white text-xs font-semibold inline-flex items-center justify-center shrink-0">
                  {user?.name ? user.name.charAt(0).toUpperCase() : 'P'}
                </span>
                <span className="hidden sm:inline text-xs font-medium truncate max-w-[110px]">
                  {authChecking ? 'Loading' : user?.name ?? 'Guest'}
                </span>
                <Icon name="chevron-down" size={14} className="text-[var(--text-muted)]" />
              </button>

              {userMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-1.5 w-64 rounded-[12px] bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-md)] p-1.5 z-40"
                >
                  <div className="px-3 py-2 border-b border-[var(--border)]">
                    <p className="text-sm font-semibold text-[var(--text)] m-0 truncate">
                      {user?.name}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] m-0 truncate">
                      {user?.email}
                    </p>
                    {activeOrg && (
                      <div className="mt-2">
                        <Badge variant="engine" icon="role-badge">
                          {activeOrg.role} · {activeOrg.name}
                        </Badge>
                      </div>
                    )}
                  </div>
                  <div className="py-1">
                    <Link
                      href="/app/settings"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-sm text-[var(--text)] no-underline hover:bg-[var(--surface-2)]"
                    >
                      <Icon name="settings" size={16} />
                      Workspace settings
                    </Link>
                    <Link
                      href="/app/api-keys"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-sm text-[var(--text)] no-underline hover:bg-[var(--surface-2)]"
                    >
                      <Icon name="api-key" size={16} />
                      API keys
                    </Link>
                  </div>
                  <div className="pt-1 border-t border-[var(--border)]">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleLogout()}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-sm text-danger hover:bg-[var(--surface-2)] text-left"
                    >
                      <Icon name="logout" size={16} />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Workspace Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {authChecking ? (
            <div className="space-y-4">
              <Skeleton className="h-9 w-64" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
              </div>
              <Skeleton className="h-80" />
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      <CommandPalette />
    </div>
  );
}

