import { API_BASE, STORAGE, read, write, toast, showLoading, hideLoading } from "./utils.js";
import { data, state, progressCache, setData, setProgressCache, orderedChapters, findLesson, findQuarter, allLessons, defaultQuarter } from "./state.js";
import { stop as audioStop } from "./audio-player.js";

export let supabaseConfig = { enabled: false };
export let supabaseClient = null;
export function setSupabaseConfig(v) { supabaseConfig = v; }
export function setSupabaseClient(v) { supabaseClient = v; }

export async function apiFetch(path, options = {}) {
  const headers = Object.assign({}, options.headers);
  if (!(options.body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "include" });
  if (res.status === 401) {
    const publicPaths = ["/auth/me", "/auth/config"];
    const isPublic = publicPaths.some(p => path.startsWith(p));
    if (!isPublic) window.logout();
    throw new Error("غير مصرح");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "حدث خطأ في الاتصال بالخادم");
  }
  return res.status === 204 ? null : res.json();
}

export async function loadAll() {
  const [content, progress] = await Promise.all([
    apiFetch("/content"),
    apiFetch("/progress/me"),
  ]);
  setData(content);
  setProgressCache({
    lessons: progress.lessons,
    quarters: progress.quarters,
    activity: progress.activity,
  });
  syncStateIds();
}

export function syncStateIds() {
  const storedLesson = read(STORAGE.lastLesson, null);
  if (storedLesson && !findLesson(storedLesson))
    localStorage.removeItem(STORAGE.lastLesson);
  const storedQuarter = read(STORAGE.lastQuarter, null);
  if (storedQuarter && !findQuarter(storedQuarter))
    localStorage.removeItem(STORAGE.lastQuarter);

  state.lessonId =
    findLesson(read(STORAGE.lastLesson, null))?.id ||
    allLessons()[0]?.id ||
    null;
  state.quarterId =
    findQuarter(read(STORAGE.lastQuarter, null))?.id ||
    defaultQuarter()?.id ||
    null;
  state.chapterId =
    data.chapters.find((c) => c.id === state.chapterId)?.id ||
    orderedChapters()[0]?.id ||
    null;
  if (!data.khutbahs.some((k) => k.id === state.khutbahId))
    state.khutbahId = data.khutbahs[0]?.id || null;
}

export async function signIn(event) {
  event.preventDefault();
  const email = document.querySelector("#email").value.trim(),
    password = document.querySelector("#password").value;
  showLoading();
  try {
    if (supabaseConfig.enabled && supabaseClient) {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const session = data.session;
      if (!session) throw new Error("فشل تسجيل الدخول: لم يتم العثور على جلسة نشطة");

      const { user } = await apiFetch("/auth/supabase", {
        method: "POST",
        body: JSON.stringify({ accessToken: session.access_token }),
      });
      write(STORAGE.user, user);
      state.session = user;
    } else {
      const { user } = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      write(STORAGE.user, user);
      state.session = user;
    }
    await loadAll();
    hideLoading();
    window._render();
  } catch (err) {
    hideLoading();
    toast(err.message, "error");
  }
}
export async function signUp(event) {
  event.preventDefault();
  const name = document.querySelector("#reg-name").value.trim(),
    email = document.querySelector("#reg-email").value.trim(),
    password = document.querySelector("#reg-password").value,
    role = document.querySelector("#reg-role")?.value || "STUDENT";
  showLoading();
  try {
    const { user } = await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password, role }),
    });
    write(STORAGE.user, user);
    state.session = user;
    await loadAll();
    hideLoading();
    window._render();
  } catch (err) {
    hideLoading();
    toast(err.message, "error");
  }
}
export function logout() {
  audioStop();
  if (supabaseConfig.enabled && supabaseClient) {
    supabaseClient.auth.signOut().catch(() => {});
  }
  fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
  localStorage.removeItem(STORAGE.user);
  state.session = null;
  state.authView = "login";
  window._render();
}
