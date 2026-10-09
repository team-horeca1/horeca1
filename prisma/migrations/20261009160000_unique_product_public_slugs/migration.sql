-- A short product URL can open only one listing. Keep the oldest product on a
-- shared slug and give every later copy its own store suffix, so editing a
-- product cannot move that URL to a different shop.

DO $$
DECLARE
  rec record;
  last_key text := '';
  store_bit text;
  suffix text;
  candidate text;
  n int;
BEGIN
  FOR rec IN
    SELECT p.id, p.slug, v.slug AS vendor_slug
    FROM products p
    LEFT JOIN vendors v ON v.id = p.vendor_id
    WHERE left(p.slug, 9) <> '_deleted_'
      AND lower(p.slug) IN (
        SELECT lower(slug)
        FROM products
        WHERE left(slug, 9) <> '_deleted_'
        GROUP BY lower(slug)
        HAVING count(*) > 1
      )
    ORDER BY lower(p.slug), p.created_at ASC, p.id ASC
  LOOP
    IF last_key IS DISTINCT FROM lower(rec.slug) THEN
      last_key := lower(rec.slug);
      CONTINUE;
    END IF;

    store_bit := regexp_replace(
      coalesce(nullif(rec.vendor_slug, ''), replace(rec.id::text, '-', '')),
      '-[0-9a-f]{8}$',
      ''
    );
    store_bit := left(regexp_replace(lower(store_bit), '[^a-z0-9-]', '', 'g'), 24);
    IF store_bit IS NULL OR store_bit = '' THEN
      store_bit := left(replace(rec.id::text, '-', ''), 8);
    END IF;

    n := 0;
    LOOP
      IF n = 0 THEN
        suffix := '-' || store_bit;
      ELSE
        suffix := '-' || store_bit || '-' || n::text;
      END IF;

      candidate := left(regexp_replace(rec.slug, '-+$', ''), greatest(8, 80 - char_length(suffix))) || suffix;
      candidate := regexp_replace(candidate, '-{2,}', '-', 'g');
      candidate := regexp_replace(candidate, '^-+|-+$', '', 'g');

      EXIT WHEN char_length(candidate) >= 2
        AND NOT EXISTS (SELECT 1 FROM products WHERE lower(slug) = lower(candidate))
        AND NOT EXISTS (SELECT 1 FROM vendors WHERE lower(slug) = lower(candidate))
        AND NOT EXISTS (SELECT 1 FROM brands WHERE lower(slug) = lower(candidate));

      n := n + 1;
      IF n > 50 THEN
        RAISE EXCEPTION 'Could not uniquify product slug %', rec.slug;
      END IF;
    END LOOP;

    UPDATE products SET slug = candidate WHERE id = rec.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "products_slug_lower_unique"
ON "products" (lower("slug"))
WHERE left("slug", 9) <> '_deleted_';
