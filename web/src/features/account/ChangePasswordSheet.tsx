import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { changePasswordRequestSchema } from '@lean/shared';
import { useAuth } from '../../auth/AuthProvider';
import { ApiError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Sheet } from '../../components/ui/Sheet';

type FieldErrors = Partial<Record<'currentPassword' | 'newPassword' | 'repeatPassword', string>>;
interface ChangePasswordSheetProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  onSuccess?(): void;
}

export function ChangePasswordSheet({ open, onOpenChange, onSuccess }: ChangePasswordSheetProps) {
  const { user, changePassword } = useAuth();
  // Unmount the form on close so every way of closing resets sensitive fields and errors.
  return (
    open && (
      <ChangePasswordForm
        onOpenChange={onOpenChange}
        username={user?.username ?? ''}
        changePassword={changePassword}
        onSuccess={() => {
          onOpenChange(false);
          onSuccess?.();
        }}
      />
    )
  );
}

function ChangePasswordForm({
  username,
  changePassword,
  onSuccess,
  onOpenChange,
}: {
  username: string;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  onSuccess(): void;
  onOpenChange(open: boolean): void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const helpId = useId();
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setMessage('');
    const nextErrors: FieldErrors = {};
    const parsed = changePasswordRequestSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'currentPassword' || field === 'newPassword') {
          nextErrors[field] ??= issue.message;
        }
      }
    }
    if (repeatPassword !== newPassword) nextErrors.repeatPassword = 'Las contraseñas no coinciden.';
    if (newPassword && newPassword === currentPassword) {
      nextErrors.newPassword = 'La contraseña nueva debe ser distinta de la actual.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setPending(true);
    try {
      await changePassword(currentPassword, newPassword);
      if (!mounted.current) return;
      onSuccess();
    } catch (error) {
      if (!mounted.current) return;
      if (
        error instanceof ApiError &&
        error.status === 401 &&
        error.code === 'invalid_credentials'
      ) {
        setErrors({ currentPassword: 'La contraseña actual no es correcta.' });
      } else if (error instanceof ApiError && error.status === 400) {
        setMessage('Revisá las contraseñas y volvé a intentar.');
      } else if (error instanceof ApiError && error.status === 429) {
        setMessage('Demasiados intentos. Esperá unos minutos y volvé a probar.');
      } else if (
        !navigator.onLine ||
        (error instanceof ApiError && (error.status === 0 || error.code === 'network_error'))
      ) {
        setMessage('Sin conexión. Revisá tu internet y volvé a intentar.');
      } else {
        setMessage('No se pudo cambiar la contraseña.');
      }
    } finally {
      if (mounted.current) setPending(false);
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!pending) onOpenChange(open);
      }}
      title="Cambiar contraseña"
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={username}
          readOnly
          className="sr-only"
          tabIndex={-1}
          aria-label="Usuario"
        />
        <Input
          label="Contraseña actual"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          error={errors.currentPassword ?? ''}
        />
        <div className="space-y-2">
          <Input
            label="Contraseña nueva"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            error={errors.newPassword ?? ''}
            aria-describedby={helpId}
          />
          <p id={helpId} className="text-sm text-muted">
            Mínimo 10 caracteres.
          </p>
        </div>
        <Input
          label="Repetir contraseña nueva"
          name="repeatPassword"
          type="password"
          autoComplete="new-password"
          value={repeatPassword}
          onChange={(event) => setRepeatPassword(event.target.value)}
          error={errors.repeatPassword ?? ''}
        />
        {message && (
          <p role="alert" className="text-sm text-danger">
            {message}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar'}
        </Button>
      </form>
    </Sheet>
  );
}
