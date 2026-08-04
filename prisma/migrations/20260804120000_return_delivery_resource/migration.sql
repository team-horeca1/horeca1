-- Link return pickups to the same DeliveryResource roster used for dispatch.
ALTER TABLE "return_requests" ADD COLUMN "delivery_resource_id" UUID;

CREATE INDEX "return_requests_delivery_resource_id_idx" ON "return_requests"("delivery_resource_id");

ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_delivery_resource_id_fkey"
  FOREIGN KEY ("delivery_resource_id") REFERENCES "delivery_resources"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
