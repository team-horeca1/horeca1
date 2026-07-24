-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected', 'pending_edit', 'under_review', 'needs_changes', 'archived');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('draft', 'submitted');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('customer', 'vendor', 'admin', 'brand');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('owner', 'manager', 'editor', 'viewer');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('draft', 'pending', 'confirmed', 'processing', 'ready_for_dispatch', 'shipped', 'partially_delivered', 'delivered', 'returned', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentState" AS ENUM ('unpaid', 'paid', 'partial', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('created', 'authorized', 'captured', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "CreditStatus" AS ENUM ('pending', 'active', 'suspended', 'closed');

-- CreateEnum
CREATE TYPE "CreditTxnType" AS ENUM ('debit', 'credit', 'adjustment');

-- CreateEnum
CREATE TYPE "WalletTxnType" AS ENUM ('credit', 'debit');

-- CreateEnum
CREATE TYPE "credit_wallet_status" AS ENUM ('ACTIVE', 'BLOCKED', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "credit_wallet_txn_type" AS ENUM ('CREDIT_ASSIGN', 'ORDER_DEBIT', 'REPAYMENT', 'PENALTY', 'REVERSAL');

-- CreateEnum
CREATE TYPE "credit_repayment_mode" AS ENUM ('REPAY_BEFORE_NEXT_USE', 'ALLOW_USAGE_TILL_DUE');

-- CreateEnum
CREATE TYPE "billing_model_type" AS ENUM ('BILL_TO_BILL', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "credit_penalty_type" AS ENUM ('LATE_FEE', 'INTEREST');

-- CreateEnum
CREATE TYPE "credit_workflow_status" AS ENUM ('SANCTIONED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('sms', 'email', 'whatsapp', 'push', 'in_app');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "BrandDistributorInviteStatus" AS ENUM ('pending', 'contacted', 'onboarded', 'declined');

-- CreateEnum
CREATE TYPE "BrandAuthorizedDistributorStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "MappingStatus" AS ENUM ('auto_mapped', 'pending_review', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "MatchMethod" AS ENUM ('rule_based', 'manually_verified');

-- CreateEnum
CREATE TYPE "BusinessAccountStatus" AS ENUM ('active', 'suspended', 'deactivated');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('account', 'vendor', 'brand', 'admin', 'delivery');

-- CreateEnum
CREATE TYPE "VendorWalletTxnType" AS ENUM ('order_credit', 'settlement_debit', 'adjustment', 'refund_debit');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('pending', 'processing', 'settled', 'failed');

-- CreateEnum
CREATE TYPE "VendorCustomerStatus" AS ENUM ('active', 'blocked', 'suspended');

-- CreateEnum
CREATE TYPE "pricing_type" AS ENUM ('fixed', 'discount', 'special', 'scheme');

-- CreateEnum
CREATE TYPE "price_list_assignment_type" AS ENUM ('customer', 'outlet', 'pincode', 'area', 'segment', 'brand', 'group');

-- CreateEnum
CREATE TYPE "promotion_type" AS ENUM ('pct_discount', 'flat_discount', 'bxgy');

-- CreateEnum
CREATE TYPE "veg_type" AS ENUM ('veg', 'nonveg', 'egg');

-- CreateEnum
CREATE TYPE "vendor_claim_type" AS ENUM ('shortage', 'damage', 'quality', 'expiry');

-- CreateEnum
CREATE TYPE "vendor_claim_status" AS ENUM ('pending', 'approved', 'rejected', 'resolved');

-- CreateEnum
CREATE TYPE "picklist_status" AS ENUM ('draft', 'printed', 'picked', 'cancelled');

-- CreateEnum
CREATE TYPE "dispatch_status" AS ENUM ('pending', 'out_for_delivery', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "goods_receipt_status" AS ENUM ('draft', 'received', 'cancelled');

-- CreateEnum
CREATE TYPE "stock_transfer_status" AS ENUM ('pending', 'in_transit', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "commission_rule_scope" AS ENUM ('default', 'customer', 'brand', 'category');

-- CreateEnum
CREATE TYPE "commission_accrual_status" AS ENUM ('pending', 'approved', 'paid', 'cancelled');

-- CreateEnum
CREATE TYPE "promo_discount_type" AS ENUM ('flat', 'percentage');

-- CreateEnum
CREATE TYPE "coupon_redemption_status" AS ENUM ('active', 'reversed');

-- CreateEnum
CREATE TYPE "cashback_destination" AS ENUM ('wallet', 'upi');

-- CreateEnum
CREATE TYPE "cashback_entry_status" AS ENUM ('pending', 'approved', 'credited', 'paid', 'cancelled');

-- CreateEnum
CREATE TYPE "cashback_entry_source" AS ENUM ('order', 'direct_grant');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255),
    "email_verified" TIMESTAMP(3),
    "password" VARCHAR(255),
    "admin_password_cipher" TEXT,
    "phone" VARCHAR(20),
    "full_name" VARCHAR(255) NOT NULL DEFAULT '',
    "image" VARCHAR(512),
    "role" "Role" NOT NULL DEFAULT 'customer',
    "pincode" VARCHAR(10),
    "business_name" VARCHAR(255),
    "gst_number" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "profile_completed_at" TIMESTAMPTZ,
    "hcid_display" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linked_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "linked_user_id" UUID NOT NULL,
    "switch_token" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "linked_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "business_account_id" UUID NOT NULL,
    "business_name" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255),
    "is_primary_store" BOOLEAN NOT NULL DEFAULT false,
    "default_outlet_id" UUID,
    "slug" VARCHAR(255) NOT NULL,
    "vendor_code" VARCHAR(20),
    "description" TEXT,
    "logo_url" VARCHAR(512),
    "banner_url" VARCHAR(512),
    "rating" DECIMAL(2,1) NOT NULL DEFAULT 0,
    "min_order_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "credit_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "address_line" TEXT,
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "address_pincode" VARCHAR(10),
    "gst_number" VARCHAR(20),
    "platform_fee_pct" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "default_moq" INTEGER,
    "default_tax_percent" DECIMAL(5,2),
    "delivery_fee" DECIMAL(10,2),
    "free_delivery_above" DECIMAL(10,2),
    "return_policy" TEXT,
    "cancellation_policy" TEXT,
    "bank_account_name" VARCHAR(100),
    "bank_account_number" VARCHAR(30),
    "bank_ifsc" VARCHAR(15),
    "bank_name" VARCHAR(100),
    "bank_account_type" VARCHAR(20),
    "payment_modes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notification_prefs" JSONB NOT NULL DEFAULT '{}',
    "trade_name" VARCHAR(255),
    "vendor_type" VARCHAR(50),
    "setup_progress" JSONB,
    "multi_warehouse_enabled" BOOLEAN NOT NULL DEFAULT false,
    "auto_disable_oos" BOOLEAN NOT NULL DEFAULT false,
    "pan_number" VARCHAR(20),
    "authorized_person_name" VARCHAR(255),
    "authorized_person_phone" VARCHAR(20),
    "authorized_person_email" VARCHAR(255),
    "pickup_address_line" TEXT,
    "pickup_city" VARCHAR(100),
    "pickup_state" VARCHAR(100),
    "pickup_pincode" VARCHAR(10),
    "delivery_capability" VARCHAR(20),
    "fssai_number" VARCHAR(50),
    "udyam_number" VARCHAR(50),
    "cin_number" VARCHAR(50),
    "sub_type" VARCHAR(80),
    "vendor_type_selections" JSONB,
    "categories_handled" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "business_size" VARCHAR(50),
    "coverage" VARCHAR(120),
    "warehouse_count" INTEGER,
    "delivery_fleet" BOOLEAN,
    "monthly_supply_band" VARCHAR(50),

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_areas" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "outlet_id" UUID,
    "pincode" VARCHAR(10) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "service_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_slots" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "outlet_id" UUID,
    "day_of_week" INTEGER NOT NULL,
    "slot_start" VARCHAR(10) NOT NULL,
    "slot_end" VARCHAR(10) NOT NULL,
    "cutoff_time" VARCHAR(10) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "delivery_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_vendors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "business_account_id" UUID NOT NULL,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "last_ordered_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "parent_id" UUID,
    "image_url" VARCHAR(512),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'approved',
    "approval_note" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "suggested_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_categories" (
    "category_id" UUID NOT NULL,
    "sub_category_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "category_categories_pkey" PRIMARY KEY ("category_id","sub_category_id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "vendor_id" UUID,
    "category_id" UUID,
    "master_product_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "image_url" VARCHAR(512),
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pack_size" VARCHAR(100),
    "unit" VARCHAR(50),
    "sku" VARCHAR(100),
    "vendor_sku" VARCHAR(100),
    "hsn" VARCHAR(50),
    "fssai_ref" VARCHAR(50),
    "brand" VARCHAR(150),
    "barcode" VARCHAR(100),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "alias_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shelf_life_days" INTEGER,
    "country_of_origin" VARCHAR(100),
    "base_price" DECIMAL(10,2) NOT NULL,
    "original_price" DECIMAL(10,2),
    "tax_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "promo_price" DECIMAL(10,2),
    "promo_start_time" VARCHAR(5),
    "promo_end_time" VARCHAR(5),
    "min_order_qty" INTEGER NOT NULL DEFAULT 1,
    "veg_non_veg" "veg_type",
    "storage_type" VARCHAR(50),
    "substitute_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "credit_eligible" BOOLEAN NOT NULL DEFAULT false,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "listing_status" "ListingStatus" NOT NULL DEFAULT 'submitted',
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "approval_note" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "pending_edit_payload" JSONB,
    "metadata" JSONB DEFAULT '{}',
    "archived_at" TIMESTAMPTZ,
    "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "embedding_model" VARCHAR(80),
    "embedding_updated_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "product_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("product_id","category_id")
);

-- CreateTable
CREATE TABLE "product_audit_logs" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "field" VARCHAR(64) NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(32) NOT NULL,

    CONSTRAINT "product_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_product_revisions" (
    "id" UUID NOT NULL,
    "master_product_id" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "category_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "master_product_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_products" (
    "id" UUID NOT NULL,
    "sku" VARCHAR(40) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "alias_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "brand" VARCHAR(150),
    "pack_size" VARCHAR(100),
    "uom" VARCHAR(50),
    "tax_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "image_url" VARCHAR(512),
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "search_keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'approved',
    "approval_note" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "suggested_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB DEFAULT '{}',

    CONSTRAINT "master_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_product_categories" (
    "master_product_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_product_categories_pkey" PRIMARY KEY ("master_product_id","category_id")
);

-- CreateTable
CREATE TABLE "price_slabs" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "min_qty" INTEGER NOT NULL,
    "max_qty" INTEGER,
    "price" DECIMAL(10,2) NOT NULL,
    "promo_price" DECIMAL(10,2),
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "price_slabs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "image_url" VARCHAR(512),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_products" (
    "id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "collection_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_combos" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "combo_price" DECIMAL(10,2) NOT NULL,
    "original_price" DECIMAL(10,2),
    "image_url" VARCHAR(512),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMPTZ,
    "valid_to" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_combos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combo_items" (
    "id" UUID NOT NULL,
    "combo_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "combo_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "qty_available" INTEGER NOT NULL DEFAULT 0,
    "qty_reserved" INTEGER NOT NULL DEFAULT 0,
    "qty_in_transit" INTEGER NOT NULL DEFAULT 0,
    "qty_damaged" INTEGER NOT NULL DEFAULT 0,
    "qty_returned" INTEGER NOT NULL DEFAULT 0,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 10,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "business_account_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_number" VARCHAR(50) NOT NULL,
    "user_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "business_account_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "fulfillment_outlet_id" UUID,
    "delivery_address_snapshot" JSONB NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "promo_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "promotion_id" UUID,
    "coupon_id" UUID,
    "coupon_code" VARCHAR(40),
    "coupon_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "wallet_applied" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "payment_method" VARCHAR(30),
    "payment_status" "PaymentState" NOT NULL DEFAULT 'unpaid',
    "delivery_slot_id" UUID,
    "delivery_date" DATE,
    "notes" TEXT,
    "rejection_reason" TEXT,
    "accepted_at" TIMESTAMPTZ,
    "rejected_at" TIMESTAMPTZ,
    "is_partial" BOOLEAN NOT NULL DEFAULT false,
    "delivery_proof_type" VARCHAR(20),
    "delivery_proof_url" TEXT,
    "delivery_notes" TEXT,
    "customer_deleted" BOOLEAN NOT NULL DEFAULT false,
    "delivery_otp" VARCHAR(6),
    "delivery_otp_expires_at" TIMESTAMPTZ,
    "delivery_otp_verified_at" TIMESTAMPTZ,
    "delivered_at" TIMESTAMPTZ,
    "eway_bill_no" VARCHAR(30),
    "salesperson_id" UUID,
    "settlement_gross_amount" DECIMAL(12,2),
    "settlement_platform_fee_pct" DECIMAL(5,2),
    "settlement_platform_fee" DECIMAL(12,2),
    "settlement_gateway_fee" DECIMAL(12,2),
    "settlement_net_vendor_amount" DECIMAL(12,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_name" VARCHAR(255) NOT NULL,
    "product_sku" VARCHAR(100),
    "hsn" VARCHAR(50),
    "brand" VARCHAR(150),
    "pack_size" VARCHAR(100),
    "category_name" VARCHAR(255),
    "tax_percent" DECIMAL(5,2),
    "quantity" INTEGER NOT NULL,
    "fulfilled_qty" INTEGER NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total_price" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quick_order_lists" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "business_account_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quick_order_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quick_order_list_items" (
    "id" UUID NOT NULL,
    "list_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "default_qty" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quick_order_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "razorpay_order_id" VARCHAR(100),
    "razorpay_payment_id" VARCHAR(100),
    "razorpay_signature" VARCHAR(255),
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'created',
    "method" VARCHAR(30),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "credit_limit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "credit_used" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "CreditStatus" NOT NULL DEFAULT 'pending',
    "grace_days" INTEGER NOT NULL DEFAULT 0,
    "interest_rate_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "penalty_rate_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "freeze_on_overdue_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" UUID NOT NULL,
    "credit_account_id" UUID NOT NULL,
    "order_id" UUID,
    "vendor_id" UUID NOT NULL,
    "type" "CreditTxnType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balance_after" DECIMAL(12,2) NOT NULL,
    "due_date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "type" "WalletTxnType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference_id" UUID,
    "reference_type" VARCHAR(30),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_credit_configs" (
    "id" UUID NOT NULL,
    "repaymentMode" "credit_repayment_mode" NOT NULL DEFAULT 'REPAY_BEFORE_NEXT_USE',
    "billingModel" "billing_model_type" NOT NULL DEFAULT 'BILL_TO_BILL',
    "creditLimit" DECIMAL(12,2) NOT NULL DEFAULT 1000,
    "creditTenureDays" INTEGER NOT NULL DEFAULT 3,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 2,
    "blacklistDays" INTEGER NOT NULL DEFAULT 10,
    "interestRatePct" DECIMAL(6,3) NOT NULL DEFAULT 1.0,
    "interest_frequency_days" INTEGER NOT NULL DEFAULT 1,
    "penaltyAmount" DECIMAL(12,2) NOT NULL DEFAULT 10.0,
    "penalty_frequency_days" INTEGER NOT NULL DEFAULT 1,
    "eligible_purchase_count" INTEGER NOT NULL DEFAULT 3,
    "unlock_credit_amount" DECIMAL(12,2) NOT NULL DEFAULT 10000,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "global_credit_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_wallets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "vendor_id" UUID,
    "status" "credit_wallet_status" NOT NULL DEFAULT 'ACTIVE',
    "credit_limit" DECIMAL(12,2) NOT NULL,
    "available_credit" DECIMAL(12,2) NOT NULL,
    "used_credit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "outstanding_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "overdue_base_amount" DECIMAL(12,2),
    "current_due_date" TIMESTAMPTZ,
    "last_utilization_date" TIMESTAMPTZ,
    "overdue_days" INTEGER NOT NULL DEFAULT 0,
    "blacklist_exempt" BOOLEAN NOT NULL DEFAULT false,
    "blacklisted_at" TIMESTAMPTZ,
    "reactivated_at" TIMESTAMPTZ,
    "override_repayment_mode" "credit_repayment_mode",
    "override_billing_model" "billing_model_type",
    "override_credit_limit" DECIMAL(12,2),
    "override_credit_tenure" INTEGER,
    "override_grace_period" INTEGER,
    "override_blacklist_days" INTEGER,
    "override_interest_rate" DECIMAL(6,3),
    "override_interest_freq_days" INTEGER,
    "override_penalty_amount" DECIMAL(12,2),
    "override_penalty_freq_days" INTEGER,
    "workflow_status" "credit_workflow_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "assigned_owner_id" UUID,
    "vendor_notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_wallet_transactions" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "type" "credit_wallet_txn_type" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balance_after_txn" DECIMAL(12,2) NOT NULL,
    "reference_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_wallet_repayments" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "repayment_method" TEXT NOT NULL,
    "razorpay_order_id" TEXT,
    "razorpay_payment_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_wallet_repayments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_wallet_penalties" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "type" "credit_penalty_type" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "applied_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_wallet_penalties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_wallet_audit_logs" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "performed_by" TEXT NOT NULL,
    "previous_value" TEXT,
    "new_value" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_wallet_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "title" VARCHAR(255),
    "body" TEXT,
    "reference_id" UUID,
    "reference_type" VARCHAR(30),
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "business_account_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "logo_url" VARCHAR(512),
    "banner_url" VARCHAR(512),
    "website" VARCHAR(512),
    "tagline" VARCHAR(512),
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bg_color" VARCHAR(20),
    "showcase_images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "brand_type" VARCHAR(80),
    "sub_type" VARCHAR(80),
    "business_size" VARCHAR(50),
    "distribution_presence" VARCHAR(120),
    "target_segments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "horeca_focused" BOOLEAN,
    "retail_focused" BOOLEAN,
    "brand_tier" VARCHAR(50),
    "marketplace_visibility" VARCHAR(50),
    "credit_support" BOOLEAN,
    "lead_status" VARCHAR(50),
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_distributor_invites" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "contact_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(30),
    "business_name" VARCHAR(255) NOT NULL,
    "city" VARCHAR(100),
    "pincode" VARCHAR(10),
    "notes" TEXT,
    "status" "BrandDistributorInviteStatus" NOT NULL DEFAULT 'pending',
    "vendor_id" UUID,
    "reviewed_by" UUID,
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_distributor_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_authorized_distributors" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "status" "BrandAuthorizedDistributorStatus" NOT NULL DEFAULT 'pending',
    "brand_approved_at" TIMESTAMPTZ,
    "brand_approved_by" UUID,
    "admin_approved_at" TIMESTAMPTZ,
    "admin_approved_by" UUID,
    "rejected_at" TIMESTAMPTZ,
    "rejected_by" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_authorized_distributors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_master_products" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "master_product_id" UUID,
    "category_id" UUID,
    "category_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "image_url" VARCHAR(512),
    "pack_size" VARCHAR(100),
    "unit" VARCHAR(50),
    "sku" VARCHAR(100),
    "category" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "embedding_model" VARCHAR(80),
    "embedding_updated_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_master_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_product_mappings" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "brand_master_product_id" UUID NOT NULL,
    "distributor_product_id" UUID NOT NULL,
    "confidence_score" DECIMAL(4,3) NOT NULL DEFAULT 0,
    "status" "MappingStatus" NOT NULL DEFAULT 'pending_review',
    "matched_by" "MatchMethod" NOT NULL,
    "reviewed_by" UUID,
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_product_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_team_members" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'viewer',
    "role_id" UUID,
    "invited_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_team_members" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'viewer',
    "role_id" UUID,
    "invited_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_team_members" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'viewer',
    "role_id" UUID,
    "invited_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_addresses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "outlet_id" UUID,
    "label" VARCHAR(50) NOT NULL DEFAULT 'Other',
    "business_name" VARCHAR(255),
    "full_address" TEXT NOT NULL,
    "short_address" VARCHAR(255),
    "flat_info" VARCHAR(255),
    "landmark" VARCHAR(255),
    "pincode" VARCHAR(10),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "place_id" VARCHAR(500),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_role" VARCHAR(50),
    "action" VARCHAR(100) NOT NULL,
    "entity" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(255),
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "ip" VARCHAR(64),
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_requests" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "admin_note" TEXT,
    "refund_amount" DECIMAL(12,2),
    "resolution_type" VARCHAR(20),
    "credit_note_number" VARCHAR(50),
    "credit_note_amount" DECIMAL(12,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_documents" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "file_url" VARCHAR(512) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "admin_note" TEXT,
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "provider_event_id" VARCHAR(100) NOT NULL,
    "event" VARCHAR(60) NOT NULL,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(20),
    "email" VARCHAR(320),
    "code" VARCHAR(6) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_accounts" (
    "id" UUID NOT NULL,
    "legal_name" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255),
    "gstin" VARCHAR(20),
    "pan" VARCHAR(20),
    "fssai_number" VARCHAR(50),
    "billing_address_line" TEXT,
    "billing_city" VARCHAR(100),
    "billing_state" VARCHAR(100),
    "billing_pincode" VARCHAR(10),
    "business_type" VARCHAR(50),
    "sub_type" VARCHAR(80),
    "vendor_type_selections" JSONB,
    "cuisine" VARCHAR(120),
    "business_size" VARCHAR(50),
    "business_structure" VARCHAR(50),
    "service_model" VARCHAR(120),
    "monthly_purchase_band" VARCHAR(50),
    "procurement_frequency" VARCHAR(50),
    "designation" VARCHAR(120),
    "lead_status" VARCHAR(50),
    "credit_type" VARCHAR(50),
    "manual_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ai_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "behaviour_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customer_type" VARCHAR(20) NOT NULL DEFAULT 'business',
    "salutation" VARCHAR(20),
    "first_name" VARCHAR(120),
    "last_name" VARCHAR(120),
    "company_name" VARCHAR(255),
    "customer_language" VARCHAR(20) NOT NULL DEFAULT 'en',
    "tax_preference" VARCHAR(20) NOT NULL DEFAULT 'taxable',
    "gst_treatment" VARCHAR(40),
    "place_of_supply" VARCHAR(100),
    "currency" VARCHAR(10) NOT NULL DEFAULT 'INR',
    "credit_limit" DECIMAL(12,2),
    "payment_terms" VARCHAR(40),
    "enable_portal" BOOLEAN NOT NULL DEFAULT false,
    "work_phone" VARCHAR(20),
    "mobile_phone" VARCHAR(20),
    "remarks" TEXT,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "is_customer" BOOLEAN NOT NULL DEFAULT true,
    "is_vendor" BOOLEAN NOT NULL DEFAULT false,
    "is_brand" BOOLEAN NOT NULL DEFAULT false,
    "status" "BusinessAccountStatus" NOT NULL DEFAULT 'active',
    "primary_outlet_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_account_members" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "business_account_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "invited_by" UUID,
    "accepted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_account_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlets" (
    "id" UUID NOT NULL,
    "business_account_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(50),
    "address_line" TEXT NOT NULL,
    "flat_info" VARCHAR(255),
    "landmark" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "pincode" VARCHAR(10),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "place_id" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "requires_address_update" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outlets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_persons" (
    "id" UUID NOT NULL,
    "business_account_id" UUID NOT NULL,
    "salutation" VARCHAR(20),
    "first_name" VARCHAR(120),
    "last_name" VARCHAR(120),
    "email" VARCHAR(255),
    "work_phone" VARCHAR(20),
    "mobile" VARCHAR(20),
    "designation" VARCHAR(120),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_roles" (
    "id" UUID NOT NULL,
    "business_account_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL,
    "is_template" BOOLEAN NOT NULL DEFAULT false,
    "scope" "RoleScope" NOT NULL DEFAULT 'account',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "business_account_id" UUID NOT NULL,
    "outlet_id" UUID,
    "vendor_id" UUID,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_wallets" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pending_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_wallet_txns" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "type" "VendorWalletTxnType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balance_after" DECIMAL(12,2) NOT NULL,
    "reference_id" UUID,
    "reference_type" VARCHAR(30),
    "notes" TEXT,
    "gross_amount" DECIMAL(12,2),
    "platform_fee" DECIMAL(12,2),
    "gateway_fee" DECIMAL(12,2),
    "net_amount" DECIMAL(12,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_wallet_txns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_settlements" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "platform_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gateway_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'pending',
    "bank_reference" VARCHAR(100),
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "settled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_settlement_orders" (
    "id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_amount" DECIMAL(12,2) NOT NULL,
    "platform_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "vendor_settlement_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_customers" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "VendorCustomerStatus" NOT NULL DEFAULT 'active',
    "price_list_id" UUID,
    "territory" VARCHAR(100),
    "sales_executive" VARCHAR(100),
    "salesperson_id" UUID,
    "delivery_route" VARCHAR(100),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "payment_terms" VARCHAR(50),
    "allowed_payment_modes" TEXT[] DEFAULT ARRAY['cod', 'prepaid', 'credit', 'cheque']::TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_customer_tasks" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "notes" TEXT,
    "due_date" TIMESTAMPTZ,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vendor_customer_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_lists" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMPTZ,
    "valid_to" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_items" (
    "id" UUID NOT NULL,
    "price_list_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "custom_price" DECIMAL(10,2),
    "pricing_type" "pricing_type" NOT NULL DEFAULT 'fixed',
    "discount_percent" DECIMAL(5,2),
    "scheme_min_qty" INTEGER,
    "scheme_free_qty" INTEGER,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "valid_from" TIMESTAMPTZ,
    "valid_to" TIMESTAMPTZ,
    "note" TEXT,
    "scheduled_price" DECIMAL(10,2),
    "scheduled_from" TIMESTAMPTZ,
    "scheduled_to" TIMESTAMPTZ,
    "history" JSONB DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_assignments" (
    "id" UUID NOT NULL,
    "price_list_id" UUID NOT NULL,
    "type" "price_list_assignment_type" NOT NULL,
    "user_id" UUID,
    "business_account_id" UUID,
    "outlet_id" UUID,
    "brand_id" UUID,
    "group_id" UUID,
    "pincode" VARCHAR(10),
    "area" VARCHAR(100),
    "segment" VARCHAR(100),
    "brand_name" VARCHAR(150),
    "assigned_by_id" UUID,
    "assigned_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_list_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_groups" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_group_members" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "user_id" UUID,
    "business_account_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "promotion_type" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "start_date" TIMESTAMPTZ,
    "end_date" TIMESTAMPTZ,
    "min_order_value" DECIMAL(10,2),
    "min_qty" INTEGER,
    "buy_product_id" UUID,
    "discount_pct" DECIMAL(5,2),
    "discount_flat" DECIMAL(10,2),
    "get_product_id" UUID,
    "get_qty" INTEGER,
    "usage_limit" INTEGER,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_customer_prices" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vendor_customer_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_logs" (
    "id" UUID NOT NULL,
    "inventory_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "field" VARCHAR(30) NOT NULL,
    "oldValue" INTEGER NOT NULL,
    "newValue" INTEGER NOT NULL,
    "reason" VARCHAR(200),
    "changed_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_claims" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "type" "vendor_claim_type" NOT NULL,
    "status" "vendor_claim_status" NOT NULL DEFAULT 'pending',
    "amount" DECIMAL(12,2),
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "picklists" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "outlet_id" UUID,
    "order_id" UUID,
    "status" "picklist_status" NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "picklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatches" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "outlet_id" UUID,
    "order_id" UUID,
    "picklist_id" UUID,
    "status" "dispatch_status" NOT NULL DEFAULT 'pending',
    "driver_name" VARCHAR(100),
    "vehicle_number" VARCHAR(30),
    "dispatched_at" TIMESTAMPTZ,
    "delivered_at" TIMESTAMPTZ,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "outlet_id" UUID,
    "reference_no" VARCHAR(50),
    "status" "goods_receipt_status" NOT NULL DEFAULT 'draft',
    "supplier" VARCHAR(150),
    "items" JSONB NOT NULL DEFAULT '[]',
    "received_at" TIMESTAMPTZ,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "from_outlet_id" UUID NOT NULL,
    "to_outlet_id" UUID NOT NULL,
    "status" "stock_transfer_status" NOT NULL DEFAULT 'pending',
    "items" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "created_by" UUID,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salespersons" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(15),
    "email" VARCHAR(255),
    "code" VARCHAR(30),
    "user_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salespersons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "salesperson_id" UUID NOT NULL,
    "scope" "commission_rule_scope" NOT NULL,
    "scope_ref_id" UUID,
    "rate_percent" DECIMAL(5,2),
    "rate_fixed" DECIMAL(12,2),
    "min_order_value" DECIMAL(12,2),
    "valid_from" TIMESTAMPTZ,
    "valid_to" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_accruals" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "salesperson_id" UUID NOT NULL,
    "rule_id" UUID,
    "base_amount" DECIMAL(12,2) NOT NULL,
    "rate_percent" DECIMAL(5,2),
    "rate_fixed" DECIMAL(12,2),
    "accrued_amount" DECIMAL(12,2) NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "status" "commission_accrual_status" NOT NULL DEFAULT 'pending',
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "paid_at" TIMESTAMPTZ,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_accruals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "vendor_id" UUID,
    "discount_type" "promo_discount_type" NOT NULL,
    "discount_value" DECIMAL(10,2) NOT NULL,
    "max_discount" DECIMAL(10,2),
    "min_order_value" DECIMAL(12,2),
    "start_date" TIMESTAMPTZ,
    "end_date" TIMESTAMPTZ,
    "usage_limit" INTEGER,
    "per_user_limit" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "category_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "product_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "brand_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stacks_with_vendor_promo" BOOLEAN NOT NULL DEFAULT true,
    "stacks_with_cashback" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" UUID NOT NULL,
    "coupon_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "checkout_group_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "coupon_redemption_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashback_campaigns" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "vendor_id" UUID,
    "cashback_type" "promo_discount_type" NOT NULL,
    "cashback_value" DECIMAL(10,2) NOT NULL,
    "max_cashback" DECIMAL(10,2),
    "min_order_value" DECIMAL(12,2),
    "destination" "cashback_destination" NOT NULL DEFAULT 'wallet',
    "start_date" TIMESTAMPTZ,
    "end_date" TIMESTAMPTZ,
    "per_user_limit" INTEGER,
    "total_budget" DECIMAL(12,2),
    "used_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "stacks_with_coupon" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cashback_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashback_entries" (
    "id" UUID NOT NULL,
    "campaign_id" UUID,
    "user_id" UUID NOT NULL,
    "order_id" UUID,
    "vendor_id" UUID,
    "source" "cashback_entry_source" NOT NULL DEFAULT 'order',
    "amount" DECIMAL(10,2) NOT NULL,
    "destination" "cashback_destination" NOT NULL,
    "upi_id" VARCHAR(100),
    "status" "cashback_entry_status" NOT NULL DEFAULT 'pending',
    "cashback_type" "promo_discount_type",
    "cashback_value" DECIMAL(10,2),
    "max_cashback" DECIMAL(10,2),
    "min_order_value" DECIMAL(12,2),
    "wallet_txn_id" UUID,
    "paid_reference" VARCHAR(100),
    "notes" TEXT,
    "created_by_id" UUID,
    "credited_at" TIMESTAMPTZ,
    "paid_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cashback_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" UUID NOT NULL,
    "platform_name" VARCHAR(120) NOT NULL DEFAULT 'HoReCa1',
    "contact_email" VARCHAR(255),
    "support_phone" VARCHAR(30),
    "default_commission_pct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "min_order_value" DECIMAL(10,2) NOT NULL DEFAULT 500,
    "free_delivery_threshold" DECIMAL(10,2) NOT NULL DEFAULT 2000,
    "email_notifications" BOOLEAN NOT NULL DEFAULT true,
    "sms_notifications" BOOLEAN NOT NULL DEFAULT true,
    "push_notifications" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_hcid_display_key" ON "users"("hcid_display");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_pincode_idx" ON "users"("pincode");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "linked_accounts_switch_token_key" ON "linked_accounts"("switch_token");

-- CreateIndex
CREATE INDEX "linked_accounts_user_id_idx" ON "linked_accounts"("user_id");

-- CreateIndex
CREATE INDEX "linked_accounts_switch_token_idx" ON "linked_accounts"("switch_token");

-- CreateIndex
CREATE UNIQUE INDEX "linked_accounts_user_id_linked_user_id_key" ON "linked_accounts"("user_id", "linked_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_default_outlet_id_key" ON "vendors"("default_outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_slug_key" ON "vendors"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_vendor_code_key" ON "vendors"("vendor_code");

-- CreateIndex
CREATE INDEX "vendors_slug_idx" ON "vendors"("slug");

-- CreateIndex
CREATE INDEX "vendors_is_active_idx" ON "vendors"("is_active");

-- CreateIndex
CREATE INDEX "vendors_user_id_idx" ON "vendors"("user_id");

-- CreateIndex
CREATE INDEX "vendors_business_account_id_idx" ON "vendors"("business_account_id");

-- CreateIndex
CREATE INDEX "service_areas_pincode_idx" ON "service_areas"("pincode");

-- CreateIndex
CREATE INDEX "service_areas_outlet_id_idx" ON "service_areas"("outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_areas_vendor_id_outlet_id_pincode_key" ON "service_areas"("vendor_id", "outlet_id", "pincode");

-- CreateIndex
CREATE INDEX "delivery_slots_outlet_id_idx" ON "delivery_slots"("outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_slots_vendor_id_outlet_id_day_of_week_slot_start_key" ON "delivery_slots"("vendor_id", "outlet_id", "day_of_week", "slot_start");

-- CreateIndex
CREATE INDEX "customer_vendors_user_id_idx" ON "customer_vendors"("user_id");

-- CreateIndex
CREATE INDEX "customer_vendors_vendor_id_idx" ON "customer_vendors"("vendor_id");

-- CreateIndex
CREATE INDEX "customer_vendors_business_account_id_idx" ON "customer_vendors"("business_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_vendors_business_account_id_vendor_id_key" ON "customer_vendors"("business_account_id", "vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE INDEX "categories_slug_idx" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_approval_status_idx" ON "categories"("approval_status");

-- CreateIndex
CREATE INDEX "category_categories_sub_category_id_idx" ON "category_categories"("sub_category_id");

-- CreateIndex
CREATE INDEX "products_vendor_id_idx" ON "products"("vendor_id");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_is_active_idx" ON "products"("is_active");

-- CreateIndex
CREATE INDEX "products_approval_status_idx" ON "products"("approval_status");

-- CreateIndex
CREATE INDEX "products_listing_status_idx" ON "products"("listing_status");

-- CreateIndex
CREATE INDEX "products_sku_idx" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_vendor_id_vendor_sku_idx" ON "products"("vendor_id", "vendor_sku");

-- CreateIndex
CREATE INDEX "products_master_product_id_idx" ON "products"("master_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_vendor_id_slug_key" ON "products"("vendor_id", "slug");

-- CreateIndex
CREATE INDEX "product_categories_category_id_idx" ON "product_categories"("category_id");

-- CreateIndex
CREATE INDEX "product_categories_product_id_is_primary_idx" ON "product_categories"("product_id", "is_primary");

-- CreateIndex
CREATE INDEX "product_audit_logs_product_id_changed_at_idx" ON "product_audit_logs"("product_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "master_product_revisions_master_product_id_created_at_idx" ON "master_product_revisions"("master_product_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "master_products_sku_key" ON "master_products"("sku");

-- CreateIndex
CREATE INDEX "master_products_category_id_idx" ON "master_products"("category_id");

-- CreateIndex
CREATE INDEX "master_products_sku_idx" ON "master_products"("sku");

-- CreateIndex
CREATE INDEX "master_products_is_active_idx" ON "master_products"("is_active");

-- CreateIndex
CREATE INDEX "master_products_approval_status_idx" ON "master_products"("approval_status");

-- CreateIndex
CREATE INDEX "master_product_categories_category_id_idx" ON "master_product_categories"("category_id");

-- CreateIndex
CREATE INDEX "master_product_categories_master_product_id_is_primary_idx" ON "master_product_categories"("master_product_id", "is_primary");

-- CreateIndex
CREATE INDEX "price_slabs_product_id_idx" ON "price_slabs"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_slabs_product_id_min_qty_key" ON "price_slabs"("product_id", "min_qty");

-- CreateIndex
CREATE UNIQUE INDEX "collections_slug_key" ON "collections"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "collection_products_collection_id_product_id_key" ON "collection_products"("collection_id", "product_id");

-- CreateIndex
CREATE INDEX "product_combos_vendor_id_idx" ON "product_combos"("vendor_id");

-- CreateIndex
CREATE INDEX "product_combos_is_active_idx" ON "product_combos"("is_active");

-- CreateIndex
CREATE INDEX "combo_items_combo_id_idx" ON "combo_items"("combo_id");

-- CreateIndex
CREATE INDEX "combo_items_product_id_idx" ON "combo_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "combo_items_combo_id_product_id_key" ON "combo_items"("combo_id", "product_id");

-- CreateIndex
CREATE INDEX "inventory_vendor_id_idx" ON "inventory"("vendor_id");

-- CreateIndex
CREATE INDEX "inventory_outlet_id_idx" ON "inventory"("outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_product_id_outlet_id_key" ON "inventory"("product_id", "outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "carts_user_id_business_account_id_outlet_id_key" ON "carts"("user_id", "business_account_id", "outlet_id");

-- CreateIndex
CREATE INDEX "cart_items_cart_id_idx" ON "cart_items"("cart_id");

-- CreateIndex
CREATE INDEX "cart_items_vendor_id_idx" ON "cart_items"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cart_id_product_id_key" ON "cart_items"("cart_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");

-- CreateIndex
CREATE INDEX "orders_vendor_id_idx" ON "orders"("vendor_id");

-- CreateIndex
CREATE INDEX "orders_business_account_id_idx" ON "orders"("business_account_id");

-- CreateIndex
CREATE INDEX "orders_outlet_id_idx" ON "orders"("outlet_id");

-- CreateIndex
CREATE INDEX "orders_fulfillment_outlet_id_idx" ON "orders"("fulfillment_outlet_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_salesperson_id_idx" ON "orders"("salesperson_id");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at" DESC);

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_order_id_key" ON "reviews"("order_id");

-- CreateIndex
CREATE INDEX "reviews_vendor_id_idx" ON "reviews"("vendor_id");

-- CreateIndex
CREATE INDEX "reviews_user_id_idx" ON "reviews"("user_id");

-- CreateIndex
CREATE INDEX "quick_order_lists_user_id_idx" ON "quick_order_lists"("user_id");

-- CreateIndex
CREATE INDEX "quick_order_lists_vendor_id_idx" ON "quick_order_lists"("vendor_id");

-- CreateIndex
CREATE INDEX "quick_order_lists_business_account_id_idx" ON "quick_order_lists"("business_account_id");

-- CreateIndex
CREATE INDEX "quick_order_list_items_list_id_idx" ON "quick_order_list_items"("list_id");

-- CreateIndex
CREATE UNIQUE INDEX "quick_order_list_items_list_id_product_id_key" ON "quick_order_list_items"("list_id", "product_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_razorpay_order_id_idx" ON "payments"("razorpay_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_accounts_user_id_vendor_id_key" ON "credit_accounts"("user_id", "vendor_id");

-- CreateIndex
CREATE INDEX "credit_transactions_credit_account_id_idx" ON "credit_transactions"("credit_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE INDEX "credit_wallets_user_id_idx" ON "credit_wallets"("user_id");

-- CreateIndex
CREATE INDEX "credit_wallets_vendor_id_idx" ON "credit_wallets"("vendor_id");

-- CreateIndex
CREATE INDEX "credit_wallets_status_current_due_date_idx" ON "credit_wallets"("status", "current_due_date");

-- CreateIndex
CREATE INDEX "credit_wallet_transactions_wallet_id_idx" ON "credit_wallet_transactions"("wallet_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_wallet_repayments_razorpay_payment_id_key" ON "credit_wallet_repayments"("razorpay_payment_id");

-- CreateIndex
CREATE INDEX "credit_wallet_repayments_wallet_id_idx" ON "credit_wallet_repayments"("wallet_id");

-- CreateIndex
CREATE INDEX "credit_wallet_repayments_razorpay_order_id_idx" ON "credit_wallet_repayments"("razorpay_order_id");

-- CreateIndex
CREATE INDEX "credit_wallet_penalties_wallet_id_idx" ON "credit_wallet_penalties"("wallet_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_wallet_penalties_wallet_id_type_applied_date_key" ON "credit_wallet_penalties"("wallet_id", "type", "applied_date");

-- CreateIndex
CREATE INDEX "credit_wallet_audit_logs_wallet_id_idx" ON "credit_wallet_audit_logs"("wallet_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE UNIQUE INDEX "brands_business_account_id_key" ON "brands"("business_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- CreateIndex
CREATE INDEX "brands_slug_idx" ON "brands"("slug");

-- CreateIndex
CREATE INDEX "brands_approval_status_idx" ON "brands"("approval_status");

-- CreateIndex
CREATE INDEX "brands_user_id_idx" ON "brands"("user_id");

-- CreateIndex
CREATE INDEX "brand_distributor_invites_brand_id_idx" ON "brand_distributor_invites"("brand_id");

-- CreateIndex
CREATE INDEX "brand_distributor_invites_status_idx" ON "brand_distributor_invites"("status");

-- CreateIndex
CREATE INDEX "brand_authorized_distributors_brand_id_status_idx" ON "brand_authorized_distributors"("brand_id", "status");

-- CreateIndex
CREATE INDEX "brand_authorized_distributors_vendor_id_idx" ON "brand_authorized_distributors"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "brand_authorized_distributors_brand_id_vendor_id_key" ON "brand_authorized_distributors"("brand_id", "vendor_id");

-- CreateIndex
CREATE INDEX "brand_master_products_brand_id_idx" ON "brand_master_products"("brand_id");

-- CreateIndex
CREATE INDEX "brand_master_products_category_id_idx" ON "brand_master_products"("category_id");

-- CreateIndex
CREATE INDEX "brand_master_products_master_product_id_idx" ON "brand_master_products"("master_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "brand_master_products_brand_id_slug_key" ON "brand_master_products"("brand_id", "slug");

-- CreateIndex
CREATE INDEX "brand_product_mappings_brand_id_idx" ON "brand_product_mappings"("brand_id");

-- CreateIndex
CREATE INDEX "brand_product_mappings_status_idx" ON "brand_product_mappings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "brand_product_mappings_brand_master_product_id_distributor__key" ON "brand_product_mappings"("brand_master_product_id", "distributor_product_id");

-- CreateIndex
CREATE INDEX "vendor_team_members_user_id_idx" ON "vendor_team_members"("user_id");

-- CreateIndex
CREATE INDEX "vendor_team_members_role_id_idx" ON "vendor_team_members"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_team_members_vendor_id_user_id_key" ON "vendor_team_members"("vendor_id", "user_id");

-- CreateIndex
CREATE INDEX "brand_team_members_user_id_idx" ON "brand_team_members"("user_id");

-- CreateIndex
CREATE INDEX "brand_team_members_role_id_idx" ON "brand_team_members"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "brand_team_members_brand_id_user_id_key" ON "brand_team_members"("brand_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_team_members_user_id_key" ON "admin_team_members"("user_id");

-- CreateIndex
CREATE INDEX "admin_team_members_role_id_idx" ON "admin_team_members"("role_id");

-- CreateIndex
CREATE INDEX "saved_addresses_user_id_idx" ON "saved_addresses"("user_id");

-- CreateIndex
CREATE INDEX "saved_addresses_outlet_id_idx" ON "saved_addresses"("outlet_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_at_idx" ON "audit_logs"("actor_id", "at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_at_idx" ON "audit_logs"("at");

-- CreateIndex
CREATE INDEX "return_requests_status_idx" ON "return_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_order_id_key" ON "return_requests"("order_id");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_user_id_endpoint_key" ON "push_subscriptions"("user_id", "endpoint");

-- CreateIndex
CREATE INDEX "vendor_documents_vendor_id_idx" ON "vendor_documents"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_documents_status_idx" ON "vendor_documents"("status");

-- CreateIndex
CREATE INDEX "webhook_events_event_idx" ON "webhook_events"("event");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_provider_event_id_key" ON "webhook_events"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "otp_codes_phone_idx" ON "otp_codes"("phone");

-- CreateIndex
CREATE INDEX "otp_codes_email_idx" ON "otp_codes"("email");

-- CreateIndex
CREATE UNIQUE INDEX "business_accounts_primary_outlet_id_key" ON "business_accounts"("primary_outlet_id");

-- CreateIndex
CREATE INDEX "business_accounts_is_vendor_idx" ON "business_accounts"("is_vendor");

-- CreateIndex
CREATE INDEX "business_accounts_is_brand_idx" ON "business_accounts"("is_brand");

-- CreateIndex
CREATE INDEX "business_account_members_user_id_idx" ON "business_account_members"("user_id");

-- CreateIndex
CREATE INDEX "business_account_members_business_account_id_idx" ON "business_account_members"("business_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_account_members_user_id_business_account_id_key" ON "business_account_members"("user_id", "business_account_id");

-- CreateIndex
CREATE INDEX "outlets_business_account_id_idx" ON "outlets"("business_account_id");

-- CreateIndex
CREATE INDEX "outlets_pincode_idx" ON "outlets"("pincode");

-- CreateIndex
CREATE INDEX "contact_persons_business_account_id_idx" ON "contact_persons"("business_account_id");

-- CreateIndex
CREATE INDEX "account_roles_is_template_scope_idx" ON "account_roles"("is_template", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "account_roles_business_account_id_name_key" ON "account_roles"("business_account_id", "name");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_business_account_id_idx" ON "user_roles"("business_account_id");

-- CreateIndex
CREATE INDEX "user_roles_vendor_id_idx" ON "user_roles"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_ba_outlet_vendor_role_key" ON "user_roles"("user_id", "business_account_id", "outlet_id", "vendor_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_wallets_vendor_id_key" ON "vendor_wallets"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_wallet_txns_wallet_id_idx" ON "vendor_wallet_txns"("wallet_id");

-- CreateIndex
CREATE INDEX "vendor_settlements_vendor_id_idx" ON "vendor_settlements"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_settlements_status_idx" ON "vendor_settlements"("status");

-- CreateIndex
CREATE INDEX "vendor_settlement_orders_settlement_id_idx" ON "vendor_settlement_orders"("settlement_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_settlement_orders_settlement_id_order_id_key" ON "vendor_settlement_orders"("settlement_id", "order_id");

-- CreateIndex
CREATE INDEX "vendor_customers_vendor_id_idx" ON "vendor_customers"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_customers_user_id_idx" ON "vendor_customers"("user_id");

-- CreateIndex
CREATE INDEX "vendor_customers_salesperson_id_idx" ON "vendor_customers"("salesperson_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_customers_vendor_id_user_id_key" ON "vendor_customers"("vendor_id", "user_id");

-- CreateIndex
CREATE INDEX "vendor_customer_tasks_vendor_id_customer_id_idx" ON "vendor_customer_tasks"("vendor_id", "customer_id");

-- CreateIndex
CREATE INDEX "price_lists_vendor_id_idx" ON "price_lists"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_vendor_id_name_key" ON "price_lists"("vendor_id", "name");

-- CreateIndex
CREATE INDEX "price_list_items_price_list_id_idx" ON "price_list_items"("price_list_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_items_price_list_id_product_id_key" ON "price_list_items"("price_list_id", "product_id");

-- CreateIndex
CREATE INDEX "price_list_assignments_price_list_id_type_idx" ON "price_list_assignments"("price_list_id", "type");

-- CreateIndex
CREATE INDEX "price_list_assignments_user_id_idx" ON "price_list_assignments"("user_id");

-- CreateIndex
CREATE INDEX "price_list_assignments_business_account_id_idx" ON "price_list_assignments"("business_account_id");

-- CreateIndex
CREATE INDEX "price_list_assignments_outlet_id_idx" ON "price_list_assignments"("outlet_id");

-- CreateIndex
CREATE INDEX "price_list_assignments_pincode_idx" ON "price_list_assignments"("pincode");

-- CreateIndex
CREATE INDEX "price_list_assignments_brand_id_idx" ON "price_list_assignments"("brand_id");

-- CreateIndex
CREATE INDEX "price_list_assignments_group_id_idx" ON "price_list_assignments"("group_id");

-- CreateIndex
CREATE INDEX "customer_groups_vendor_id_idx" ON "customer_groups"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_groups_vendor_id_name_key" ON "customer_groups"("vendor_id", "name");

-- CreateIndex
CREATE INDEX "customer_group_members_group_id_idx" ON "customer_group_members"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_group_members_group_id_user_id_key" ON "customer_group_members"("group_id", "user_id");

-- CreateIndex
CREATE INDEX "promotions_vendor_id_is_active_idx" ON "promotions"("vendor_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_customer_prices_vendor_id_customer_id_product_id_key" ON "vendor_customer_prices"("vendor_id", "customer_id", "product_id");

-- CreateIndex
CREATE INDEX "inventory_logs_inventory_id_idx" ON "inventory_logs"("inventory_id");

-- CreateIndex
CREATE INDEX "inventory_logs_vendor_id_idx" ON "inventory_logs"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_claims_vendor_id_idx" ON "vendor_claims"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_claims_order_id_idx" ON "vendor_claims"("order_id");

-- CreateIndex
CREATE INDEX "picklists_vendor_id_idx" ON "picklists"("vendor_id");

-- CreateIndex
CREATE INDEX "picklists_outlet_id_idx" ON "picklists"("outlet_id");

-- CreateIndex
CREATE INDEX "picklists_order_id_idx" ON "picklists"("order_id");

-- CreateIndex
CREATE INDEX "dispatches_vendor_id_idx" ON "dispatches"("vendor_id");

-- CreateIndex
CREATE INDEX "dispatches_outlet_id_idx" ON "dispatches"("outlet_id");

-- CreateIndex
CREATE INDEX "dispatches_order_id_idx" ON "dispatches"("order_id");

-- CreateIndex
CREATE INDEX "goods_receipts_vendor_id_idx" ON "goods_receipts"("vendor_id");

-- CreateIndex
CREATE INDEX "goods_receipts_outlet_id_idx" ON "goods_receipts"("outlet_id");

-- CreateIndex
CREATE INDEX "stock_transfers_vendor_id_idx" ON "stock_transfers"("vendor_id");

-- CreateIndex
CREATE INDEX "stock_transfers_from_outlet_id_idx" ON "stock_transfers"("from_outlet_id");

-- CreateIndex
CREATE INDEX "stock_transfers_to_outlet_id_idx" ON "stock_transfers"("to_outlet_id");

-- CreateIndex
CREATE INDEX "stock_transfers_status_idx" ON "stock_transfers"("status");

-- CreateIndex
CREATE INDEX "salespersons_vendor_id_idx" ON "salespersons"("vendor_id");

-- CreateIndex
CREATE INDEX "salespersons_user_id_idx" ON "salespersons"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "salespersons_vendor_id_code_key" ON "salespersons"("vendor_id", "code");

-- CreateIndex
CREATE INDEX "commission_rules_vendor_id_salesperson_id_is_active_idx" ON "commission_rules"("vendor_id", "salesperson_id", "is_active");

-- CreateIndex
CREATE INDEX "commission_rules_scope_scope_ref_id_idx" ON "commission_rules"("scope", "scope_ref_id");

-- CreateIndex
CREATE INDEX "commission_accruals_vendor_id_period_status_idx" ON "commission_accruals"("vendor_id", "period", "status");

-- CreateIndex
CREATE INDEX "commission_accruals_salesperson_id_period_idx" ON "commission_accruals"("salesperson_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "commission_accruals_order_id_salesperson_id_key" ON "commission_accruals"("order_id", "salesperson_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_vendor_id_is_active_idx" ON "coupons"("vendor_id", "is_active");

-- CreateIndex
CREATE INDEX "coupons_is_active_end_date_idx" ON "coupons"("is_active", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemptions_order_id_key" ON "coupon_redemptions"("order_id");

-- CreateIndex
CREATE INDEX "coupon_redemptions_coupon_id_user_id_status_idx" ON "coupon_redemptions"("coupon_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "coupon_redemptions_checkout_group_id_idx" ON "coupon_redemptions"("checkout_group_id");

-- CreateIndex
CREATE INDEX "cashback_campaigns_vendor_id_is_active_idx" ON "cashback_campaigns"("vendor_id", "is_active");

-- CreateIndex
CREATE INDEX "cashback_campaigns_is_active_end_date_idx" ON "cashback_campaigns"("is_active", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "cashback_entries_order_id_key" ON "cashback_entries"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "cashback_entries_wallet_txn_id_key" ON "cashback_entries"("wallet_txn_id");

-- CreateIndex
CREATE INDEX "cashback_entries_user_id_status_idx" ON "cashback_entries"("user_id", "status");

-- CreateIndex
CREATE INDEX "cashback_entries_campaign_id_idx" ON "cashback_entries"("campaign_id");

-- CreateIndex
CREATE INDEX "cashback_entries_status_destination_idx" ON "cashback_entries"("status", "destination");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linked_accounts" ADD CONSTRAINT "linked_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linked_accounts" ADD CONSTRAINT "linked_accounts_linked_user_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_business_account_id_fkey" FOREIGN KEY ("business_account_id") REFERENCES "business_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_default_outlet_id_fkey" FOREIGN KEY ("default_outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_areas" ADD CONSTRAINT "service_areas_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_areas" ADD CONSTRAINT "service_areas_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_slots" ADD CONSTRAINT "delivery_slots_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_slots" ADD CONSTRAINT "delivery_slots_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_vendors" ADD CONSTRAINT "customer_vendors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_vendors" ADD CONSTRAINT "customer_vendors_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_vendors" ADD CONSTRAINT "customer_vendors_business_account_id_fkey" FOREIGN KEY ("business_account_id") REFERENCES "business_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_categories" ADD CONSTRAINT "category_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_categories" ADD CONSTRAINT "category_categories_sub_category_id_fkey" FOREIGN KEY ("sub_category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_master_product_id_fkey" FOREIGN KEY ("master_product_id") REFERENCES "master_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_audit_logs" ADD CONSTRAINT "product_audit_logs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_audit_logs" ADD CONSTRAINT "product_audit_logs_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_product_revisions" ADD CONSTRAINT "master_product_revisions_master_product_id_fkey" FOREIGN KEY ("master_product_id") REFERENCES "master_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_product_revisions" ADD CONSTRAINT "master_product_revisions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_products" ADD CONSTRAINT "master_products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_product_categories" ADD CONSTRAINT "master_product_categories_master_product_id_fkey" FOREIGN KEY ("master_product_id") REFERENCES "master_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_product_categories" ADD CONSTRAINT "master_product_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_slabs" ADD CONSTRAINT "price_slabs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_slabs" ADD CONSTRAINT "price_slabs_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_combos" ADD CONSTRAINT "product_combos_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "product_combos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_business_account_id_fkey" FOREIGN KEY ("business_account_id") REFERENCES "business_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_business_account_id_fkey" FOREIGN KEY ("business_account_id") REFERENCES "business_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfillment_outlet_id_fkey" FOREIGN KEY ("fulfillment_outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_slot_id_fkey" FOREIGN KEY ("delivery_slot_id") REFERENCES "delivery_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_salesperson_id_fkey" FOREIGN KEY ("salesperson_id") REFERENCES "salespersons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_order_lists" ADD CONSTRAINT "quick_order_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_order_lists" ADD CONSTRAINT "quick_order_lists_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_order_lists" ADD CONSTRAINT "quick_order_lists_business_account_id_fkey" FOREIGN KEY ("business_account_id") REFERENCES "business_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_order_list_items" ADD CONSTRAINT "quick_order_list_items_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "quick_order_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_order_list_items" ADD CONSTRAINT "quick_order_list_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_order_list_items" ADD CONSTRAINT "quick_order_list_items_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_credit_account_id_fkey" FOREIGN KEY ("credit_account_id") REFERENCES "credit_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_assigned_owner_id_fkey" FOREIGN KEY ("assigned_owner_id") REFERENCES "vendor_team_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_wallet_transactions" ADD CONSTRAINT "credit_wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "credit_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_wallet_repayments" ADD CONSTRAINT "credit_wallet_repayments_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "credit_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_wallet_penalties" ADD CONSTRAINT "credit_wallet_penalties_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "credit_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_wallet_audit_logs" ADD CONSTRAINT "credit_wallet_audit_logs_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "credit_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_business_account_id_fkey" FOREIGN KEY ("business_account_id") REFERENCES "business_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_distributor_invites" ADD CONSTRAINT "brand_distributor_invites_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_authorized_distributors" ADD CONSTRAINT "brand_authorized_distributors_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_authorized_distributors" ADD CONSTRAINT "brand_authorized_distributors_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_master_products" ADD CONSTRAINT "brand_master_products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_master_products" ADD CONSTRAINT "brand_master_products_master_product_id_fkey" FOREIGN KEY ("master_product_id") REFERENCES "master_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_master_products" ADD CONSTRAINT "brand_master_products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_product_mappings" ADD CONSTRAINT "brand_product_mappings_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_product_mappings" ADD CONSTRAINT "brand_product_mappings_brand_master_product_id_fkey" FOREIGN KEY ("brand_master_product_id") REFERENCES "brand_master_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_product_mappings" ADD CONSTRAINT "brand_product_mappings_distributor_product_id_fkey" FOREIGN KEY ("distributor_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_team_members" ADD CONSTRAINT "vendor_team_members_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_team_members" ADD CONSTRAINT "vendor_team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_team_members" ADD CONSTRAINT "vendor_team_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_team_members" ADD CONSTRAINT "vendor_team_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "account_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_team_members" ADD CONSTRAINT "brand_team_members_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_team_members" ADD CONSTRAINT "brand_team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_team_members" ADD CONSTRAINT "brand_team_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_team_members" ADD CONSTRAINT "brand_team_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "account_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_team_members" ADD CONSTRAINT "admin_team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_team_members" ADD CONSTRAINT "admin_team_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_team_members" ADD CONSTRAINT "admin_team_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "account_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_addresses" ADD CONSTRAINT "saved_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_addresses" ADD CONSTRAINT "saved_addresses_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_account_members" ADD CONSTRAINT "business_account_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_account_members" ADD CONSTRAINT "business_account_members_business_account_id_fkey" FOREIGN KEY ("business_account_id") REFERENCES "business_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_account_members" ADD CONSTRAINT "business_account_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_business_account_id_fkey" FOREIGN KEY ("business_account_id") REFERENCES "business_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_persons" ADD CONSTRAINT "contact_persons_business_account_id_fkey" FOREIGN KEY ("business_account_id") REFERENCES "business_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_roles" ADD CONSTRAINT "account_roles_business_account_id_fkey" FOREIGN KEY ("business_account_id") REFERENCES "business_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_business_account_id_fkey" FOREIGN KEY ("business_account_id") REFERENCES "business_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "account_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_wallets" ADD CONSTRAINT "vendor_wallets_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_wallet_txns" ADD CONSTRAINT "vendor_wallet_txns_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "vendor_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_settlements" ADD CONSTRAINT "vendor_settlements_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_settlements" ADD CONSTRAINT "vendor_settlements_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "vendor_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_settlement_orders" ADD CONSTRAINT "vendor_settlement_orders_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "vendor_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_customers" ADD CONSTRAINT "vendor_customers_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_customers" ADD CONSTRAINT "vendor_customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_customers" ADD CONSTRAINT "vendor_customers_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_customers" ADD CONSTRAINT "vendor_customers_salesperson_id_fkey" FOREIGN KEY ("salesperson_id") REFERENCES "salespersons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_customer_tasks" ADD CONSTRAINT "vendor_customer_tasks_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_assignments" ADD CONSTRAINT "price_list_assignments_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_assignments" ADD CONSTRAINT "price_list_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_assignments" ADD CONSTRAINT "price_list_assignments_business_account_id_fkey" FOREIGN KEY ("business_account_id") REFERENCES "business_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_assignments" ADD CONSTRAINT "price_list_assignments_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_assignments" ADD CONSTRAINT "price_list_assignments_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_assignments" ADD CONSTRAINT "price_list_assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "customer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_groups" ADD CONSTRAINT "customer_groups_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_group_members" ADD CONSTRAINT "customer_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "customer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_buy_product_id_fkey" FOREIGN KEY ("buy_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_get_product_id_fkey" FOREIGN KEY ("get_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_customer_prices" ADD CONSTRAINT "vendor_customer_prices_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_customer_prices" ADD CONSTRAINT "vendor_customer_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_claims" ADD CONSTRAINT "vendor_claims_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_claims" ADD CONSTRAINT "vendor_claims_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picklists" ADD CONSTRAINT "picklists_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picklists" ADD CONSTRAINT "picklists_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picklists" ADD CONSTRAINT "picklists_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_outlet_id_fkey" FOREIGN KEY ("from_outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_outlet_id_fkey" FOREIGN KEY ("to_outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salespersons" ADD CONSTRAINT "salespersons_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salespersons" ADD CONSTRAINT "salespersons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_salesperson_id_fkey" FOREIGN KEY ("salesperson_id") REFERENCES "salespersons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_accruals" ADD CONSTRAINT "commission_accruals_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_accruals" ADD CONSTRAINT "commission_accruals_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_accruals" ADD CONSTRAINT "commission_accruals_salesperson_id_fkey" FOREIGN KEY ("salesperson_id") REFERENCES "salespersons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_accruals" ADD CONSTRAINT "commission_accruals_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "commission_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_accruals" ADD CONSTRAINT "commission_accruals_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_campaigns" ADD CONSTRAINT "cashback_campaigns_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_entries" ADD CONSTRAINT "cashback_entries_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "cashback_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_entries" ADD CONSTRAINT "cashback_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_entries" ADD CONSTRAINT "cashback_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
