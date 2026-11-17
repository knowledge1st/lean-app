CREATE TYPE "public"."checkin_reason" AS ENUM('slower_than_plan', 'faster_than_plan');--> statement-breakpoint
CREATE TYPE "public"."checkin_status" AS ENUM('insufficient_data', 'on_track', 'adjust');--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "status" "checkin_status" NOT NULL;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "reason" "checkin_reason";--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "logged_days" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "weigh_ins" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "actual_weekly_change_kg" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "expected_weekly_change_kg" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "current_kcal" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "current_protein_g" numeric(6, 1) NOT NULL;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "current_carbs_g" numeric(6, 1) NOT NULL;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "current_fat_g" numeric(6, 1) NOT NULL;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "proposed_protein_g" numeric(6, 1);--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "proposed_carbs_g" numeric(6, 1);--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "proposed_fat_g" numeric(6, 1);--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "delta_kcal" integer;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "target_id" uuid;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_proposal_check" CHECK ((
      "checkins"."status" = 'adjust' AND "checkins"."proposed_kcal" IS NOT NULL
      AND "checkins"."proposed_protein_g" IS NOT NULL AND "checkins"."proposed_carbs_g" IS NOT NULL
      AND "checkins"."proposed_fat_g" IS NOT NULL AND "checkins"."delta_kcal" IS NOT NULL AND "checkins"."reason" IS NOT NULL
    ) OR (
      "checkins"."status" <> 'adjust' AND "checkins"."proposed_kcal" IS NULL
      AND "checkins"."proposed_protein_g" IS NULL AND "checkins"."proposed_carbs_g" IS NULL
      AND "checkins"."proposed_fat_g" IS NULL AND "checkins"."delta_kcal" IS NULL AND "checkins"."reason" IS NULL
    ));