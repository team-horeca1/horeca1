-- CreateTable
CREATE TABLE "voice_stories" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "badge" VARCHAR(80) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "role" VARCHAR(255),
    "venue" VARCHAR(255),
    "quote" TEXT NOT NULL,
    "body" TEXT,
    "photo_url" VARCHAR(512),
    "published" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_stories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "voice_stories_slug_key" ON "voice_stories"("slug");
CREATE INDEX "voice_stories_published_published_at_idx" ON "voice_stories"("published", "published_at");

INSERT INTO "voice_stories" ("id", "slug", "badge", "name", "role", "venue", "quote", "body", "published", "published_at", "created_at", "updated_at")
VALUES
(
  gen_random_uuid(),
  'chef-arjun-rao',
  'CHEF OF THE FORTNIGHT',
  'Chef Arjun Rao',
  'Executive Chef',
  'The Copper Ladle, Mumbai',
  'The best dishes are built long before they reach the kitchen.',
  'Chef Arjun shares how disciplined sourcing and trusted suppliers helped his team scale a Sunday-special menu without compromising consistency.',
  true,
  NOW(),
  NOW(),
  NOW()
),
(
  gen_random_uuid(),
  'rakesh-mehta-spice-route',
  'RESTAURATEUR SPOTLIGHT',
  'Rakesh Mehta',
  'Owner',
  'Spice Route Kitchen',
  'From a single tiffin stall to three outlets — the supplier calls that nearly broke us.',
  'Rakesh talks about consolidating procurement on Horeca1 and reclaiming hours every morning previously lost to phone orders.',
  true,
  NOW(),
  NOW(),
  NOW()
);
