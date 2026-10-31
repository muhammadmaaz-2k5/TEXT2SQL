import { create } from 'zustand';
import type { AuthUser, DatabaseConnectionItem } from '@datapilot/types';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant: 'info' | 'success' | 'warning' | 'danger';
}

interface UiState {
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandPaletteOpen: boolean;
  readOnlyMode: boolean;
  activeDatabaseId: string;
  databases: DatabaseConnectionItem[];
  user: AuthUser | null;
  accessToken: string | null;
  toasts: ToastMessage[];
  setTheme: (theme: ThemeMode) => void;
  setResolvedTheme: (resolved: 'light' | 'dark') => void;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setReadOnlyMode: (readOnly: boolean) => void;
  setActiveDatabaseId: (id: string) => void;
  setDatabases: (databases: DatabaseConnectionItem[]) => void;
  setSession: (user: AuthUser | null, accessToken?: string | null) => void;
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useAppStore = create<UiState>((set) => ({
  theme: 'system',
  resolvedTheme: 'light',
  sidebarCollapsed: false,
  mobileNavOpen: false,
  commandPaletteOpen: false,
  readOnlyMode: true,
  activeDatabaseId: 'db_shop_analytics',
  databases: [],
  user: null,
  accessToken: null,
  toasts: [],
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('dp_theme', theme);
    }
    set({ theme });
  },
  setResolvedTheme: (resolvedTheme) => set({ resolvedTheme }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setReadOnlyMode: (readOnlyMode) => set({ readOnlyMode }),
  setActiveDatabaseId: (activeDatabaseId) => set({ activeDatabaseId }),
  setDatabases: (databases) =>
    set((state) => ({
      databases,
      activeDatabaseId:
        databases.find((d) => d.id === state.activeDatabaseId)?.id ??
        databases[0]?.id ??
        state.activeDatabaseId,
    })),
  setSession: (user, accessToken = null) => {
    if (typeof window !== 'undefined') {
      if (accessToken) {
        window.localStorage.setItem('dp_access_token', accessToken);
      } else if (user === null) {
        window.localStorage.removeItem('dp_access_token');
      }
    }
    set({ user, accessToken });
  },
  addToast: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, 4200);
    }
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

