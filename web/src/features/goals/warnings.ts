import { KCAL_FLOORS, type WarningCode, type Sex, type Plan } from '@lean/shared';
import { formatGoalDate } from './format';
type Context = { sex: Sex; today: string; adjusted?: Plan['adjusted'] };
const arrival = ({ adjusted, today }: Context) =>
  adjusted
    ? `Con un ritmo saludable llegás el ${formatGoalDate(adjusted.targetDate, today)}. El plan ya usa esa fecha.`
    : 'Elegí otra fecha o cambiá tu objetivo.';
export const WARNING_TEXT: Record<WarningCode, (context: Context) => string> = {
  rate_capped: arrival,
  date_in_past: (context) => `La fecha ya pasó. ${arrival(context)}`,
  floor_applied: ({ sex }) =>
    `No conviene comer menos de ${KCAL_FLOORS[sex]} kcal por día, así que ajustamos tu meta.`,
  date_unreachable: () =>
    'Con tu gasto diario no es posible bajar de forma saludable para esa fecha. Probá con un objetivo de composición o definí tus números.',
  already_at_target: () => 'Ya estás en tu peso objetivo: te armamos un plan para mantenerlo.',
  manual_macros_mismatch: () => 'Las calorías de tus macros no coinciden con las kcal que pusiste.',
};
export const warningText = (code: WarningCode, context: Context) => WARNING_TEXT[code](context);

export function planWarningMessages(
  plan: { warnings: Plan['warnings']; adjusted?: Plan['adjusted'] },
  context: Context,
): string[] {
  const messages = plan.warnings.flatMap(({ code }) => {
    if (plan.adjusted && code === 'rate_capped') return [];
    if (plan.adjusted && code === 'date_in_past') return ['La fecha ya pasó.'];
    return [warningText(code, context)];
  });
  if (plan.adjusted) messages.push(arrival({ ...context, adjusted: plan.adjusted }));
  return messages;
}
