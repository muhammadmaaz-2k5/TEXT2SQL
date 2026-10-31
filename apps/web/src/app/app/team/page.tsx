'use client';

import * as React from 'react';
import type { OrgRole, TeamMemberItem } from '@datapilot/types';
import { Badge, Button, Card, Icon, Input, Skeleton } from '@datapilot/ui';
import { apiClient } from '@/lib/api';
import { useAppStore } from '@/lib/store';

const ROLES: OrgRole[] = ['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER'];

const PERMISSION_MATRIX: Array<{
  capability: string;
  description: string;
  OWNER: boolean;
  ADMIN: boolean;
  DEVELOPER: boolean;
  VIEWER: boolean;
}> = [
  {
    capability: 'Ask AI & Run Read-Only SQL (SELECT / EXPLAIN)',
    description: 'Query databases in Read-only mode, view charts, and run EXPLAIN plans.',
    OWNER: true,
    ADMIN: true,
    DEVELOPER: true,
    VIEWER: true,
  },
  {
    capability: 'Execute Write SQL (INSERT / UPDATE / DELETE)',
    description:
      'Run mutations inside a transaction after reviewing the Write Impact Preview.',
    OWNER: true,
    ADMIN: true,
    DEVELOPER: true,
    VIEWER: false,
  },
  {
    capability: 'Apply Schema DDL, Seed Data & Import CSV',
    description: 'Create tables, apply indexes, generate seed rows, and import CSV tables.',
    OWNER: true,
    ADMIN: true,
    DEVELOPER: true,
    VIEWER: false,
  },
  {
    capability: 'Provision & Connect Databases / Manage API Keys',
    description: 'Connect external PostgreSQL instances and issue or revoke API keys.',
    OWNER: true,
    ADMIN: true,
    DEVELOPER: true,
    VIEWER: false,
  },
  {
    capability: 'Invite Members & Modify Organization Roles',
    description: 'Invite teammates by email, change RBAC roles, and remove members.',
    OWNER: true,
    ADMIN: true,
    DEVELOPER: false,
    VIEWER: false,
  },
];

export default function TeamPage() {
  const user = useAppStore((s) => s.user);
  const addToast = useAppStore((s) => s.addToast);

  const activeOrg = React.useMemo(
    () =>
      user?.organizations.find((o) => o.id === user.activeOrganizationId) ??
      user?.organizations[0],
    [user],
  );

  const [members, setMembers] = React.useState<TeamMemberItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Invite form state
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteName, setInviteName] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState<OrgRole>('DEVELOPER');
  const [isInviting, setIsInviting] = React.useState(false);

  const loadMembers = React.useCallback(async () => {
    setLoading(true);
    try {
      const { members: data } = await apiClient.listTeamMembers();
      setMembers(data);
    } catch (err) {
      addToast({
        title: 'Failed to load team members',
        description: err instanceof Error ? err.message : 'Try refreshing the page.',
        variant: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  React.useEffect(() => {
    void loadMembers();
  }, [loadMembers, activeOrg?.id]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setIsInviting(true);
    try {
      const { member } = await apiClient.inviteTeamMember({
        email: inviteEmail.trim(),
        name: inviteName.trim() || undefined,
        role: inviteRole,
      });
      setMembers((prev) => {
        const exists = prev.some((m) => m.id === member.id);
        return exists
          ? prev.map((m) => (m.id === member.id ? member : m))
          : [...prev, member];
      });
      setInviteEmail('');
      setInviteName('');
      addToast({
        title: `Invited ${member.email}`,
        description: `Assigned role: ${member.role}.`,
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Could not send invitation',
        description: err instanceof Error ? err.message : 'Verify your role permissions.',
        variant: 'danger',
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: OrgRole) => {
    try {
      const { member } = await apiClient.updateTeamMemberRole(memberId, newRole);
      setMembers((prev) => prev.map((m) => (m.id === memberId ? member : m)));
      addToast({
        title: `Updated role for ${member.name}`,
        description: `Role changed to ${member.role}.`,
        variant: 'info',
      });
    } catch (err) {
      addToast({
        title: 'Could not update role',
        description: err instanceof Error ? err.message : 'Check organization permissions.',
        variant: 'danger',
      });
    }
  };

  const handleRemoveMember = async (member: TeamMemberItem) => {
    try {
      await apiClient.removeTeamMember(member.id);
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      addToast({
        title: `Removed ${member.name}`,
        description: `${member.email} no longer has access to ${activeOrg?.name ?? 'this workspace'}.`,
        variant: 'info',
      });
    } catch (err) {
      addToast({
        title: 'Cannot remove member',
        description:
          err instanceof Error
            ? err.message
            : 'The last Organization Owner cannot be removed.',
        variant: 'danger',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="engine" icon="organization">
              {activeOrg?.name ?? 'Acme Data Team'}
            </Badge>
            <Badge variant="readonly" icon="role-badge">
              Your role: {activeOrg?.role ?? 'OWNER'}
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold m-0">
            Team &amp; Role-Based Access Control
          </h1>
          <p className="text-sm text-[var(--text-muted)] m-0 mt-1">
            Manage workspace members, invite teammates by email, and govern read/write
            database permissions.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Invite Teammate Card */}
        <Card className="lg:col-span-4 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
            <Icon name="users" size={18} className="text-brand" />
            <div>
              <h2 className="text-base font-display font-bold m-0">Invite by Email</h2>
              <p className="text-xs text-[var(--text-muted)] m-0">
                Grant least-privilege access to your organization.
              </p>
            </div>
          </div>

          <form onSubmit={(e) => void handleInvite(e)} className="space-y-3.5">
            <Input
              label="Work email"
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@company.com"
            />

            <Input
              label="Full name (optional)"
              type="text"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="e.g. Elena Vance"
            />

            <div>
              <label className="dp-label" htmlFor="invite-role-select">
                Organization role
              </label>
              <select
                id="invite-role-select"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as OrgRole)}
                className="dp-select text-xs font-mono"
              >
                <option value="VIEWER">VIEWER — Read-only SQL &amp; Dashboards</option>
                <option value="DEVELOPER">
                  DEVELOPER — Read/Write SQL, Schema &amp; API Keys
                </option>
                <option value="ADMIN">
                  ADMIN — Full Database &amp; Team Administration
                </option>
                <option value="OWNER">OWNER — Organization Owner</option>
              </select>
            </div>

            <Button
              type="submit"
              variant="primary"
              leftIcon="plus"
              isLoading={isInviting}
              className="w-full justify-center"
            >
              Send workspace invite
            </Button>
          </form>
        </Card>

        {/* Right: Active Team Members List */}
        <Card className="lg:col-span-8 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div>
              <h2 className="text-base font-display font-bold m-0">
                Organization Members ({members.length})
              </h2>
              <p className="text-xs text-[var(--text-muted)] m-0">
                Role changes take effect immediately across all SQL Editor and AI pipelines.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2.5">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Status</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td>
                        <div className="font-sans font-semibold text-sm text-[var(--text)]">
                          {member.name}
                        </div>
                        <div className="font-mono text-xs text-[var(--text-muted)]">
                          {member.email}
                        </div>
                      </td>
                      <td>
                        <Badge
                          variant={member.status === 'ACTIVE' ? 'readonly' : 'write'}
                        >
                          {member.status}
                        </Badge>
                      </td>
                      <td>
                        <select
                          aria-label={`Role for ${member.name}`}
                          value={member.role}
                          onChange={(e) =>
                            void handleRoleChange(member.id, e.target.value as OrgRole)
                          }
                          className="dp-select h-8 text-xs font-mono max-w-[145px]"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="text-xs text-[var(--text-muted)]">
                        {new Date(member.joinedAt).toLocaleDateString()}
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          aria-label={`Remove ${member.name}`}
                          onClick={() => void handleRemoveMember(member)}
                          className="dp-btn dp-btn--ghost dp-btn--sm text-danger h-7 px-2"
                        >
                          <Icon name="destructive" size={14} />
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* RBAC Permission Matrix */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div>
            <h2 className="text-base font-display font-bold m-0">
              Role Permission Matrix
            </h2>
            <p className="text-xs text-[var(--text-muted)] m-0">
              Enforced by @datapilot/sql-guard and PostgresEngineService on every query.
            </p>
          </div>
          <Badge variant="readonly" icon="shield-check">
            Strict RBAC Enforcement
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="dp-table">
            <thead>
              <tr>
                <th>Capability</th>
                <th className="text-center">OWNER</th>
                <th className="text-center">ADMIN</th>
                <th className="text-center">DEVELOPER</th>
                <th className="text-center">VIEWER</th>
              </tr>
            </thead>
            <tbody>
              {PERMISSION_MATRIX.map((row) => (
                <tr key={row.capability}>
                  <td className="font-sans">
                    <div className="font-semibold text-xs text-[var(--text)]">
                      {row.capability}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {row.description}
                    </div>
                  </td>
                  {(['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER'] as const).map((r) => (
                    <td key={r} className="text-center">
                      {row[r] ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-success/15 text-success">
                          <Icon name="check" size={14} />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--surface-2)] text-[var(--text-muted)]">
                          <Icon name="close" size={13} />
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
