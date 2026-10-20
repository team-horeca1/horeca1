-- Extend the target-consistency CHECK for the assignment types added
-- after the baseline: 'group' and 'credit_status' (workspace V2).
-- Without this, INSERTs of those types violate the old constraint (500).

ALTER TABLE "price_list_assignments"
  DROP CONSTRAINT IF EXISTS "price_list_assignments_target_consistency";

ALTER TABLE "price_list_assignments"
  ADD CONSTRAINT "price_list_assignments_target_consistency" CHECK (
        ("type" = 'customer' AND ("user_id" IS NOT NULL OR "business_account_id" IS NOT NULL)
                              AND "outlet_id" IS NULL AND "brand_id" IS NULL AND "group_id" IS NULL
                              AND "pincode" IS NULL AND "area" IS NULL AND "segment" IS NULL AND "brand_name" IS NULL AND "credit_status" IS NULL)
        OR
        ("type" = 'outlet'   AND "outlet_id" IS NOT NULL
                              AND "user_id" IS NULL AND "business_account_id" IS NULL AND "brand_id" IS NULL AND "group_id" IS NULL
                              AND "pincode" IS NULL AND "area" IS NULL AND "segment" IS NULL AND "brand_name" IS NULL AND "credit_status" IS NULL)
        OR
        ("type" = 'pincode'  AND "pincode" IS NOT NULL
                              AND "user_id" IS NULL AND "business_account_id" IS NULL AND "outlet_id" IS NULL AND "group_id" IS NULL
                              AND "brand_id" IS NULL AND "area" IS NULL AND "segment" IS NULL AND "brand_name" IS NULL AND "credit_status" IS NULL)
        OR
        ("type" = 'area'     AND "area" IS NOT NULL
                              AND "user_id" IS NULL AND "business_account_id" IS NULL AND "outlet_id" IS NULL AND "group_id" IS NULL
                              AND "brand_id" IS NULL AND "pincode" IS NULL AND "segment" IS NULL AND "brand_name" IS NULL AND "credit_status" IS NULL)
        OR
        ("type" = 'segment'  AND "segment" IS NOT NULL
                              AND "user_id" IS NULL AND "business_account_id" IS NULL AND "outlet_id" IS NULL AND "group_id" IS NULL
                              AND "brand_id" IS NULL AND "pincode" IS NULL AND "area" IS NULL AND "brand_name" IS NULL AND "credit_status" IS NULL)
        OR
        ("type" = 'brand'    AND ("brand_id" IS NOT NULL OR "brand_name" IS NOT NULL)
                              AND "user_id" IS NULL AND "business_account_id" IS NULL AND "outlet_id" IS NULL AND "group_id" IS NULL
                              AND "pincode" IS NULL AND "area" IS NULL AND "segment" IS NULL AND "credit_status" IS NULL)
        OR
        ("type" = 'group'    AND "group_id" IS NOT NULL
                              AND "user_id" IS NULL AND "business_account_id" IS NULL AND "outlet_id" IS NULL AND "brand_id" IS NULL
                              AND "pincode" IS NULL AND "area" IS NULL AND "segment" IS NULL AND "brand_name" IS NULL AND "credit_status" IS NULL)
        OR
        ("type" = 'credit_status' AND "credit_status" IS NOT NULL
                              AND "user_id" IS NULL AND "business_account_id" IS NULL AND "outlet_id" IS NULL AND "brand_id" IS NULL AND "group_id" IS NULL
                              AND "pincode" IS NULL AND "area" IS NULL AND "segment" IS NULL AND "brand_name" IS NULL)
    );
