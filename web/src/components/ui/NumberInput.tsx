import { Input } from './Input';
import type { InputProps } from './Input';

export type NumberInputProps = Omit<InputProps, 'type' | 'inputMode' | 'suffix'> & {
  unit?: string;
};

export function NumberInput({ unit, ...props }: NumberInputProps) {
  return <Input {...props} type="text" inputMode="decimal" suffix={unit} />;
}
