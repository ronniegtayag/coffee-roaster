-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "totalWeightGrams" SET DATA TYPE BIGINT;


-- ─── Hand-written (code review of 20261119082000) ──────────────────────────────

-- Prisma creates Int[] columns as nullable, and cardinality(NULL) > 0 is NULL, which a CHECK
-- accepts. Require the arrays explicitly (a NOT NULL column would show as drift to Prisma).
ALTER TABLE "roast_calendar_settings" DROP CONSTRAINT "roast_calendar_settings_chk";
ALTER TABLE "roast_calendar_settings" ADD CONSTRAINT "roast_calendar_settings_chk" CHECK (
  "id" = 1
  AND "roastDays" IS NOT NULL AND cardinality("roastDays") > 0 AND "roastDays" <@ ARRAY[1,2,3,4,5,6,7]
  AND "deliveryDays" IS NOT NULL AND cardinality("deliveryDays") > 0 AND "deliveryDays" <@ ARRAY[1,2,3,4,5,6,7]
  AND "businessDays" IS NOT NULL AND cardinality("businessDays") > 0 AND "businessDays" <@ ARRAY[1,2,3,4,5,6,7]
  AND "cutoffTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "cutoffLeadBusinessDays" BETWEEN 0 AND 14
  AND "deliveryLagBusinessDays" BETWEEN 0 AND 14
);

-- Coffee and grind names are unique case-insensitively, ignoring outer spaces, so two saves
-- racing past the service's pre-check can't both succeed (map the violation to *_NAME_TAKEN).
CREATE UNIQUE INDEX "coffees_name_lower_key" ON "coffees" (lower(btrim("name")));
CREATE UNIQUE INDEX "grinds_name_lower_key" ON "grinds" (lower(btrim("name")));
