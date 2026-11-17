import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { GoalCard } from '../features/goals/GoalCard';
import { ProfileCard } from '../features/goals/ProfileForm';
import { Sheet } from '../components/ui/Sheet';
import { ChangePasswordSheet } from '../features/account/ChangePasswordSheet';
import { ApiError } from '../lib/api';
import { RemindersCard } from '../features/notifications/RemindersCard';
import { forgetDeviceOnLogout } from '../features/notifications/push';

export function Perfil() {
  const { user, logout, logoutAll } = useAuth();
  const navigate = useNavigate();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  async function endSession(all: boolean) {
    if (pending) return;
    setPending(true);
    setMessage('');
    try {
      await forgetDeviceOnLogout();
      await (all ? logoutAll() : logout());
      navigate('/login', { replace: true });
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.status === 0
          ? 'Sin conexión. No se pudieron cerrar las otras sesiones; volvé a intentar.'
          : 'No se pudieron cerrar las sesiones. Probá de nuevo.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Perfil</h1>
      <GoalCard />
      <ProfileCard />
      <RemindersCard />
      <Card className="space-y-5">
        <h2 className="text-xl font-semibold">Cuenta</h2>
        <div>
          <p className="font-medium">{user?.displayName}</p>
          <p className="text-sm text-muted">@{user?.username}</p>
        </div>
        {updated && (
          <p role="status">Contraseña actualizada. Se cerró la sesión en tus otros dispositivos.</p>
        )}
        <div className="flex flex-col gap-3">
          <Button
            variant="secondary"
            className="w-full"
            disabled={pending}
            onClick={() => {
              setUpdated(false);
              setPasswordOpen(true);
            }}
          >
            Cambiar contraseña
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            disabled={pending}
            onClick={() => {
              setMessage('');
              setConfirmAll(false);
              setConfirmOpen(true);
            }}
          >
            Cerrar sesión
          </Button>
          <Button
            variant="danger"
            className="w-full"
            disabled={pending}
            onClick={() => {
              setMessage('');
              setConfirmAll(true);
              setConfirmOpen(true);
            }}
          >
            Cerrar sesión en todos los dispositivos
          </Button>
        </div>
      </Card>
      <ChangePasswordSheet
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
        onSuccess={() => setUpdated(true)}
      />
      <Sheet
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!pending) setConfirmOpen(open);
        }}
        title={confirmAll ? 'Cerrar todas las sesiones' : 'Cerrar sesión'}
        description={
          confirmAll
            ? 'Se cerrará la sesión en este y en todos tus otros dispositivos.'
            : 'Vas a salir de tu cuenta en este dispositivo.'
        }
      >
        <div className="flex flex-col gap-3">
          {message && <p role="alert">{message}</p>}
          <Button variant="secondary" disabled={pending} onClick={() => setConfirmOpen(false)}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={pending} onClick={() => void endSession(confirmAll)}>
            {pending ? 'Cerrando…' : confirmAll ? 'Cerrar todas' : 'Confirmar cierre'}
          </Button>
        </div>
      </Sheet>
    </section>
  );
}
