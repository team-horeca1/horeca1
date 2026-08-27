-- Payout / grant tracking keys (H1P-XXXXXX) on cashback entries and payout invites.

ALTER TABLE "cashback_entries" ADD COLUMN "tracking_key" VARCHAR(16);
ALTER TABLE "payout_invites" ADD COLUMN "tracking_key" VARCHAR(16);

DO $$
DECLARE
  r RECORD;
  k TEXT;
  n INT;
BEGIN
  FOR r IN SELECT id FROM cashback_entries WHERE tracking_key IS NULL LOOP
    n := 0;
    LOOP
      k := 'H1P-' || UPPER(substr(md5(r.id::text || n::text), 1, 6));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM cashback_entries WHERE tracking_key = k)
             AND NOT EXISTS (SELECT 1 FROM payout_invites WHERE tracking_key = k);
      n := n + 1;
    END LOOP;
    UPDATE cashback_entries SET tracking_key = k WHERE id = r.id;
  END LOOP;

  FOR r IN SELECT id FROM payout_invites WHERE tracking_key IS NULL LOOP
    n := 0;
    LOOP
      k := 'H1P-' || UPPER(substr(md5('invite' || r.id::text || n::text), 1, 6));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM cashback_entries WHERE tracking_key = k)
             AND NOT EXISTS (SELECT 1 FROM payout_invites WHERE tracking_key = k);
      n := n + 1;
    END LOOP;
    UPDATE payout_invites SET tracking_key = k WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX "cashback_entries_tracking_key_key" ON "cashback_entries"("tracking_key");
CREATE UNIQUE INDEX "payout_invites_tracking_key_key" ON "payout_invites"("tracking_key");
