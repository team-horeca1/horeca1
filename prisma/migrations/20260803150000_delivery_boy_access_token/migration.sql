-- Shared delivery-boy portal magic link (one active token per DeliveryResource).
CREATE TABLE "delivery_boy_access_tokens" (
    "id" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "vendor_id" UUID NOT NULL,
    "delivery_resource_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_boy_access_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_boy_access_tokens_token_key" ON "delivery_boy_access_tokens"("token");
CREATE INDEX "delivery_boy_access_tokens_vendor_id_idx" ON "delivery_boy_access_tokens"("vendor_id");
CREATE INDEX "delivery_boy_access_tokens_delivery_resource_id_idx" ON "delivery_boy_access_tokens"("delivery_resource_id");
CREATE INDEX "delivery_boy_access_tokens_delivery_resource_id_revoked_at_idx" ON "delivery_boy_access_tokens"("delivery_resource_id", "revoked_at");
CREATE INDEX "delivery_boy_access_tokens_expires_at_idx" ON "delivery_boy_access_tokens"("expires_at");

ALTER TABLE "delivery_boy_access_tokens" ADD CONSTRAINT "delivery_boy_access_tokens_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_boy_access_tokens" ADD CONSTRAINT "delivery_boy_access_tokens_delivery_resource_id_fkey" FOREIGN KEY ("delivery_resource_id") REFERENCES "delivery_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
