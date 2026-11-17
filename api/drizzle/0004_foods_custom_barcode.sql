DROP INDEX IF EXISTS "foods_owner_barcode_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "foods_custom_barcode_idx" ON "foods" USING btree ("barcode") WHERE "foods"."barcode" IS NOT NULL AND "foods"."source" = 'custom';
