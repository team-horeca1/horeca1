# HoReCa Hub - Database Schema Overview

Generated: 2026-07-24

## Important

- **One PostgreSQL database** powers the website (not many separate DBs).
- **90 tables** / models, **44 enums**.
- This document is **structure only** (no customer or order data).

## Domain groups

### Auth & Identity

- **User** (table: `users`)
- **Account** (table: `accounts`)
- **Session** (table: `sessions`)
- **VerificationToken** (table: `verification_tokens`)
- **LinkedAccount** (table: `linked_accounts`)
- **SavedAddress** (table: `saved_addresses`)

### Business / Supplier / Store

- **BusinessAccount** (table: `business_accounts`)
- **BusinessAccountMember** (table: `business_account_members`)
- **Outlet** (table: `outlets`)
- **Vendor** (table: `vendors`)
- **ServiceArea** (table: `service_areas`)
- **DeliverySlot** (table: `delivery_slots`)
- **CustomerVendor** (table: `customer_vendors`)

### Catalog

- **Category** (table: `categories`)
- **CategoryCategory** (table: `category_categories`)
- **Product** (table: `products`)
- **ProductCategory** (table: `product_categories`)
- **PriceSlab** (table: `price_slabs`)
- **Collection** (table: `collections`)
- **CollectionProduct** (table: `collection_products`)
- **ProductCombo** (table: `product_combos`)
- **ComboItem** (table: `combo_items`)
- **Inventory** (table: `inventory`)
- **MasterProduct** (table: `master_products`)
- **MasterProductCategory** (table: `master_product_categories`)
- **MasterProductRevision** (table: `master_product_revisions`)
- **ProductAuditLog** (table: `product_audit_logs`)

### Cart & Orders

- **Cart** (table: `carts`)
- **CartItem** (table: `cart_items`)
- **Order** (table: `orders`)
- **OrderItem** (table: `order_items`)
- **Review** (table: `reviews`)

### Lists & Saved

- **QuickOrderList** (table: `quick_order_lists`)
- **QuickOrderListItem** (table: `quick_order_list_items`)

### Payments & Credit

- **Payment** (table: `payments`)
- **CreditAccount** (table: `credit_accounts`)
- **CreditTransaction** (table: `credit_transactions`)
- **Wallet** (table: `wallets`)
- **WalletTransaction** (table: `wallet_transactions`)
- **GlobalCreditConfig** (table: `global_credit_configs`)
- **CreditWallet** (table: `credit_wallets`)
- **CreditWalletTxn** (table: `credit_wallet_transactions`)
- **CreditWalletRepayment** (table: `credit_wallet_repayments`)
- **CreditWalletPenalty** (table: `credit_wallet_penalties`)
- **CreditWalletAuditLog** (table: `credit_wallet_audit_logs`)

### Notifications

- **Notification** (table: `notifications`)

### Brand

- **Brand** (table: `brands`)
- **BrandMasterProduct** (table: `brand_master_products`)
- **BrandProductMapping** (table: `brand_product_mappings`)
- **BrandDistributorInvite** (table: `brand_distributor_invites`)
- **BrandAuthorizedDistributor** (table: `brand_authorized_distributors`)
- **BrandTeamMember** (table: `brand_team_members`)

### Teams

- **VendorTeamMember** (table: `vendor_team_members`)
- **AdminTeamMember** (table: `admin_team_members`)
- **UserRole** (table: `user_roles`)
- **AccountRole** (table: `account_roles`)

### Audit

- **AuditLog** (table: `audit_logs`)

## All tables (simple list)

- `accounts`
- `account_roles`
- `admin_team_members`
- `audit_logs`
- `brands`
- `brand_authorized_distributors`
- `brand_distributor_invites`
- `brand_master_products`
- `brand_product_mappings`
- `brand_team_members`
- `business_accounts`
- `business_account_members`
- `carts`
- `cart_items`
- `cashback_campaigns`
- `cashback_entries`
- `categories`
- `category_categories`
- `collections`
- `collection_products`
- `combo_items`
- `commission_accruals`
- `commission_rules`
- `contact_persons`
- `coupons`
- `coupon_redemptions`
- `credit_accounts`
- `credit_transactions`
- `credit_wallets`
- `credit_wallet_audit_logs`
- `credit_wallet_penalties`
- `credit_wallet_repayments`
- `credit_wallet_transactions`
- `customer_groups`
- `customer_group_members`
- `customer_vendors`
- `delivery_slots`
- `dispatches`
- `global_credit_configs`
- `goods_receipts`
- `inventory`
- `inventory_logs`
- `linked_accounts`
- `master_products`
- `master_product_categories`
- `master_product_revisions`
- `notifications`
- `orders`
- `order_items`
- `otp_codes`
- `outlets`
- `payments`
- `picklists`
- `platform_settings`
- `price_lists`
- `price_list_assignments`
- `price_list_items`
- `price_slabs`
- `products`
- `product_audit_logs`
- `product_categories`
- `product_combos`
- `promotions`
- `push_subscriptions`
- `quick_order_lists`
- `quick_order_list_items`
- `return_requests`
- `reviews`
- `salespersons`
- `saved_addresses`
- `service_areas`
- `sessions`
- `stock_transfers`
- `users`
- `user_roles`
- `vendors`
- `vendor_claims`
- `vendor_customers`
- `vendor_customer_prices`
- `vendor_customer_tasks`
- `vendor_documents`
- `vendor_settlements`
- `vendor_settlement_orders`
- `vendor_team_members`
- `vendor_wallets`
- `vendor_wallet_txns`
- `verification_tokens`
- `wallets`
- `wallet_transactions`
- `webhook_events`

## Full detail

See `horeca1-schema-overview.json` for columns and relationships per table.

For a visual diagram, import `horeca1-schema.sql` into https://dbdiagram.io (Import → From PostgreSQL) and use Share.
