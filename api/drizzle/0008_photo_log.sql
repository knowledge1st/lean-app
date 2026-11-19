ALTER TABLE "text_log_usage" ADD COLUMN "kind" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
CREATE INDEX "text_log_usage_user_id_kind_created_at_idx" ON "text_log_usage" USING btree ("user_id","kind","created_at");--> statement-breakpoint
ALTER TABLE "text_log_usage" ADD CONSTRAINT "text_log_usage_kind_check" CHECK ("text_log_usage"."kind" IN ('text', 'photo'));