/* Client-side LMS — thin entry point. All logic lives in modules/. */
import { applyTheme, toggleTheme, showConfirm, showPrompt, openImageOverlay, toast, showLoading, hideLoading } from "./modules/utils.js";
import { state } from "./modules/state.js";
import { apiFetch, loadAll, signIn, signUp, logout, setSupabaseConfig, setSupabaseClient } from "./modules/api.js";
import { playRecording, cycleSpeed, miniPlayPause, miniCycleSpeed, miniPrevLesson, miniNextLesson, miniClose, miniReopen, miniExpand, miniCollapse, cancelCountdown, onSeekTrackPointerDown } from "./modules/audio.js";
import { go, openLesson, openQuarter, openKhutbah, selectChapter, filterCurriculum, filterQuran, filterKhutbahs, filterGlobal, advanceLesson, toggleQuarter, refreshUploadTargets, hashToState } from "./modules/routing.js";
import { render } from "./modules/pages.js";
import { adminTab, newChapter, editChapter, cancelEditors, saveChapter, deleteChapter, newLesson, editLesson, saveLesson, uploadResource, addAnnouncement, deleteAnnouncement, deleteKhutbah, addKhutbah, addHizb, deleteHizb, addQuarter, deleteQuarter, deleteRecording, deleteResource } from "./modules/admin.js";

window._render = render;

window.go = go;
window.openLesson = openLesson;
window.openQuarter = openQuarter;
window.openKhutbah = openKhutbah;
window.selectChapter = selectChapter;
window.filterCurriculum = filterCurriculum;
window.filterQuran = filterQuran;
window.filterKhutbahs = filterKhutbahs;
window.filterGlobal = filterGlobal;
window.advanceLesson = advanceLesson;
window.toggleQuarter = toggleQuarter;
window.refreshUploadTargets = refreshUploadTargets;
window.toggleTheme = toggleTheme;
window.render = render;
window.signIn = signIn;
window.signUp = signUp;
window.logout = logout;
window.playRecording = playRecording;
window.cycleSpeed = cycleSpeed;
window.miniPlayPause = miniPlayPause;
window.miniCycleSpeed = miniCycleSpeed;
window.miniPrevLesson = miniPrevLesson;
window.miniNextLesson = miniNextLesson;
window.miniClose = miniClose;
window.miniReopen = miniReopen;
window.miniExpand = miniExpand;
window.miniCollapse = miniCollapse;
window.onSeekTrackPointerDown = onSeekTrackPointerDown;
window.cancelCountdown = cancelCountdown;
window.adminTab = adminTab;
window.newChapter = newChapter;
window.editChapter = editChapter;
window.cancelEditors = cancelEditors;
window.saveChapter = saveChapter;
window.deleteChapter = deleteChapter;
window.newLesson = newLesson;
window.editLesson = editLesson;
window.saveLesson = saveLesson;
window.uploadResource = uploadResource;
window.addAnnouncement = addAnnouncement;
window.deleteAnnouncement = deleteAnnouncement;
window.deleteKhutbah = deleteKhutbah;
window.addKhutbah = addKhutbah;
window.addHizb = addHizb;
window.deleteHizb = deleteHizb;
window.addQuarter = addQuarter;
window.deleteQuarter = deleteQuarter;
window.deleteRecording = deleteRecording;
window.deleteResource = deleteResource;
window.showConfirm = showConfirm;
window.openImageOverlay = openImageOverlay;
window.toast = toast;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.showRegister = () => { state.authView = "register"; render(); };
window.showLogin = () => { state.authView = "login"; render(); };

async function init() {
  applyTheme();

  try {
    const config = await apiFetch("/auth/config");
    if (config) {
      state.authConfig = config;
      if (config.supabase?.enabled) {
        setSupabaseConfig(config.supabase);
        if (window.supabase) {
          setSupabaseClient(window.supabase.createClient(config.supabase.url, config.supabase.publishableKey));
        }
      }
    }
  } catch (err) {
    console.error("Failed to load auth config:", err);
  }

  // Handle OAuth error redirect
  const params = new URLSearchParams(window.location.search);
  const authError = params.get('auth_error');
  if (authError) {
    const msg = authError === 'provider'
      ? 'مزوّد تسجيل الدخول غير مُعد بعد'
      : 'فشل تسجيل الدخول عبر التواصل الاجتماعي';
    toast(msg, 'error');
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  }

  const cachedUser = localStorage.getItem("tajweed-user");
  if (cachedUser) {
    try { state.session = JSON.parse(cachedUser); } catch (_) {}
  }
  showLoading();
  try {
    const { user } = await apiFetch("/auth/me");
    state.session = user;
    if (user) {
      localStorage.setItem("tajweed-user", JSON.stringify(user));
      await loadAll();
    } else {
      localStorage.removeItem("tajweed-user");
    }
  } catch (err) {
    console.error("Failed to restore session:", err);
    state.session = null;
    localStorage.removeItem("tajweed-user");
    toast("تعذر تحميل الجلسة. حاول مرة أخرى.", "error");
  }
  hideLoading();

  const incoming = hashToState();
  state.page = incoming.page || "home";
  state.lessonId = incoming.lessonId || null;
  state.quarterId = incoming.quarterId || null;
  state.khutbahId = incoming.khutbahId || null;

  render();

  window.addEventListener("popstate", () => {
    const s = hashToState();
    state.page = s.page || "home";
    state.lessonId = s.lessonId || null;
    state.quarterId = s.quarterId || null;
    state.khutbahId = s.khutbahId || null;
    render();
  });
}
init();
