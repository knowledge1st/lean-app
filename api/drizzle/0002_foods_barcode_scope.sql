DROP INDEX "foods_barcode_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "foods_shared_barcode_idx" ON "foods" USING btree ("barcode") WHERE "foods"."barcode" IS NOT NULL AND "foods"."source" <> 'custom';--> statement-breakpoint
CREATE UNIQUE INDEX "foods_owner_barcode_idx" ON "foods" USING btree ("owner_id","barcode") WHERE "foods"."barcode" IS NOT NULL AND "foods"."source" = 'custom';