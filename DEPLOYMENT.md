# Horeca1 — Production Deployment

## Live URL

**http://64.227.187.210**

---

## How to Deploy Code Changes

### Quick Version (one command)

```bash
# 1. Push your changes to master
git push origin master

# 2. SSH into server and run deploy script
ssh root@64.227.187.210 "bash /opt/horeca1/deploy.sh"
```

That's it. The script pulls code, rebuilds the Docker image, runs any new migrations, and restarts the app.

### ⚡ Fast deploys (CI/CD) — recommended

Building `next build` on the droplet is the slow part (~5 min). The pipeline in
`.github/workflows/deploy.yml` builds the image on GitHub's runners (cached) and
pushes it to **GHCR**; the droplet just **pulls + migrates + restarts** → **~30–60s**.

- On every push to `master`, CI builds + pushes `ghcr.io/team-horeca1/horeca1`,
  then SSHes to the droplet and runs the pull-based `deploy.sh`.
- **One-time setup:** add a `SSH_PRIVATE_KEY` secret (+ `DEPLOY_HOST` variable) in
  GitHub → Settings → Secrets and variables → Actions. Full steps: see the
  top of `.github/workflows/deploy.yml`. Until then, CI still builds + pushes the
  image; only the auto-deploy step is skipped.
- The manual `deploy.sh` above is the fallback — it now **pulls the prebuilt image
  first** and only builds (cached, no `--no-cache`) if no image is available.

### Step-by-Step (what the script does)

```
You (local)                         Server (64.227.187.210)
-----------                         -----------------------
git add .
git commit -m "your changes"
git push origin master
                          ───────>  git fetch origin master
                                    git reset --hard origin/master
                                    docker compose build app       (~5 min)
                                    prisma migrate deploy          (if new migrations)
                                    docker compose up -d app       (restart app only)
                                    docker compose restart nginx
```

### What If I Changed the Database Schema?

If you added/modified anything in `prisma/schema.prisma`:

```bash
# Locally, create the migration first
npx prisma migrate dev --name describe_your_change

# This creates a new file in prisma/migrations/
# Commit and push it
git add prisma/migrations/
git commit -m "add migration: describe_your_change"
git push origin master

# Then deploy — the script runs `prisma migrate deploy` automatically
ssh root@64.227.187.210 "bash /opt/horeca1/deploy.sh"
```

### What If I Only Changed Environment Variables?

```bash
# SSH into server, edit the env file
ssh root@64.227.187.210
nano /opt/horeca1/.env.production

# Restart app to pick up changes (no rebuild needed)
cd /opt/horeca1
docker compose -f docker/docker-compose.prod.yml restart app
```

### Rollback If Something Breaks

```bash
ssh root@64.227.187.210

# Check logs first
docker logs --tail 50 horeca1-app

# If needed, go back to previous commit
cd /opt/horeca1
git log --oneline -5             # find the good commit hash
git reset --hard <commit-hash>

# Rebuild and restart
docker compose -f docker/docker-compose.prod.yml build --no-cache app
docker compose -f docker/docker-compose.prod.yml up -d app
```

---

## Droplet Details

| Field | Value |
|-------|-------|
| Provider | DigitalOcean |
| Name | ubuntu-s-2vcpu-4gb-blr1-01 |
| Region | BLR1 (Bangalore) |
| OS | Ubuntu 24.04 LTS x64 |
| Specs | 2 vCPU / 4 GB RAM / 80 GB Disk |
| IPv4 | 64.227.187.210 |
| Private IP | 10.122.0.2 |

### SSH Access

```bash
ssh root@64.227.187.210
# Password: DontChangeme@01OK
```

> SSH key from your local machine (`~/.ssh/id_ed25519.pub`) is also authorized for passwordless login.

---

## Services Running

| Service | Container | Image | Port | Status |
|---------|-----------|-------|------|--------|
| Next.js App | horeca1-app | docker-app:latest | 3000 | Running (~107 MB RAM) |
| PostgreSQL 17 | horeca1-db | postgres:17-alpine | 5432 (internal) | Healthy (~37 MB RAM) |
| Redis 7 | horeca1-redis | redis:7-alpine | 6379 (internal) | Healthy (~4 MB RAM) |
| Nginx | horeca1-nginx | nginx:alpine | 80, 443 | Running (~4 MB RAM) |
| Certbot | horeca1-certbot | certbot/certbot | — | Stopped (run manually for SSL) |

**Total RAM usage:** ~152 MB of 4 GB

---

## Database Credentials

| Field | Value |
|-------|-------|
| Host (from app container) | postgres |
| Host (from server) | localhost (via `docker exec`) |
| Port | 5432 |
| Database | horeca1 |
| User | horeca1 |
| Password | 5RWoLMyTN6fyA27EXpsf0w11 |
| Full URL | `postgresql://horeca1:5RWoLMyTN6fyA27EXpsf0w11@postgres:5432/horeca1` |

### Database Contents (after seed)

| Table | Count |
|-------|-------|
| users | 9 |
| vendors | 5 |
| products | 43 |
| categories | 10 |
| Total tables | 27 |

5 Prisma migrations applied:
1. `20260320081540_init_schema`
2. `20260323_add_product_fields`
3. `20260325063445_add_approval_status`
4. `20260325122437_add_promo_pricing`
5. `20260325123911_make_product_vendor_optional`

---

## Redis

| Field | Value |
|-------|-------|
| Host (from app container) | redis |
| Port | 6379 |
| URL | `redis://redis:6379` |
| Version | 7.4.8 |

---

## App Login Credentials (seeded test data)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@horeca1.com | admin123 |
| Vendor | fresh@dailyfreshfoods.com | vendor123 |
| Customer | chef@tajpalace.com | customer123 |

---

## Auth & Secrets

| Key | Value |
|-----|-------|
| AUTH_SECRET | `8380ea62ee0408bea9c8165cdde7f332806b9ba552f6797da2be51e7976c5880` |
| AUTH_URL | `http://64.227.187.210` |
| AUTH_TRUST_HOST | `true` |

---

## Environment Files on Server

| File | Location | Purpose |
|------|----------|---------|
| `.env.production` | `/opt/horeca1/.env.production` | App environment variables (DB, Auth, Redis, Sentry, ImageKit, email, SMS) |

### Email (Nodemailer + Gmail SMTP)

Production email uses **Gmail SMTP only** (no Resend). Required keys in `.env.production`:

| Variable | Example |
|----------|---------|
| `EMAIL_SERVICE` | `gmail` |
| `EMAIL_USER` | `team.horeca1@gmail.com` |
| `EMAIL_PASS` | 16-char Gmail app password (no spaces) |
| `EMAIL_HOST` | `smtp.gmail.com` |
| `EMAIL_PORT` | `465` |
| `EMAIL_FROM` | `Horeca1 <team.horeca1@gmail.com>` |

After changing email vars: `docker compose -f docker/docker-compose.prod.yml up -d --force-recreate app worker` (restart alone does not reload `env_file`).

Verify loaded in container: `docker exec horeca1-app printenv | grep -E '^EMAIL_' | cut -d= -f1`
| `docker/.env` | `/opt/horeca1/docker/.env` | Docker Compose variable substitution (POSTGRES_PASSWORD) |

---

## Performance

| Metric | Value |
|--------|-------|
| TTFB (external) | ~54 ms |
| TTFB (internal) | ~14 ms |
| Homepage load (external) | ~444 ms |
| Homepage size | 54 KB |
| Auth API response | ~89 ms |

---

## Capacity Estimate

With **2 vCPU / 4 GB RAM + 4 GB swap**:

- **150–300 concurrent users** comfortably (SSR + static pages)
- **50–100 concurrent API requests** (DB-heavy operations)
- Bottleneck: CPU for SSR rendering, RAM is well within limits
- 4 GB swap configured as safety net for peak loads
- 64 GB disk free for logs, uploads, and database growth

---

## Security

- **UFW Firewall:** Only ports 22 (SSH), 80 (HTTP), 443 (HTTPS) open
- **Non-root Docker user** for the Next.js app (uid 1001)
- **Security headers:** X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy, Permissions-Policy
- **Nginx reverse proxy** hides app on port 3000 behind port 80
- **PostgreSQL** not exposed externally (internal Docker network only)
- **Redis** not exposed externally (internal Docker network only)

---

## Useful Commands

### SSH into server

```bash
ssh root@64.227.187.210
```

### View logs

```bash
docker logs -f horeca1-app       # App logs
docker logs -f horeca1-db        # PostgreSQL logs
docker logs -f horeca1-redis     # Redis logs
docker logs -f horeca1-nginx     # Nginx access/error logs
```

### Restart all services

```bash
cd /opt/horeca1
docker compose -f docker/docker-compose.prod.yml restart
```

### Stop everything

```bash
cd /opt/horeca1
docker compose -f docker/docker-compose.prod.yml down
```

### Start everything

```bash
cd /opt/horeca1
docker compose -f docker/docker-compose.prod.yml up -d
```

### Rebuild app after code changes

```bash
cd /opt/horeca1
docker compose -f docker/docker-compose.prod.yml build --no-cache app
docker compose -f docker/docker-compose.prod.yml up -d app
```

### Run Prisma migrations

```bash
docker run --rm --network docker_default \
  -e DATABASE_URL="postgresql://horeca1:5RWoLMyTN6fyA27EXpsf0w11@postgres:5432/horeca1" \
  -v /opt/horeca1:/app -w /app node:22-alpine \
  sh -c "npm install prisma@7.5.0 @prisma/client@7.5.0 dotenv tsx typescript @types/node 2>/dev/null && npx prisma migrate deploy"
```

### Re-seed database

```bash
docker run --rm --network docker_default \
  -e DATABASE_URL="postgresql://horeca1:5RWoLMyTN6fyA27EXpsf0w11@postgres:5432/horeca1" \
  -v /opt/horeca1:/app -w /app node:22-alpine \
  sh -c "npx prisma generate && npx prisma db seed"
```

### Connect to PostgreSQL directly

```bash
docker exec -it horeca1-db psql -U horeca1
```

### Connect to Redis directly

```bash
docker exec -it horeca1-redis redis-cli
```

### Check resource usage

```bash
docker stats --no-stream
free -m
df -h /
```

---

## File Structure on Server

```
/opt/horeca1/
├── docker/
│   ├── docker-compose.prod.yml   # Production compose file
│   ├── Dockerfile                # Multi-stage Next.js build
│   ├── nginx.conf                # Nginx reverse proxy config
│   ├── entrypoint.sh             # Container entrypoint
│   ├── backup.sh                 # DB backup script (for DO Spaces)
│   └── .env                      # POSTGRES_PASSWORD for compose
├── prisma/
│   ├── schema.prisma             # Database schema
│   ├── migrations/               # Migration files
│   └── seed.ts                   # Database seeder
├── src/                          # Application source code
├── public/                       # Static assets
├── .env.production               # Production environment variables
├── next.config.ts                # Next.js configuration
├── package.json                  # Dependencies
└── ...
```

---

## SSL Setup (when domain is ready)

When you point a domain to `64.227.187.210`:

```bash
# 1. Update nginx.conf server_name to your domain
# 2. Get SSL certificate
docker compose -f docker/docker-compose.prod.yml run certbot certonly --webroot -w /var/lib/letsencrypt -d yourdomain.com

# 3. Uncomment HTTPS block in nginx.conf and update domain
# 4. Restart nginx
docker compose -f docker/docker-compose.prod.yml restart nginx
```

---

## Deployment Date

**2026-03-30** — Initial production deployment on DigitalOcean droplet.
