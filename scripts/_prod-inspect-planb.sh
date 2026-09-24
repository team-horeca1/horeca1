#!/bin/bash
set -e
cd /opt/horeca1/docker
echo '=== MASTERS ==='
docker compose -f docker-compose.prod.yml exec -T postgres psql -U horeca1 -d horeca1 -c "SELECT sku, LEFT(name,45) AS name, is_active, approval_status FROM master_products WHERE brand ILIKE 'Plan B' OR name ILIKE 'Plan B Vegan%' ORDER BY created_at DESC LIMIT 40;"
echo '=== PRODUCTS ==='
docker compose -f docker-compose.prod.yml exec -T postgres psql -U horeca1 -d horeca1 -c "SELECT LEFT(p.name,35) AS name, p.approval_status, p.is_active, LEFT(p.slug,25) AS slug, v.business_name FROM products p LEFT JOIN vendors v ON v.id=p.vendor_id WHERE p.brand ILIKE 'Plan B' OR p.name ILIKE 'Plan B Vegan%' ORDER BY p.created_at DESC LIMIT 40;"
echo '=== BRANDS ==='
docker compose -f docker-compose.prod.yml exec -T postgres psql -U horeca1 -d horeca1 -c "SELECT name, approval_status, created_at FROM brands WHERE name ILIKE 'Plan B';"
echo '=== BMP ==='
docker compose -f docker-compose.prod.yml exec -T postgres psql -U horeca1 -d horeca1 -c "SELECT bmp.sku, LEFT(bmp.name,40) AS name, bmp.is_active, (SELECT COUNT(*) FROM brand_product_mappings m WHERE m.brand_master_product_id=bmp.id) AS maps FROM brand_master_products bmp JOIN brands b ON b.id=bmp.brand_id WHERE b.name ILIKE 'Plan B' ORDER BY bmp.name;"
