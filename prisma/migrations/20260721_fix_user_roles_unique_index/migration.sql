-- Replace truncated user_roles unique index with a short explicit name so
-- `prisma migrate diff` matches schema.prisma (Postgres 63-char identifier limit).
DROP INDEX IF EXISTS "user_roles_user_id_business_account_id_outlet_id_vendor_id_role_id_key";
DROP INDEX IF EXISTS "user_roles_user_id_business_account_id_outlet_id_vendor_id_role";
DROP INDEX IF EXISTS "user_roles_user_id_business_account_id_outlet_id_vendor_id__key";
CREATE UNIQUE INDEX IF NOT EXISTS "user_roles_user_ba_outlet_vendor_role_key"
  ON "user_roles"("user_id", "business_account_id", "outlet_id", "vendor_id", "role_id");
