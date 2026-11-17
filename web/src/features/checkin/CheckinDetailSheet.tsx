import type { Checkin } from '@lean/shared';
import type { RefObject } from 'react';
import { Sheet } from '../../components/ui/Sheet';
import { formatKcal, formatKg, normalizeWeightChange } from './messages';

export function CheckinDetailSheet({
  checkin: c,
  open,
  onOpenChange,
  returnFocusRef,
}: {
  checkin: Checkin;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}) {
  const kcal = (n: number | null) => (n === null ? '—' : `${formatKcal(n)} kcal/día`);
  const change = (n: number | null) => {
    const rounded = normalizeWeightChange(n);
    return rounded === null
      ? '—'
      : `${rounded < 0 ? '−' : rounded > 0 ? '+' : ''}${formatKg(rounded)} kg/semana`;
  };
  return (
    <Sheet
      title="Detalle de la revisión"
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={(event) => {
        if (returnFocusRef?.current) {
          event.preventDefault();
          returnFocusRef.current.focus();
        }
      }}
    >
      <dl className="mb-5 grid grid-cols-2 gap-3">
        <dt>Ingesta promedio</dt>
        <dd>{kcal(c.avgIntakeKcal)}</dd>
        <dt>Gasto estimado</dt>
        <dd>{kcal(c.estimatedTdee)}</dd>
        <dt>Cambio de peso real</dt>
        <dd>{change(c.actualWeeklyChangeKg)}</dd>
        <dt>Cambio de peso esperado</dt>
        <dd>{change(c.expectedWeeklyChangeKg)}</dd>
      </dl>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Comparación de metas diarias</caption>
        <thead>
          <tr>
            <th scope="col">Nutriente</th>
            <th scope="col">Meta actual</th>
            <th scope="col">Propuesta</th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              ['kcal', 'Calorías', 'kcal'],
              ['proteinG', 'Proteína', 'g'],
              ['carbsG', 'Carbohidratos', 'g'],
              ['fatG', 'Grasa', 'g'],
            ] as const
          ).map(([key, label, unit]) => (
            <tr key={key} className="border-t border-border">
              <th scope="row" className="py-3">
                {label} ({unit})
              </th>
              <td>{key === 'kcal' ? formatKcal(c.current[key]) : formatKg(c.current[key])}</td>
              <td>
                {c.proposed
                  ? key === 'kcal'
                    ? formatKcal(c.proposed[key])
                    : formatKg(c.proposed[key])
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Sheet>
  );
}
