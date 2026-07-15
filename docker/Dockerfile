# Multi-stage build for Next.js production
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Heap raised from 1536 → 3072 because Phase 4 grew the codebase past the
# old ceiling — webpack was SIGABRT'ing at the end of the build with no
# explicit OOM message. The droplet has 4G swap available so Node can
# spill cleanly if it needs more than physical RAM.
ENV NODE_OPTIONS="--max-old-space-size=3072"
RUN npm run build

# Worker image — runs notification.worker.ts via tsx (has full src + node_modules)
FROM base AS worker
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
CMD ["npx", "tsx", "src/workers/notification.worker.ts"]

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Create the uploads mountpoint owned by the runtime user. When the named
# volume (docker-compose) first mounts onto this path it inherits uid 1001
# ownership, so the app can write vendor KYC files without permission errors.
# Also pre-create Image Optimization cache so nextjs can write without EACCES.
RUN mkdir -p /app/uploads /app/.next/cache \
  && chown -R nextjs:nodejs /app/uploads /app/.next

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
