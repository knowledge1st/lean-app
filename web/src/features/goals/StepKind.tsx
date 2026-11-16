import { Choices, type StepProps } from './fields';
export function StepKind(props: StepProps) {
  return (
    <Choices
      {...props}
      name="mode"
      legend="Elegí tu objetivo"
      options={[
        ['weight_date', 'Llegar a un peso', 'Elegí un peso y cuándo querés llegar.'],
        ['composition', 'Cambiar mi composición', 'Ganá músculo o bajá grasa de a poco.'],
        ['manual', 'Definir mis números', 'Poné tus calorías y nutrientes diarios.'],
      ]}
    />
  );
}
