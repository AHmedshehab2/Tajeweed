# Tajweed LMS — Quickstart & Local Development

Welcome — this repo contains a small backend (Express + Prisma) and a vanilla-JS frontend for a Tajweed learning app. You don't need a deployed site to try it: you can run everything locally and use `http://localhost` URLs for development.

This README is short and practical: run the backend, run the frontend, or use Docker to get a full local stack. Follow the steps below and read the notes for safe testing and secrets handling.

**Key folders**
- `backend/` — Express server, Prisma schema, tests.
- `frontend/` — static files: `index.html`, `app.js`, `styles.css`, and small modules under `modules/`.

---

## Run locally (recommended for development)

1) Backend (API + tests)

```powershell
cd backend
npm install
cp .env.example .env    # edit .env with your local values; DO NOT commit .env
# Ensure DATABASE_URL points to a local Postgres (see notes below)
npm run dev             # starts the dev server (default port 4000)
```

Notes:
- The backend expects PostgreSQL. For local development either run Postgres locally or use Docker (instructions below).
- The server exposes an API under `/api` (default `http://localhost:4000/api`).
- Don't commit `backend/.env` if it contains secrets — it's ignored by Git already but double-check.

2) Frontend (static)

```powershell
cd frontend
npx serve . -l 3000    # or use any static file server
```

Then open `http://localhost:3000/` in a browser. The frontend will call the backend at `http://localhost:4000/api` by default. If your backend runs on another host/port, update `window.API_BASE` (top of `index.html`) or set `API_BASE` in the browser console before using the app.

---

## Run with Docker (easy isolated setup)

This project includes `docker-compose.yml` which runs the app and a `postgres:16` service for local testing.

```bash
docker compose up --build -d
# backend will be available on port 4000 by default
```

The Docker compose setup creates a local Postgres database and a named volume `tajweed-pg-data` for persistence. This is the safest way to run tests locally without touching production data.

---

## Running tests safely

- Tests (Vitest) run a global setup that resets the database using Prisma. This will wipe the DB you point `DATABASE_URL` at. Always run tests against a disposable test DB (local Postgres container or a dedicated test DB), never against production or shared databases.
- To run tests using Docker Postgres (example):

```powershell
# start docker compose first
docker compose up -d
cd backend
npm test
```

If you prefer a managed DB (like Supabase) make absolutely sure the URL points to a throwaway project before running tests.

---

## Seeding & demo accounts

- The repo includes `prisma/seed.js`. Use `npm run db:seed` from `backend/` to populate demo accounts. The seed script will print credentials the first time it runs.
- In production, seeding only runs when the database is empty and `ALLOW_PROD_SEED=true`.

---

## OAuth & social login notes

- OAuth (Google/Facebook) is handled on the server with Passport. For local testing, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `backend/.env` and make sure the OAuth app callback matches `http://localhost:4000/api/auth/google/callback`.
- You can fully exercise sign-in flows locally — no deployment required.

---

## Security & production

- `JWT_SECRET` and other secrets must never be committed. Keep them in `backend/.env` or a secrets manager in production.
- The app sets several security headers by default; CSP is intentionally deferred until the frontend is refactored away from inline handlers.

---

## I don't want the deployment link to be the only way to use the site

You can and should run the app locally. Use the steps above to:
- start the backend on `localhost:4000`
- serve the frontend on `localhost:3000`
- or use `docker compose up` for an isolated stack that includes Postgres

These local URLs are the recommended way to develop, test, and demo features without relying on an external deployment link.

---

If you'd like, I can:
- open a PR with this README change (I can create the PR description),
- add a short `CONTRIBUTING.md` with local dev checklist, or
- add a lightweight Makefile / npm script to start both frontend and backend together.

Pick one and I'll do it next.
