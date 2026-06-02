-- Remove subscription tables, fields, constraints, indexes and enum values from existing databases.

ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "Transaction_subscriptionId_fkey";
ALTER TABLE "Attachment" DROP CONSTRAINT IF EXISTS "Attachment_subscriptionId_fkey";
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_userId_fkey";
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_accountId_fkey";
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_categoryId_fkey";

DROP INDEX IF EXISTS "Subscription_userId_status_idx";
DROP INDEX IF EXISTS "Subscription_userId_nextBillingAt_idx";

ALTER TABLE "Transaction" DROP COLUMN IF EXISTS "subscriptionId";
ALTER TABLE "Attachment" DROP COLUMN IF EXISTS "subscriptionId";
ALTER TABLE "Budget" DROP COLUMN IF EXISTS "includeSubscriptions";

DROP TABLE IF EXISTS "Subscription";
DROP TYPE IF EXISTS "SubscriptionStatus";
DROP TYPE IF EXISTS "BillingCycle";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum enum_value
    JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
    WHERE enum_type.typname = 'TransactionSource'
      AND enum_value.enumlabel = 'subscription'
  ) THEN
    CREATE TYPE "TransactionSource_new" AS ENUM ('manual', 'ai_parse', 'import');
    ALTER TABLE "Transaction" ALTER COLUMN "source" DROP DEFAULT;
    ALTER TABLE "Transaction"
      ALTER COLUMN "source" TYPE "TransactionSource_new"
      USING (
        CASE
          WHEN "source"::text = 'subscription' THEN 'manual'
          ELSE "source"::text
        END
      )::"TransactionSource_new";
    ALTER TABLE "Transaction" ALTER COLUMN "source" SET DEFAULT 'manual';
    DROP TYPE "TransactionSource";
    ALTER TYPE "TransactionSource_new" RENAME TO "TransactionSource";
  END IF;
END $$;
