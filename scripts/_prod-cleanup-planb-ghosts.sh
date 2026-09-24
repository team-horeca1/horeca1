#!/bin/bash
set -e
cd /opt/horeca1/docker
echo '=== BEFORE cleanup counts ==='
docker compose -f docker-compose.prod.yml exec -T postgres psql -U horeca1 -d horeca1 -c "SELECT COUNT(*) AS active_planb_masters FROM master_products WHERE (brand ILIKE 'Plan B' OR name ILIKE 'Plan B Vegan%') AND is_active = true;"
docker compose -f docker-compose.prod.yml exec -T postgres psql -U horeca1 -d horeca1 -c "SELECT COUNT(*) AS orphan_bmps FROM brand_master_products bmp JOIN brands b ON b.id=bmp.brand_id WHERE b.name ILIKE 'Plan B' AND NOT EXISTS (SELECT 1 FROM brand_product_mappings m WHERE m.brand_master_product_id=bmp.id);"

echo '=== Deactivate orphan Plan B masters (no live vendor listing) ==='
docker compose -f docker-compose.prod.yml exec -T postgres psql -U horeca1 -d horeca1 -c "
UPDATE master_products mp
SET is_active = false
WHERE (mp.brand ILIKE 'Plan B' OR mp.name ILIKE 'Plan B Vegan%')
  AND mp.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM products p
    WHERE p.master_product_id = mp.id
      AND p.slug NOT LIKE '_deleted_%'
  );
"

echo '=== Delete orphan Plan B brand products (0 mappings) ==='
docker compose -f docker-compose.prod.yml exec -T postgres psql -U horeca1 -d horeca1 -c "
DELETE FROM brand_master_products bmp
USING brands b
WHERE bmp.brand_id = b.id
  AND b.name ILIKE 'Plan B'
  AND NOT EXISTS (
    SELECT 1 FROM brand_product_mappings m
    WHERE m.brand_master_product_id = bmp.id
  );
"

echo '=== AFTER cleanup counts ==='
docker compose -f docker-compose.prod.yml exec -T postgres psql -U horeca1 -d horeca1 -c "SELECT COUNT(*) AS active_planb_masters FROM master_products WHERE (brand ILIKE 'Plan B' OR name ILIKE 'Plan B Vegan%') AND is_active = true;"
docker compose -f docker-compose.prod.yml exec -T postgres psql -U horeca1 -d horeca1 -c "SELECT COUNT(*) AS remaining_bmps FROM brand_master_products bmp JOIN brands b ON b.id=bmp.brand_id WHERE b.name ILIKE 'Plan B';"
docker compose -f docker-compose.prod.yml exec -T postgres psql -U horeca1 -d horeca1 -c "SELECT COUNT(*) AS live_vendor_products FROM products p WHERE (p.brand ILIKE 'Plan B' OR p.name ILIKE 'Plan B Vegan%') AND p.slug NOT LIKE '_deleted_%';"
echo DONE
