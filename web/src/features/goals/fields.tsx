import type { ReactNode } from 'react';
import { Input } from '../../components/ui/Input';
import { NumberInput } from '../../components/ui/NumberInput';
import type { Draft, Errors } from './draft';
export type StepProps = {
  draft: Draft;
  errors: Errors;
  change: (key: keyof Draft, value: string) => void;
};
export function Field({
  name,
  label,
  unit,
  type,
  min,
  max,
  description,
  ...props
}: StepProps & {
  name: keyof Draft;
  label: string;
  unit?: string;
  type?: string;
  min?: string;
  max?: string;
  description?: string;
}) {
  const common = {
    id: `goal-${name}`,
    label,
    value: props.draft[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      props.change(name, event.target.value),
    error: props.errors[name],
    ...(description ? { 'aria-describedby': `goal-${name}-help` } : {}),
  };
  return (
    <div>
      {type ? (
        <Input {...common} type={type} min={min} max={max} />
      ) : (
        <NumberInput {...common} {...(unit ? { unit } : {})} />
      )}
      {description && (
        <p id={`goal-${name}-help`} className="mt-2 text-sm text-muted">
          {description}
        </p>
      )}
    </div>
  );
}
export function Choices({
  name,
  legend,
  options,
  draft,
  errors,
  change,
}: StepProps & {
  name: keyof Draft;
  legend: string;
  options: readonly (readonly [string, string, string?])[];
}) {
  return (
    <fieldset
      className="min-w-0 space-y-3"
      aria-describedby={errors[name] ? `error-${name}` : undefined}
    >
      <legend className="mb-2 font-medium">{legend}</legend>
      {options.map(([value, label, description]) => (
        <label
          key={value}
          className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border p-4 ${draft[name] === value ? 'border-accent bg-surface' : 'border-border'}`}
        >
          <input
            type="radio"
            name={name}
            value={value}
            checked={draft[name] === value}
            onChange={() => change(name, value)}
            aria-invalid={!!errors[name]}
            className="mt-1 accent-accent"
          />
          <span>
            <span className="block font-medium">{label}</span>
            {description && <span className="text-sm text-muted">{description}</span>}
          </span>
        </label>
      ))}
      {errors[name] && (
        <p id={`error-${name}`} className="text-sm text-danger">
          {errors[name]}
        </p>
      )}
    </fieldset>
  );
}
export function StepContent({ children }: { children: ReactNode }) {
  return <div className="space-y-5">{children}</div>;
}
