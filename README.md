# Tajweed LMS — Backend + Frontend wiring

## Run the backend

```bash
cd backend
npm install
cp .env.example .env          # edit JWT_SECRET if you like
npx prisma migrate dev --name init
npm run prisma:seed           # loads the same chapters/lessons/hizbs/khutbahs as the old defaultContent()
npm run dev                   # starts on http://localhost:4000
```

Demo accounts (created by the seed script, same as the old quickLogin()):
- Student: `ahmed@example.com` / `student`
- Admin:   `admin@example.com` / `admin`

## Run the frontend

`frontend/` is the same three files (`index.html`, `app.js`, `styles.css`) — just serve them statically, e.g.:
n
```bash
cd frontend
npx serve .        # or any static server
```

`index.html` sets `window.API_BASE` to `http://localhost:4000/api` before `app.js` loads — change that if your backend runs elsewhere.

## What changed in app.js

- `STORAGE` no longer holds `content`, `session`, `lessonProgress`, `quranProgress`, or `activity` — those live in the database now. Only `theme`, `lastLesson`, `lastQuarter`, `token`, and `user` (a cache of the JWT payload, for instant UI on reload) stay in `localStorage`.
- `apiFetch()` — a small wrapper around `fetch` that attaches the JWT and throws on non-2xx (auto-logs out on 401).
- `loadAll()` — fetches `/api/content` (full chapters/hizbs/khutbahs/announcements tree, same shape as the old `defaultContent()`) and `/api/progress/me` (per-user lesson/quarter progress + recent activity) and fills the same `data`/`progressCache` objects the render functions already read from. This means almost none of the 20+ render functions (`home()`, `curriculum()`, `lesson()`, `quran()`, etc.) needed to change — they still just read `data` and call `lessonStatus()`/`completedQuarters()` synchronously.
- `signIn`, `quickLogin`, `logout` — now call `POST /api/auth/login`, store the JWT, then `loadAll()`.
- `advanceLesson`, `toggleQuarter`, `playRecording` — now call the progress API and update the local `progressCache` from the response instead of writing to `localStorage`.
- `saveChapter`, `deleteChapter`, `saveLesson`, `uploadResource`, `addAnnouncement`, `deleteAnnouncement` — now call the matching REST endpoint, then re-run `loadAll()` to refresh `data` from the DB (simplest correctness-first approach; can be optimized to patch `data` locally later if you want fewer round trips).
- `uploadResource` now sends the actual file via `FormData` to `/api/upload` instead of an in-memory `URL.createObjectURL()` blob — files now persist across sessions/browsers, served from `/uploads` on the backend.
- `persistContent()` is gone entirely — the backend is now the source of truth.

## Endpoints

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me

GET    /api/content                    (full chapters/hizbs/khutbahs/announcements tree)
POST   /api/chapters                   (admin)
PATCH  /api/chapters/:id               (admin)
DELETE /api/chapters/:id               (admin)
POST   /api/lessons                    (admin)
PATCH  /api/lessons/:id                (admin)
DELETE /api/lessons/:id                (admin)

POST   /api/announcements              (admin)
DELETE /api/announcements/:id          (admin)

GET    /api/progress/me
POST   /api/progress/lessons/:id       (cycles not-started → in-progress → completed)
POST   /api/progress/quarters/:id      (toggles completion)
POST   /api/progress/activity          (logs a listen event, keeps last 5)

POST   /api/upload                     (admin, multipart — attaches a recording/resource to a lesson/quarter/khutbah)
```

## Notes / next steps

- SQLite is set in `schema.prisma` for zero-setup local dev. Switch `provider` to `"postgresql"` and point `DATABASE_URL` at a real Postgres instance before deploying.
- Move `JWT_SECRET` to a real secret manager in production; don't commit `.env`.
- File uploads currently sit on local disk (`backend/uploads/`) — swap `multer.diskStorage` for an S3/R2 adapter when you deploy, since local disk won't persist on most hosting platforms.
