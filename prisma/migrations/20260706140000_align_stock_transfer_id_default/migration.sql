-- Align stock_transfers.id with schema.prisma @default(uuid()).
-- Prisma generates UUIDs client-side — no database default (same pattern as
-- 20260630090000_align_audit_revision_id_defaults).
ALTER TABLE "stock_transfers" ALTER COLUMN "id" DROP DEFAULT;
