import { Choices, Field, StepContent, type StepProps } from './fields';
export function StepAbout(props: StepProps) {
  return (
    <StepContent>
      <p className="text-muted">Contanos un poco de vos para armar tu plan.</p>
      <Choices
        {...props}
        name="sex"
        legend="Sexo"
        options={[
          ['female', 'Mujer'],
          ['male', 'Hombre'],
        ]}
      />
      <Field {...props} name="birthDate" label="Fecha de nacimiento" type="date" />
      <Field {...props} name="heightCm" label="Altura" unit="cm" />
      <Field {...props} name="weightKg" label="Peso actual" unit="kg" />
      <Field
        {...props}
        name="bodyFatPct"
        label="Grasa corporal (opcional)"
        unit="%"
        description="Si no lo sabés, dejalo vacío"
      />
      <Choices
        {...props}
        name="activityLevel"
        legend="Nivel de actividad"
        options={[
          ['sedentary', 'Poco movimiento', 'Trabajo sentado, casi sin ejercicio.'],
          ['light', 'Algo activo', 'Caminatas o ejercicio 1–3 días por semana.'],
          ['moderate', 'Activo', 'Ejercicio 3–5 días por semana.'],
          ['active', 'Muy activo', 'Ejercicio intenso 6–7 días o trabajo físico.'],
        ]}
      />
    </StepContent>
  );
}
