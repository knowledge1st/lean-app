import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
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
export const checkinStatus = pgEnum('checkin_status', ['insufficient_data', 'on_track', 'adjust']);
export const checkinReason = pgEnum('checkin_reason', ['slower_than_plan', 'faster_than_plan']);
export const targetReason = pgEnum('target_reason', ['initial', 'adjustment', 'manual']);
export const activityLevel = pgEnum('activity_level', ['sedentary', 'light', 'moderate', 'active']);
export const sex = pgEnum('sex', ['female', 'male']);
export const reminderSlot = pgEnum('reminder_slot', [
  'breakfast',
  'lunch',
  'afternoon_snack',
  'dinner',
  'snack',
  'day_close',
]);

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
    uniqueIndex('foods_shared_barcode_idx')
      .on(t.barcode)
      .where(sql`${t.barcode} IS NOT NULL AND ${t.source} <> 'custom'`),
    uniqueIndex('foods_custom_barcode_idx')
      .on(t.barcode)
      .where(sql`${t.barcode} IS NOT NULL AND ${t.source} = 'custom'`),
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
    kcal: numeric('kcal', { precision: 12, scale: 4 }).notNull(),
    protein: numeric('protein', { precision: 12, scale: 4 }).notNull(),
    carbs: numeric('carbs', { precision: 12, scale: 4 }).notNull(),
    fat: numeric('fat', { precision: 12, scale: 4 }).notNull(),
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
    status: checkinStatus('status').notNull(),
    reason: checkinReason('reason'),
    loggedDays: integer('logged_days').notNull(),
    weighIns: integer('weigh_ins').notNull(),
    actualWeeklyChangeKg: numeric('actual_weekly_change_kg', { precision: 5, scale: 2 }),
    expectedWeeklyChangeKg: numeric('expected_weekly_change_kg', { precision: 5, scale: 2 }),
    currentKcal: integer('current_kcal').notNull(),
    currentProteinG: numeric('current_protein_g', { precision: 6, scale: 1 }).notNull(),
    currentCarbsG: numeric('current_carbs_g', { precision: 6, scale: 1 }).notNull(),
    currentFatG: numeric('current_fat_g', { precision: 6, scale: 1 }).notNull(),
    proposedProteinG: numeric('proposed_protein_g', { precision: 6, scale: 1 }),
    proposedCarbsG: numeric('proposed_carbs_g', { precision: 6, scale: 1 }),
    proposedFatG: numeric('proposed_fat_g', { precision: 6, scale: 1 }),
    deltaKcal: integer('delta_kcal'),
    targetId: uuid('target_id').references(() => targets.id, { onDelete: 'set null' }),
    avgIntakeKcal: integer('avg_intake_kcal'),
    trendWeightKg: numeric('trend_weight_kg', { precision: 5, scale: 2 }),
    estimatedTdee: integer('estimated_tdee'),
    proposedKcal: integer('proposed_kcal'),
    accepted: boolean('accepted'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('checkins_goal_id_week_start_idx').on(t.goalId, t.weekStart),
    check(
      'checkins_proposal_check',
      sql`(
      ${t.status} = 'adjust' AND ${t.proposedKcal} IS NOT NULL
      AND ${t.proposedProteinG} IS NOT NULL AND ${t.proposedCarbsG} IS NOT NULL
      AND ${t.proposedFatG} IS NOT NULL AND ${t.deltaKcal} IS NOT NULL AND ${t.reason} IS NOT NULL
    ) OR (
      ${t.status} <> 'adjust' AND ${t.proposedKcal} IS NULL
      AND ${t.proposedProteinG} IS NULL AND ${t.proposedCarbsG} IS NULL
      AND ${t.proposedFatG} IS NULL AND ${t.deltaKcal} IS NULL AND ${t.reason} IS NULL
    )`,
    ),
  ],
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

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('push_subscriptions_endpoint_idx').on(t.endpoint),
    index('push_subscriptions_user_id_idx').on(t.userId),
  ],
);

/** Only reminders the user changed are stored; missing slots use the shared defaults. */
export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    slot: reminderSlot('slot').notNull(),
    enabled: boolean('enabled').notNull(),
    time: text('time').notNull(),
    message: text('message'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('reminders_user_id_slot_idx').on(t.userId, t.slot),
    check('reminders_time_check', sql`${t.time} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check('reminders_message_check', sql`char_length(${t.message}) BETWEEN 1 AND 120`),
  ],
);

/** One row per reminder sent, so a slot fires at most once per local day. */
export const reminderDeliveries = pgTable(
  'reminder_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    slot: reminderSlot('slot').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('reminder_deliveries_user_id_slot_date_idx').on(t.userId, t.slot, t.date)],
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

export const textLogUsage = pgTable(
  'text_log_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    model: text('model'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    attempts: integer('attempts').notNull().default(0),
    outcome: text('outcome').notNull(),
    kind: text('kind').notNull().default('text'),
  },
  (t) => [
    check('text_log_usage_kind_check', sql`${t.kind} IN ('text', 'photo')`),
    index('text_log_usage_user_id_kind_created_at_idx').on(t.userId, t.kind, t.createdAt),
    index('text_log_usage_user_id_created_at_idx').on(t.userId, t.createdAt),
    check(
      'text_log_usage_outcome_check',
      sql`${t.outcome} IN ('ok', 'invalid_output', 'timeout', 'provider_error', 'rate_limited', 'non_free_model', 'no_models')`,
    ),
  ],
);

export const textLogModels = pgTable(
  'text_log_models',
  {
    id: integer('id').primaryKey().default(1),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    candidates: jsonb('candidates').$type<string[]>().notNull().default([]),
    freeRemaining: integer('free_remaining'),
    freeCheckedAt: timestamp('free_checked_at', { withTimezone: true }),
  },
  (t) => [check('text_log_models_singleton_check', sql`${t.id} = 1`)],
);

export const textLogModelHealth = pgTable('text_log_model_health', {
  model: text('model').primaryKey(),
  failures: integer('failures').notNull().default(0),
  lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
  degradedUntil: timestamp('degraded_until', { withTimezone: true }),
});
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type ReminderRow = typeof reminders.$inferSelect;
