'use client';

import {
  Permission,
  roleHasPermission,
  UserRole,
  type Permission as PermissionType,
  type UserRole as UserRoleType,
} from '@inventory/shared';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: UserRoleType;
}

interface ContextValue {
  user: CurrentUser | null;
  isAdmin: boolean;
  can: (perm: PermissionType) => boolean;
}

const CurrentUserContext = createContext<ContextValue | undefined>(undefined);

interface ProviderProps {
  user: CurrentUser | null;
  children: ReactNode;
}

/**
 * Provider que cuelga del DashboardLayout (server component) y baja el
 * usuario logueado a los componentes cliente. Todos los hooks de roles/
 * permisos de la app leen de acá.
 */
export function CurrentUserProvider({ user, children }: ProviderProps) {
  const value = useMemo<ContextValue>(() => {
    const isAdmin = user?.role === UserRole.ADMIN;
    return {
      user,
      isAdmin,
      can: (perm) => (user ? roleHasPermission(user.role, perm) : false),
    };
  }, [user]);

  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  );
}

function useCtx(): ContextValue {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) {
    throw new Error(
      'useCurrentUser debe usarse adentro de <CurrentUserProvider>',
    );
  }
  return ctx;
}

/** Devuelve el usuario logueado o null si no hay sesión. */
export function useCurrentUser(): CurrentUser | null {
  return useCtx().user;
}

/** Atajo: el usuario actual es ADMIN. */
export function useIsAdmin(): boolean {
  return useCtx().isAdmin;
}

/**
 * Chequea un permiso fino contra el rol del usuario actual.
 * Espejo del helper backend `roleHasPermission`.
 */
export function useCan(perm: PermissionType): boolean {
  return useCtx().can(perm);
}

// Re-exportamos Permission para que los consumers no tengan que importarlo
// por separado.
export { Permission };
