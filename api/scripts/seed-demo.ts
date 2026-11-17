import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { addDays, checkinWindow } from '../src/lib/checkins';

export type DemoScenario = 'adjust' | 'on_track' | 'insufficient';
class InputError extends Error {}
// Keep in sync with the EMA warm-up read by GET /api/checkins/pending and checkinDays.
const WEIGHT_WARMUP_DAYS = 60;
export const demoWindow = checkinWindow;
export function demoWeeklyChange(
  goal: {
    mode: string;
    startWeightKg: number;
    targetWeightKg: number | null;
    startDate: string;
    endDate: string;
    preset: string | null;
  },
  kcal: number,
) {
  if (goal.mode === 'manual') return 0;
  if (goal.mode === 'body_composition') {
    const percent = goal.preset === 'cut' ? -0.2 : goal.preset === 'lean_bulk' ? 0.1 : -0.05;
    return (percent * kcal) / (1100 * (1 + percent));
  }
  const days = (Date.parse(goal.endDate) - Date.parse(goal.startDate)) / 86400000;
  return days <= 0 ? 0 : ((goal.targetWeightKg! - goal.startWeightKg) * 7) / days;
}
export function buildDemoData(input: {
  today: string;
  scenario: DemoScenario;
  weightKg: number;
  kcal: number;
  expectedWeeklyChangeKg: number;
  food: { kcal: number; protein: number; carbs: number; fat: number };
}) {
  const window = demoWindow(input.today);
  const loggedDays = input.scenario === 'insufficient' ? 6 : 13;
  const weighIns = input.scenario === 'insufficient' ? 2 : 7;
  const weekly = input.scenario === 'on_track' ? input.expectedWeeklyChangeKg : 0;
  // Invert the EMA at each weigh-in so the evaluated trend follows the planned rate.
  let previousTrend = input.weightKg;
  const weights = [{ date: addDays(window.from, -7), weightKg: input.weightKg }];
  for (let index = 0; index < weighIns; index++) {
    const day = input.scenario === 'insufficient' ? index * 8 : index * 2;
    const trend = input.weightKg + (weekly * day * 13) / (12 * 7);
    const weightKg = Math.round((previousTrend + (trend - previousTrend) / 0.1) * 100) / 100;
    if (weightKg <= 0 || weightKg >= 1000)
      throw new InputError('El ritmo planeado no permite generar pesajes demo válidos');
    weights.push({ date: addDays(window.from, day), weightKg });
    previousTrend = trend;
  }
  const grams = Math.round((input.kcal / input.food.kcal) * 1000) / 10;
  if (grams <= 0 || grams >= 100000)
    throw new InputError('La meta no permite generar comidas demo válidas');
  const meals = Array.from({ length: loggedDays }, (_, index) => ({
    date: addDays(window.from, index),
    grams,
    kcal: (grams * input.food.kcal) / 100,
    protein: (grams * input.food.protein) / 100,
    carbs: (grams * input.food.carbs) / 100,
    fat: (grams * input.food.fat) / 100,
  }));
  return {
    ...window,
    weightDeleteFrom: addDays(window.from, -WEIGHT_WARMUP_DAYS),
    weights,
    meals,
    loggedDays,
    weighIns,
    avgIntakeKcal: Math.round(meals.reduce((sum, meal) => sum + meal.kcal, 0) / meals.length),
  };
}
export async function main() {
  const { values } = parseArgs({
    options: {
      user: { type: 'string' },
      scenario: { type: 'string', default: 'adjust' },
      yes: { type: 'boolean', default: false },
    },
    args: process.argv.slice(2).filter((arg: string) => arg !== '--'),
  });
  if (!values.user) throw new InputError('Indicá --user <username>');
  if (!['adjust', 'on_track', 'insufficient'].includes(values.scenario!))
    throw new InputError('Escenario inválido');
  const envFile = new URL('../.dev.vars', import.meta.url);
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.DATABASE_URL;
  if (!url) throw new InputError('Falta DATABASE_URL');
  if (url === process.env.PROD_DATABASE_URL)
    throw new InputError('No se permite ejecutar el demo en producción');
  console.log(`Base de datos: ${new URL(url).hostname}`);
  const sql = neon(url);
  const [user] =
    await sql`SELECT u.id, p.time_zone FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.username = ${values.user}`;
  if (!user) throw new InputError('Usuario no encontrado');
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: user.time_zone ?? 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [goal] =
    await sql`SELECT g.*, (SELECT min(effective_from)::text FROM targets WHERE goal_id = g.id) AS start_date,
    (SELECT max(date)::text FROM milestones WHERE goal_id = g.id) AS end_date
    FROM goals g WHERE g.user_id = ${user.id} AND g.status = 'active'`;
  if (!goal) throw new InputError('Creá un objetivo activo desde la app antes de ejecutar el demo');
  const [target] =
    await sql`SELECT t.* FROM targets t JOIN goals g ON g.id = t.goal_id WHERE g.user_id = ${user.id} AND t.effective_from <= ${date}::date ORDER BY t.effective_from DESC, t.created_at DESC, t.id DESC LIMIT 1`;
  if (!target) throw new InputError('El usuario no tiene una meta vigente');
  const [food] =
    await sql`SELECT * FROM foods WHERE source = 'seed' AND name = 'Pechuga de pollo sin piel cocida' AND kcal_per_100g = 165 ORDER BY id LIMIT 1`;
  if (!food)
    throw new InputError(
      'Falta el alimento seed Pechuga de pollo sin piel cocida (165 kcal/100 g)',
    );
  const [latest] =
    await sql`SELECT weight_kg FROM body_logs WHERE user_id = ${user.id} AND date <= ${date}::date AND weight_kg IS NOT NULL ORDER BY date DESC LIMIT 1`;
  const data = buildDemoData({
    today: date,
    scenario: values.scenario as DemoScenario,
    weightKg: Number(latest?.weight_kg ?? goal.start_weight_kg),
    kcal: Number(target.kcal),
    expectedWeeklyChangeKg: demoWeeklyChange(
      {
        mode: goal.mode,
        startWeightKg: Number(goal.start_weight_kg),
        targetWeightKg: goal.target_weight_kg === null ? null : Number(goal.target_weight_kg),
        startDate: goal.start_date,
        endDate: goal.end_date ?? goal.start_date,
        preset: goal.preset,
      },
      Number(target.kcal),
    ),
    food: {
      kcal: Number(food.kcal_per_100g),
      protein: Number(food.protein_per_100g),
      carbs: Number(food.carbs_per_100g),
      fat: Number(food.fat_per_100g),
    },
  });
  if (!values.yes) {
    if (!process.stdin.isTTY) throw new InputError('Usá --yes o una terminal interactiva');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await rl.question(
        `Se borrarán pesajes de ${data.weightDeleteFrom} a ${data.weekEnd} y comidas de ${data.from} a ${data.weekEnd} (ambos rangos inclusive), y se insertarán los datos demo. ¿Continuar? [s/N] `,
      );
      if (!['s', 'si', 'sí'].includes(answer.trim().toLowerCase()))
        throw new InputError('Operación cancelada');
    } finally {
      rl.close();
    }
  }
  await sql.transaction([
    sql`DELETE FROM meal_entries WHERE user_id = ${user.id} AND date BETWEEN ${data.from}::date AND ${data.weekEnd}::date`,
    sql`DELETE FROM body_logs WHERE user_id = ${user.id} AND date BETWEEN ${data.weightDeleteFrom}::date AND ${data.weekEnd}::date`,
    sql`INSERT INTO body_logs (user_id, date, weight_kg) SELECT ${user.id}::uuid, x.date, x."weightKg" FROM jsonb_to_recordset(${JSON.stringify(data.weights)}::jsonb) AS x(date date, "weightKg" numeric) ON CONFLICT (user_id, date) DO UPDATE SET weight_kg = excluded.weight_kg, updated_at = now()`,
    sql`INSERT INTO meal_entries (user_id, food_id, date, meal, status, grams, kcal, protein, carbs, fat) SELECT ${user.id}::uuid, ${food.id}::uuid, x.date, 'lunch', 'eaten', x.grams, x.kcal, x.protein, x.carbs, x.fat FROM jsonb_to_recordset(${JSON.stringify(data.meals)}::jsonb) AS x(date date, grams numeric, kcal numeric, protein numeric, carbs numeric, fat numeric)`,
    sql`DELETE FROM checkins WHERE goal_id = ${goal.id} AND week_start = ${data.weekStart}::date`,
  ]);
  console.log(
    `Días con comida: ${data.loggedDays}. Pesajes: ${data.weighIns} (+1 de calentamiento). Ingesta promedio: ${data.avgIntakeKcal} kcal. Semana: ${data.weekStart} a ${data.weekEnd}.`,
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof InputError
        ? error.message
        : 'No se pudo generar el demo. Revisá los argumentos, la configuración y la conexión.',
    );
    process.exitCode = 1;
  });
}
