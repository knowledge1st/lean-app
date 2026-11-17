import { useState } from 'react';
import type { FormEvent } from 'react';
import { rebalanceMacrosForKcal, updateTargetKcalSchema, type Target } from '@lean/shared';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Sheet } from '../../components/ui/Sheet';
import { MACROS } from '../../lib/macros';
import { useUpdateTargetKcal } from './api';
import { formatNumber } from './format';

export function EditTargetKcalSheet({
  target,
  onClose,
  onSaved,
}: {
  target: Target;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [text, setText] = useState(String(target.kcal));
  const [error, setError] = useState<string>();
  const mutation = useUpdateTargetKcal();
  const kcal = /^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN;
  const parsed = updateTargetKcalSchema.safeParse({ kcal });
  const preview = parsed.success
    ? rebalanceMacrosForKcal(parsed.data.kcal, { proteinG: target.protein, fatG: target.fat })
    : null;
  const grams = preview
    ? { protein: preview.proteinG, carbs: preview.carbsG, fat: preview.fatG }
    : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    if (!parsed.success) {
      setError(
        Number.isNaN(kcal)
          ? 'Indicá calorías enteras'
          : (parsed.error.issues[0]?.message ?? 'Calorías inválidas'),
      );
      return;
    }
    setError(undefined);
    mutation.mutate(parsed.data.kcal, {
      onSuccess: () => {
        onSaved?.();
        onClose();
      },
      onError: (failure) => setError(failure.message),
    });
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
      title="Calorías objetivo"
      description="Aplica desde hoy. Proteína y grasa se mantienen; la diferencia se ajusta en carbohidratos."
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Input
          autoFocus
          label="Calorías diarias"
          suffix="kcal"
          type="text"
          inputMode="numeric"
          value={text}
          onChange={(event) => setText(event.target.value)}
          error={error}
        />
        <dl className="grid grid-cols-3 gap-2" aria-label="Macros resultantes">
          {MACROS.map(({ key, label, color }) => (
            <div key={key} className="min-w-0 rounded-xl border border-border p-2">
              <dt className="text-xs break-words text-muted">{label}</dt>
              <dd className="flex items-center gap-1.5 font-medium">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {grams ? `${formatNumber(grams[key])} g` : '—'}
              </dd>
            </div>
          ))}
        </dl>
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </form>
    </Sheet>
  );
}
