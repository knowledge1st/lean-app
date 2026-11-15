import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const meal = pgEnum('meal', ['breakfast', 'lunch', 'afternoon_snack', 'dinner', 'snack']);
export const entryStatus = pgEnum('entry_status', ['planned', 'eaten']);
export const foodSource = pgEnum('food_source', ['off', 'seed', 'custom']);
export const goalMode = pgEnum('goal_mode', ['target_weight', 'body_composition', 'manual']);
export const compositionPreset = pgEnum('composition_preset', ['cut', 'recomp', 'lean_bulk']);
export const goalStatus = pgEnum('goal_status', ['active', 'archived']);
export const targetReason = pgEnum('target_reason', ['initial', 'adjustment', 'manual']);
export const activityLevel = pgEnum('activity_level', ['sedentary', 'light', 'moderate', 'active']);
export const sex = pgEnum('sex', ['female', 'male']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_idx').on(t.tokenHash),
    index('sessions_user_id_idx').on(t.userId),
  ],
);

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull(),
    ip: text('ip').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('login_attempts_username_created_at_idx').on(t.username, t.createdAt),
    index('login_attempts_ip_created_at_idx').on(t.ip, t.createdAt),
  ],
);

export const profiles = pgTable('profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  sex: sex('sex'),
  birthDate: date('birth_date', { mode: 'string' }),
  heightCm: numeric('height_cm', { precision: 5, scale: 1 }),
  activityLevel: activityLevel('activity_level'),
  timeZone: text('time_zone').notNull().default('America/Argentina/Buenos_Aires'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const foods = pgTable(
  'foods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: foodSource('source').notNull(),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    barcode: text('barcode'),
    name: text('name').notNull(),
    brand: text('brand'),
    kcalPer100g: integer('kcal_per_100g').notNull(),
    proteinPer100g: numeric('protein_per_100g', { precision: 6, scale: 2 }).notNull(),
    carbsPer100g: numeric('carbs_per_100g', { precision: 6, scale: 2 }).notNull(),
    fatPer100g: numeric('fat_per_100g', { precision: 6, scale: 2 }).notNull(),
    servingGrams: numeric('serving_grams', { precision: 7, scale: 1 }),
    servingLabel: text('serving_label'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('foods_barcode_idx')
      .on(t.barcode)
      .where(sql`${t.barcode} IS NOT NULL`),
    index('foods_name_trgm_idx').using('gin', t.name.op('gin_trgm_ops')),
    index('foods_brand_trgm_idx').using('gin', t.brand.op('gin_trgm_ops')),
    index('foods_owner_id_idx').on(t.ownerId),
    check('foods_source_owner_check', sql`(${t.source} = 'custom') = (${t.ownerId} IS NOT NULL)`),
    check('foods_kcal_per_100g_check', sql`${t.kcalPer100g} >= 0`),
    check('foods_protein_per_100g_check', sql`${t.proteinPer100g} >= 0`),
    check('foods_carbs_per_100g_check', sql`${t.carbsPer100g} >= 0`),
    check('foods_fat_per_100g_check', sql`${t.fatPer100g} >= 0`),
    check('foods_serving_grams_check', sql`${t.servingGrams} >= 0`),
  ],
);

export const mealEntries = pgTable(
  'meal_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    meal: meal('meal').notNull(),
    foodId: uuid('food_id')
      .notNull()
      .references(() => foods.id, { onDelete: 'restrict' }),
    grams: numeric('grams', { precision: 7, scale: 1 }).notNull(),
    status: entryStatus('status').notNull().default('eaten'),
    kcal: integer('kcal').notNull(),
    protein: numeric('protein', { precision: 7, scale: 2 }).notNull(),
    carbs: numeric('carbs', { precision: 7, scale: 2 }).notNull(),
    fat: numeric('fat', { precision: 7, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('meal_entries_user_id_date_idx').on(t.userId, t.date),
    check('meal_entries_grams_check', sql`${t.grams} > 0`),
    check('meal_entries_kcal_check', sql`${t.kcal} >= 0`),
    check('meal_entries_protein_check', sql`${t.protein} >= 0`),
    check('meal_entries_carbs_check', sql`${t.carbs} >= 0`),
    check('meal_entries_fat_check', sql`${t.fat} >= 0`),
  ],
);

export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mode: goalMode('mode').notNull(),
    startWeightKg: numeric('start_weight_kg', { precision: 5, scale: 1 }).notNull(),
    targetWeightKg: numeric('target_weight_kg', { precision: 5, scale: 1 }),
    targetDate: date('target_date', { mode: 'string' }),
    preset: compositionPreset('preset'),
    status: goalStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('goals_user_id_idx').on(t.userId),
    uniqueIndex('goals_one_active_idx')
      .on(t.userId)
      .where(sql`${t.status} = 'active'`),
  ],
);

export const targets = pgTable(
  'targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    goalId: uuid('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    kcal: integer('kcal').notNull(),
    proteinG: numeric('protein_g', { precision: 6, scale: 1 }).notNull(),
    carbsG: numeric('carbs_g', { precision: 6, scale: 1 }).notNull(),
    fatG: numeric('fat_g', { precision: 6, scale: 1 }).notNull(),
    waterMl: integer('water_ml').notNull(),
    reason: targetReason('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('targets_goal_id_effective_from_idx').on(t.goalId, t.effectiveFrom),
    check('targets_kcal_check', sql`${t.kcal} >= 0`),
    check('targets_protein_g_check', sql`${t.proteinG} >= 0`),
    check('targets_carbs_g_check', sql`${t.carbsG} >= 0`),
    check('targets_fat_g_check', sql`${t.fatG} >= 0`),
    check('targets_water_ml_check', sql`${t.waterMl} >= 0`),
  ],
);

export const milestones = pgTable(
  'milestones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    goalId: uuid('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    expectedWeightKg: numeric('expected_weight_kg', { precision: 5, scale: 1 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('milestones_goal_id_date_idx').on(t.goalId, t.date)],
);

export const checkins = pgTable(
  'checkins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    goalId: uuid('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    avgIntakeKcal: integer('avg_intake_kcal'),
    trendWeightKg: numeric('trend_weight_kg', { precision: 5, scale: 2 }),
    estimatedTdee: integer('estimated_tdee'),
    proposedKcal: integer('proposed_kcal'),
    accepted: boolean('accepted'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('checkins_goal_id_week_start_idx').on(t.goalId, t.weekStart)],
);

export const bodyLogs = pgTable(
  'body_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    weightKg: numeric('weight_kg', { precision: 5, scale: 2 }),
    bodyFatPct: numeric('body_fat_pct', { precision: 4, scale: 1 }),
    waistCm: numeric('waist_cm', { precision: 5, scale: 1 }),
    hipCm: numeric('hip_cm', { precision: 5, scale: 1 }),
    chestCm: numeric('chest_cm', { precision: 5, scale: 1 }),
    armCm: numeric('arm_cm', { precision: 5, scale: 1 }),
    thighCm: numeric('thigh_cm', { precision: 5, scale: 1 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('body_logs_user_id_date_idx').on(t.userId, t.date),
    check('body_logs_weight_kg_check', sql`${t.weightKg} > 0`),
    check('body_logs_body_fat_pct_check', sql`${t.bodyFatPct} > 0`),
    check('body_logs_waist_cm_check', sql`${t.waistCm} > 0`),
    check('body_logs_hip_cm_check', sql`${t.hipCm} > 0`),
    check('body_logs_chest_cm_check', sql`${t.chestCm} > 0`),
    check('body_logs_arm_cm_check', sql`${t.armCm} > 0`),
    check('body_logs_thigh_cm_check', sql`${t.thighCm} > 0`),
  ],
);

export const waterLogs = pgTable(
  'water_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    ml: integer('ml').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('water_logs_user_id_date_idx').on(t.userId, t.date),
    check('water_logs_ml_check', sql`${t.ml} >= 0`),
  ],
);

export const exerciseLogs = pgTable(
  'exercise_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    activity: text('activity').notNull(),
    minutes: integer('minutes').notNull(),
    kcal: integer('kcal').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('exercise_logs_user_id_date_idx').on(t.userId, t.date),
    check('exercise_logs_minutes_check', sql`${t.minutes} >= 0`),
    check('exercise_logs_kcal_check', sql`${t.kcal} >= 0`),
  ],
);

export const shoppingItems = pgTable(
  'shopping_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    foodId: uuid('food_id').references(() => foods.id, { onDelete: 'restrict' }),
    text: text('text'),
    grams: numeric('grams', { precision: 8, scale: 1 }),
    purchased: boolean('purchased').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('shopping_items_user_id_week_start_idx').on(t.userId, t.weekStart),
    check(
      'shopping_items_food_or_text_check',
      sql`${t.foodId} IS NOT NULL OR ${t.text} IS NOT NULL`,
    ),
    check('shopping_items_grams_check', sql`${t.grams} >= 0`),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type NewLoginAttempt = typeof loginAttempts.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Food = typeof foods.$inferSelect;
export type NewFood = typeof foods.$inferInsert;
export type MealEntry = typeof mealEntries.$inferSelect;
export type NewMealEntry = typeof mealEntries.$inferInsert;
export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type Target = typeof targets.$inferSelect;
export type NewTarget = typeof targets.$inferInsert;
export type Milestone = typeof milestones.$inferSelect;
export type NewMilestone = typeof milestones.$inferInsert;
export type Checkin = typeof checkins.$inferSelect;
export type NewCheckin = typeof checkins.$inferInsert;
export type BodyLog = typeof bodyLogs.$inferSelect;
export type NewBodyLog = typeof bodyLogs.$inferInsert;
export type WaterLog = typeof waterLogs.$inferSelect;
export type NewWaterLog = typeof waterLogs.$inferInsert;
export type ExerciseLog = typeof exerciseLogs.$inferSelect;
export type NewExerciseLog = typeof exerciseLogs.$inferInsert;
export type ShoppingItem = typeof shoppingItems.$inferSelect;
export type NewShoppingItem = typeof shoppingItems.$inferInsert;
