-- Remove payment/account scope and user-level locale finance settings from the backend schema.

ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "Transaction_accountId_fkey";
ALTER TABLE "Account" DROP CONSTRAINT IF EXISTS "Account_userId_fkey";

DROP INDEX IF EXISTS "Account_userId_idx";

ALTER TABLE "UserProfile"
  DROP COLUMN IF EXISTS "defaultCurrency",
  DROP COLUMN IF EXISTS "timezone";

ALTER TABLE "Transaction"
  DROP COLUMN IF EXISTS "currency",
  DROP COLUMN IF EXISTS "accountId";

ALTER TABLE "Budget"
  DROP COLUMN IF EXISTS "currency";

DROP TABLE IF EXISTS "Account";
DROP TYPE IF EXISTS "AccountType";
