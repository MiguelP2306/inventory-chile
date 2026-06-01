'use client';

/* ============================================================================
 *  UsuariosPage — REESTILIZADO con el sistema visual del rediseño
 *  (Inventario / Caja / Gastos) + modales SoftModal. Solo UI/UX.
 *
 *  TODA LA LÓGICA SE CONSERVA 1:1 del original:
 *   · Guard isAdmin, listUsers({ q, role }), toggleActive (updateUser).
 *   · CreateUserDialog / EditUserDialog / ResetPasswordDialog (mismas mutations
 *     y validaciones) — ahora montados sobre SoftModal en vez del Dialog shadcn.
 *   · ConfirmDialog para activar/desactivar (ya usaba SoftModal).
 * ========================================================================== */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserRole } from '@inventory/shared';
import {
  ChevronDown,
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  User as UserIcon,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  SoftModal,
  softInputClass,
  softLabelClass,
} from '@/components/ui/soft-modal';
import { useCurrentUser, useIsAdmin } from '@/lib/current-user-context';
import { apiErrorMessage } from '@/lib/catalog-api';
import {
  createUser,
  listUsers,
  resetUserPassword,
  updateUser,
  type UserDto,
} from '@/lib/users-api';
import { cn } from '@/lib/utils';

const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  USER: 'Vendedor',
};

const SELECT_CLASS = `${softInputClass} cursor-pointer appearance-none pr-10`;

// Botones del footer de los modales — mismo patrón que el resto de los forms.
const CANCEL_BTN =
  'inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900';
const SUBMIT_BTN =
  'inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#2F6BFF] px-5 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';

export default function UsuariosPage() {
  const qc = useQueryClient();
  const isAdmin = useIsAdmin();
  const me = useCurrentUser();
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'ALL'>('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserDto | null>(null);
  const [resetTarget, setResetTarget] = useState<UserDto | null>(null);
  const [toggleTarget, setToggleTarget] = useState<UserDto | null>(null);

  const users = useQuery({
    queryKey: ['users', { q, role: roleFilter }],
    queryFn: () =>
      listUsers({
        q: q.trim() || undefined,
        role: roleFilter === 'ALL' ? undefined : roleFilter,
      }),
    enabled: isAdmin,
  });

  const items = users.data ?? [];

  const toggleActive = useMutation({
    mutationFn: (u: UserDto) => updateUser(u.id, { isActive: !u.isActive }),
    onSuccess: (_data, u) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success(`${u.email} ${u.isActive ? 'desactivado' : 'activado'}`);
      setToggleTarget(null);
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo cambiar el estado')),
  });

  // Guard de UI — si la URL la abre alguien que no es admin, el backend
  // devuelve 403, pero acá mostramos un estado coherente.
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-slate-100 bg-white py-16 text-center shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-black text-slate-900 dark:text-white">
          Acceso restringido
        </h1>
        <p className="max-w-md text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
          Solo los administradores pueden gestionar usuarios. Pedile a un admin
          de tu organización que te dé acceso.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200 text-slate-800 dark:text-slate-200">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Usuarios
          </h1>
          <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Administrá las cuentas que pueden ingresar al sistema y sus roles.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-2xl bg-[#2F6BFF] px-5 py-3 text-xs font-bold text-white shadow-md transition-colors hover:bg-[#2F6BFF]/90 sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Nuevo usuario
        </button>
      </div>

      {/* FILTROS */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o email…"
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-xs font-medium text-slate-700 transition-all placeholder:text-slate-400 focus:border-[#2F6BFF] focus:outline-none dark:border-slate-850 dark:bg-[#11151C] dark:text-white"
          />
        </div>
        <div className="relative">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | 'ALL')}
            className="w-full cursor-pointer appearance-none rounded-2xl border border-slate-200 bg-white py-3 pl-4 pr-10 text-xs font-bold text-slate-700 shadow-sm outline-none transition-colors hover:bg-slate-50 focus:border-[#2F6BFF] dark:border-slate-850 dark:bg-[#11151C] dark:text-slate-300 dark:hover:bg-slate-900 sm:w-48"
          >
            <option value="ALL">Todos los roles</option>
            <option value={UserRole.ADMIN}>Administrador</option>
            <option value={UserRole.USER}>Vendedor</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>
      </div>

      {/* TABLA */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="py-4 pl-6">Usuario</th>
                <th className="py-4">Email</th>
                <th className="py-4">Rol</th>
                <th className="py-4 text-center">Estado</th>
                <th className="w-[160px] py-4 pr-6 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {users.isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-6 py-5">
                      <div className="h-5 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))}

              {!users.isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                        <UserIcon className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        Sin usuarios
                      </p>
                      <p className="max-w-[40ch] text-xs font-medium text-slate-400">
                        No hay usuarios que coincidan con esos filtros.
                      </p>
                    </div>
                  </td>
                </tr>
              )}

              {!users.isLoading &&
                items.map((u) => {
                  const isMe = u.id === me?.id;
                  return (
                    <tr
                      key={u.id}
                      className={cn(
                        'transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10',
                        !u.isActive && 'opacity-55',
                      )}
                    >
                      <td className="py-4 pl-6">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#2F6BFF]/10 text-[11px] font-black text-[#2F6BFF] dark:bg-[#2F6BFF]/15">
                            {u.name.slice(0, 2).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
                              {u.name}
                            </p>
                            {isMe && (
                              <p className="text-[9.5px] font-bold uppercase tracking-widest text-[#2F6BFF]">
                                Yo
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 font-medium text-slate-500 dark:text-slate-400">
                        {u.email}
                      </td>
                      <td className="py-4">
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="py-4">
                        <div className="flex justify-center">
                          {u.isActive ? (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-emerald-500">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Activo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-rose-500">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                              Inactivo
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 pr-6">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            title="Editar"
                            onClick={() => setEditTarget(u)}
                            className="cursor-pointer p-2 text-slate-400 transition-colors hover:text-[#2F6BFF]"
                          >
                            <Pencil className="h-[17px] w-[17px]" />
                          </button>
                          <button
                            type="button"
                            title="Resetear contraseña"
                            onClick={() => setResetTarget(u)}
                            className="cursor-pointer p-2 text-slate-400 transition-colors hover:text-amber-500"
                          >
                            <KeyRound className="h-[17px] w-[17px]" />
                          </button>
                          <button
                            type="button"
                            title={u.isActive ? 'Desactivar' : 'Activar'}
                            onClick={() => setToggleTarget(u)}
                            disabled={isMe && u.isActive}
                            className={cn(
                              'p-2 transition-colors',
                              isMe && u.isActive
                                ? 'cursor-not-allowed text-slate-200 dark:text-slate-700'
                                : u.isActive
                                  ? 'cursor-pointer text-slate-400 hover:text-rose-500'
                                  : 'cursor-pointer text-slate-400 hover:text-emerald-500',
                            )}
                          >
                            {u.isActive ? (
                              <UserX className="h-[17px] w-[17px]" />
                            ) : (
                              <UserCheck className="h-[17px] w-[17px]" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['users'] });
        }}
      />

      <EditUserDialog
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ['users'] })}
      />

      <ResetPasswordDialog
        target={resetTarget}
        onClose={() => setResetTarget(null)}
      />

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(o) => !o && setToggleTarget(null)}
        title={
          toggleTarget?.isActive
            ? `¿Desactivar a ${toggleTarget?.name}?`
            : `¿Reactivar a ${toggleTarget?.name}?`
        }
        description={
          toggleTarget?.isActive
            ? 'No podrá iniciar sesión hasta que lo reactives. Las ventas y cotizaciones asociadas se mantienen.'
            : 'Volverá a poder iniciar sesión con sus credenciales actuales.'
        }
        confirmLabel={toggleTarget?.isActive ? 'Desactivar' : 'Activar'}
        variant={toggleTarget?.isActive ? 'destructive' : 'default'}
        onConfirm={async () => {
          if (toggleTarget) await toggleActive.mutateAsync(toggleTarget);
        }}
      />
    </div>
  );
}

/* ============================================================
   ROLE BADGE
   ============================================================ */
function RoleBadge({ role }: { role: UserRole }) {
  if (role === UserRole.ADMIN) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-violet-600 dark:bg-violet-950/30 dark:text-violet-300">
        <ShieldCheck className="h-3 w-3" />
        {ROLE_LABEL[role]}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-300">
      <UserIcon className="h-3 w-3" />
      {ROLE_LABEL[role]}
    </span>
  );
}

/* ============================================================
   FIELD — wrapper de campo del modal
   ============================================================ */
function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className={softLabelClass}>
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      {error && <p className="text-[11px] font-bold text-rose-500">{error}</p>}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  disabled,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(SELECT_CLASS, disabled && 'cursor-not-allowed opacity-60')}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

/* ============================================================
   CREATE USER — SoftModal
   ============================================================ */
function CreateUserDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.USER);

  const reset = () => {
    setName('');
    setEmail('');
    setPassword('');
    setRole(UserRole.USER);
  };

  const mut = useMutation({
    mutationFn: () =>
      createUser({ name: name.trim(), email: email.trim(), password, role }),
    onSuccess: () => {
      toast.success('Usuario creado');
      onSaved();
      reset();
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear')),
  });

  const valid =
    name.trim().length >= 2 && /.+@.+\..+/.test(email) && password.length >= 6;

  return (
    <SoftModal
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
      title="Nuevo usuario"
      subtitle="Creá una cuenta para que ingrese al sistema."
      icon={<UserPlus className="h-[18px] w-[18px]" />}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !mut.isPending) mut.mutate();
        }}
        className="space-y-4 p-5"
      >
        <Field label="Nombre">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            className={softInputClass}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value.toLowerCase())}
            required
            className={softInputClass}
          />
        </Field>
        <Field
          label="Contraseña inicial"
          hint="El usuario podrá cambiarla después desde su perfil."
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
            className={softInputClass}
          />
        </Field>
        <Field label="Rol">
          <SelectField value={role} onChange={(v) => setRole(v as UserRole)}>
            <option value={UserRole.USER}>
              Vendedor — no ve costos ni comisiones
            </option>
            <option value={UserRole.ADMIN}>Administrador — acceso total</option>
          </SelectField>
        </Field>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={CANCEL_BTN}
          >
            Cancelar
          </button>
          <button type="submit" disabled={!valid || mut.isPending} className={SUBMIT_BTN}>
            {mut.isPending ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </SoftModal>
  );
}

/* ============================================================
   EDIT USER — SoftModal
   ============================================================ */
function EditUserDialog({
  target,
  onClose,
  onSaved,
}: {
  target: UserDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const me = useCurrentUser();
  const [name, setName] = useState(target?.name ?? '');
  const [role, setRole] = useState<UserRole>(target?.role ?? UserRole.USER);

  // Sync cuando cambia el target.
  useMemo(() => {
    setName(target?.name ?? '');
    setRole(target?.role ?? UserRole.USER);
  }, [target]);

  const mut = useMutation({
    mutationFn: () => {
      if (!target) throw new Error('no target');
      return updateUser(target.id, { name: name.trim(), role });
    },
    onSuccess: () => {
      toast.success('Usuario actualizado');
      onSaved();
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });

  if (!target) return null;
  const isMe = target.id === me?.id;

  return (
    <SoftModal
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title={`Editar ${target.email}`}
      subtitle="Actualizá el nombre y el rol de la cuenta."
      icon={<Pencil className="h-[18px] w-[18px]" />}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!mut.isPending) mut.mutate();
        }}
        className="space-y-4 p-5"
      >
        <Field label="Nombre">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className={softInputClass}
          />
        </Field>
        <Field
          label="Rol"
          hint={
            isMe
              ? 'No podés cambiar tu propio rol. Pedile a otro admin que lo haga.'
              : undefined
          }
        >
          <SelectField
            value={role}
            onChange={(v) => setRole(v as UserRole)}
            disabled={isMe}
          >
            <option value={UserRole.USER}>Vendedor</option>
            <option value={UserRole.ADMIN}>Administrador</option>
          </SelectField>
        </Field>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={CANCEL_BTN}>
            Cancelar
          </button>
          <button type="submit" disabled={mut.isPending} className={SUBMIT_BTN}>
            {mut.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </SoftModal>
  );
}

/* ============================================================
   RESET PASSWORD — SoftModal
   ============================================================ */
function ResetPasswordDialog({
  target,
  onClose,
}: {
  target: UserDto | null;
  onClose: () => void;
}) {
  const [newPassword, setNewPassword] = useState('');
  const mut = useMutation({
    mutationFn: () => {
      if (!target) throw new Error('no target');
      return resetUserPassword(target.id, newPassword);
    },
    onSuccess: () => {
      toast.success('Contraseña actualizada');
      setNewPassword('');
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo resetear')),
  });

  if (!target) return null;

  return (
    <SoftModal
      open={!!target}
      onOpenChange={(o) => {
        if (!o) {
          setNewPassword('');
          onClose();
        }
      }}
      title={`Resetear contraseña`}
      subtitle={target.email}
      icon={<KeyRound className="h-[18px] w-[18px]" />}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newPassword.length >= 6 && !mut.isPending) mut.mutate();
        }}
        className="space-y-4 p-5"
      >
        <Field
          label="Nueva contraseña"
          hint="Comunicale la nueva contraseña al usuario por un canal seguro."
        >
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={6}
            required
            autoFocus
            className={softInputClass}
          />
        </Field>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={CANCEL_BTN}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={newPassword.length < 6 || mut.isPending}
            className={SUBMIT_BTN}
          >
            {mut.isPending ? 'Actualizando…' : 'Resetear'}
          </button>
        </div>
      </form>
    </SoftModal>
  );
}
