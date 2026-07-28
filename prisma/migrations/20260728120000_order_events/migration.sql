-- Section 7: append-only order activity / status history

CREATE TABLE IF NOT EXISTS "order_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "from_status" VARCHAR(40),
    "to_status" VARCHAR(40),
    "payload" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "order_events_order_id_created_at_idx"
  ON "order_events"("order_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "order_events_actor_id_idx"
  ON "order_events"("actor_id");

ALTER TABLE "order_events"
  ADD CONSTRAINT "order_events_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_events"
  ADD CONSTRAINT "order_events_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
