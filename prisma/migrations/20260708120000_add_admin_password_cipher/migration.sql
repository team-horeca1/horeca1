-- Idempotent: column may already exist on prod (applied via db push / partial deploy).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "admin_password_cipher" TEXT;
