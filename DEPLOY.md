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

1. Copy the project to your server (git clone or zip).
2. Set environment variables in `.env` or export them:

   ```bash
   export JWT_SECRET="your-long-random-secret"
   export CLIENT_ORIGIN="https://yourdomain.com"
   ```

3. Run `docker compose up --build -d`.
4. Seed once: `docker compose exec tajweed npm run db:seed`
5. Put **Nginx** or **Caddy** in front for HTTPS on port 443, proxying to `localhost:4000`.

Example Caddy (`Caddyfile`):

```
yourdomain.com {
    reverse_proxy localhost:4000
}
```

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

Copy `backend/.env.example` to `backend/.env` for local development.

---

## Security checklist before going live

- [ ] Set a strong `JWT_SECRET` (never use the example value).
- [ ] Set `CLIENT_ORIGIN` to your real domain instead of `*`.
- [ ] Enable HTTPS (Caddy, Nginx, or your host’s TLS).
- [ ] Change default demo passwords after seeding.
- [ ] Do not commit `.env` or upload folders with private data.
