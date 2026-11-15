CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."activity_level" AS ENUM('sedentary', 'light', 'moderate', 'active');--> statement-breakpoint
CREATE TYPE "public"."composition_preset" AS ENUM('cut', 'recomp', 'lean_bulk');--> statement-breakpoint
CREATE TYPE "public"."entry_status" AS ENUM('planned', 'eaten');--> statement-breakpoint
CREATE TYPE "public"."food_source" AS ENUM('off', 'seed', 'custom');--> statement-breakpoint
CREATE TYPE "public"."goal_mode" AS ENUM('target_weight', 'body_composition', 'manual');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."meal" AS ENUM('breakfast', 'lunch', 'afternoon_snack', 'dinner', 'snack');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('female', 'male');--> statement-breakpoint
CREATE TYPE "public"."target_reason" AS ENUM('initial', 'adjustment', 'manual');--> statement-breakpoint
CREATE TABLE "body_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"weight_kg" numeric(5, 2),
	"body_fat_pct" numeric(4, 1),
	"waist_cm" numeric(5, 1),
	"hip_cm" numeric(5, 1),
	"chest_cm" numeric(5, 1),
	"arm_cm" numeric(5, 1),
	"thigh_cm" numeric(5, 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "body_logs_weight_kg_check" CHECK ("body_logs"."weight_kg" > 0),
	CONSTRAINT "body_logs_body_fat_pct_check" CHECK ("body_logs"."body_fat_pct" > 0),
	CONSTRAINT "body_logs_waist_cm_check" CHECK ("body_logs"."waist_cm" > 0),
	CONSTRAINT "body_logs_hip_cm_check" CHECK ("body_logs"."hip_cm" > 0),
	CONSTRAINT "body_logs_chest_cm_check" CHECK ("body_logs"."chest_cm" > 0),
	CONSTRAINT "body_logs_arm_cm_check" CHECK ("body_logs"."arm_cm" > 0),
	CONSTRAINT "body_logs_thigh_cm_check" CHECK ("body_logs"."thigh_cm" > 0)
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"avg_intake_kcal" integer,
	"trend_weight_kg" numeric(5, 2),
	"estimated_tdee" integer,
	"proposed_kcal" integer,
	"accepted" boolean,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"activity" text NOT NULL,
	"minutes" integer NOT NULL,
	"kcal" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_logs_minutes_check" CHECK ("exercise_logs"."minutes" >= 0),
	CONSTRAINT "exercise_logs_kcal_check" CHECK ("exercise_logs"."kcal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "food_source" NOT NULL,
	"owner_id" uuid,
	"barcode" text,
	"name" text NOT NULL,
	"brand" text,
	"kcal_per_100g" integer NOT NULL,
	"protein_per_100g" numeric(6, 2) NOT NULL,
	"carbs_per_100g" numeric(6, 2) NOT NULL,
	"fat_per_100g" numeric(6, 2) NOT NULL,
	"serving_grams" numeric(7, 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "foods_source_owner_check" CHECK (("foods"."source" = 'custom') = ("foods"."owner_id" IS NOT NULL)),
	CONSTRAINT "foods_kcal_per_100g_check" CHECK ("foods"."kcal_per_100g" >= 0),
	CONSTRAINT "foods_protein_per_100g_check" CHECK ("foods"."protein_per_100g" >= 0),
	CONSTRAINT "foods_carbs_per_100g_check" CHECK ("foods"."carbs_per_100g" >= 0),
	CONSTRAINT "foods_fat_per_100g_check" CHECK ("foods"."fat_per_100g" >= 0),
	CONSTRAINT "foods_serving_grams_check" CHECK ("foods"."serving_grams" >= 0)
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" "goal_mode" NOT NULL,
	"start_weight_kg" numeric(5, 1) NOT NULL,
	"target_weight_kg" numeric(5, 1),
	"target_date" date,
	"preset" "composition_preset",
	"status" "goal_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"ip" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"meal" "meal" NOT NULL,
	"food_id" uuid NOT NULL,
	"grams" numeric(7, 1) NOT NULL,
	"status" "entry_status" DEFAULT 'eaten' NOT NULL,
	"kcal" integer NOT NULL,
	"protein" numeric(7, 2) NOT NULL,
	"carbs" numeric(7, 2) NOT NULL,
	"fat" numeric(7, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_entries_grams_check" CHECK ("meal_entries"."grams" > 0),
	CONSTRAINT "meal_entries_kcal_check" CHECK ("meal_entries"."kcal" >= 0),
	CONSTRAINT "meal_entries_protein_check" CHECK ("meal_entries"."protein" >= 0),
	CONSTRAINT "meal_entries_carbs_check" CHECK ("meal_entries"."carbs" >= 0),
	CONSTRAINT "meal_entries_fat_check" CHECK ("meal_entries"."fat" >= 0)
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"date" date NOT NULL,
	"expected_weight_kg" numeric(5, 1) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"sex" "sex",
	"birth_date" date,
	"height_cm" numeric(5, 1),
	"activity_level" "activity_level",
	"time_zone" text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"food_id" uuid,
	"text" text,
	"grams" numeric(8, 1),
	"purchased" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopping_items_food_or_text_check" CHECK ("shopping_items"."food_id" IS NOT NULL OR "shopping_items"."text" IS NOT NULL),
	CONSTRAINT "shopping_items_grams_check" CHECK ("shopping_items"."grams" >= 0)
);
--> statement-breakpoint
CREATE TABLE "targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"kcal" integer NOT NULL,
	"protein_g" numeric(6, 1) NOT NULL,
	"carbs_g" numeric(6, 1) NOT NULL,
	"fat_g" numeric(6, 1) NOT NULL,
	"water_ml" integer NOT NULL,
	"reason" "target_reason" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "targets_kcal_check" CHECK ("targets"."kcal" >= 0),
	CONSTRAINT "targets_protein_g_check" CHECK ("targets"."protein_g" >= 0),
	CONSTRAINT "targets_carbs_g_check" CHECK ("targets"."carbs_g" >= 0),
	CONSTRAINT "targets_fat_g_check" CHECK ("targets"."fat_g" >= 0),
	CONSTRAINT "targets_water_ml_check" CHECK ("targets"."water_ml" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "water_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"ml" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "water_logs_ml_check" CHECK ("water_logs"."ml" >= 0)
);
--> statement-breakpoint
ALTER TABLE "body_logs" ADD CONSTRAINT "body_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_logs" ADD CONSTRAINT "exercise_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_entries" ADD CONSTRAINT "meal_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_entries" ADD CONSTRAINT "meal_entries_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "water_logs" ADD CONSTRAINT "water_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "body_logs_user_id_date_idx" ON "body_logs" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "checkins_goal_id_week_start_idx" ON "checkins" USING btree ("goal_id","week_start");--> statement-breakpoint
CREATE INDEX "exercise_logs_user_id_date_idx" ON "exercise_logs" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "foods_barcode_idx" ON "foods" USING btree ("barcode") WHERE "foods"."barcode" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "foods_name_trgm_idx" ON "foods" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "foods_brand_trgm_idx" ON "foods" USING gin ("brand" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "foods_owner_id_idx" ON "foods" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "goals_user_id_idx" ON "goals" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goals_one_active_idx" ON "goals" USING btree ("user_id") WHERE "goals"."status" = 'active';--> statement-breakpoint
CREATE INDEX "login_attempts_username_created_at_idx" ON "login_attempts" USING btree ("username","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_created_at_idx" ON "login_attempts" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "meal_entries_user_id_date_idx" ON "meal_entries" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "milestones_goal_id_date_idx" ON "milestones" USING btree ("goal_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shopping_items_user_id_week_start_idx" ON "shopping_items" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE INDEX "targets_goal_id_effective_from_idx" ON "targets" USING btree ("goal_id","effective_from");--> statement-breakpoint
CREATE INDEX "water_logs_user_id_date_idx" ON "water_logs" USING btree ("user_id","date");