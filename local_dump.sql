--
-- PostgreSQL database dump
--

\restrict vgZzv5YAyAicjUdBax5S5jQmTDVVNtBG45UkRttrX4B1GQDmbKCJ6AStdsf6y6i

-- Dumped from database version 17.9
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: ApprovalStatus; Type: TYPE; Schema: public; Owner: horeca1
--

CREATE TYPE public."ApprovalStatus" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE public."ApprovalStatus" OWNER TO horeca1;

--
-- Name: CreditStatus; Type: TYPE; Schema: public; Owner: horeca1
--

CREATE TYPE public."CreditStatus" AS ENUM (
    'pending',
    'active',
    'suspended',
    'closed'
);


ALTER TYPE public."CreditStatus" OWNER TO horeca1;

--
-- Name: CreditTxnType; Type: TYPE; Schema: public; Owner: horeca1
--

CREATE TYPE public."CreditTxnType" AS ENUM (
    'debit',
    'credit',
    'adjustment'
);


ALTER TYPE public."CreditTxnType" OWNER TO horeca1;

--
-- Name: NotificationChannel; Type: TYPE; Schema: public; Owner: horeca1
--

CREATE TYPE public."NotificationChannel" AS ENUM (
    'sms',
    'email',
    'whatsapp',
    'push',
    'in_app'
);


ALTER TYPE public."NotificationChannel" OWNER TO horeca1;

--
-- Name: NotificationStatus; Type: TYPE; Schema: public; Owner: horeca1
--

CREATE TYPE public."NotificationStatus" AS ENUM (
    'pending',
    'sent',
    'failed'
);


ALTER TYPE public."NotificationStatus" OWNER TO horeca1;

--
-- Name: OrderStatus; Type: TYPE; Schema: public; Owner: horeca1
--

CREATE TYPE public."OrderStatus" AS ENUM (
    'pending',
    'confirmed',
    'processing',
    'shipped',
    'delivered',
    'cancelled'
);


ALTER TYPE public."OrderStatus" OWNER TO horeca1;

--
-- Name: PaymentState; Type: TYPE; Schema: public; Owner: horeca1
--

CREATE TYPE public."PaymentState" AS ENUM (
    'unpaid',
    'paid',
    'partial',
    'refunded'
);


ALTER TYPE public."PaymentState" OWNER TO horeca1;

--
-- Name: PaymentStatus; Type: TYPE; Schema: public; Owner: horeca1
--

CREATE TYPE public."PaymentStatus" AS ENUM (
    'created',
    'authorized',
    'captured',
    'failed',
    'refunded'
);


ALTER TYPE public."PaymentStatus" OWNER TO horeca1;

--
-- Name: Role; Type: TYPE; Schema: public; Owner: horeca1
--

CREATE TYPE public."Role" AS ENUM (
    'customer',
    'vendor',
    'admin'
);


ALTER TYPE public."Role" OWNER TO horeca1;

--
-- Name: WalletTxnType; Type: TYPE; Schema: public; Owner: horeca1
--

CREATE TYPE public."WalletTxnType" AS ENUM (
    'credit',
    'debit'
);


ALTER TYPE public."WalletTxnType" OWNER TO horeca1;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO horeca1;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.accounts (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    provider text NOT NULL,
    provider_account_id text NOT NULL,
    refresh_token text,
    access_token text,
    expires_at integer,
    token_type text,
    scope text,
    id_token text,
    session_state text
);


ALTER TABLE public.accounts OWNER TO horeca1;

--
-- Name: cart_items; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.cart_items (
    id uuid NOT NULL,
    cart_id uuid NOT NULL,
    product_id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.cart_items OWNER TO horeca1;

--
-- Name: carts; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.carts (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.carts OWNER TO horeca1;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.categories (
    id uuid NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    parent_id uuid,
    image_url character varying(512),
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    approval_note text,
    approval_status public."ApprovalStatus" DEFAULT 'approved'::public."ApprovalStatus" NOT NULL,
    approved_at timestamp with time zone,
    approved_by uuid,
    suggested_by uuid
);


ALTER TABLE public.categories OWNER TO horeca1;

--
-- Name: collection_products; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.collection_products (
    id uuid NOT NULL,
    collection_id uuid NOT NULL,
    product_id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.collection_products OWNER TO horeca1;

--
-- Name: collections; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.collections (
    id uuid NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    description text,
    image_url character varying(512),
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.collections OWNER TO horeca1;

--
-- Name: credit_accounts; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.credit_accounts (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    credit_limit numeric(12,2) DEFAULT 0 NOT NULL,
    credit_used numeric(12,2) DEFAULT 0 NOT NULL,
    status public."CreditStatus" DEFAULT 'pending'::public."CreditStatus" NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.credit_accounts OWNER TO horeca1;

--
-- Name: credit_transactions; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.credit_transactions (
    id uuid NOT NULL,
    credit_account_id uuid NOT NULL,
    order_id uuid,
    vendor_id uuid NOT NULL,
    type public."CreditTxnType" NOT NULL,
    amount numeric(12,2) NOT NULL,
    balance_after numeric(12,2) NOT NULL,
    due_date date,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.credit_transactions OWNER TO horeca1;

--
-- Name: customer_vendors; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.customer_vendors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    is_favorite boolean DEFAULT false NOT NULL,
    last_ordered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.customer_vendors OWNER TO horeca1;

--
-- Name: delivery_slots; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.delivery_slots (
    id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    slot_start character varying(10) NOT NULL,
    slot_end character varying(10) NOT NULL,
    cutoff_time character varying(10) NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


ALTER TABLE public.delivery_slots OWNER TO horeca1;

--
-- Name: inventory; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.inventory (
    id uuid NOT NULL,
    product_id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    qty_available integer DEFAULT 0 NOT NULL,
    qty_reserved integer DEFAULT 0 NOT NULL,
    low_stock_threshold integer DEFAULT 10 NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.inventory OWNER TO horeca1;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.notifications (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    type character varying(30) NOT NULL,
    channel public."NotificationChannel" NOT NULL,
    title character varying(255),
    body text,
    reference_id uuid,
    reference_type character varying(30),
    status public."NotificationStatus" DEFAULT 'pending'::public."NotificationStatus" NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.notifications OWNER TO horeca1;

--
-- Name: order_items; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.order_items (
    id uuid NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_name character varying(255) NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    total_price numeric(12,2) NOT NULL
);


ALTER TABLE public.order_items OWNER TO horeca1;

--
-- Name: orders; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.orders (
    id uuid NOT NULL,
    order_number character varying(50) NOT NULL,
    user_id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    status public."OrderStatus" DEFAULT 'pending'::public."OrderStatus" NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    tax_amount numeric(12,2) DEFAULT 0 NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    payment_method character varying(30),
    payment_status public."PaymentState" DEFAULT 'unpaid'::public."PaymentState" NOT NULL,
    delivery_slot_id uuid,
    delivery_date date,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.orders OWNER TO horeca1;

--
-- Name: payments; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.payments (
    id uuid NOT NULL,
    order_id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    user_id uuid NOT NULL,
    razorpay_order_id character varying(100),
    razorpay_payment_id character varying(100),
    razorpay_signature character varying(255),
    amount numeric(12,2) NOT NULL,
    currency character varying(10) DEFAULT 'INR'::character varying NOT NULL,
    status public."PaymentStatus" DEFAULT 'created'::public."PaymentStatus" NOT NULL,
    method character varying(30),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.payments OWNER TO horeca1;

--
-- Name: price_slabs; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.price_slabs (
    id uuid NOT NULL,
    product_id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    min_qty integer NOT NULL,
    max_qty integer,
    price numeric(10,2) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    promo_price numeric(10,2)
);


ALTER TABLE public.price_slabs OWNER TO horeca1;

--
-- Name: products; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.products (
    id uuid NOT NULL,
    vendor_id uuid,
    category_id uuid,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    description text,
    image_url character varying(512),
    pack_size character varying(100),
    unit character varying(50),
    base_price numeric(10,2) NOT NULL,
    credit_eligible boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    images text[] DEFAULT '{}'::text[],
    sku character varying(100),
    hsn character varying(50),
    brand character varying(150),
    barcode character varying(100),
    tags text[] DEFAULT '{}'::text[],
    original_price numeric(10,2),
    tax_percent numeric(5,2) DEFAULT 0 NOT NULL,
    min_order_qty integer DEFAULT 1 NOT NULL,
    approval_note text,
    approval_status public."ApprovalStatus" DEFAULT 'pending'::public."ApprovalStatus" NOT NULL,
    approved_at timestamp with time zone,
    approved_by uuid,
    promo_end_time character varying(5),
    promo_price numeric(10,2),
    promo_start_time character varying(5)
);


ALTER TABLE public.products OWNER TO horeca1;

--
-- Name: quick_order_list_items; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.quick_order_list_items (
    id uuid NOT NULL,
    list_id uuid NOT NULL,
    product_id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    default_qty integer DEFAULT 0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.quick_order_list_items OWNER TO horeca1;

--
-- Name: quick_order_lists; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.quick_order_lists (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.quick_order_lists OWNER TO horeca1;

--
-- Name: service_areas; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.service_areas (
    id uuid NOT NULL,
    vendor_id uuid NOT NULL,
    pincode character varying(10) NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


ALTER TABLE public.service_areas OWNER TO horeca1;

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.sessions (
    id uuid NOT NULL,
    session_token text NOT NULL,
    user_id uuid NOT NULL,
    expires timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.sessions OWNER TO horeca1;

--
-- Name: users; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email character varying(255) NOT NULL,
    email_verified timestamp(3) without time zone,
    password character varying(255),
    phone character varying(20),
    full_name character varying(255) DEFAULT ''::character varying NOT NULL,
    image character varying(512),
    role public."Role" DEFAULT 'customer'::public."Role" NOT NULL,
    pincode character varying(10),
    business_name character varying(255),
    gst_number character varying(20),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.users OWNER TO horeca1;

--
-- Name: vendors; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.vendors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    business_name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    description text,
    logo_url character varying(512),
    banner_url character varying(512),
    rating numeric(2,1) DEFAULT 0 NOT NULL,
    min_order_value numeric(10,2) DEFAULT 0 NOT NULL,
    credit_enabled boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.vendors OWNER TO horeca1;

--
-- Name: verification_tokens; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.verification_tokens (
    identifier text NOT NULL,
    token text NOT NULL,
    expires timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.verification_tokens OWNER TO horeca1;

--
-- Name: wallet_transactions; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.wallet_transactions (
    id uuid NOT NULL,
    wallet_id uuid NOT NULL,
    type public."WalletTxnType" NOT NULL,
    amount numeric(12,2) NOT NULL,
    reference_id uuid,
    reference_type character varying(30),
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.wallet_transactions OWNER TO horeca1;

--
-- Name: wallets; Type: TABLE; Schema: public; Owner: horeca1
--

CREATE TABLE public.wallets (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    balance numeric(12,2) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.wallets OWNER TO horeca1;

--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
feb32286-4e49-4a55-9d94-182c52948a4e	cf5426d70882a77fb45f63afc5e835f856ac48c6dc493f957b757a184c39cd1a	2026-03-20 08:15:41.176526+00	20260320081540_init_schema	\N	\N	2026-03-20 08:15:40.660272+00	1
0ee4451f-e4e1-468c-a241-a5f02fa68889	5f502390b2638f079c0fada1ea73d494eaad51da148bff87a2b408580661be73	2026-03-25 06:34:44.566266+00	20260323_add_product_fields	\N	\N	2026-03-25 06:34:44.517019+00	1
78d7f25e-b0ff-4e88-afc1-bd31109cea03	4b182a713d388bc25db9c7b2f6cb0ee563c7ec576712838db50ed64bcc80d506	2026-03-25 06:35:15.388365+00	20260325063445_add_approval_status	\N	\N	2026-03-25 06:35:15.350335+00	1
a9637166-0b84-443d-969b-090717b47f92	c9f12badc357d5eff647682f9a096a9d24c6a56aa08d33529e76a28a8ae54218	2026-03-25 12:24:37.179672+00	20260325122437_add_promo_pricing	\N	\N	2026-03-25 12:24:37.152515+00	1
d6c98686-dc8d-4f95-8416-ef2e075ee529	b17bb85a10575514975fc5460ebaa67a2e25107ca9684abc9343a8b7a5111514	2026-03-25 12:39:11.060758+00	20260325123911_make_product_vendor_optional	\N	\N	2026-03-25 12:39:11.031465+00	1
\.


--
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.accounts (id, user_id, type, provider, provider_account_id, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state) FROM stdin;
\.


--
-- Data for Name: cart_items; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.cart_items (id, cart_id, product_id, vendor_id, quantity, unit_price, created_at) FROM stdin;
7bd94a20-e793-4f25-b636-7f9f3feb0cdb	1152e988-43be-4e2b-9b58-f3ebd3655b59	6ee12622-a145-424c-8673-ed9eb9532ffc	7cff9dc1-5ba2-488c-aa62-863fde869b05	5	520.00	2026-03-20 08:53:41.76+00
\.


--
-- Data for Name: carts; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.carts (id, user_id, updated_at) FROM stdin;
1152e988-43be-4e2b-9b58-f3ebd3655b59	eaef2156-ece2-492f-adf1-9ed39785164a	2026-03-20 08:53:41.709+00
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.categories (id, name, slug, parent_id, image_url, sort_order, is_active, created_at, approval_note, approval_status, approved_at, approved_by, suggested_by) FROM stdin;
1cf015fd-3ec2-4d50-b467-ef926b8d0828	Vegetables	vegetables	\N	/images/category/vegitable.png	1	t	2026-03-20 08:16:31.733+00	\N	approved	\N	\N	\N
fa828ff7-96bc-49db-9086-7bfdac322a4d	Fruits	fruits	\N	/images/category/fruits.png	2	t	2026-03-20 08:16:31.748+00	\N	approved	\N	\N	\N
16e6c5c3-d06d-412a-952e-aea7517bba0f	Dairy & Eggs	dairy-eggs	\N	/images/category/milk.png	3	t	2026-03-20 08:16:31.759+00	\N	approved	\N	\N	\N
2555cc44-f663-4724-9903-b26a7afc8436	Spices & Masala	spices-masala	\N	/images/category/candy.png	4	t	2026-03-20 08:16:31.769+00	\N	approved	\N	\N	\N
ab480a32-f280-4610-9541-0064e490a9e4	Grains & Pulses	grains-pulses	\N	/images/category/snacks.png	5	t	2026-03-20 08:16:31.779+00	\N	approved	\N	\N	\N
f41fd0c1-f940-41be-9ce4-d1c07600f800	Meat & Poultry	meat-poultry	\N	/images/category/fish & meat.png	6	t	2026-03-20 08:16:31.789+00	\N	approved	\N	\N	\N
d04594cf-2961-4551-9695-d0a2295a0e7d	Seafood	seafood	\N	/images/category/fish & meat.png	7	t	2026-03-20 08:16:31.798+00	\N	approved	\N	\N	\N
826b17fa-ed9d-4a73-bf6f-0a4b28c0a89d	Beverages	beverages	\N	/images/category/drink-juice.png	8	t	2026-03-20 08:16:31.807+00	\N	approved	\N	\N	\N
639b973c-ad72-4a98-ad7c-606ee1b413f4	Oils & Ghee	oils-ghee	\N	/images/category/fruits.png	9	t	2026-03-20 08:16:31.817+00	\N	approved	\N	\N	\N
db4fe326-7086-4224-9469-df3a2a6b7a50	Packaging & Supplies	packaging-supplies	\N	/images/category/vegitable.png	10	t	2026-03-20 08:16:31.825+00	\N	approved	\N	\N	\N
b94f97ab-3e14-4f59-a47d-60df0dbb2949	gggyjgyj	gggyjgyj	\N	https://ik.imagekit.io/nasjugiz2/horeca/categories/horeca1_event_flow_1773390830312-1774510489572_NYZ9YPmAR.png	0	t	2026-03-26 07:36:38.056+00	\N	approved	2026-03-26 07:36:38.041+00	b4d67165-07f4-4473-b8ea-102e3887f520	\N
\.


--
-- Data for Name: collection_products; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.collection_products (id, collection_id, product_id, vendor_id, sort_order) FROM stdin;
\.


--
-- Data for Name: collections; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.collections (id, name, slug, description, image_url, sort_order, is_active, created_at) FROM stdin;
49d31aac-195b-4cc1-ad2f-fadc13e61ee2	Weekend Specials	weekend-specials	Top picks for weekend menu prep	\N	1	t	2026-03-20 08:16:34.66+00
a9266278-ba64-48b2-b6e8-4334a6373b9c	Kitchen Essentials	kitchen-essentials	Must-have staples for every kitchen	\N	2	t	2026-03-20 08:16:34.672+00
7341833d-680a-438b-acaf-e12f6d9f28fa	New Arrivals	new-arrivals	Fresh additions from our vendors	\N	3	t	2026-03-20 08:16:34.679+00
\.


--
-- Data for Name: credit_accounts; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.credit_accounts (id, user_id, vendor_id, credit_limit, credit_used, status, created_at, updated_at) FROM stdin;
69606ba6-87a9-42ac-9dec-cc53cdf93e0d	eaef2156-ece2-492f-adf1-9ed39785164a	93b01c97-779d-404a-82be-6d4d59d5d4d6	50000.00	12500.00	active	2026-03-20 08:16:34.69+00	2026-03-20 08:16:34.69+00
78d0ff3a-de1e-4399-9195-c3b4eb9c781b	eaef2156-ece2-492f-adf1-9ed39785164a	7cff9dc1-5ba2-488c-aa62-863fde869b05	25000.00	0.00	active	2026-03-20 08:16:34.703+00	2026-03-20 08:16:34.703+00
\.


--
-- Data for Name: credit_transactions; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.credit_transactions (id, credit_account_id, order_id, vendor_id, type, amount, balance_after, due_date, notes, created_at) FROM stdin;
\.


--
-- Data for Name: customer_vendors; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.customer_vendors (id, user_id, vendor_id, is_favorite, last_ordered_at, created_at) FROM stdin;
fae00eac-9f1c-4498-a188-729efa7b030c	eaef2156-ece2-492f-adf1-9ed39785164a	93b01c97-779d-404a-82be-6d4d59d5d4d6	t	\N	2026-03-20 08:16:34.595+00
48cfed08-2ba5-4198-8916-f4ce2ae5d4ef	eaef2156-ece2-492f-adf1-9ed39785164a	7cff9dc1-5ba2-488c-aa62-863fde869b05	t	\N	2026-03-20 08:16:34.603+00
1d059251-b624-42c6-8f94-7c7fc218e9ba	eaef2156-ece2-492f-adf1-9ed39785164a	bba91aff-3a40-4ce8-8133-dfca667ecd24	t	\N	2026-03-20 08:16:34.61+00
371e937d-1c5e-49fc-90c7-a34151fc22ca	eaef2156-ece2-492f-adf1-9ed39785164a	a9c92a29-63bb-419c-b19f-e2e27aef616a	t	\N	2026-03-20 08:16:34.616+00
5e1c8d62-81cd-4362-8c07-93e917944c07	eaef2156-ece2-492f-adf1-9ed39785164a	04976999-f802-4b3d-a097-665aef50c3f1	t	\N	2026-03-20 08:16:34.623+00
cc5820ab-72f7-4f93-9aa3-5c7fa071e50f	545b73d8-c63d-423d-a51a-8f20fa28c427	93b01c97-779d-404a-82be-6d4d59d5d4d6	t	\N	2026-03-20 08:16:34.63+00
385a999b-aab2-48e6-8c08-8befd08fb05f	545b73d8-c63d-423d-a51a-8f20fa28c427	7cff9dc1-5ba2-488c-aa62-863fde869b05	f	\N	2026-03-20 08:16:34.636+00
02b241cf-6f66-47c7-8a62-b63d2e491bd5	545b73d8-c63d-423d-a51a-8f20fa28c427	bba91aff-3a40-4ce8-8133-dfca667ecd24	f	\N	2026-03-20 08:16:34.646+00
\.


--
-- Data for Name: delivery_slots; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.delivery_slots (id, vendor_id, day_of_week, slot_start, slot_end, cutoff_time, is_active) FROM stdin;
744e9273-427d-497f-ac05-a80b805647b8	93b01c97-779d-404a-82be-6d4d59d5d4d6	1	06:00	10:00	22:00	t
770ba912-199c-4100-a58b-ed9f88e120e7	93b01c97-779d-404a-82be-6d4d59d5d4d6	1	14:00	18:00	10:00	t
31101de6-88d6-46e6-a410-eada0c793a54	93b01c97-779d-404a-82be-6d4d59d5d4d6	2	06:00	10:00	22:00	t
5cce039a-b3c1-4d6f-bdf2-94116f7edd4f	93b01c97-779d-404a-82be-6d4d59d5d4d6	2	14:00	18:00	10:00	t
e622d35d-f182-4406-a725-882ec248a7c0	93b01c97-779d-404a-82be-6d4d59d5d4d6	3	06:00	10:00	22:00	t
228b19ba-b04f-4f12-952c-789593fea2d0	93b01c97-779d-404a-82be-6d4d59d5d4d6	3	14:00	18:00	10:00	t
07bcdcc0-f9fe-4cf4-ab99-1b3aedc35789	93b01c97-779d-404a-82be-6d4d59d5d4d6	4	06:00	10:00	22:00	t
2865cb73-d2c5-4589-afb2-3342c010941c	93b01c97-779d-404a-82be-6d4d59d5d4d6	4	14:00	18:00	10:00	t
3b83a3b1-9ff4-49ec-93c1-e3727b048b8a	93b01c97-779d-404a-82be-6d4d59d5d4d6	5	06:00	10:00	22:00	t
766bb8d7-eaf2-478d-996f-f3ea70eb997b	93b01c97-779d-404a-82be-6d4d59d5d4d6	5	14:00	18:00	10:00	t
1527ad72-26a4-4b77-8e96-f367249e9368	93b01c97-779d-404a-82be-6d4d59d5d4d6	6	06:00	10:00	22:00	t
7108ab0b-1f15-4034-8a2b-e1d332dd241f	93b01c97-779d-404a-82be-6d4d59d5d4d6	6	14:00	18:00	10:00	t
edb79385-7361-45d8-b0bc-e105bc74f96b	7cff9dc1-5ba2-488c-aa62-863fde869b05	1	06:00	10:00	22:00	t
cb2ab7a8-d4f3-440b-8de9-0f2bc0b5c6c5	7cff9dc1-5ba2-488c-aa62-863fde869b05	1	14:00	18:00	10:00	t
667ab08a-1c91-48e9-bbfc-d0aeddbc8f50	7cff9dc1-5ba2-488c-aa62-863fde869b05	2	06:00	10:00	22:00	t
95879f10-274d-40de-ae39-30e1c7fc6dee	7cff9dc1-5ba2-488c-aa62-863fde869b05	2	14:00	18:00	10:00	t
d50ea212-5dff-45dd-8fe3-52eb3fcd4e68	7cff9dc1-5ba2-488c-aa62-863fde869b05	3	06:00	10:00	22:00	t
387e1437-1656-4926-ae34-5a988cf64265	7cff9dc1-5ba2-488c-aa62-863fde869b05	3	14:00	18:00	10:00	t
91341e6b-02f3-4125-b476-6424600c631c	7cff9dc1-5ba2-488c-aa62-863fde869b05	4	06:00	10:00	22:00	t
0b3fa00a-beab-4ccd-ba41-79774847df02	7cff9dc1-5ba2-488c-aa62-863fde869b05	4	14:00	18:00	10:00	t
41d77a2e-fe58-435c-830c-78e15e37c950	7cff9dc1-5ba2-488c-aa62-863fde869b05	5	06:00	10:00	22:00	t
6aab27b6-d070-4f6d-a246-86bc83473f9a	7cff9dc1-5ba2-488c-aa62-863fde869b05	5	14:00	18:00	10:00	t
85f50fc1-0a2e-4e5b-a676-21d664cdcee6	7cff9dc1-5ba2-488c-aa62-863fde869b05	6	06:00	10:00	22:00	t
4b2a5898-f310-4dad-9c28-2c29551cb2ec	7cff9dc1-5ba2-488c-aa62-863fde869b05	6	14:00	18:00	10:00	t
f2ab1a8b-fd33-4149-b6cb-4d30d48c3c9d	bba91aff-3a40-4ce8-8133-dfca667ecd24	1	06:00	10:00	22:00	t
3802893e-a958-4f1a-8c48-f2d90efb2f88	bba91aff-3a40-4ce8-8133-dfca667ecd24	1	14:00	18:00	10:00	t
32d72aae-2738-4617-a583-5af22ef86b3b	bba91aff-3a40-4ce8-8133-dfca667ecd24	2	06:00	10:00	22:00	t
9a5a1620-852f-4d71-8fbe-aafe93f34d2a	bba91aff-3a40-4ce8-8133-dfca667ecd24	2	14:00	18:00	10:00	t
e5034e55-2582-4a23-951f-bf3e739739ab	bba91aff-3a40-4ce8-8133-dfca667ecd24	3	06:00	10:00	22:00	t
8e800b53-aff4-4d91-b4e0-de4cb48f3e0c	bba91aff-3a40-4ce8-8133-dfca667ecd24	3	14:00	18:00	10:00	t
d7298afa-6284-4247-b869-e75616a32f38	bba91aff-3a40-4ce8-8133-dfca667ecd24	4	06:00	10:00	22:00	t
2b9f0d8e-0ddc-4a6e-b11e-6f9fa2b92802	bba91aff-3a40-4ce8-8133-dfca667ecd24	4	14:00	18:00	10:00	t
4daf0262-af71-4e77-b423-1acc63188873	bba91aff-3a40-4ce8-8133-dfca667ecd24	5	06:00	10:00	22:00	t
71e689f4-2915-4c80-9791-0fbfd47abc86	bba91aff-3a40-4ce8-8133-dfca667ecd24	5	14:00	18:00	10:00	t
7f0b0b3a-0236-4b74-87f1-cdecfb2c7c45	bba91aff-3a40-4ce8-8133-dfca667ecd24	6	06:00	10:00	22:00	t
1c30c830-b9af-4d7f-b438-230f979f4ba8	bba91aff-3a40-4ce8-8133-dfca667ecd24	6	14:00	18:00	10:00	t
498843b6-f2f0-44db-b4c6-308ed3e22907	a9c92a29-63bb-419c-b19f-e2e27aef616a	1	06:00	10:00	22:00	t
77557604-db29-47c4-a36b-fed923d099ca	a9c92a29-63bb-419c-b19f-e2e27aef616a	1	14:00	18:00	10:00	t
ea844074-891c-44f3-8a40-7d31acf985aa	a9c92a29-63bb-419c-b19f-e2e27aef616a	2	06:00	10:00	22:00	t
c23af8ae-75b1-44b3-8757-3fad40bedd0d	a9c92a29-63bb-419c-b19f-e2e27aef616a	2	14:00	18:00	10:00	t
8aa34c1e-2b8b-4702-94fe-2db63613a591	a9c92a29-63bb-419c-b19f-e2e27aef616a	3	06:00	10:00	22:00	t
afee4633-ff3f-44a2-8608-bb6d2bfa7608	a9c92a29-63bb-419c-b19f-e2e27aef616a	3	14:00	18:00	10:00	t
9a3b5bb9-e29a-4bef-9c4e-a4b2830df9eb	a9c92a29-63bb-419c-b19f-e2e27aef616a	4	06:00	10:00	22:00	t
d46c274b-065b-4461-b80c-202e7d973078	a9c92a29-63bb-419c-b19f-e2e27aef616a	4	14:00	18:00	10:00	t
86b1d927-7507-43d3-a778-7095cdf6cfd7	a9c92a29-63bb-419c-b19f-e2e27aef616a	5	06:00	10:00	22:00	t
2cf874c5-835f-4f04-9a75-4c78ccbf0110	a9c92a29-63bb-419c-b19f-e2e27aef616a	5	14:00	18:00	10:00	t
a4609c81-78c2-4fba-81f7-4f10d011c171	a9c92a29-63bb-419c-b19f-e2e27aef616a	6	06:00	10:00	22:00	t
89357873-9d97-436b-8ce0-0a05489695b5	a9c92a29-63bb-419c-b19f-e2e27aef616a	6	14:00	18:00	10:00	t
81b0abd5-0b6e-48dd-937b-e85488a89812	04976999-f802-4b3d-a097-665aef50c3f1	1	06:00	10:00	22:00	t
2432c9d8-6a60-497f-bea2-fb179e9f6b11	04976999-f802-4b3d-a097-665aef50c3f1	1	14:00	18:00	10:00	t
bcf85816-5f31-4e4a-a9c4-4d1c222d447d	04976999-f802-4b3d-a097-665aef50c3f1	2	06:00	10:00	22:00	t
5a19e506-7f5c-40dd-b792-14b5942fb541	04976999-f802-4b3d-a097-665aef50c3f1	2	14:00	18:00	10:00	t
5c3bc20c-0e92-473c-9434-3569d992a32a	04976999-f802-4b3d-a097-665aef50c3f1	3	06:00	10:00	22:00	t
de96f45d-f163-4478-8a17-0f3d9690a55c	04976999-f802-4b3d-a097-665aef50c3f1	3	14:00	18:00	10:00	t
c97c0198-98b5-413d-924c-49fa7c354dd9	04976999-f802-4b3d-a097-665aef50c3f1	4	06:00	10:00	22:00	t
fa5e71f1-6200-4fc3-a50f-f36e83f1e3e3	04976999-f802-4b3d-a097-665aef50c3f1	4	14:00	18:00	10:00	t
750d47ae-1d17-4363-937f-b4e3bbf621fb	04976999-f802-4b3d-a097-665aef50c3f1	5	06:00	10:00	22:00	t
78e85a9f-c523-4207-9e16-cc9333d58052	04976999-f802-4b3d-a097-665aef50c3f1	5	14:00	18:00	10:00	t
ce2cb392-48a9-45cb-8c9b-3a83a721f0f2	04976999-f802-4b3d-a097-665aef50c3f1	6	06:00	10:00	22:00	t
875b035d-7e9c-4ecd-b405-2e3f1e9125d9	04976999-f802-4b3d-a097-665aef50c3f1	6	14:00	18:00	10:00	t
\.


--
-- Data for Name: inventory; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.inventory (id, product_id, vendor_id, qty_available, qty_reserved, low_stock_threshold, updated_at) FROM stdin;
3b8b4b83-7a6c-474c-8b95-0b70e088d144	ed4bfb93-84b4-4015-8465-3cd614579cf6	93b01c97-779d-404a-82be-6d4d59d5d4d6	500	0	50	2026-03-20 08:16:31.878+00
0ec3a865-c271-47a6-80cd-85d51f1d3475	254b1180-5a81-47f8-816a-9ba47865a530	93b01c97-779d-404a-82be-6d4d59d5d4d6	400	0	40	2026-03-20 08:16:31.923+00
0f063d90-2d87-4035-b322-0d2606b37e52	051f7284-b65f-4a80-a6eb-bb3cbc339f08	93b01c97-779d-404a-82be-6d4d59d5d4d6	600	0	60	2026-03-20 08:16:31.964+00
3aa410a5-cd3e-4d72-8073-c49bbd0ebf44	15535deb-3f85-4d6c-aa89-8684f09fb650	93b01c97-779d-404a-82be-6d4d59d5d4d6	200	0	20	2026-03-20 08:16:32.011+00
6c402b80-3582-4cf9-8593-6f2e735ac25c	7afd9ab8-6381-472d-974d-826993515217	93b01c97-779d-404a-82be-6d4d59d5d4d6	300	0	30	2026-03-20 08:16:32.069+00
dcf6b504-d50a-4c25-a30e-16c3bb48bc04	31214b66-4174-4c18-82fb-a1afc5923525	93b01c97-779d-404a-82be-6d4d59d5d4d6	100	0	10	2026-03-20 08:16:32.158+00
8eae8a27-023c-4d52-a564-16461e39c1e8	2953e52d-8a75-437f-aef9-995a4ed4ece2	93b01c97-779d-404a-82be-6d4d59d5d4d6	250	0	25	2026-03-20 08:16:32.238+00
7bab1e6c-8be7-4e78-b356-55c1fad6676d	37ac55b1-9d35-4c1f-90fe-90978ae8a0ea	93b01c97-779d-404a-82be-6d4d59d5d4d6	150	0	15	2026-03-20 08:16:32.296+00
ece340c6-ee74-4a48-979c-ed79af73bf0e	91f4585e-0748-4864-a11f-f84ec2b776fa	93b01c97-779d-404a-82be-6d4d59d5d4d6	200	0	20	2026-03-20 08:16:32.334+00
b5fc5375-3685-43f2-9917-c0552a78e861	2d9082b9-9151-43f6-a830-d22bfd3d67e6	93b01c97-779d-404a-82be-6d4d59d5d4d6	120	0	12	2026-03-20 08:16:32.377+00
aef27de7-9096-4ae7-8ac9-28b5ba55f0ba	ad260332-d616-4826-86eb-7fc1325ffc88	7cff9dc1-5ba2-488c-aa62-863fde869b05	300	0	30	2026-03-20 08:16:32.422+00
8cfa0ed0-afa2-438d-be9a-d8b3665ea8ba	7e75443d-1e20-4a9b-9739-8d8ef20551b0	7cff9dc1-5ba2-488c-aa62-863fde869b05	250	0	25	2026-03-20 08:16:32.467+00
5d7df5da-250b-4e33-8a1b-75bd79f88a1a	c357cb06-01ae-475b-8a0e-fee869905592	7cff9dc1-5ba2-488c-aa62-863fde869b05	200	0	20	2026-03-20 08:16:32.508+00
861de5e3-3834-4bdf-bc02-af7115e0b77b	94f48148-d9b1-46f2-9d47-d5ed3b6e8880	7cff9dc1-5ba2-488c-aa62-863fde869b05	180	0	18	2026-03-20 08:16:32.55+00
2fb9d5c1-735e-4538-a9e1-cf6061e9cb98	1df29de3-1aa3-4d09-9f1a-5138e3b480c6	7cff9dc1-5ba2-488c-aa62-863fde869b05	150	0	15	2026-03-20 08:16:32.589+00
76ad197e-461d-4fa7-a344-e778ba05a0d1	6ee12622-a145-424c-8673-ed9eb9532ffc	7cff9dc1-5ba2-488c-aa62-863fde869b05	200	0	20	2026-03-20 08:16:32.63+00
c512ee2a-3232-4850-b199-0eb7ce636b0a	26d1775b-6bf7-48b2-931f-eb35cd95469a	7cff9dc1-5ba2-488c-aa62-863fde869b05	300	0	30	2026-03-20 08:16:32.673+00
887d80d5-9bc8-4082-b25d-a01667ef53f0	edfb6ee1-e3e4-4ab5-b574-5bd4df05a2ef	7cff9dc1-5ba2-488c-aa62-863fde869b05	280	0	28	2026-03-20 08:16:32.722+00
3112ebf6-bab2-4c16-ba46-0190d3d07f35	276fa982-88cd-4fa4-a502-3470a7ff2bdc	7cff9dc1-5ba2-488c-aa62-863fde869b05	100	0	10	2026-03-20 08:16:32.773+00
01bc5a4e-d24b-42f8-bf2a-e46a0800eef7	82436349-e4e8-471b-9885-67ef630a1d95	7cff9dc1-5ba2-488c-aa62-863fde869b05	120	0	12	2026-03-20 08:16:32.827+00
6f15cc56-fb24-434d-94b9-542ce278e2ee	3d052fa9-1522-46b3-8db9-4578f8291616	bba91aff-3a40-4ce8-8133-dfca667ecd24	200	0	20	2026-03-20 08:16:32.865+00
89c9e6ed-2cd0-4b12-964e-413ef585f335	d31593f6-d987-4321-93ee-95ff0770830f	bba91aff-3a40-4ce8-8133-dfca667ecd24	250	0	25	2026-03-20 08:16:32.918+00
02bdca2b-9eba-4be3-b48e-f04e76b60f8c	8d7ff898-9667-4a69-bdd3-97e795a4015d	bba91aff-3a40-4ce8-8133-dfca667ecd24	100	0	10	2026-03-20 08:16:32.967+00
48def29b-c092-42ab-8e95-3df0c6e713c6	de516ead-4ca5-4e9a-af07-00da978dc152	bba91aff-3a40-4ce8-8133-dfca667ecd24	80	0	10	2026-03-20 08:16:33.02+00
a25d330e-04f3-4b2f-9345-9669e23636e3	93033245-02da-4ea9-9933-650d61b0c976	bba91aff-3a40-4ce8-8133-dfca667ecd24	60	0	10	2026-03-20 08:16:33.059+00
bf678bcf-9cd3-4e57-977b-21337c0cd0cc	e1f71ffb-0ad9-47ad-a722-451e7b39fa2d	bba91aff-3a40-4ce8-8133-dfca667ecd24	120	0	12	2026-03-20 08:16:33.093+00
09d6de35-d39e-4fe5-853b-019a9d34b4b8	18a1558f-7432-4ccc-9ca1-bc77b8311639	bba91aff-3a40-4ce8-8133-dfca667ecd24	50	0	10	2026-03-20 08:16:33.13+00
196a26ce-3fe9-4f52-95ff-a4e6c9635beb	5f76e73c-0d80-4386-916f-22d6dce7ad2d	bba91aff-3a40-4ce8-8133-dfca667ecd24	150	0	15	2026-03-20 08:16:33.169+00
7ff936d2-bbc8-4404-bd8e-ab5c82891eaa	a3e77eff-12c6-43c1-87c9-469cc13e0505	a9c92a29-63bb-419c-b19f-e2e27aef616a	200	0	20	2026-03-20 08:16:33.214+00
6474c654-8ee2-46b2-9e35-a3e976124f98	e0225a7a-99c7-4c0b-aa47-d31c9a8b212b	a9c92a29-63bb-419c-b19f-e2e27aef616a	180	0	18	2026-03-20 08:16:33.262+00
0c80ce6f-aaa4-470a-a184-a1151d490c82	93c117b5-551f-4b61-bb25-ce1edac401d1	a9c92a29-63bb-419c-b19f-e2e27aef616a	400	0	40	2026-03-20 08:16:33.318+00
8207a803-cc1e-4b68-bbec-c4da428f4d7b	7c558c05-7b51-4d1e-8c8c-4e742bc20706	a9c92a29-63bb-419c-b19f-e2e27aef616a	80	0	10	2026-03-20 08:16:33.364+00
b2ff7fb2-4eb4-4ccd-8feb-cde5f6cf31f0	4c4a9875-94fc-40fb-89e4-b5e815409fd8	a9c92a29-63bb-419c-b19f-e2e27aef616a	150	0	15	2026-03-20 08:16:33.407+00
fe0bdc21-8859-4178-bcba-83dd1e242451	7b166fb8-3a6f-4ce2-9dec-4d9ed8660a90	a9c92a29-63bb-419c-b19f-e2e27aef616a	200	0	20	2026-03-20 08:16:33.445+00
acd8889b-eaa3-4fd4-9813-b82abf521e78	c987e291-5268-4f80-aa5c-8931c426d0b1	a9c92a29-63bb-419c-b19f-e2e27aef616a	100	0	10	2026-03-20 08:16:33.485+00
cc00816e-1c02-4ea3-b276-b733862800ea	ba4cb3e0-851c-410a-8960-a83a9254e0ff	04976999-f802-4b3d-a097-665aef50c3f1	500	0	50	2026-03-20 08:16:33.521+00
e35025ea-fff3-407c-a6f4-96ecb1f8dee0	4894a8b2-e647-4cd9-ada5-4468489e5897	04976999-f802-4b3d-a097-665aef50c3f1	300	0	30	2026-03-20 08:16:33.563+00
1be29e6b-7939-4c7e-b9a3-54198f7751fa	a94a99f6-c4f5-4eff-ac75-a41b7c2efe54	04976999-f802-4b3d-a097-665aef50c3f1	250	0	25	2026-03-20 08:16:33.606+00
21141a93-5bba-4726-a41f-b504663f23e0	750f130a-11a4-4b7b-ac40-0942c4130b86	04976999-f802-4b3d-a097-665aef50c3f1	400	0	40	2026-03-20 08:16:33.65+00
33104552-b9dc-4bfe-a439-d132a7864a56	9700cf27-fcb5-46a7-b23f-bfec474769aa	04976999-f802-4b3d-a097-665aef50c3f1	350	0	35	2026-03-20 08:16:33.695+00
29cff47b-e122-4b6e-a3e3-b7e632889cfa	54bf54d8-d9d7-46c9-b6f6-4f332d6e27f0	04976999-f802-4b3d-a097-665aef50c3f1	200	0	20	2026-03-20 08:16:33.743+00
f201f7d8-1911-40a6-88fe-98e0b8cff1e8	0163c0ff-963b-4c1b-8491-1536f1543669	04976999-f802-4b3d-a097-665aef50c3f1	300	0	30	2026-03-20 08:16:33.82+00
909b60e0-0d5f-4074-864a-5fc8c8d147a0	f77caccc-e7c0-4aca-a7e0-d5de7ed9ff50	04976999-f802-4b3d-a097-665aef50c3f1	250	0	25	2026-03-20 08:16:33.875+00
a7eaa4ed-64a7-4e59-bc56-c7f3f099615e	48b6c774-f869-4e2e-841c-7eed042e6ff6	93b01c97-779d-404a-82be-6d4d59d5d4d6	0	0	10	2026-03-25 12:17:56.577+00
97b64807-79cd-457b-8ee3-cb87a4d01e68	fbad9e01-d19f-4750-9482-117c2d3de6b3	93b01c97-779d-404a-82be-6d4d59d5d4d6	0	0	10	2026-03-26 07:40:42.507+00
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.notifications (id, user_id, type, channel, title, body, reference_id, reference_type, status, read_at, created_at) FROM stdin;
c0d8f287-71d0-4d7b-a1ae-2853811878c5	bf9d6c40-26d1-46cd-9259-878820fc711c	account	in_app	Welcome to Horeca1!	Your account has been created. Start exploring vendors and place your first order.	bf9d6c40-26d1-46cd-9259-878820fc711c	user	pending	\N	2026-03-21 21:04:28.612+00
f675f728-20f3-4d90-ab66-e3daccee7790	b4d67165-07f4-4473-b8ea-102e3887f520	approval	in_app	New Product Pending Approval	New product pending approval: test2	fbad9e01-d19f-4750-9482-117c2d3de6b3	product	pending	\N	2026-03-26 07:40:42.547+00
9845bb1b-06d3-4faa-b3ef-455c9f5be8fb	8e04279e-987d-4dd4-90fc-abd9fd2f6397	approval	in_app	Product Approved	Your product 'test2' has been approved	fbad9e01-d19f-4750-9482-117c2d3de6b3	product	pending	\N	2026-03-26 07:42:54.373+00
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.order_items (id, order_id, product_id, product_name, quantity, unit_price, total_price) FROM stdin;
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.orders (id, order_number, user_id, vendor_id, status, subtotal, tax_amount, total_amount, payment_method, payment_status, delivery_slot_id, delivery_date, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.payments (id, order_id, vendor_id, user_id, razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, currency, status, method, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: price_slabs; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.price_slabs (id, product_id, vendor_id, min_qty, max_qty, price, sort_order, promo_price) FROM stdin;
7af71136-7823-42ee-aa06-169f745d907b	ed4bfb93-84b4-4015-8465-3cd614579cf6	93b01c97-779d-404a-82be-6d4d59d5d4d6	1	9	35.00	0	\N
fad994a3-ae8c-44a7-8b78-c90c37ac8fa5	ed4bfb93-84b4-4015-8465-3cd614579cf6	93b01c97-779d-404a-82be-6d4d59d5d4d6	10	49	33.00	1	\N
5ad12f1b-3abc-43ea-9853-eac8a728f365	ed4bfb93-84b4-4015-8465-3cd614579cf6	93b01c97-779d-404a-82be-6d4d59d5d4d6	50	\N	32.00	2	\N
0d37ee7f-c35d-4d6b-88cf-7e722a09a1d9	254b1180-5a81-47f8-816a-9ba47865a530	93b01c97-779d-404a-82be-6d4d59d5d4d6	1	9	40.00	0	\N
4739868c-95b9-4403-ae8b-fec51b3695ec	254b1180-5a81-47f8-816a-9ba47865a530	93b01c97-779d-404a-82be-6d4d59d5d4d6	10	49	38.00	1	\N
de880457-1e47-4f96-9c88-2b53a8e474d7	254b1180-5a81-47f8-816a-9ba47865a530	93b01c97-779d-404a-82be-6d4d59d5d4d6	50	\N	36.00	2	\N
aeb584ae-5ebf-4fc4-8432-2f5213e13173	051f7284-b65f-4a80-a6eb-bb3cbc339f08	93b01c97-779d-404a-82be-6d4d59d5d4d6	1	9	30.00	0	\N
179465c6-f47c-4d44-9fb0-68f72e31c2a8	051f7284-b65f-4a80-a6eb-bb3cbc339f08	93b01c97-779d-404a-82be-6d4d59d5d4d6	10	49	29.00	1	\N
5bc64f0e-9afc-4b9d-a61a-c467dce0ab19	051f7284-b65f-4a80-a6eb-bb3cbc339f08	93b01c97-779d-404a-82be-6d4d59d5d4d6	50	\N	27.00	2	\N
53cabf25-2925-4eaa-b02a-479ae81f3176	15535deb-3f85-4d6c-aa89-8684f09fb650	93b01c97-779d-404a-82be-6d4d59d5d4d6	1	9	80.00	0	\N
2cc75ebf-8dc7-4472-8285-e8342cf50102	15535deb-3f85-4d6c-aa89-8684f09fb650	93b01c97-779d-404a-82be-6d4d59d5d4d6	10	49	76.00	1	\N
d1ade532-9772-4156-8e22-fca1aefb5003	15535deb-3f85-4d6c-aa89-8684f09fb650	93b01c97-779d-404a-82be-6d4d59d5d4d6	50	\N	72.00	2	\N
580b3dfc-aa76-433a-bb81-4d1565f01086	7afd9ab8-6381-472d-974d-826993515217	93b01c97-779d-404a-82be-6d4d59d5d4d6	1	9	15.00	0	\N
a2ce8040-935d-4c78-9e7a-d6eab0ed0400	7afd9ab8-6381-472d-974d-826993515217	93b01c97-779d-404a-82be-6d4d59d5d4d6	10	49	14.00	1	\N
13dee619-5667-4c21-b2ed-d5357669e1ab	7afd9ab8-6381-472d-974d-826993515217	93b01c97-779d-404a-82be-6d4d59d5d4d6	50	\N	14.00	2	\N
f7f9ce5d-ed9a-4d79-a62e-f54ccb4f0a5f	31214b66-4174-4c18-82fb-a1afc5923525	93b01c97-779d-404a-82be-6d4d59d5d4d6	1	9	600.00	0	\N
9d55bddb-1c6c-4737-9a1e-7e42f50110f5	31214b66-4174-4c18-82fb-a1afc5923525	93b01c97-779d-404a-82be-6d4d59d5d4d6	10	49	570.00	1	\N
6e81ce99-6b05-442f-8c56-76cb0d12091d	31214b66-4174-4c18-82fb-a1afc5923525	93b01c97-779d-404a-82be-6d4d59d5d4d6	50	\N	540.00	2	\N
39b71571-b125-4919-8ce3-fd3a2371f41f	2953e52d-8a75-437f-aef9-995a4ed4ece2	93b01c97-779d-404a-82be-6d4d59d5d4d6	1	9	45.00	0	\N
a9638472-7d23-413e-afcc-c0c36035ff52	2953e52d-8a75-437f-aef9-995a4ed4ece2	93b01c97-779d-404a-82be-6d4d59d5d4d6	10	49	43.00	1	\N
a113bcdb-c34a-4637-bb78-525fea7a0c7d	2953e52d-8a75-437f-aef9-995a4ed4ece2	93b01c97-779d-404a-82be-6d4d59d5d4d6	50	\N	41.00	2	\N
4b3ef7c1-f858-4507-9c48-1b49c7d3fbc7	37ac55b1-9d35-4c1f-90fe-90978ae8a0ea	93b01c97-779d-404a-82be-6d4d59d5d4d6	1	9	270.00	0	\N
2c49a2f3-a1e9-42b9-a431-14d61b9a3327	37ac55b1-9d35-4c1f-90fe-90978ae8a0ea	93b01c97-779d-404a-82be-6d4d59d5d4d6	10	49	257.00	1	\N
74b7e54b-135b-4566-bd3c-7f8eb8bfd2cc	37ac55b1-9d35-4c1f-90fe-90978ae8a0ea	93b01c97-779d-404a-82be-6d4d59d5d4d6	50	\N	243.00	2	\N
7982b2f9-8b3a-45c8-97e7-391ba25dc493	91f4585e-0748-4864-a11f-f84ec2b776fa	93b01c97-779d-404a-82be-6d4d59d5d4d6	1	9	210.00	0	\N
7c0e1624-9ec9-4bb5-aa48-ecdba6724a10	91f4585e-0748-4864-a11f-f84ec2b776fa	93b01c97-779d-404a-82be-6d4d59d5d4d6	10	49	200.00	1	\N
84c4a39c-a6d1-49dc-b524-59781115b144	91f4585e-0748-4864-a11f-f84ec2b776fa	93b01c97-779d-404a-82be-6d4d59d5d4d6	50	\N	189.00	2	\N
358fb731-e0db-4553-9a23-7a11ffe52065	2d9082b9-9151-43f6-a830-d22bfd3d67e6	93b01c97-779d-404a-82be-6d4d59d5d4d6	1	9	320.00	0	\N
79fc53d5-4ebf-4ed9-b0bb-0be4e78f3570	2d9082b9-9151-43f6-a830-d22bfd3d67e6	93b01c97-779d-404a-82be-6d4d59d5d4d6	10	49	304.00	1	\N
59f87dbe-5887-4f41-a4a9-cbe6db7f2bf3	2d9082b9-9151-43f6-a830-d22bfd3d67e6	93b01c97-779d-404a-82be-6d4d59d5d4d6	50	\N	288.00	2	\N
49227cd6-480a-48bd-b375-48af97f08d11	ad260332-d616-4826-86eb-7fc1325ffc88	7cff9dc1-5ba2-488c-aa62-863fde869b05	1	9	180.00	0	\N
91c635ab-05b7-4d35-9851-b798928753e6	ad260332-d616-4826-86eb-7fc1325ffc88	7cff9dc1-5ba2-488c-aa62-863fde869b05	10	49	171.00	1	\N
68cddf73-6c33-400b-b091-42012943b5e4	ad260332-d616-4826-86eb-7fc1325ffc88	7cff9dc1-5ba2-488c-aa62-863fde869b05	50	\N	162.00	2	\N
625f9001-89ff-4a7b-be0b-950732b8c286	7e75443d-1e20-4a9b-9739-8d8ef20551b0	7cff9dc1-5ba2-488c-aa62-863fde869b05	1	9	220.00	0	\N
961a3474-7037-401c-bac0-0eb45c76168c	7e75443d-1e20-4a9b-9739-8d8ef20551b0	7cff9dc1-5ba2-488c-aa62-863fde869b05	10	49	209.00	1	\N
d2ae8b04-4dc4-41f8-a3ca-3eb8e96e5f05	7e75443d-1e20-4a9b-9739-8d8ef20551b0	7cff9dc1-5ba2-488c-aa62-863fde869b05	50	\N	198.00	2	\N
224bae33-7e12-45b9-9956-9983a6f9480c	c357cb06-01ae-475b-8a0e-fee869905592	7cff9dc1-5ba2-488c-aa62-863fde869b05	1	9	350.00	0	\N
70e72deb-bae9-4582-962f-157048c693d6	c357cb06-01ae-475b-8a0e-fee869905592	7cff9dc1-5ba2-488c-aa62-863fde869b05	10	49	333.00	1	\N
5d3695e7-8798-48f6-89e8-cda4b6255e33	c357cb06-01ae-475b-8a0e-fee869905592	7cff9dc1-5ba2-488c-aa62-863fde869b05	50	\N	315.00	2	\N
24fef80b-5ffb-494f-bae7-6ed95a0544ef	94f48148-d9b1-46f2-9d47-d5ed3b6e8880	7cff9dc1-5ba2-488c-aa62-863fde869b05	1	9	280.00	0	\N
b60447bd-d852-403f-98b3-1157831bb424	94f48148-d9b1-46f2-9d47-d5ed3b6e8880	7cff9dc1-5ba2-488c-aa62-863fde869b05	10	49	266.00	1	\N
e0ff6df5-8e42-42b9-8ceb-aafa03544769	94f48148-d9b1-46f2-9d47-d5ed3b6e8880	7cff9dc1-5ba2-488c-aa62-863fde869b05	50	\N	252.00	2	\N
498296db-d1e4-40d8-91a8-3a6b8ee795b7	1df29de3-1aa3-4d09-9f1a-5138e3b480c6	7cff9dc1-5ba2-488c-aa62-863fde869b05	1	9	450.00	0	\N
8acabb04-1f7b-42a9-a004-79adfec9f160	1df29de3-1aa3-4d09-9f1a-5138e3b480c6	7cff9dc1-5ba2-488c-aa62-863fde869b05	10	49	428.00	1	\N
6f40c844-ad31-4426-a31c-b1496f599371	1df29de3-1aa3-4d09-9f1a-5138e3b480c6	7cff9dc1-5ba2-488c-aa62-863fde869b05	50	\N	405.00	2	\N
201ad00d-85cd-4b5b-8d98-6b30ed7a8e03	6ee12622-a145-424c-8673-ed9eb9532ffc	7cff9dc1-5ba2-488c-aa62-863fde869b05	1	9	520.00	0	\N
90236856-c542-43d9-a464-530785aa7d8e	6ee12622-a145-424c-8673-ed9eb9532ffc	7cff9dc1-5ba2-488c-aa62-863fde869b05	10	49	494.00	1	\N
d670f297-c191-49fd-8007-8f7014d76dd7	6ee12622-a145-424c-8673-ed9eb9532ffc	7cff9dc1-5ba2-488c-aa62-863fde869b05	50	\N	468.00	2	\N
4f7318a1-8396-4912-9295-11bfd66948c4	26d1775b-6bf7-48b2-931f-eb35cd95469a	7cff9dc1-5ba2-488c-aa62-863fde869b05	1	9	160.00	0	\N
2acdd987-5932-4dad-8cba-fd4b15d8e1b9	26d1775b-6bf7-48b2-931f-eb35cd95469a	7cff9dc1-5ba2-488c-aa62-863fde869b05	10	49	152.00	1	\N
bb395ef7-eba7-48b3-ad15-ffbd7d8f5b8c	26d1775b-6bf7-48b2-931f-eb35cd95469a	7cff9dc1-5ba2-488c-aa62-863fde869b05	50	\N	144.00	2	\N
0ce5f274-35b6-4d51-9e04-48859929e9dd	edfb6ee1-e3e4-4ab5-b574-5bd4df05a2ef	7cff9dc1-5ba2-488c-aa62-863fde869b05	1	9	140.00	0	\N
5872d197-1814-41bd-967e-0461c1b2f736	edfb6ee1-e3e4-4ab5-b574-5bd4df05a2ef	7cff9dc1-5ba2-488c-aa62-863fde869b05	10	49	133.00	1	\N
a4811265-cbd3-4b28-9c91-6a46b9043f46	edfb6ee1-e3e4-4ab5-b574-5bd4df05a2ef	7cff9dc1-5ba2-488c-aa62-863fde869b05	50	\N	126.00	2	\N
9b0267b5-c1b0-4adf-895d-a2ffdd509cf7	276fa982-88cd-4fa4-a502-3470a7ff2bdc	7cff9dc1-5ba2-488c-aa62-863fde869b05	1	9	750.00	0	\N
ce27281c-31fb-4834-845c-69b163dc801f	276fa982-88cd-4fa4-a502-3470a7ff2bdc	7cff9dc1-5ba2-488c-aa62-863fde869b05	10	49	713.00	1	\N
aba499a0-9d76-4f15-a61e-4d1bb052ff7c	276fa982-88cd-4fa4-a502-3470a7ff2bdc	7cff9dc1-5ba2-488c-aa62-863fde869b05	50	\N	675.00	2	\N
4a16eb57-68c3-4b1d-9d51-43c8c9447e5e	82436349-e4e8-471b-9885-67ef630a1d95	7cff9dc1-5ba2-488c-aa62-863fde869b05	1	9	580.00	0	\N
8e6f4773-39e1-4309-8a8a-eff38c107d77	82436349-e4e8-471b-9885-67ef630a1d95	7cff9dc1-5ba2-488c-aa62-863fde869b05	10	49	551.00	1	\N
93441ccb-5427-4db0-b494-035d68cda8fe	82436349-e4e8-471b-9885-67ef630a1d95	7cff9dc1-5ba2-488c-aa62-863fde869b05	50	\N	522.00	2	\N
981f47c2-b15c-48c1-a6a1-c2a37faf21cd	3d052fa9-1522-46b3-8db9-4578f8291616	bba91aff-3a40-4ce8-8133-dfca667ecd24	1	9	280.00	0	\N
f7483e85-27ad-4184-a132-ef0f502257e7	3d052fa9-1522-46b3-8db9-4578f8291616	bba91aff-3a40-4ce8-8133-dfca667ecd24	10	49	266.00	1	\N
0be45408-bf00-4dc5-bbfd-c351345c4d75	3d052fa9-1522-46b3-8db9-4578f8291616	bba91aff-3a40-4ce8-8133-dfca667ecd24	50	\N	252.00	2	\N
79ef4e65-98e5-4465-9e5f-624961429fba	d31593f6-d987-4321-93ee-95ff0770830f	bba91aff-3a40-4ce8-8133-dfca667ecd24	1	9	220.00	0	\N
961de3a6-612b-4e08-9dea-766c6021a332	d31593f6-d987-4321-93ee-95ff0770830f	bba91aff-3a40-4ce8-8133-dfca667ecd24	10	49	209.00	1	\N
7a380a8d-24f9-404d-9378-e62b7d9d976b	d31593f6-d987-4321-93ee-95ff0770830f	bba91aff-3a40-4ce8-8133-dfca667ecd24	50	\N	198.00	2	\N
73e01b6a-2681-451c-b0f3-6dbf30d37a91	8d7ff898-9667-4a69-bdd3-97e795a4015d	bba91aff-3a40-4ce8-8133-dfca667ecd24	1	9	750.00	0	\N
d0ef9ec4-6dbf-42fc-83d7-41aff4dc2c44	8d7ff898-9667-4a69-bdd3-97e795a4015d	bba91aff-3a40-4ce8-8133-dfca667ecd24	10	49	713.00	1	\N
9d055a30-9d6f-4b94-94b3-9386ac4c139b	8d7ff898-9667-4a69-bdd3-97e795a4015d	bba91aff-3a40-4ce8-8133-dfca667ecd24	50	\N	675.00	2	\N
7f86d3d6-64e1-4764-b4a3-ca5bfc162639	de516ead-4ca5-4e9a-af07-00da978dc152	bba91aff-3a40-4ce8-8133-dfca667ecd24	1	9	680.00	0	\N
79f7ea1c-8f12-4487-a1e8-a1abc59c89b0	de516ead-4ca5-4e9a-af07-00da978dc152	bba91aff-3a40-4ce8-8133-dfca667ecd24	10	49	646.00	1	\N
0d94eabc-5b2f-43b3-b613-33b5e5c0f077	de516ead-4ca5-4e9a-af07-00da978dc152	bba91aff-3a40-4ce8-8133-dfca667ecd24	50	\N	612.00	2	\N
d1f2c9dc-c009-4146-8a16-dbcac5e11972	93033245-02da-4ea9-9933-650d61b0c976	bba91aff-3a40-4ce8-8133-dfca667ecd24	1	9	650.00	0	\N
def59dd6-54d6-4069-bca6-80d077560c9c	93033245-02da-4ea9-9933-650d61b0c976	bba91aff-3a40-4ce8-8133-dfca667ecd24	10	49	618.00	1	\N
8af61b30-48b9-4fc6-83e6-80eca0dff7b3	93033245-02da-4ea9-9933-650d61b0c976	bba91aff-3a40-4ce8-8133-dfca667ecd24	50	\N	585.00	2	\N
f8f6a585-557b-4907-acfb-ef3768ce75fa	e1f71ffb-0ad9-47ad-a722-451e7b39fa2d	bba91aff-3a40-4ce8-8133-dfca667ecd24	1	9	350.00	0	\N
932fa259-e2c1-4053-9b8b-2c9ff4308ab6	e1f71ffb-0ad9-47ad-a722-451e7b39fa2d	bba91aff-3a40-4ce8-8133-dfca667ecd24	10	49	333.00	1	\N
dd37b50d-13a7-45b3-9844-19899bd30bf1	e1f71ffb-0ad9-47ad-a722-451e7b39fa2d	bba91aff-3a40-4ce8-8133-dfca667ecd24	50	\N	315.00	2	\N
9cab06ab-e2cc-4b99-9519-cccd5b024ad7	18a1558f-7432-4ccc-9ca1-bc77b8311639	bba91aff-3a40-4ce8-8133-dfca667ecd24	1	9	800.00	0	\N
816a3d8b-0c06-4031-9795-4c8b9dacde17	18a1558f-7432-4ccc-9ca1-bc77b8311639	bba91aff-3a40-4ce8-8133-dfca667ecd24	10	49	760.00	1	\N
03079127-cd71-49b2-b827-6b5ebf2187a5	18a1558f-7432-4ccc-9ca1-bc77b8311639	bba91aff-3a40-4ce8-8133-dfca667ecd24	50	\N	720.00	2	\N
7757c18f-b097-4671-94e3-db03fb0406fe	5f76e73c-0d80-4386-916f-22d6dce7ad2d	bba91aff-3a40-4ce8-8133-dfca667ecd24	1	9	380.00	0	\N
c2d68329-fa7a-407f-8ca9-7a157bd6ca78	5f76e73c-0d80-4386-916f-22d6dce7ad2d	bba91aff-3a40-4ce8-8133-dfca667ecd24	10	49	361.00	1	\N
f3d4e66b-f753-4f83-bab6-fb6309b07d2d	5f76e73c-0d80-4386-916f-22d6dce7ad2d	bba91aff-3a40-4ce8-8133-dfca667ecd24	50	\N	342.00	2	\N
b62ac765-7ac7-4b28-b164-29c2de010f44	a3e77eff-12c6-43c1-87c9-469cc13e0505	a9c92a29-63bb-419c-b19f-e2e27aef616a	1	9	480.00	0	\N
c511faba-bf3f-4f10-9ecb-03f144ce466b	a3e77eff-12c6-43c1-87c9-469cc13e0505	a9c92a29-63bb-419c-b19f-e2e27aef616a	10	49	456.00	1	\N
0fbbcfcf-86d0-4c85-8bd8-e6016880675d	a3e77eff-12c6-43c1-87c9-469cc13e0505	a9c92a29-63bb-419c-b19f-e2e27aef616a	50	\N	432.00	2	\N
75d8ab13-bbe5-4034-91bc-f3a8e6a2e585	e0225a7a-99c7-4c0b-aa47-d31c9a8b212b	a9c92a29-63bb-419c-b19f-e2e27aef616a	1	9	420.00	0	\N
0debf8da-dad3-43a5-862c-cc341f151cbf	e0225a7a-99c7-4c0b-aa47-d31c9a8b212b	a9c92a29-63bb-419c-b19f-e2e27aef616a	10	49	399.00	1	\N
149c58e7-db9d-4495-a2b1-31f294461cde	e0225a7a-99c7-4c0b-aa47-d31c9a8b212b	a9c92a29-63bb-419c-b19f-e2e27aef616a	50	\N	378.00	2	\N
974a4cf3-7644-4f46-8bb3-ecb62fb88398	93c117b5-551f-4b61-bb25-ce1edac401d1	a9c92a29-63bb-419c-b19f-e2e27aef616a	1	9	180.00	0	\N
db6d8e8a-bdee-4797-887a-e337144b0e05	93c117b5-551f-4b61-bb25-ce1edac401d1	a9c92a29-63bb-419c-b19f-e2e27aef616a	10	49	171.00	1	\N
e8bfc99d-dde9-4b47-b0b9-d4acb410d64c	93c117b5-551f-4b61-bb25-ce1edac401d1	a9c92a29-63bb-419c-b19f-e2e27aef616a	50	\N	162.00	2	\N
7058b158-df62-48c6-a448-2e1b4862c475	7c558c05-7b51-4d1e-8c8c-4e742bc20706	a9c92a29-63bb-419c-b19f-e2e27aef616a	1	9	2400.00	0	\N
defbfd89-af2f-46f1-bc4d-1e2f1ce90471	7c558c05-7b51-4d1e-8c8c-4e742bc20706	a9c92a29-63bb-419c-b19f-e2e27aef616a	10	49	2280.00	1	\N
f8fcaa7d-d240-4f7b-8a71-370f2b719f8e	7c558c05-7b51-4d1e-8c8c-4e742bc20706	a9c92a29-63bb-419c-b19f-e2e27aef616a	50	\N	2160.00	2	\N
d3ba12fb-d5dc-40d3-88b1-de34d4bb64e9	4c4a9875-94fc-40fb-89e4-b5e815409fd8	a9c92a29-63bb-419c-b19f-e2e27aef616a	1	9	520.00	0	\N
94a1cc31-2583-473a-8d6e-e7ab239cb6b7	4c4a9875-94fc-40fb-89e4-b5e815409fd8	a9c92a29-63bb-419c-b19f-e2e27aef616a	10	49	494.00	1	\N
55df80e7-a61d-4eeb-bdb3-e85d31bf5eb7	4c4a9875-94fc-40fb-89e4-b5e815409fd8	a9c92a29-63bb-419c-b19f-e2e27aef616a	50	\N	468.00	2	\N
517534fc-c88c-4664-98fc-1021201a08ab	7b166fb8-3a6f-4ce2-9dec-4d9ed8660a90	a9c92a29-63bb-419c-b19f-e2e27aef616a	1	9	350.00	0	\N
bb4035e8-c5f4-42cc-9054-a25222a7103f	7b166fb8-3a6f-4ce2-9dec-4d9ed8660a90	a9c92a29-63bb-419c-b19f-e2e27aef616a	10	49	333.00	1	\N
acc8fe62-b257-437d-8f7a-cf777e232037	7b166fb8-3a6f-4ce2-9dec-4d9ed8660a90	a9c92a29-63bb-419c-b19f-e2e27aef616a	50	\N	315.00	2	\N
3ff0358f-aca5-488e-b29e-eea71c78dc7e	c987e291-5268-4f80-aa5c-8931c426d0b1	a9c92a29-63bb-419c-b19f-e2e27aef616a	1	9	720.00	0	\N
e8e763b6-929b-4051-9e0a-a9e5d59343f8	c987e291-5268-4f80-aa5c-8931c426d0b1	a9c92a29-63bb-419c-b19f-e2e27aef616a	10	49	684.00	1	\N
a330476e-b866-48a2-9023-c2c678bf99dc	c987e291-5268-4f80-aa5c-8931c426d0b1	a9c92a29-63bb-419c-b19f-e2e27aef616a	50	\N	648.00	2	\N
3c0d34d9-c06e-4b58-ab99-1d2c00702d06	ba4cb3e0-851c-410a-8960-a83a9254e0ff	04976999-f802-4b3d-a097-665aef50c3f1	1	9	180.00	0	\N
cdd24c30-1658-4e63-a4e0-618cdfd8cc53	ba4cb3e0-851c-410a-8960-a83a9254e0ff	04976999-f802-4b3d-a097-665aef50c3f1	10	49	171.00	1	\N
97191f50-6ff4-4a2b-878f-fdc805c26865	ba4cb3e0-851c-410a-8960-a83a9254e0ff	04976999-f802-4b3d-a097-665aef50c3f1	50	\N	162.00	2	\N
4a849330-9286-4358-98d8-6d405004377a	4894a8b2-e647-4cd9-ada5-4468489e5897	04976999-f802-4b3d-a097-665aef50c3f1	1	9	350.00	0	\N
c6cb007d-1ade-4932-9daa-2892947e49c7	4894a8b2-e647-4cd9-ada5-4468489e5897	04976999-f802-4b3d-a097-665aef50c3f1	10	49	333.00	1	\N
1a8e1e02-0477-419e-9e03-5d26dd453044	4894a8b2-e647-4cd9-ada5-4468489e5897	04976999-f802-4b3d-a097-665aef50c3f1	50	\N	315.00	2	\N
540435b2-ddef-4d0d-abd9-c04915e3c7ae	a94a99f6-c4f5-4eff-ac75-a41b7c2efe54	04976999-f802-4b3d-a097-665aef50c3f1	1	9	280.00	0	\N
982ebbed-4a97-4c53-b818-834153281363	a94a99f6-c4f5-4eff-ac75-a41b7c2efe54	04976999-f802-4b3d-a097-665aef50c3f1	10	49	266.00	1	\N
cc5c94c8-7d7c-4a68-8ff6-c5c36d49575c	a94a99f6-c4f5-4eff-ac75-a41b7c2efe54	04976999-f802-4b3d-a097-665aef50c3f1	50	\N	252.00	2	\N
5b63a574-a1ab-45ef-8da7-f7c74d5cd645	750f130a-11a4-4b7b-ac40-0942c4130b86	04976999-f802-4b3d-a097-665aef50c3f1	1	9	220.00	0	\N
7ee96acc-e924-4a10-961a-f467fc14c2b8	750f130a-11a4-4b7b-ac40-0942c4130b86	04976999-f802-4b3d-a097-665aef50c3f1	10	49	209.00	1	\N
48fc17d6-daef-48e2-b4b8-97394cd70035	750f130a-11a4-4b7b-ac40-0942c4130b86	04976999-f802-4b3d-a097-665aef50c3f1	50	\N	198.00	2	\N
ffbc9c79-3853-461e-9a02-8e41bd2a2b37	9700cf27-fcb5-46a7-b23f-bfec474769aa	04976999-f802-4b3d-a097-665aef50c3f1	1	9	320.00	0	\N
8f0e2826-9147-4358-975d-b85c892db773	9700cf27-fcb5-46a7-b23f-bfec474769aa	04976999-f802-4b3d-a097-665aef50c3f1	10	49	304.00	1	\N
934c65e4-738a-4f6d-856e-6db73b03cbce	9700cf27-fcb5-46a7-b23f-bfec474769aa	04976999-f802-4b3d-a097-665aef50c3f1	50	\N	288.00	2	\N
25a0bc06-e028-4f14-bc26-60c6d4415d5c	54bf54d8-d9d7-46c9-b6f6-4f332d6e27f0	04976999-f802-4b3d-a097-665aef50c3f1	1	9	250.00	0	\N
d97c26cf-d60e-4b3a-9a5b-167649e3701b	54bf54d8-d9d7-46c9-b6f6-4f332d6e27f0	04976999-f802-4b3d-a097-665aef50c3f1	10	49	238.00	1	\N
257d0413-596c-42c8-984f-c6f54c7a5bdf	54bf54d8-d9d7-46c9-b6f6-4f332d6e27f0	04976999-f802-4b3d-a097-665aef50c3f1	50	\N	225.00	2	\N
1cda7bd2-5394-4118-b245-238b6b6b5bed	0163c0ff-963b-4c1b-8491-1536f1543669	04976999-f802-4b3d-a097-665aef50c3f1	1	9	180.00	0	\N
f267aa0b-6ca2-40b9-90b7-906166d94ccb	0163c0ff-963b-4c1b-8491-1536f1543669	04976999-f802-4b3d-a097-665aef50c3f1	10	49	171.00	1	\N
9b95fb08-f96b-4269-b92b-d2d559e383f7	0163c0ff-963b-4c1b-8491-1536f1543669	04976999-f802-4b3d-a097-665aef50c3f1	50	\N	162.00	2	\N
4e04f3f5-609e-49e0-a250-c67320095f54	f77caccc-e7c0-4aca-a7e0-d5de7ed9ff50	04976999-f802-4b3d-a097-665aef50c3f1	1	9	150.00	0	\N
6083e39c-07d0-4385-a10e-1681e5775b47	f77caccc-e7c0-4aca-a7e0-d5de7ed9ff50	04976999-f802-4b3d-a097-665aef50c3f1	10	49	143.00	1	\N
3adcca35-a18b-4fb8-ade1-bc4275310bfc	f77caccc-e7c0-4aca-a7e0-d5de7ed9ff50	04976999-f802-4b3d-a097-665aef50c3f1	50	\N	135.00	2	\N
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.products (id, vendor_id, category_id, name, slug, description, image_url, pack_size, unit, base_price, credit_eligible, is_active, created_at, updated_at, images, sku, hsn, brand, barcode, tags, original_price, tax_percent, min_order_qty, approval_note, approval_status, approved_at, approved_by, promo_end_time, promo_price, promo_start_time) FROM stdin;
254b1180-5a81-47f8-816a-9ba47865a530	93b01c97-779d-404a-82be-6d4d59d5d4d6	1cf015fd-3ec2-4d50-b467-ef926b8d0828	Tomatoes (Hybrid)	tomatoes-hybrid	\N	https://images.unsplash.com/photo-1546470427-0d4db154ceb8?w=400&h=400&fit=crop	1 kg	kg	40.00	t	t	2026-03-20 08:16:31.889+00	2026-03-21 20:55:41.591+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
31214b66-4174-4c18-82fb-a1afc5923525	93b01c97-779d-404a-82be-6d4d59d5d4d6	fa828ff7-96bc-49db-9086-7bfdac322a4d	Alphonso Mangoes	alphonso-mangoes	\N	https://images.unsplash.com/photo-1553279768-865429fa0078?w=400&h=400&fit=crop	1 dozen	dozen	600.00	t	f	2026-03-20 08:16:32.088+00	2026-03-25 11:33:19.345+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
051f7284-b65f-4a80-a6eb-bb3cbc339f08	93b01c97-779d-404a-82be-6d4d59d5d4d6	1cf015fd-3ec2-4d50-b467-ef926b8d0828	Potatoes	potatoes	\N	https://images.unsplash.com/photo-1518977676601-b53f82ber6b0?w=400&h=400&fit=crop	1 kg	kg	30.00	t	f	2026-03-20 08:16:31.932+00	2026-03-25 12:09:25.824+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
15535deb-3f85-4d6c-aa89-8684f09fb650	93b01c97-779d-404a-82be-6d4d59d5d4d6	1cf015fd-3ec2-4d50-b467-ef926b8d0828	Green Capsicum	green-capsicum	\N	https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=400&h=400&fit=crop	1 kg	kg	80.00	t	t	2026-03-20 08:16:31.973+00	2026-03-21 20:55:41.675+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
7afd9ab8-6381-472d-974d-826993515217	93b01c97-779d-404a-82be-6d4d59d5d4d6	1cf015fd-3ec2-4d50-b467-ef926b8d0828	Fresh Coriander	fresh-coriander	\N	/images/fruits-vegetables/corriander.png	100 g	bundle	15.00	t	t	2026-03-20 08:16:32.023+00	2026-03-21 20:55:41.714+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
2953e52d-8a75-437f-aef9-995a4ed4ece2	93b01c97-779d-404a-82be-6d4d59d5d4d6	fa828ff7-96bc-49db-9086-7bfdac322a4d	Bananas (Robusta)	bananas-robusta	\N	https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400&h=400&fit=crop	1 dozen	dozen	45.00	t	t	2026-03-20 08:16:32.181+00	2026-03-21 20:55:41.79+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
37ac55b1-9d35-4c1f-90fe-90978ae8a0ea	93b01c97-779d-404a-82be-6d4d59d5d4d6	16e6c5c3-d06d-412a-952e-aea7517bba0f	Amul Butter (500g)	amul-butter-500g	\N	/images/dairy/amul-butter.png	500 g	pack	270.00	t	t	2026-03-20 08:16:32.253+00	2026-03-21 20:55:41.826+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
91f4585e-0748-4864-a11f-f84ec2b776fa	93b01c97-779d-404a-82be-6d4d59d5d4d6	16e6c5c3-d06d-412a-952e-aea7517bba0f	Farm Eggs (30 pcs)	farm-eggs-30	\N	https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400&h=400&fit=crop	30 pcs	tray	210.00	t	t	2026-03-20 08:16:32.305+00	2026-03-21 20:55:41.863+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
2d9082b9-9151-43f6-a830-d22bfd3d67e6	93b01c97-779d-404a-82be-6d4d59d5d4d6	16e6c5c3-d06d-412a-952e-aea7517bba0f	Paneer (1kg block)	paneer-1kg	\N	https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&h=400&fit=crop	1 kg	block	320.00	t	t	2026-03-20 08:16:32.342+00	2026-03-21 20:55:41.899+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
ad260332-d616-4826-86eb-7fc1325ffc88	7cff9dc1-5ba2-488c-aa62-863fde869b05	2555cc44-f663-4724-9903-b26a7afc8436	Turmeric Powder	turmeric-powder	\N	https://images.unsplash.com/photo-1615485500704-8e990f9900f7?w=400&h=400&fit=crop	500 g	pack	180.00	t	t	2026-03-20 08:16:32.386+00	2026-03-21 20:55:41.935+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
7e75443d-1e20-4a9b-9739-8d8ef20551b0	7cff9dc1-5ba2-488c-aa62-863fde869b05	2555cc44-f663-4724-9903-b26a7afc8436	Red Chilli Powder	red-chilli-powder	\N	https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=400&h=400&fit=crop	500 g	pack	220.00	t	t	2026-03-20 08:16:32.43+00	2026-03-21 20:55:41.97+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
c357cb06-01ae-475b-8a0e-fee869905592	7cff9dc1-5ba2-488c-aa62-863fde869b05	2555cc44-f663-4724-9903-b26a7afc8436	Garam Masala	garam-masala	\N	/images/masala-salt/everest-masala.png	500 g	pack	350.00	t	t	2026-03-20 08:16:32.475+00	2026-03-21 20:55:42.007+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
94f48148-d9b1-46f2-9d47-d5ed3b6e8880	7cff9dc1-5ba2-488c-aa62-863fde869b05	2555cc44-f663-4724-9903-b26a7afc8436	Cumin Seeds (Jeera)	cumin-seeds	\N	https://images.unsplash.com/photo-1599909533601-aa4ef8ed4928?w=400&h=400&fit=crop	500 g	pack	280.00	t	t	2026-03-20 08:16:32.517+00	2026-03-21 20:55:42.047+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
26d1775b-6bf7-48b2-931f-eb35cd95469a	7cff9dc1-5ba2-488c-aa62-863fde869b05	ab480a32-f280-4610-9541-0064e490a9e4	Toor Dal (1kg)	toor-dal-1kg	\N	https://images.unsplash.com/photo-1613758947307-f3b8f5d80711?w=400&h=400&fit=crop	1 kg	pack	160.00	t	t	2026-03-20 08:16:32.638+00	2026-03-21 20:55:42.165+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
82436349-e4e8-471b-9885-67ef630a1d95	7cff9dc1-5ba2-488c-aa62-863fde869b05	639b973c-ad72-4a98-ad7c-606ee1b413f4	Pure Desi Ghee (1L)	desi-ghee-1l	\N	https://images.unsplash.com/photo-1600398142498-28586eb4ac5e?w=400&h=400&fit=crop	1 L	jar	580.00	t	t	2026-03-20 08:16:32.784+00	2026-03-21 20:55:42.285+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
d31593f6-d987-4321-93ee-95ff0770830f	bba91aff-3a40-4ce8-8133-dfca667ecd24	f41fd0c1-f940-41be-9ce4-d1c07600f800	Chicken Drumsticks	chicken-drumsticks	\N	https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=400&h=400&fit=crop	1 kg	kg	220.00	f	t	2026-03-20 08:16:32.873+00	2026-03-21 20:55:42.356+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
93033245-02da-4ea9-9933-650d61b0c976	bba91aff-3a40-4ce8-8133-dfca667ecd24	d04594cf-2961-4551-9695-d0a2295a0e7d	Prawns (Large)	prawns-large	\N	https://images.unsplash.com/photo-1565680018093-ebb6b9e3b208?w=400&h=400&fit=crop	500 g	pack	650.00	f	t	2026-03-20 08:16:33.029+00	2026-03-21 20:55:42.449+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
5f76e73c-0d80-4386-916f-22d6dce7ad2d	bba91aff-3a40-4ce8-8133-dfca667ecd24	f41fd0c1-f940-41be-9ce4-d1c07600f800	Whole Chicken	whole-chicken	\N	https://images.unsplash.com/photo-1501200291289-c5a76c232e5f?w=400&h=400&fit=crop	~1.2 kg	piece	380.00	f	t	2026-03-20 08:16:33.138+00	2026-03-21 20:55:42.557+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
e0225a7a-99c7-4c0b-aa47-d31c9a8b212b	a9c92a29-63bb-419c-b19f-e2e27aef616a	826b17fa-ed9d-4a73-bf6f-0a4b28c0a89d	Thumbs Up (250ml x 24)	thumbs-up-250ml-24	\N	https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400&h=400&fit=crop	24 bottles	case	420.00	f	t	2026-03-20 08:16:33.224+00	2026-03-21 20:55:42.625+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
7b166fb8-3a6f-4ce2-9dec-4d9ed8660a90	a9c92a29-63bb-419c-b19f-e2e27aef616a	826b17fa-ed9d-4a73-bf6f-0a4b28c0a89d	Nescafe Classic (200g)	nescafe-classic-200g	\N	https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400&h=400&fit=crop	200 g	jar	350.00	f	t	2026-03-20 08:16:33.414+00	2026-03-21 20:55:42.752+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
ba4cb3e0-851c-410a-8960-a83a9254e0ff	04976999-f802-4b3d-a097-665aef50c3f1	db4fe326-7086-4224-9469-df3a2a6b7a50	Disposable Plates (100 pcs)	disposable-plates-100	\N	https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=400&h=400&fit=crop	100 pcs	pack	180.00	f	t	2026-03-20 08:16:33.492+00	2026-03-21 20:55:42.808+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
750f130a-11a4-4b7b-ac40-0942c4130b86	04976999-f802-4b3d-a097-665aef50c3f1	db4fe326-7086-4224-9469-df3a2a6b7a50	Paper Napkins (1000 pcs)	paper-napkins-1000	\N	https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=400&h=400&fit=crop	1000 pcs	pack	220.00	f	t	2026-03-20 08:16:33.614+00	2026-03-21 20:55:42.888+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
1df29de3-1aa3-4d09-9f1a-5138e3b480c6	7cff9dc1-5ba2-488c-aa62-863fde869b05	2555cc44-f663-4724-9903-b26a7afc8436	Black Pepper Whole	black-pepper-whole	\N	https://images.unsplash.com/photo-1599940824399-b87987ceb72a?w=400&h=400&fit=crop	250 g	pack	450.00	t	t	2026-03-20 08:16:32.558+00	2026-03-21 20:55:42.084+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
6ee12622-a145-424c-8673-ed9eb9532ffc	7cff9dc1-5ba2-488c-aa62-863fde869b05	ab480a32-f280-4610-9541-0064e490a9e4	Basmati Rice (5kg)	basmati-rice-5kg	\N	https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=400&fit=crop	5 kg	bag	520.00	t	t	2026-03-20 08:16:32.598+00	2026-03-21 20:55:42.125+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
edfb6ee1-e3e4-4ab5-b574-5bd4df05a2ef	7cff9dc1-5ba2-488c-aa62-863fde869b05	ab480a32-f280-4610-9541-0064e490a9e4	Moong Dal (1kg)	moong-dal-1kg	\N	https://images.unsplash.com/photo-1612257416648-ee7a6c5b4060?w=400&h=400&fit=crop	1 kg	pack	140.00	t	t	2026-03-20 08:16:32.682+00	2026-03-21 20:55:42.2+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
276fa982-88cd-4fa4-a502-3470a7ff2bdc	7cff9dc1-5ba2-488c-aa62-863fde869b05	639b973c-ad72-4a98-ad7c-606ee1b413f4	Mustard Oil (5L)	mustard-oil-5l	\N	https://images.unsplash.com/photo-1474979266404-7eaacdc14090?w=400&h=400&fit=crop	5 L	can	750.00	t	t	2026-03-20 08:16:32.731+00	2026-03-21 20:55:42.237+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
3d052fa9-1522-46b3-8db9-4578f8291616	bba91aff-3a40-4ce8-8133-dfca667ecd24	f41fd0c1-f940-41be-9ce4-d1c07600f800	Chicken Breast (Boneless)	chicken-breast-boneless	\N	https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=400&h=400&fit=crop	1 kg	kg	280.00	f	t	2026-03-20 08:16:32.836+00	2026-03-21 20:55:42.323+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
8d7ff898-9667-4a69-bdd3-97e795a4015d	bba91aff-3a40-4ce8-8133-dfca667ecd24	f41fd0c1-f940-41be-9ce4-d1c07600f800	Mutton (Bone-In)	mutton-bone-in	\N	https://images.unsplash.com/photo-1602470520998-f4a52199a3d6?w=400&h=400&fit=crop	1 kg	kg	750.00	f	t	2026-03-20 08:16:32.927+00	2026-03-21 20:55:42.385+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
de516ead-4ca5-4e9a-af07-00da978dc152	bba91aff-3a40-4ce8-8133-dfca667ecd24	f41fd0c1-f940-41be-9ce4-d1c07600f800	Lamb Keema	lamb-keema	\N	https://images.unsplash.com/photo-1588168333986-5078d3ae3976?w=400&h=400&fit=crop	1 kg	kg	680.00	f	t	2026-03-20 08:16:32.978+00	2026-03-21 20:55:42.416+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
e1f71ffb-0ad9-47ad-a722-451e7b39fa2d	bba91aff-3a40-4ce8-8133-dfca667ecd24	d04594cf-2961-4551-9695-d0a2295a0e7d	Fish Fillets (Basa)	fish-fillets-basa	\N	https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&h=400&fit=crop	1 kg	kg	350.00	f	t	2026-03-20 08:16:33.066+00	2026-03-21 20:55:42.484+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
18a1558f-7432-4ccc-9ca1-bc77b8311639	bba91aff-3a40-4ce8-8133-dfca667ecd24	d04594cf-2961-4551-9695-d0a2295a0e7d	Surmai Steaks	surmai-steaks	\N	https://images.unsplash.com/photo-1510130387422-82bed34b37e9?w=400&h=400&fit=crop	1 kg	kg	800.00	f	t	2026-03-20 08:16:33.1+00	2026-03-21 20:55:42.518+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
a3e77eff-12c6-43c1-87c9-469cc13e0505	a9c92a29-63bb-419c-b19f-e2e27aef616a	826b17fa-ed9d-4a73-bf6f-0a4b28c0a89d	Coca-Cola (300ml x 24)	coca-cola-300ml-24	\N	https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400&h=400&fit=crop	24 bottles	case	480.00	f	t	2026-03-20 08:16:33.177+00	2026-03-21 20:55:42.594+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
93c117b5-551f-4b61-bb25-ce1edac401d1	a9c92a29-63bb-419c-b19f-e2e27aef616a	826b17fa-ed9d-4a73-bf6f-0a4b28c0a89d	Bisleri Water (1L x 12)	bisleri-water-1l-12	\N	https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400&h=400&fit=crop	12 bottles	case	180.00	f	t	2026-03-20 08:16:33.274+00	2026-03-21 20:55:42.658+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
7c558c05-7b51-4d1e-8c8c-4e742bc20706	a9c92a29-63bb-419c-b19f-e2e27aef616a	826b17fa-ed9d-4a73-bf6f-0a4b28c0a89d	Red Bull (250ml x 24)	redbull-250ml-24	\N	https://images.unsplash.com/photo-1613217784112-e0e197be6a0b?w=400&h=400&fit=crop	24 cans	case	2400.00	f	t	2026-03-20 08:16:33.331+00	2026-03-21 20:55:42.687+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
4c4a9875-94fc-40fb-89e4-b5e815409fd8	a9c92a29-63bb-419c-b19f-e2e27aef616a	826b17fa-ed9d-4a73-bf6f-0a4b28c0a89d	Tata Tea Gold (1kg)	tata-tea-gold-1kg	\N	https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&h=400&fit=crop	1 kg	pack	520.00	f	t	2026-03-20 08:16:33.372+00	2026-03-21 20:55:42.72+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
c987e291-5268-4f80-aa5c-8931c426d0b1	a9c92a29-63bb-419c-b19f-e2e27aef616a	826b17fa-ed9d-4a73-bf6f-0a4b28c0a89d	Real Juice Mango (1L x 12)	real-juice-mango-1l-12	\N	https://images.unsplash.com/photo-1546173159-315724a31696?w=400&h=400&fit=crop	12 packs	case	720.00	f	t	2026-03-20 08:16:33.453+00	2026-03-21 20:55:42.779+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
4894a8b2-e647-4cd9-ada5-4468489e5897	04976999-f802-4b3d-a097-665aef50c3f1	db4fe326-7086-4224-9469-df3a2a6b7a50	Aluminium Foil Roll (72m)	aluminium-foil-72m	\N	https://images.unsplash.com/photo-1594311431505-aa2265e68b82?w=400&h=400&fit=crop	72 m	roll	350.00	f	t	2026-03-20 08:16:33.529+00	2026-03-21 20:55:42.836+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
a94a99f6-c4f5-4eff-ac75-a41b7c2efe54	04976999-f802-4b3d-a097-665aef50c3f1	db4fe326-7086-4224-9469-df3a2a6b7a50	Cling Wrap (300m)	cling-wrap-300m	\N	https://images.unsplash.com/photo-1605000797499-95a51c5269ae?w=400&h=400&fit=crop	300 m	roll	280.00	f	t	2026-03-20 08:16:33.572+00	2026-03-21 20:55:42.862+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
9700cf27-fcb5-46a7-b23f-bfec474769aa	04976999-f802-4b3d-a097-665aef50c3f1	db4fe326-7086-4224-9469-df3a2a6b7a50	Takeaway Containers (500ml x 50)	takeaway-containers-500ml	\N	https://images.unsplash.com/photo-1604187351574-c75ca79f5807?w=400&h=400&fit=crop	50 pcs	pack	320.00	f	t	2026-03-20 08:16:33.659+00	2026-03-21 20:55:42.913+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
54bf54d8-d9d7-46c9-b6f6-4f332d6e27f0	04976999-f802-4b3d-a097-665aef50c3f1	db4fe326-7086-4224-9469-df3a2a6b7a50	Kitchen Gloves (100 pcs)	kitchen-gloves-100	\N	https://images.unsplash.com/photo-1584744982491-665216d95f8b?w=400&h=400&fit=crop	100 pcs	box	250.00	f	t	2026-03-20 08:16:33.705+00	2026-03-21 20:55:42.939+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
f77caccc-e7c0-4aca-a7e0-d5de7ed9ff50	04976999-f802-4b3d-a097-665aef50c3f1	db4fe326-7086-4224-9469-df3a2a6b7a50	Tissue Paper Roll (6 pack)	tissue-paper-roll-6	\N	https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=400&h=400&fit=crop	6 rolls	pack	150.00	f	t	2026-03-20 08:16:33.833+00	2026-03-21 20:55:43.001+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
ed4bfb93-84b4-4015-8465-3cd614579cf6	93b01c97-779d-404a-82be-6d4d59d5d4d6	1cf015fd-3ec2-4d50-b467-ef926b8d0828	Fresh Onions	fresh-onions	\N	/images/fruits-vegetables/onion.png	1 kg	kg	35.00	t	t	2026-03-20 08:16:31.835+00	2026-03-21 20:55:41.54+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
0163c0ff-963b-4c1b-8491-1536f1543669	04976999-f802-4b3d-a097-665aef50c3f1	db4fe326-7086-4224-9469-df3a2a6b7a50	Garbage Bags (Large x 50)	garbage-bags-large-50	\N	https://images.unsplash.com/photo-1610141160782-a1a24e1f9e70?w=400&h=400&fit=crop	50 pcs	pack	180.00	f	t	2026-03-20 08:16:33.754+00	2026-03-21 20:55:42.969+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
ad96b29e-9b4b-4bb1-bd99-dcf9fb5a50b2	\N	\N	test	test-mn75m8yl	\N	https://ik.imagekit.io/nasjugiz2/horeca/products/HOME--1--1774510295085_-IN-esdnk.jpg	\N	\N	100.00	f	t	2026-03-26 07:31:43.241+00	2026-03-26 07:38:42.77+00	{}	\N	\N	\N	\N	{}	\N	5.00	1	\N	approved	2026-03-26 07:31:43.197+00	b4d67165-07f4-4473-b8ea-102e3887f520	\N	\N	\N
48b6c774-f869-4e2e-841c-7eed042e6ff6	93b01c97-779d-404a-82be-6d4d59d5d4d6	db4fe326-7086-4224-9469-df3a2a6b7a50	Tissue Paper Roll (6 pack)	tissue-paper-roll-6-pack	\N	https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=400&h=400&fit=crop	6 rolls	pack	170.00	f	t	2026-03-25 12:17:56.551+00	2026-03-26 07:39:04.454+00	{}	\N	\N	\N	\N	{}	\N	0.00	1	\N	approved	\N	\N	\N	\N	\N
fbad9e01-d19f-4750-9482-117c2d3de6b3	93b01c97-779d-404a-82be-6d4d59d5d4d6	db4fe326-7086-4224-9469-df3a2a6b7a50	test2	test2	\N	https://ik.imagekit.io/nasjugiz2/horeca/products/Screenshot-2026-03-05-164737-1774510806879_6cVWXHSTJ.png	50 pcs	pack	180.00	f	t	2026-03-26 07:40:42.488+00	2026-03-26 07:42:54.334+00	{}	\N	\N	\N	\N	{}	\N	5.00	1	\N	approved	2026-03-26 07:42:54.327+00	b4d67165-07f4-4473-b8ea-102e3887f520	09:00	50.00	18:00
\.


--
-- Data for Name: quick_order_list_items; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.quick_order_list_items (id, list_id, product_id, vendor_id, default_qty, sort_order) FROM stdin;
\.


--
-- Data for Name: quick_order_lists; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.quick_order_lists (id, user_id, vendor_id, name, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: service_areas; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.service_areas (id, vendor_id, pincode, is_active) FROM stdin;
4c0b95a9-c7dd-47c4-8c04-c86cc7af47b4	93b01c97-779d-404a-82be-6d4d59d5d4d6	400001	t
75683880-9012-49f6-85fd-b4c89167648f	93b01c97-779d-404a-82be-6d4d59d5d4d6	400002	t
9a7b3fe9-6e07-4c13-b9c1-f32cbb77991e	93b01c97-779d-404a-82be-6d4d59d5d4d6	400003	t
59306db8-3821-41c9-9e0c-3316d0f0c027	93b01c97-779d-404a-82be-6d4d59d5d4d6	400004	t
9811faf1-500c-4668-af6c-f58cc02660c3	93b01c97-779d-404a-82be-6d4d59d5d4d6	400005	t
4f1d5d05-91f2-44ea-9e5b-90f10fc51f86	93b01c97-779d-404a-82be-6d4d59d5d4d6	400006	t
a3ba25a8-1184-42cf-8962-138dc589f221	93b01c97-779d-404a-82be-6d4d59d5d4d6	400007	t
480f59d4-564c-4195-8df7-f09db4ce1eb8	93b01c97-779d-404a-82be-6d4d59d5d4d6	400008	t
036d9705-2229-4d4e-9ace-6afc97535d35	7cff9dc1-5ba2-488c-aa62-863fde869b05	400001	t
2b18d9a7-3e52-468a-84b6-34cbb6d09efb	7cff9dc1-5ba2-488c-aa62-863fde869b05	400002	t
5636c2cd-5216-4503-8842-553f7d7d519f	7cff9dc1-5ba2-488c-aa62-863fde869b05	400003	t
29f66fc2-ab34-4372-8872-54619b111006	7cff9dc1-5ba2-488c-aa62-863fde869b05	400004	t
1dbbd091-a0d3-486a-96fc-a6f548ea7ed5	7cff9dc1-5ba2-488c-aa62-863fde869b05	400005	t
9e6c8044-5f87-47a3-b89b-c0b57e3fb8c0	7cff9dc1-5ba2-488c-aa62-863fde869b05	400006	t
a6c00681-2c38-484f-8e61-6cf2e5a68fa4	7cff9dc1-5ba2-488c-aa62-863fde869b05	400007	t
0b25c40e-eb24-4263-8bb1-dd8586512ad3	7cff9dc1-5ba2-488c-aa62-863fde869b05	400008	t
ed4e6d03-1a2b-4df6-90be-49f5b1667ef9	bba91aff-3a40-4ce8-8133-dfca667ecd24	400001	t
9f124b31-2b2c-4848-9f9f-d6a094ee2902	bba91aff-3a40-4ce8-8133-dfca667ecd24	400002	t
0d0dc4cc-f33e-438c-88b5-2bdf788ad0cf	bba91aff-3a40-4ce8-8133-dfca667ecd24	400003	t
007db90d-9dba-4b87-aa5a-8160b2a29c25	bba91aff-3a40-4ce8-8133-dfca667ecd24	400004	t
98f87c61-27e1-470a-9235-9032a4565739	a9c92a29-63bb-419c-b19f-e2e27aef616a	400001	t
32f7bdbb-eb1a-4085-b7bf-cd11de7131bd	a9c92a29-63bb-419c-b19f-e2e27aef616a	400002	t
f0b73d29-2348-4416-8a27-266e4798a97e	a9c92a29-63bb-419c-b19f-e2e27aef616a	400003	t
fef8435f-ca7e-46e8-a4a0-9067d2f87dc9	a9c92a29-63bb-419c-b19f-e2e27aef616a	400004	t
c7e696f3-fe9e-4b68-bf9f-ef46474aed37	a9c92a29-63bb-419c-b19f-e2e27aef616a	400005	t
24ab4892-fe77-4445-8319-b17e5cfe9c65	a9c92a29-63bb-419c-b19f-e2e27aef616a	400006	t
992db0f3-293e-43ff-a80c-01a26f060fd6	a9c92a29-63bb-419c-b19f-e2e27aef616a	400007	t
3f7859e6-2f94-405a-be29-efec314d240f	a9c92a29-63bb-419c-b19f-e2e27aef616a	400008	t
69cf0ea7-fe0c-4c35-8fc1-7c02cf009d8a	04976999-f802-4b3d-a097-665aef50c3f1	400001	t
11ff0dce-6d69-46e4-a826-090bfe6d112c	04976999-f802-4b3d-a097-665aef50c3f1	400002	t
3b39ad79-a9a6-42b4-adac-f7d76f9c1f75	04976999-f802-4b3d-a097-665aef50c3f1	400003	t
fc55adf4-61c6-4866-a884-ff431c4d03af	04976999-f802-4b3d-a097-665aef50c3f1	400004	t
442be952-cce5-4939-bd19-8fceac876281	04976999-f802-4b3d-a097-665aef50c3f1	400005	t
373f6e72-e82b-4325-87b9-761c542d1f2f	04976999-f802-4b3d-a097-665aef50c3f1	400006	t
49a19cce-ad52-48c5-a5fc-cc5cbd95b349	04976999-f802-4b3d-a097-665aef50c3f1	400007	t
5d43ea5b-72ab-4bcb-a4cf-8f0d17712b4f	04976999-f802-4b3d-a097-665aef50c3f1	400008	t
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.sessions (id, session_token, user_id, expires) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.users (id, email, email_verified, password, phone, full_name, image, role, pincode, business_name, gst_number, is_active, created_at, updated_at) FROM stdin;
b4d67165-07f4-4473-b8ea-102e3887f520	admin@horeca1.com	2026-03-20 08:16:30.852	$2b$12$f32fE4QUdGe/C6Kxg/mVkOFOl11k1EDyUG30escDykj/pIw0cZdD6	+919999900000	HoReCa Admin	\N	admin	400001	\N	\N	t	2026-03-20 08:16:31.01+00	2026-03-20 08:16:31.01+00
8e04279e-987d-4dd4-90fc-abd9fd2f6397	fresh@dailyfreshfoods.com	2026-03-20 08:16:31.32	$2b$12$Ko9EfCJ75z.K54x1ViX3vO2l/r65V3f0ZOYsPTfY24A6ZO0841CUS	+919876500001	Rajesh Kumar	\N	vendor	400001	Daily Fresh Foods	\N	t	2026-03-20 08:16:31.323+00	2026-03-20 08:16:31.323+00
c5a11a4f-1128-488d-a0be-f98cea17ecee	owner@spicetrail.in	2026-03-20 08:16:31.354	$2b$12$Ko9EfCJ75z.K54x1ViX3vO2l/r65V3f0ZOYsPTfY24A6ZO0841CUS	+919876500002	Priya Sharma	\N	vendor	400001	Spice Trail India	\N	t	2026-03-20 08:16:31.355+00	2026-03-20 08:16:31.355+00
a2bf7b39-51b7-45fd-b338-0471b91b4895	info@meathouseindia.com	2026-03-20 08:16:31.376	$2b$12$Ko9EfCJ75z.K54x1ViX3vO2l/r65V3f0ZOYsPTfY24A6ZO0841CUS	+919876500003	Faizan Sheikh	\N	vendor	400001	MeatHouse India	\N	t	2026-03-20 08:16:31.376+00	2026-03-20 08:16:31.376+00
714838c0-6c08-4541-81bc-b95002eb598d	sales@beverageco.in	2026-03-20 08:16:31.396	$2b$12$Ko9EfCJ75z.K54x1ViX3vO2l/r65V3f0ZOYsPTfY24A6ZO0841CUS	+919876500004	Amit Patel	\N	vendor	400001	BeverageCo	\N	t	2026-03-20 08:16:31.396+00	2026-03-20 08:16:31.396+00
2b8f34af-20a9-420f-827c-8e338205f343	orders@packnserve.in	2026-03-20 08:16:31.418	$2b$12$Ko9EfCJ75z.K54x1ViX3vO2l/r65V3f0ZOYsPTfY24A6ZO0841CUS	+919876500005	Sneha Reddy	\N	vendor	400001	Pack & Serve Supplies	\N	t	2026-03-20 08:16:31.418+00	2026-03-20 08:16:31.418+00
eaef2156-ece2-492f-adf1-9ed39785164a	chef@tajpalace.com	2026-03-20 08:16:31.693	$2b$12$41JxS4utULnko5jUfbpq2enjnEK0LWBzjIlPatOr1KSqIc8lW.GqS	+919876600001	Vikram Singh	\N	customer	400001	Taj Palace Restaurant	\N	t	2026-03-20 08:16:31.696+00	2026-03-20 08:16:31.696+00
545b73d8-c63d-423d-a51a-8f20fa28c427	owner@greenleafcafe.com	2026-03-20 08:16:31.711	$2b$12$41JxS4utULnko5jUfbpq2enjnEK0LWBzjIlPatOr1KSqIc8lW.GqS	+919876600002	Ananya Menon	\N	customer	400002	Green Leaf Cafe	\N	t	2026-03-20 08:16:31.712+00	2026-03-20 08:16:31.712+00
2959aafd-53b9-47a7-bd2e-40af7c2fb348	kitchen@grandhyatt.com	2026-03-20 08:16:31.721	$2b$12$41JxS4utULnko5jUfbpq2enjnEK0LWBzjIlPatOr1KSqIc8lW.GqS	+919876600003	Suresh Nair	\N	customer	400001	Grand Hyatt Kitchen	\N	t	2026-03-20 08:16:31.721+00	2026-03-20 08:16:31.721+00
2aa7480c-440b-43a6-baeb-9940aab9278a	testuser@example.com	\N	$2b$12$iMglGZgxt8vGPjOXWILMyOs9dtCrPqxgyiduaCypgoA67FBWTLHPK	\N	Test User	\N	customer	\N	\N	\N	t	2026-03-20 08:51:11.063+00	2026-03-20 08:51:11.063+00
bf9d6c40-26d1-46cd-9259-878820fc711c	test-signup-1774127068179@test.com	\N	$2b$12$dYswd4Y75cQAVVgd7Q5JdOoJHM1JJsczscraCm/tUkj3DodZ5tlPW	+919999911111	Test Signup User	\N	customer	400001	\N	\N	t	2026-03-21 21:04:28.599+00	2026-03-21 21:04:28.599+00
\.


--
-- Data for Name: vendors; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.vendors (id, user_id, business_name, slug, description, logo_url, banner_url, rating, min_order_value, credit_enabled, is_active, is_verified, created_at, updated_at) FROM stdin;
93b01c97-779d-404a-82be-6d4d59d5d4d6	8e04279e-987d-4dd4-90fc-abd9fd2f6397	Daily Fresh Foods	daily-fresh-foods	Premium quality fresh vegetables, fruits, and dairy delivered daily to your kitchen.	/images/top vendors/vendor-logo1.png	\N	4.5	500.00	t	t	t	2026-03-20 08:16:31.339+00	2026-03-21 20:55:41.124+00
7cff9dc1-5ba2-488c-aa62-863fde869b05	c5a11a4f-1128-488d-a0be-f98cea17ecee	Spice Trail India	spice-trail-india	Authentic Indian spices, masalas, and dry ingredients sourced directly from farms.	/images/top vendors/vendor-logo2.png	\N	4.8	300.00	t	t	t	2026-03-20 08:16:31.366+00	2026-03-21 20:55:41.15+00
bba91aff-3a40-4ce8-8133-dfca667ecd24	a2bf7b39-51b7-45fd-b338-0471b91b4895	MeatHouse India	meathouse-india	FSSAI-certified fresh and frozen meats, poultry, and seafood for restaurants.	/images/top vendors/vendor-logo3.png	\N	4.3	1000.00	f	t	t	2026-03-20 08:16:31.386+00	2026-03-21 20:55:41.166+00
a9c92a29-63bb-419c-b19f-e2e27aef616a	714838c0-6c08-4541-81bc-b95002eb598d	BeverageCo	beverageco	Complete beverage solutions — soft drinks, juices, water, tea, and coffee for HORECA.	/images/top vendors/vendor-logo4.png	\N	4.1	800.00	t	t	t	2026-03-20 08:16:31.407+00	2026-03-21 20:55:41.186+00
04976999-f802-4b3d-a097-665aef50c3f1	2b8f34af-20a9-420f-827c-8e338205f343	Pack & Serve Supplies	pack-and-serve-supplies	Disposable packaging, kitchen supplies, and cleaning essentials for food businesses.	/images/top vendors/vendor-logo5.png	\N	4.0	200.00	f	t	t	2026-03-20 08:16:31.429+00	2026-03-21 20:55:41.204+00
\.


--
-- Data for Name: verification_tokens; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.verification_tokens (identifier, token, expires) FROM stdin;
\.


--
-- Data for Name: wallet_transactions; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.wallet_transactions (id, wallet_id, type, amount, reference_id, reference_type, notes, created_at) FROM stdin;
\.


--
-- Data for Name: wallets; Type: TABLE DATA; Schema: public; Owner: horeca1
--

COPY public.wallets (id, user_id, balance, updated_at) FROM stdin;
d32dac35-46d0-4bd4-a576-8fca33485b0f	eaef2156-ece2-492f-adf1-9ed39785164a	0.00	2026-03-20 08:16:34.712+00
3419bb20-0e8d-46f6-9a11-56f1d8ecb274	545b73d8-c63d-423d-a51a-8f20fa28c427	0.00	2026-03-20 08:16:34.722+00
2428c890-210f-4bc8-844f-221872c7b907	2959aafd-53b9-47a7-bd2e-40af7c2fb348	0.00	2026-03-20 08:16:34.735+00
\.


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: cart_items cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);


--
-- Name: carts carts_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: collection_products collection_products_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.collection_products
    ADD CONSTRAINT collection_products_pkey PRIMARY KEY (id);


--
-- Name: collections collections_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_pkey PRIMARY KEY (id);


--
-- Name: credit_accounts credit_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.credit_accounts
    ADD CONSTRAINT credit_accounts_pkey PRIMARY KEY (id);


--
-- Name: credit_transactions credit_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_pkey PRIMARY KEY (id);


--
-- Name: customer_vendors customer_vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.customer_vendors
    ADD CONSTRAINT customer_vendors_pkey PRIMARY KEY (id);


--
-- Name: delivery_slots delivery_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.delivery_slots
    ADD CONSTRAINT delivery_slots_pkey PRIMARY KEY (id);


--
-- Name: inventory inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: price_slabs price_slabs_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.price_slabs
    ADD CONSTRAINT price_slabs_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: quick_order_list_items quick_order_list_items_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.quick_order_list_items
    ADD CONSTRAINT quick_order_list_items_pkey PRIMARY KEY (id);


--
-- Name: quick_order_lists quick_order_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.quick_order_lists
    ADD CONSTRAINT quick_order_lists_pkey PRIMARY KEY (id);


--
-- Name: service_areas service_areas_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.service_areas
    ADD CONSTRAINT service_areas_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- Name: wallet_transactions wallet_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id);


--
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);


--
-- Name: accounts_provider_provider_account_id_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX accounts_provider_provider_account_id_key ON public.accounts USING btree (provider, provider_account_id);


--
-- Name: cart_items_cart_id_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX cart_items_cart_id_idx ON public.cart_items USING btree (cart_id);


--
-- Name: cart_items_cart_id_product_id_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX cart_items_cart_id_product_id_key ON public.cart_items USING btree (cart_id, product_id);


--
-- Name: cart_items_vendor_id_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX cart_items_vendor_id_idx ON public.cart_items USING btree (vendor_id);


--
-- Name: carts_user_id_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX carts_user_id_key ON public.carts USING btree (user_id);


--
-- Name: categories_approval_status_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX categories_approval_status_idx ON public.categories USING btree (approval_status);


--
-- Name: categories_parent_id_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX categories_parent_id_idx ON public.categories USING btree (parent_id);


--
-- Name: categories_slug_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX categories_slug_idx ON public.categories USING btree (slug);


--
-- Name: categories_slug_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX categories_slug_key ON public.categories USING btree (slug);


--
-- Name: collection_products_collection_id_product_id_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX collection_products_collection_id_product_id_key ON public.collection_products USING btree (collection_id, product_id);


--
-- Name: collections_slug_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX collections_slug_key ON public.collections USING btree (slug);


--
-- Name: credit_accounts_user_id_vendor_id_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX credit_accounts_user_id_vendor_id_key ON public.credit_accounts USING btree (user_id, vendor_id);


--
-- Name: credit_transactions_credit_account_id_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX credit_transactions_credit_account_id_idx ON public.credit_transactions USING btree (credit_account_id);


--
-- Name: customer_vendors_user_id_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX customer_vendors_user_id_idx ON public.customer_vendors USING btree (user_id);


--
-- Name: customer_vendors_user_id_vendor_id_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX customer_vendors_user_id_vendor_id_key ON public.customer_vendors USING btree (user_id, vendor_id);


--
-- Name: customer_vendors_vendor_id_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX customer_vendors_vendor_id_idx ON public.customer_vendors USING btree (vendor_id);


--
-- Name: delivery_slots_vendor_id_day_of_week_slot_start_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX delivery_slots_vendor_id_day_of_week_slot_start_key ON public.delivery_slots USING btree (vendor_id, day_of_week, slot_start);


--
-- Name: inventory_product_id_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX inventory_product_id_key ON public.inventory USING btree (product_id);


--
-- Name: inventory_vendor_id_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX inventory_vendor_id_idx ON public.inventory USING btree (vendor_id);


--
-- Name: notifications_status_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX notifications_status_idx ON public.notifications USING btree (status);


--
-- Name: notifications_user_id_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX notifications_user_id_idx ON public.notifications USING btree (user_id);


--
-- Name: order_items_order_id_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX order_items_order_id_idx ON public.order_items USING btree (order_id);


--
-- Name: orders_created_at_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX orders_created_at_idx ON public.orders USING btree (created_at DESC);


--
-- Name: orders_order_number_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX orders_order_number_key ON public.orders USING btree (order_number);


--
-- Name: orders_status_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX orders_status_idx ON public.orders USING btree (status);


--
-- Name: orders_user_id_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX orders_user_id_idx ON public.orders USING btree (user_id);


--
-- Name: orders_vendor_id_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX orders_vendor_id_idx ON public.orders USING btree (vendor_id);


--
-- Name: payments_order_id_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX payments_order_id_idx ON public.payments USING btree (order_id);


--
-- Name: payments_razorpay_order_id_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX payments_razorpay_order_id_idx ON public.payments USING btree (razorpay_order_id);


--
-- Name: price_slabs_product_id_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX price_slabs_product_id_idx ON public.price_slabs USING btree (product_id);


--
-- Name: price_slabs_product_id_min_qty_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX price_slabs_product_id_min_qty_key ON public.price_slabs USING btree (product_id, min_qty);


--
-- Name: products_approval_status_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX products_approval_status_idx ON public.products USING btree (approval_status);


--
-- Name: products_category_id_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX products_category_id_idx ON public.products USING btree (category_id);


--
-- Name: products_is_active_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX products_is_active_idx ON public.products USING btree (is_active);


--
-- Name: products_sku_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX products_sku_idx ON public.products USING btree (sku);


--
-- Name: products_vendor_id_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX products_vendor_id_idx ON public.products USING btree (vendor_id);


--
-- Name: products_vendor_id_slug_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX products_vendor_id_slug_key ON public.products USING btree (vendor_id, slug);


--
-- Name: quick_order_list_items_list_id_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX quick_order_list_items_list_id_idx ON public.quick_order_list_items USING btree (list_id);


--
-- Name: quick_order_list_items_list_id_product_id_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX quick_order_list_items_list_id_product_id_key ON public.quick_order_list_items USING btree (list_id, product_id);


--
-- Name: quick_order_lists_user_id_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX quick_order_lists_user_id_idx ON public.quick_order_lists USING btree (user_id);


--
-- Name: quick_order_lists_vendor_id_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX quick_order_lists_vendor_id_idx ON public.quick_order_lists USING btree (vendor_id);


--
-- Name: service_areas_pincode_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX service_areas_pincode_idx ON public.service_areas USING btree (pincode);


--
-- Name: service_areas_vendor_id_pincode_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX service_areas_vendor_id_pincode_key ON public.service_areas USING btree (vendor_id, pincode);


--
-- Name: sessions_session_token_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX sessions_session_token_key ON public.sessions USING btree (session_token);


--
-- Name: users_email_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX users_email_idx ON public.users USING btree (email);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: users_phone_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX users_phone_idx ON public.users USING btree (phone);


--
-- Name: users_phone_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX users_phone_key ON public.users USING btree (phone);


--
-- Name: users_pincode_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX users_pincode_idx ON public.users USING btree (pincode);


--
-- Name: users_role_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX users_role_idx ON public.users USING btree (role);


--
-- Name: vendors_is_active_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX vendors_is_active_idx ON public.vendors USING btree (is_active);


--
-- Name: vendors_slug_idx; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE INDEX vendors_slug_idx ON public.vendors USING btree (slug);


--
-- Name: vendors_slug_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX vendors_slug_key ON public.vendors USING btree (slug);


--
-- Name: vendors_user_id_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX vendors_user_id_key ON public.vendors USING btree (user_id);


--
-- Name: verification_tokens_identifier_token_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX verification_tokens_identifier_token_key ON public.verification_tokens USING btree (identifier, token);


--
-- Name: verification_tokens_token_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX verification_tokens_token_key ON public.verification_tokens USING btree (token);


--
-- Name: wallets_user_id_key; Type: INDEX; Schema: public; Owner: horeca1
--

CREATE UNIQUE INDEX wallets_user_id_key ON public.wallets USING btree (user_id);


--
-- Name: accounts accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cart_items cart_items_cart_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.carts(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cart_items cart_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: cart_items cart_items_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: carts carts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: categories categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: collection_products collection_products_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.collection_products
    ADD CONSTRAINT collection_products_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: collection_products collection_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.collection_products
    ADD CONSTRAINT collection_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: collection_products collection_products_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.collection_products
    ADD CONSTRAINT collection_products_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: credit_accounts credit_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.credit_accounts
    ADD CONSTRAINT credit_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: credit_accounts credit_accounts_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.credit_accounts
    ADD CONSTRAINT credit_accounts_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: credit_transactions credit_transactions_credit_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_credit_account_id_fkey FOREIGN KEY (credit_account_id) REFERENCES public.credit_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: credit_transactions credit_transactions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: credit_transactions credit_transactions_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: customer_vendors customer_vendors_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.customer_vendors
    ADD CONSTRAINT customer_vendors_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: customer_vendors customer_vendors_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.customer_vendors
    ADD CONSTRAINT customer_vendors_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: delivery_slots delivery_slots_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.delivery_slots
    ADD CONSTRAINT delivery_slots_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: inventory inventory_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: inventory inventory_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: orders orders_delivery_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_delivery_slot_id_fkey FOREIGN KEY (delivery_slot_id) REFERENCES public.delivery_slots(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: orders orders_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payments payments_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: price_slabs price_slabs_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.price_slabs
    ADD CONSTRAINT price_slabs_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: price_slabs price_slabs_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.price_slabs
    ADD CONSTRAINT price_slabs_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: products products_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: quick_order_list_items quick_order_list_items_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.quick_order_list_items
    ADD CONSTRAINT quick_order_list_items_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.quick_order_lists(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: quick_order_list_items quick_order_list_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.quick_order_list_items
    ADD CONSTRAINT quick_order_list_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: quick_order_list_items quick_order_list_items_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.quick_order_list_items
    ADD CONSTRAINT quick_order_list_items_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: quick_order_lists quick_order_lists_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.quick_order_lists
    ADD CONSTRAINT quick_order_lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: quick_order_lists quick_order_lists_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.quick_order_lists
    ADD CONSTRAINT quick_order_lists_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: service_areas service_areas_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.service_areas
    ADD CONSTRAINT service_areas_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: vendors vendors_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: wallet_transactions wallet_transactions_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: wallets wallets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: horeca1
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict vgZzv5YAyAicjUdBax5S5jQmTDVVNtBG45UkRttrX4B1GQDmbKCJ6AStdsf6y6i

