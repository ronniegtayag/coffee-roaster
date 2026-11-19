-- Hand-written guard: this migration reshapes products and orders and assumes they are empty
-- (no endpoint has ever created them). Abort rather than lose data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "products") OR EXISTS (SELECT 1 FROM "orders")
     OR EXISTS (SELECT 1 FROM "order_items") OR EXISTS (SELECT 1 FROM "inventory_items") THEN
    RAISE EXCEPTION 'ordering migration expects empty products, orders, order_items and inventory_items';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "CoffeeType" AS ENUM ('SINGLE_ORIGIN', 'BLEND');

-- CreateEnum
CREATE TYPE "OrderEventType" AS ENUM ('CREATED', 'UPDATED', 'CONFIRMED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'REVERTED');

-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('DRAFT', 'CONFIRMED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'CANCELLED');
ALTER TABLE "public"."orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- DropForeignKey
ALTER TABLE "inventory_items" DROP CONSTRAINT "inventory_items_productId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_invoiceId_fkey";

-- DropIndex
DROP INDEX "order_items_orderId_idx";

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "gstAmount" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "lineTotalExGst" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "lineTotalIncGst" DECIMAL(12,2) NOT NULL;

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "orderedAt",
DROP COLUMN "requestedDeliveryDate",
ADD COLUMN     "afterCutoff" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMPTZ(6),
ADD COLUMN     "confirmedAt" TIMESTAMPTZ(6),
ADD COLUMN     "createdById" UUID NOT NULL,
ADD COLUMN     "customerId" UUID NOT NULL,
ADD COLUMN     "deliveredAt" TIMESTAMPTZ(6),
ADD COLUMN     "deliveryDate" DATE NOT NULL,
ADD COLUMN     "dispatchedAt" TIMESTAMPTZ(6),
ADD COLUMN     "gstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "packedAt" TIMESTAMPTZ(6),
ADD COLUMN     "requestId" UUID NOT NULL,
ADD COLUMN     "roastDate" DATE NOT NULL,
ADD COLUMN     "subtotalExGst" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalIncGst" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalWeightGrams" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedById" UUID NOT NULL,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
DROP COLUMN "orderNumber",
ADD COLUMN     "orderNumber" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "products" DROP COLUMN "origin",
DROP COLUMN "roastLevel",
DROP COLUMN "unitPriceExGst",
DROP COLUMN "weightGrams",
ADD COLUMN     "bagSizeGrams" INTEGER,
ADD COLUMN     "coffeeId" UUID,
ADD COLUMN     "deactivatedAt" TIMESTAMPTZ(6),
ADD COLUMN     "grindId" UUID,
ADD COLUMN     "listPriceExGst" DECIMAL(12,2) NOT NULL,
ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "taxCode" DROP DEFAULT;

-- DropEnum
DROP TYPE "RoastLevel";

-- CreateTable
CREATE TABLE "coffees" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CoffeeType" NOT NULL,
    "origin" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "coffees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grinds" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "grinds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "type" "OrderEventType" NOT NULL,
    "userId" UUID NOT NULL,
    "reason" TEXT,
    "changes" JSONB,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roast_calendar_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "roastDays" INTEGER[],
    "deliveryDays" INTEGER[],
    "businessDays" INTEGER[],
    "cutoffTime" VARCHAR(5) NOT NULL,
    "cutoffLeadBusinessDays" INTEGER NOT NULL,
    "deliveryLagBusinessDays" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roast_calendar_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closure_days" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "closure_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coffees_isActive_idx" ON "coffees"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "grinds_name_key" ON "grinds"("name");

-- CreateIndex
CREATE INDEX "order_events_orderId_idx" ON "order_events"("orderId");

-- CreateIndex
CREATE INDEX "order_events_userId_idx" ON "order_events"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "closure_days_date_key" ON "closure_days"("date");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_orderId_productId_key" ON "order_items"("orderId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "orders_requestId_key" ON "orders"("requestId");

-- CreateIndex
CREATE INDEX "orders_customerId_idx" ON "orders"("customerId");

-- CreateIndex
CREATE INDEX "orders_deliveryDate_idx" ON "orders"("deliveryDate");

-- CreateIndex
CREATE INDEX "orders_roastDate_idx" ON "orders"("roastDate");

-- CreateIndex
CREATE INDEX "orders_createdById_idx" ON "orders"("createdById");

-- CreateIndex
CREATE INDEX "orders_updatedById_idx" ON "orders"("updatedById");

-- CreateIndex
CREATE INDEX "products_coffeeId_idx" ON "products"("coffeeId");

-- CreateIndex
CREATE INDEX "products_grindId_idx" ON "products"("grindId");

-- CreateIndex
CREATE INDEX "products_isActive_idx" ON "products"("isActive");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_coffeeId_fkey" FOREIGN KEY ("coffeeId") REFERENCES "coffees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_grindId_fkey" FOREIGN KEY ("grindId") REFERENCES "grinds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Hand-written (Prisma does not model these; it leaves them alone) ─────────

-- Order numbers are shown as "ORD-1001", "ORD-1002", ... (D-PO-15: not like MYOB invoice numbers).
ALTER SEQUENCE "orders_orderNumber_seq" RESTART WITH 1001;

-- Products: coffee products have coffee + bag size + grind and no name; non-coffee products
-- have a name and none of the three (D-PO-8).
ALTER TABLE "products" ADD CONSTRAINT "products_kind_chk" CHECK (
  ("coffeeId" IS NOT NULL AND "bagSizeGrams" IS NOT NULL AND "grindId" IS NOT NULL AND "name" IS NULL)
  OR ("coffeeId" IS NULL AND "bagSizeGrams" IS NULL AND "grindId" IS NULL AND "name" IS NOT NULL)
);
ALTER TABLE "products" ADD CONSTRAINT "products_bag_size_chk" CHECK ("bagSizeGrams" IS NULL OR "bagSizeGrams" > 0);
ALTER TABLE "products" ADD CONSTRAINT "products_list_price_chk" CHECK ("listPriceExGst" > 0);
ALTER TABLE "products" ADD CONSTRAINT "products_sku_normalised_chk" CHECK ("sku" = upper(btrim("sku")) AND "sku" <> '');
-- One ACTIVE product per coffee + bag size + grind (D-PO-8). Inactive duplicates are allowed.
CREATE UNIQUE INDEX "products_active_variant_key" ON "products" ("coffeeId", "bagSizeGrams", "grindId")
  WHERE "isActive" AND "coffeeId" IS NOT NULL;

-- Order lines: whole bags 1..999 (D-PO-11); amounts never negative.
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_chk" CHECK ("quantity" BETWEEN 1 AND 999);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_amounts_chk" CHECK (
  "unitPriceExGst" > 0 AND "lineTotalExGst" >= 0 AND "gstAmount" >= 0
  AND "lineTotalIncGst" = "lineTotalExGst" + "gstAmount"
);

-- Orders: roast on or before delivery (brief R1); totals add up.
ALTER TABLE "orders" ADD CONSTRAINT "orders_dates_chk" CHECK ("roastDate" <= "deliveryDate");
ALTER TABLE "orders" ADD CONSTRAINT "orders_totals_chk" CHECK (
  "subtotalExGst" >= 0 AND "gstAmount" >= 0 AND "totalIncGst" = "subtotalExGst" + "gstAmount"
  AND "totalWeightGrams" >= 0 AND "version" >= 1
);

-- Roast calendar: a single row; ISO weekdays 1..7; "HH:mm" cut-off.
ALTER TABLE "roast_calendar_settings" ADD CONSTRAINT "roast_calendar_settings_chk" CHECK (
  "id" = 1
  AND cardinality("roastDays") > 0 AND "roastDays" <@ ARRAY[1,2,3,4,5,6,7]
  AND cardinality("deliveryDays") > 0 AND "deliveryDays" <@ ARRAY[1,2,3,4,5,6,7]
  AND cardinality("businessDays") > 0 AND "businessDays" <@ ARRAY[1,2,3,4,5,6,7]
  AND "cutoffTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "cutoffLeadBusinessDays" BETWEEN 0 AND 14
  AND "deliveryLagBusinessDays" BETWEEN 0 AND 14
);

-- Default calendar (D-PO-13; assumptions, Q6 and OQ-PO-8): roast, deliver and business days
-- Mon-Fri, cut-off 12:00 Sydney one business day before the roast day, deliver 1 business day later.
INSERT INTO "roast_calendar_settings"
  ("id", "roastDays", "deliveryDays", "businessDays", "cutoffTime", "cutoffLeadBusinessDays", "deliveryLagBusinessDays", "updatedAt")
VALUES (1, ARRAY[1,2,3,4,5], ARRAY[1,2,3,4,5], ARRAY[1,2,3,4,5], '12:00', 1, 1, CURRENT_TIMESTAMP);

-- Default grinds (brief P1; assumption, Q5).
INSERT INTO "grinds" ("id", "name", "sortOrder", "updatedAt") VALUES
  (uuidv7(), 'Whole bean', 10, CURRENT_TIMESTAMP),
  (uuidv7(), 'Espresso', 20, CURRENT_TIMESTAMP),
  (uuidv7(), 'Filter', 30, CURRENT_TIMESTAMP);
