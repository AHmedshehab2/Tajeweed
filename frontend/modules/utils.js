export const API_BASE =
  window.API_BASE ||
  (location.protocol === "file:" ||
  (location.hostname === "localhost" &&
    location.port &&
    location.port !== "4000")
    ? "http://localhost:4000/api"
    : `${location.origin}/api`);
export const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");
export const STORAGE = {
  lastLesson: "tajweed-last-lesson",
  lastQuarter: "tajweed-last-quarter",
  theme: "tajweed-theme",
  user: "tajweed-user",
};
export const TODAY = new Date().toISOString().slice(0, 10);
export const HOME_PHOTO = "home.png";

export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[c],
  );
export const fmt = (date) => {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
};
export const mediaUrl = (url) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith("/") ? url : `/${url}`}`;
};
export const formatTime = (seconds) => {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
export const isAdmin = (session) =>
  session?.role === "ADMIN" || session?.role === "admin";

export const $ = (selector) => document.querySelector(selector);
export function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}
export function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
export function currentTheme() {
  return read(
    STORAGE.theme,
    window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  );
}
export function applyTheme() {
  document.documentElement.setAttribute("data-theme", currentTheme());
}
export function toggleTheme() {
  write(STORAGE.theme, currentTheme() === "dark" ? "light" : "dark");
  applyTheme();
  window._render();
}
export const progressBar = (value) =>
  `<div class="progress-line" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><i style="width:${value}%"></i></div>`;
export const empty = (text) =>
  `<div class="empty-state"><span>◌</span><p>${esc(text)}</p></div>`;
export const crumbs = (items) =>
  `<nav class="breadcrumb" aria-label="مسار الصفحة">${items.map(esc).join(" ← ")}</nav>`;
export function adminTable(headers, rows) {
  return `<div class="table-wrap"><table class="admin-table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, i) => `<td data-label="${headers[i]}">${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
export function showConfirm(title, message) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.innerHTML = `<div class="confirm-card"><h3>${esc(title)}</h3><p>${esc(message)}</p><div class="confirm-actions"><button class="btn-danger">تأكيد الحذف</button><button class="btn-ghost">إلغاء</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector(".btn-danger").onclick = () => { overlay.remove(); resolve(true); };
    overlay.querySelector(".btn-ghost").onclick = () => { overlay.remove(); resolve(false); };
    overlay.addEventListener("click", (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
  });
}
export function openImageOverlay(url, title) {
  const overlay = document.createElement("div");
  overlay.className = "confirm-overlay image-overlay";
  overlay.innerHTML = `<div class="image-overlay-card"><div class="image-overlay-header"><h3>${esc(title)}</h3><div class="image-overlay-actions"><a class="primary" href="${esc(url)}" download="${esc(title)}">تحميل الصورة</a><button class="btn-ghost" onclick="this.closest('.image-overlay').remove()">إغلاق</button></div></div><img src="${esc(url)}" alt="${esc(title)}"></div>`;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

let toastContainer = null;
function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.className = "toast-container";
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}
export function toast(message, type = "info", durationMs = 4000) {
  const container = getToastContainer();
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${esc(message)}</span><button class="toast-close" aria-label="إغلاق">&times;</button>`;
  const remove = () => { el.classList.add("removing"); el.addEventListener("animationend", () => el.remove()); };
  el.querySelector(".toast-close").onclick = remove;
  container.appendChild(el);
  if (durationMs > 0) setTimeout(remove, durationMs);
}

export function debounce(fn, ms = 250) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

let spinnerOverlay = null;
export function showLoading() {
  if (!spinnerOverlay) {
    spinnerOverlay = document.createElement("div");
    spinnerOverlay.className = "spinner-overlay";
    spinnerOverlay.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(spinnerOverlay);
  }
  spinnerOverlay.classList.add("active");
}
export function hideLoading() {
  if (spinnerOverlay) spinnerOverlay.classList.remove("active");
}
