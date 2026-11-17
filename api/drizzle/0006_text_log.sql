CREATE TABLE "text_log_model_health" (
	"model" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_failure_at" timestamp with time zone,
	"degraded_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "text_log_models" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"checked_at" timestamp with time zone,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"free_remaining" integer,
	"free_checked_at" timestamp with time zone,
	CONSTRAINT "text_log_models_singleton_check" CHECK ("text_log_models"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "text_log_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"outcome" text NOT NULL,
	CONSTRAINT "text_log_usage_outcome_check" CHECK ("text_log_usage"."outcome" IN ('ok', 'invalid_output', 'timeout', 'provider_error', 'rate_limited', 'non_free_model', 'no_models'))
);
--> statement-breakpoint
ALTER TABLE "text_log_usage" ADD CONSTRAINT "text_log_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "text_log_usage_user_id_created_at_idx" ON "text_log_usage" USING btree ("user_id","created_at");