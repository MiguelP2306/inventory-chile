'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { UserRole } from '@inventory/shared';
import {
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  User as UserIcon,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo cambiar el estado')),
  });

  // Guard de UI — si la URL la abre alguien que no es admin, el backend
  // devuelve 403, pero acá mostramos un estado coherente.
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-md border bg-card py-16 text-center">
        <ShieldCheck className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Acceso restringido</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Solo los administradores pueden gestionar usuarios. Pedile a un
          admin de tu organización que te dé acceso.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Usuarios</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Administrá las cuentas que pueden ingresar al sistema y sus roles.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nuevo usuario
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o email…"
            className="pl-9"
          />
        </div>
        <Select
          value={roleFilter}
          onValueChange={(v) => setRoleFilter(v as UserRole | 'ALL')}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Rol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los roles</SelectItem>
            <SelectItem value={UserRole.ADMIN}>Administrador</SelectItem>
            <SelectItem value={UserRole.USER}>Vendedor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[180px] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-9 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!users.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No hay usuarios que coincidan con esos filtros.
                </TableCell>
              </TableRow>
            )}
            {items.map((u) => {
              const isMe = u.id === me?.id;
              return (
                <TableRow key={u.id} className={cn(!u.isActive && 'opacity-60')}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                        {u.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <p className="font-medium">{u.name}</p>
                        {isMe && (
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Vos
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.email}
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={u.role} />
                  </TableCell>
                  <TableCell>
                    {u.isActive ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        Inactivo
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Editar"
                        onClick={() => setEditTarget(u)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Resetear contraseña"
                        onClick={() => setResetTarget(u)}
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={u.isActive ? 'Desactivar' : 'Activar'}
                        onClick={() => setToggleTarget(u)}
                        disabled={isMe && u.isActive}
                      >
                        {u.isActive ? (
                          <UserX className="h-4 w-4 text-destructive" />
                        ) : (
                          <UserCheck className="h-4 w-4 text-emerald-600" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
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

function RoleBadge({ role }: { role: UserRole }) {
  if (role === UserRole.ADMIN) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">
        <ShieldCheck className="h-3 w-3" />
        {ROLE_LABEL[role]}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
      <UserIcon className="h-3 w-3" />
      {ROLE_LABEL[role]}
    </span>
  );
}

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
    name.trim().length >= 2 &&
    /.+@.+\..+/.test(email) &&
    password.length >= 6;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !mut.isPending) mut.mutate();
          }}
          className="space-y-3"
        >
          <div className="space-y-1">
            <Label htmlFor="u-name">Nombre</Label>
            <Input
              id="u-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="u-email">Email</Label>
            <Input
              id="u-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.toLowerCase())}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="u-pass">Contraseña inicial</Label>
            <Input
              id="u-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
            <p className="text-[11px] text-muted-foreground">
              El usuario podrá cambiarla después desde su perfil.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Rol</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UserRole.USER}>
                  Vendedor — no ve costos ni comisiones
                </SelectItem>
                <SelectItem value={UserRole.ADMIN}>
                  Administrador — acceso total
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || mut.isPending}>
              {mut.isPending ? 'Creando…' : 'Crear usuario'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar {target.email}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!mut.isPending) mut.mutate();
          }}
          className="space-y-3"
        >
          <div className="space-y-1">
            <Label htmlFor="e-name">Nombre</Label>
            <Input
              id="e-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Rol</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as UserRole)}
              disabled={isMe}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UserRole.USER}>Vendedor</SelectItem>
                <SelectItem value={UserRole.ADMIN}>Administrador</SelectItem>
              </SelectContent>
            </Select>
            {isMe && (
              <p className="text-[11px] text-muted-foreground">
                No podés cambiar tu propio rol. Pedile a otro admin que lo
                haga.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
    <Dialog
      open={!!target}
      onOpenChange={(o) => {
        if (!o) {
          setNewPassword('');
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resetear contraseña de {target.email}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newPassword.length >= 6 && !mut.isPending) mut.mutate();
          }}
          className="space-y-3"
        >
          <div className="space-y-1">
            <Label htmlFor="r-pass">Nueva contraseña</Label>
            <Input
              id="r-pass"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Comunicale la nueva contraseña al usuario por un canal seguro.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={newPassword.length < 6 || mut.isPending}
            >
              {mut.isPending ? 'Actualizando…' : 'Resetear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
