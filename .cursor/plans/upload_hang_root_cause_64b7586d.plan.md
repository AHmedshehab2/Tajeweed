---
name: Upload Hang Root Cause
overview: "Code-traced root cause of production \"Uploading...\" forever: the UI awaits a bare `fetch` with no timeout, so any non-completing request leaves the button stuck. On your stated Vercel+Render split, `API_BASE` points at the wrong host; on Render itself, multer runs before any timeout and empty Cloudinary env forces a risky disk path."
todos:
  - id: confirm-network-url
    content: "Confirm via Network tab whether upload hits Vercel or Render (decides root cause #1 vs #2)"
    status: in_progress
  - id: fix-api-base
    content: Set window.API_BASE to Render API URL for Vercel deploy; update CLIENT_ORIGIN + SameSite for cross-origin cookies
    status: pending
  - id: fix-client-timeout
    content: Add AbortController timeout in apiFetch so Uploading... always clears
    status: pending
  - id: fix-multer-timeout
    content: Move/add request timeout before multer; add server upload pipeline logs
    status: pending
  - id: fix-cloudinary-env
    content: Set real CLOUDINARY_* on Render; remove empty render.yaml placeholders
    status: pending
  - id: verify-upload
    content: "Verify small PDF + audio upload: 201, toast, Cloudinary asset, button restores"
    status: pending
isProject: false
---

# Production Upload Hang — Investigation Report & Fix Plan

## Complete upload sequence

```mermaid
sequenceDiagram
  participant UI as admin.uploadResource
  participant API as apiFetch
  participant Net as Browser_fetch
  participant Auth as requireAuth
  participant Multer as multer.memoryStorage
  participant Val as validateUpload
  participant TO as timeoutHandler_60s
  participant Store as storeFile
  participant Cloud as uploadBuffer_20s
  participant DB as Prisma

  UI->>UI: btn = "جاري الرفع..."
  UI->>API: await apiFetch("/upload", FormData)
  API->>Net: fetch(API_BASE + "/upload")
  Note over Net: NO AbortController / NO timeout
  Net->>Auth: POST arrives (if correct host)
  Auth->>Multer: next
  Note over Multer: Buffers entire body; NO timeout
  Multer->>Val: file.buffer ready
  Val->>TO: next
  Note over TO: 60s timer STARTS HERE ONLY
  TO->>Store: await storeFile
  alt Cloudinary configured
    Store->>Cloud: uploadBuffer (rejects at 20s)
    Cloud-->>Store: url / error
  else CLOUDINARY_* empty
    Store->>Store: fs.writeFileSync (blocking)
  end
  Store->>DB: create Recording/Resource
  DB-->>UI: 201 JSON
  UI->>UI: await loadAll(); toast; finally restore btn
```

## Every function involved

| Step | Function | File |
|------|----------|------|
| 1 | `uploadForm` `onsubmit` | [frontend/modules/admin.js](frontend/modules/admin.js) L77 |
| 2 | `uploadResource` | [frontend/modules/admin.js](frontend/modules/admin.js) L190–223 |
| 3 | `apiFetch` | [frontend/modules/api.js](frontend/modules/api.js) L10–26 |
| 4 | `API_BASE` resolution | [frontend/modules/utils.js](frontend/modules/utils.js) L1–9 |
| 5 | `requireAuth` / `requireAdmin` | [backend/src/middleware/auth.js](backend/src/middleware/auth.js) |
| 6 | `upload.fields` (multer) | [backend/src/routes/upload.js](backend/src/routes/upload.js) L11, L179–188 |
| 7 | `validateUpload` / `validateTargetId` | same file L84–165 |
| 8 | `timeoutHandler(60000)` | same file L167–191 |
| 9 | `storeFile` → `uploadBuffer` or `writeFileSync` | L55–67; [cloudinary.service.js](backend/src/services/cloudinary.service.js) L18–41 |
| 10 | Prisma `create` | upload.js L223+ |
| 11 | `loadAll` (after success) | [frontend/modules/api.js](frontend/modules/api.js) L28–40 |

## Every async operation (and whether it can hang)

| Async | Timeout? | Can hang forever? |
|-------|----------|-------------------|
| `fetch` in `apiFetch` | **No** | **Yes** — primary UI hang |
| `res.json()` | No (fails fast on bad body) | No |
| `loadAll` → two more `fetch`es | **No** | Yes (secondary hang after upload) |
| Multer body parse | **No** | **Yes** — before 60s timer |
| Prisma in auth / validateTargetId | **No** | Yes (before 60s timer) |
| `uploadBuffer` Cloudinary | **20s reject** | No (Promise settles) |
| `timeoutHandler` | 60s → 504 | Only covers work **after** multer |
| `fs.writeFileSync` | N/A (sync) | Blocks event loop; can look hung |

## Why "جاري الرفع..." never clears

Evidence in [frontend/modules/admin.js](frontend/modules/admin.js):

```190:222:frontend/modules/admin.js
btn.textContent = "جاري الرفع...";
try {
  ...
  await apiFetch("/upload", { method: "POST", body: form });
  await loadAll();
  ...
} catch (err) {
  toast(err.message, "error");
} finally {
  btn.disabled = false;
  btn.textContent = originalText;
}
```

- Loading is only cleared in `finally`.
- `finally` runs only when the `await` settles (resolve or reject).
- [frontend/modules/api.js](frontend/modules/api.js) L14: bare `fetch` — **no `AbortController`, no client timeout**.
- A pending request → no toast, no console error from your code, button stuck forever.

**Last successful step (always):** button text set to `"جاري الرفع..."`, FormData built, `fetch` started.

**First failing step:** `await fetch(...)` never settles (or settles so late it feels infinite).

---

## Root causes ranked by likelihood (code evidence)

### 1. Split hosting: `API_BASE` targets Vercel, not Render (HIGH if you open the Vercel URL)

**Evidence:**

```1:9:frontend/modules/utils.js
export const API_BASE =
  window.API_BASE ||
  (location.protocol === "file:" ||
  (location.hostname === "localhost" && location.port && location.port !== "4000")
    ? "http://localhost:4000/api"
    : `${location.origin}/api`);
```

- [frontend/index.html](frontend/index.html) does **not** set `window.API_BASE`.
- No `vercel.json` / rewrite / proxy in the repo.
- README claim that `index.html` sets `API_BASE` is **false**.

**Final URL on Vercel:** `https://<your-vercel-app>/api/upload` — **not** Render.

**Why hang vs quick error:** A static 404 usually fails fast. Infinite pending means either a bad Vercel rewrite/proxy, or you are actually hitting Render (see #2). **Confirm in Network tab** — that single URL decides #1 vs #2.

**Cross-origin follow-on (if you fix URL to Render but keep Vercel UI):**

- [render.yaml](render.yaml) `CLIENT_ORIGIN` is only `https://tajeweed-v2-0.onrender.com` — Vercel origin gets **403** from [server.js](backend/src/server.js) L38–47 (fails fast, not hang).
- Auth cookies use `sameSite: 'strict'` in production ([auth.js](backend/src/routes/auth.js) L78) — cross-site cookie **not sent** → 401 (fails fast). Split hosting also needs `SameSite=None; Secure` and Vercel in `CLIENT_ORIGIN`.

### 2. Request reaches Render but stalls in Multer before any timeout (HIGH if Network URL is Render)

**Evidence:** middleware order in [upload.js](backend/src/routes/upload.js):

```184:191:backend/src/routes/upload.js
router.post("/",
  requireAuth,
  requireAdmin,
  uploadFields,          // ← buffers up to 250MB, NO timeout
  validateUpload,
  validateTargetId,      // ← Prisma, NO timeout
  timeoutHandler(60000), // ← timer starts ONLY after body is fully parsed
  ...
);
```

**Why "Uploading..." forever:** Browser waits for full response. Server waits for full multipart body. Nothing aborts either side. Large audio + slow uplink / free-tier stall = indefinite pending. Cloudinary’s 20s timer never starts until Multer finishes.

### 3. Empty Cloudinary env on Render → silent disk fallback (HIGH for misconfigured Render)

**Evidence:**

```22:27:render.yaml
CLOUDINARY_CLOUD_NAME: ""
CLOUDINARY_API_KEY: ""
CLOUDINARY_API_SECRET: ""
```

```8:8:backend/src/services/cloudinary.service.js
const isConfigured = !!(CLOUD_NAME && API_KEY && API_SECRET);
```

Empty string → `isConfigured === false` → [upload.js](backend/src/routes/upload.js) `storeFile` uses `fs.writeFileSync` to ephemeral `uploads/` (no Render volume). Large files block the event loop / risk OOM — response never sent while UI waits.

Cloudinary path itself **cannot hang forever**: [cloudinary.service.js](backend/src/services/cloudinary.service.js) rejects at 20s.

### 4. Secondary hang on `loadAll()` after a successful upload (MEDIUM)

If `/upload` returns 201 but `/content` or `/progress/me` hangs, button stays on "Uploading..." with upload already saved.

---

## Exact code / deploy changes required

### A. Make API URL correct for Vercel → Render

1. In [frontend/index.html](frontend/index.html), before `app.js`:

```html
<script>
  window.API_BASE = "https://tajeweed-v2-0.onrender.com/api";
</script>
```

(Or inject via Vercel env into a tiny generated config script — same effect.)

2. On Render, set:

`CLIENT_ORIGIN=https://<your-vercel-domain>,https://tajeweed-v2-0.onrender.com`

3. For cross-site cookies, change production cookie `sameSite` from `'strict'` to `'none'` (keep `secure: true`) in [auth.js](backend/src/routes/auth.js) `cookieOptions()`.

### B. Stop infinite UI hang (required regardless of host)

In [frontend/modules/api.js](frontend/modules/api.js), wrap `fetch` with `AbortController` + timeout (e.g. 90s for uploads, 20s for JSON). On abort, throw a clear Arabic error so `catch`/`finally` always run.

In [admin.js](frontend/modules/admin.js), add the numbered `console.log` steps you listed (1–8) temporarily around validate → FormData → fetch → parse → UI.

### C. Fix backend timeout placement + Cloudinary env

1. Apply an overall request timeout **before** Multer (or use Express/server timeouts on the upload route), and abort when client disconnects.
2. On Render Dashboard: set real non-empty `CLOUDINARY_CLOUD_NAME`, `API_KEY`, `API_SECRET`.
3. Remove empty Cloudinary placeholders from [render.yaml](render.yaml) (empty strings force disk fallback if they override Dashboard).
4. Log in the upload handler: received → multer done → cloudinary start/finish → prisma → response.

### D. Prefer same-origin if you do not need Vercel

Render already serves [frontend/](frontend/) via Express static ([server.js](backend/src/server.js)). Using only `https://tajeweed-v2-0.onrender.com` avoids cross-origin cookie/CORS entirely; then focus on B+C.

---

## Verification steps (proves the fix)

1. Open production site → Admin → Upload → DevTools **Network**.
2. Note the request URL:
   - `*.vercel.app/api/upload` → root cause #1 (API_BASE).
   - `*.onrender.com/api/upload` → root cause #2/#3.
3. Note status: `(pending)` forever vs 403/401/504/201.
4. Console: last printed log among 1–8 = exact client stop point.
5. Render logs: last server log among “received / multer / cloudinary / prisma / response”.
6. After fixes: upload a small PDF (&lt;1MB) → expect 201 within seconds, button restores, success toast.
7. Upload a larger audio → expect either success or a **timeout error toast** (never infinite "Uploading...").
8. Confirm Cloudinary dashboard shows the new asset (proves not disk fallback).

## Temporary diagnostic logging (add then remove)

**Client** ([admin.js](frontend/modules/admin.js) / [api.js](frontend/modules/api.js)): logs 1–8 + `console.log("fetch URL", API_BASE + "/upload")`.

**Server** ([upload.js](backend/src/routes/upload.js)): log when request hits route, after multer (middleware wrapper), before/after `storeFile`, before/after Prisma, before `res.json`.

---

## Bottom line

| Item | Finding |
|------|---------|
| Last successful step | Button set to "جاري الرفع..."; `fetch` invoked |
| First failing step | `await fetch` in `apiFetch` never settles |
| Why no toast/console | Pending Promise never rejects; `finally` never runs |
| Most likely prod causes | Wrong `API_BASE` on Vercel **and/or** Multer-before-timeout on Render **and/or** empty Cloudinary → disk |
| Cloudinary hang forever? | **No** — 20s reject exists; empty config skips Cloudinary entirely |
| Exact UI fix | Client AbortController + always clear loading |
| Exact deploy fix | Point `API_BASE` at Render; set Cloudinary env; fix `CLIENT_ORIGIN` / SameSite if cross-origin |