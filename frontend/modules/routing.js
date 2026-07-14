import { $, empty, esc, STORAGE, write, read, toast, debounce } from "./utils.js";
import { data, state, progressCache, orderedChapters, allLessons, findLesson, findQuarter, lessonRows, uploadTargets } from "./state.js";
import { apiFetch } from "./api.js";

export function pushHash(hash) {
  history.pushState(null, "", hash);
}
export function stateToHash() {
  const s = state;
  if (s.page === "lesson" && s.lessonId) return `#lesson/${s.lessonId}`;
  if (s.page === "quarter" && s.quarterId) return `#quarter/${s.quarterId}`;
  if (s.page === "khutbah" && s.khutbahId) return `#khutbah/${s.khutbahId}`;
  return `#${s.page}`;
}
export function hashToState() {
  const hash = location.hash.replace(/^#\/?/, "");
  if (!hash || hash === "home") return { page: "home" };
  const [page, id] = hash.split("/");
  if (page === "lesson" && id) return { page: "lesson", lessonId: id };
  if (page === "quarter" && id) return { page: "quarter", quarterId: id };
  if (page === "khutbah" && id) return { page: "khutbah", khutbahId: id };
  if (["curriculum", "quran", "khutbahs", "profile", "admin", "search"].includes(page)) return { page };
  return { page: "home" };
}

export function go(page) {
  state.page = page;
  pushHash(stateToHash());
  window._render();
  window.scrollTo(0, 0);
}
export function openLesson(id) {
  if (!findLesson(id)) return;
  state.lessonId = id;
  write(STORAGE.lastLesson, id);
  state.page = "lesson";
  pushHash(stateToHash());
  window._render();
  window.scrollTo(0, 0);
}
export function openQuarter(id) {
  if (!findQuarter(id)) return;
  state.quarterId = id;
  write(STORAGE.lastQuarter, id);
  state.page = "quarter";
  pushHash(stateToHash());
  window._render();
  window.scrollTo(0, 0);
}
export function openKhutbah(id) {
  if (!data.khutbahs.some((item) => item.id === id)) return;
  state.khutbahId = id;
  state.page = "khutbah";
  pushHash(stateToHash());
  window._render();
  window.scrollTo(0, 0);
}
export function selectChapter(id) {
  state.chapterId = id;
  state.page = "curriculum";
  window._render();
}
const _filterCurriculum = (query) => {
  const chapters = orderedChapters();
  const current =
    chapters.find((chapter) => chapter.id === state.chapterId) || chapters[0];
  const term = query.trim().toLowerCase();
  const results = allLessons().filter((item) =>
    `${item.title} ${item.description} ${item.chapter.name}`
      .toLowerCase()
      .includes(term),
  );
  const el = $("#curriculum-results");
  if (!el) return;
  if (!current) {
    el.innerHTML = empty("لا يوجد منهج بعد.");
    return;
  }
  el.innerHTML = term
    ? lessonRows(results)
    : lessonRows(
        current.lessons.map((lesson) => ({ ...lesson, chapter: current })),
      );
}
export const filterCurriculum = debounce(_filterCurriculum, 250);

const _filterQuran = (query) => {
  const normalized = String(query || "")
    .trim()
    .toLowerCase();
  const grid = $("#hizb-grid");
  document.querySelectorAll(".hizb-card").forEach((card) => {
    const text = (card.dataset.search || "").toLowerCase();
    card.hidden = Boolean(normalized) && !text.includes(normalized);
  });
  const existing = grid && grid.querySelector(".no-results");
  const anyVisible = grid
    ? grid.querySelectorAll(".hizb-card:not([hidden])").length > 0
    : true;
  if (normalized && !anyVisible) {
    if (!existing)
      grid.insertAdjacentHTML(
        "beforeend",
        `<div class="no-results">${empty("لم يتم العثور على نتائج.")}</div>`,
      );
  } else if (existing) existing.remove();
}
export const filterQuran = debounce(_filterQuran, 250);

const _filterKhutbahs = (query) => {
  const normalized = String(query || "")
    .trim()
    .toLowerCase();
  const cards = document.querySelectorAll(".khutbah");
  cards.forEach((card) => {
    const text = (card.dataset.search || "").toLowerCase();
    card.hidden = Boolean(normalized) && !text.includes(normalized);
  });
  const grid = document.getElementById("khutbah-grid");
  if (!grid) return;
  const existing = grid.querySelector(".no-results");
  const anyVisible = grid.querySelectorAll(".khutbah:not([hidden])").length > 0;
  if (normalized && !anyVisible) {
    if (!existing)
      grid.insertAdjacentHTML(
        "beforeend",
        `<div class="no-results">${empty("لم يتم العثور على نتائج.")}</div>`,
      );
  } else if (existing) existing.remove();
};
export const filterKhutbahs = debounce(_filterKhutbahs, 250);

const _filterGlobal = (query) => {
  const term = query.trim().toLowerCase();
  if (!term) {
    $("#global-results").innerHTML = empty("اكتب كلمة للبحث في جميع المحتوى.");
    return;
  }
  const chapters = orderedChapters().filter((chapter) =>
      chapter.name.toLowerCase().includes(term),
    ),
    lessons = allLessons().filter((item) =>
      `${item.title} ${item.description} ${item.chapter.name}`
        .toLowerCase()
        .includes(term),
    ),
    quarters = data.hizbs
      .flatMap((h) => h.quarters.map((q) => ({ ...q, hizb: h })))
      .filter((item) =>
        `${item.hizb.juz} ${item.hizb.number} ${item.hizb.title} ${item.number} ${item.name} ${item.notes}`
          .toLowerCase()
          .includes(term),
      ),
    khutbahItems = data.khutbahs.filter((item) =>
      `${item.title} ${item.description}`.toLowerCase().includes(term),
    );
  $("#global-results").innerHTML =
    `<section class="search-groups"><div class="card"><h3>الأبواب</h3>${chapters.length ? chapters.map((chapter) => `<button class="search-result" onclick="selectChapter('${esc(chapter.id)}')">${esc(chapter.name)}<span>${chapter.lessons.length} دروس</span></button>`).join("") : empty("لا توجد أبواب مطابقة.")}</div><div class="card"><h3>الدروس</h3>${lessonRows(lessons)}</div><div class="card"><h3>القرآن</h3>${
      quarters.length
        ? quarters
            .slice(0, 12)
            .map(
              (item) =>
                `<button class="search-result" onclick="openQuarter('${esc(item.id)}')">الجزء ${item.hizb.juz} · ${esc(item.hizb.title)} · ${esc(item.name)}</button>`,
            )
            .join("")
        : empty("لا توجد أرباع مطابقة.")
    }</div><div class="card"><h3>الخطب</h3>${khutbahItems.length ? khutbahItems.map((item) => `<button class="search-result" onclick="openKhutbah('${esc(item.id)}')">${esc(item.title)}<span>${esc(item.date)}</span></button>`).join("") : empty("لا توجد خطب مطابقة.")}</div></section>`;
};
export const filterGlobal = debounce(_filterGlobal, 300);
export async function advanceLesson(id) {
  try {
    const { status } = await apiFetch(`/progress/lessons/${id}`, {
      method: "POST",
    });
    progressCache.lessons[id] = status;
    window._render();
  } catch (err) {
    toast(err.message, "error");
  }
}
export async function toggleQuarter(id) {
  try {
    const { completed } = await apiFetch(`/progress/quarters/${id}`, {
      method: "POST",
    });
    progressCache.quarters = completed
      ? [...progressCache.quarters, id]
      : progressCache.quarters.filter((item) => item !== id);
    window._render();
  } catch (err) {
    toast(err.message, "error");
  }
}
export function refreshUploadTargets() {
  const target = document.querySelector("#upload-target");
  const area = document.querySelector("#upload-area");
  if (!target || !area) return;
  target.innerHTML = uploadTargets(area.value);
  const boardEl = document.querySelector(".upload-board");
  if (boardEl) boardEl.style.display = area.value === "curriculum" ? "" : "none";
}


