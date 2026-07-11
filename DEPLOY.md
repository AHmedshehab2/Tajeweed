# Deploying Tajweed LMS

This app has a **Node.js API** (`backend/`) and a **static frontend** (`frontend/`). In production, one server runs both.

## Quick start with Docker (recommended)

**Requirements:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)

1. Open a terminal in the project folder.

2. Create a secret (replace with your own long random string):

   ```powershell
   $env:JWT_SECRET = "your-very-long-random-secret-here"
   ```

3. Build and start:

   ```powershell
   docker compose up --build -d
   ```

4. Seed demo data (first time only):

   ```powershell
   docker compose exec tajweed npm run db:seed
   ```

5. Open **http://localhost:4000**

   | Account | Email | Password |
   |---------|-------|----------|
   | Student | ahmed@example.com | student |
   | Admin | admin@example.com | admin |

Data and uploads are stored in Docker volumes and survive restarts.

---

## Deploy to a VPS (Ubuntu + Docker)

### 1. Install Docker on your VPS

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for the group change to take effect
```

### 2. Copy the project to your VPS

```bash
git clone <your-repo-url> tajweed
cd tajweed
```

### 3. Set environment variables

```bash
export JWT_SECRET="$(openssl rand -hex 32)"
export CLIENT_ORIGIN="http://YOUR_VPS_IP"
echo "JWT_SECRET=$JWT_SECRET" > .env
echo "CLIENT_ORIGIN=$CLIENT_ORIGIN" >> .env
```

### 4. Start everything (app + Caddy for HTTPS)

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

This starts two containers:
- **tajweed** — the app on port 4000 (internal)
- **caddy** — reverse proxy on ports 80/443

The database is **auto-seeded** on first run.

### 5. Open in browser

Go to `http://YOUR_VPS_IP`

| Account | Email | Password |
|---------|-------|----------|
| Student | ahmed@example.com | student |
| Admin | admin@example.com | admin |

### 6. Add a domain (optional, for HTTPS)

1. Point your domain's DNS to your VPS IP
2. Edit `Caddyfile` and replace `:80` with your domain:

```
yourdomain.com {
    reverse_proxy tajweed:4000
}
```

3. Update `CLIENT_ORIGIN`:

```bash
echo "CLIENT_ORIGIN=https://yourdomain.com" > .env
```

4. Restart Caddy:

```bash
docker compose -f docker-compose.prod.yml restart caddy
```

HTTPS is automatic — Caddy fetches a free Let's Encrypt certificate.

### 7. Manage the app

```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f

# Restart app
docker compose -f docker-compose.prod.yml restart tajweed

# Stop everything
docker compose -f docker-compose.prod.yml down

# Rebuild after code changes
docker compose -f docker-compose.prod.yml up --build -d
```

Data is stored in Docker volumes (`tajweed-data`, `tajweed-uploads`) and survives restarts.

---

## Deploy to Render

1. Push the repo to GitHub (do **not** commit `.env` — it is in `.gitignore`).
2. On [Render](https://render.com), create a **Web Service** from the repo.
3. Set **Runtime** to **Docker**.
4. Add environment variables:
   - `JWT_SECRET` — generate a strong random value
   - `NODE_ENV` — `production`
   - `CLIENT_ORIGIN` — your Render URL (e.g. `https://tajweed-lms.onrender.com`)
5. Deploy, then open the Render **Shell** and run:

   ```bash
   npm run db:seed
   ```

> **Note:** On free Render tiers, the filesystem may reset on redeploy. For a stable production site, use a VPS with Docker volumes or migrate the database to PostgreSQL.

---

## Local development (without Docker)

**Terminal 1 — API:**

```powershell
cd backend
npm install
npm run db:setup
npm run dev
```

**Terminal 2 — frontend:** open `frontend/index.html` in the browser, or serve the folder:

```powershell
cd frontend
npx serve .
```

The frontend auto-connects to `http://localhost:4000/api` when not served from port 4000.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | `file:./dev.db` (local) or `file:./data/prod.db` (Docker) |
| `JWT_SECRET` | Yes | Long random string for auth tokens |
| `PORT` | No | Default `4000` |
| `HOST` | No | Default `0.0.0.0` |
| `CLIENT_ORIGIN` | No | CORS origin (`*` or your site URL) |
| `NODE_ENV` | Prod | Set to `production` to serve the frontend from the API |
| `SUPABASE_URL` | Supabase | Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase | Publishable API key (safe for client) |
| `SUPABASE_SECRET_KEY` | Supabase | Secret key — server only, never expose |
| `SUPABASE_JWKS_URL` | Supabase | JWKS endpoint for JWT verification |

Copy `backend/.env.example` to `backend/.env` for local development.

### Supabase Auth

1. Add the Supabase variables to `backend/.env`.
2. Restart the API — `GET /api/auth/config` returns `{ enabled: true, url, publishableKey }`.
3. The API accepts **local JWTs** (demo login) and **Supabase Auth JWTs**.
4. After client-side Supabase sign-in, call `POST /api/auth/supabase` with the access token to sync the user profile.

---

## Security checklist before going live

- [ ] Set a strong `JWT_SECRET` (never use the example value).
- [ ] Set `CLIENT_ORIGIN` to your real domain instead of `*`.
- [ ] Enable HTTPS (Caddy, Nginx, or your host’s TLS).
- [ ] Change default demo passwords after seeding.
- [ ] Do not commit `.env` or upload folders with private data.
