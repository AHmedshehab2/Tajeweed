import { STORAGE, TODAY, esc, fmt, mediaUrl, isAdmin, read, write, empty } from "./utils.js";

export let data = { chapters: [], hizbs: [], khutbahs: [], announcements: [] };
export let state = {
  page: "home",
  session: read(STORAGE.user, null),
  authView: "login",
  authConfig: null,
  chapterId: null,
  lessonId: read(STORAGE.lastLesson, null),
  quarterId: read(STORAGE.lastQuarter, null),
  khutbahId: null,
  adminTab: "overview",
  chapterEditor: null,
  lessonEditor: null,
};
export let activeAudio = null;
export let activeRecordingId = null;
export let progressCache = { lessons: {}, quarters: [], activity: [] };

export function setData(v) { data = v; }
export function setState(v) { Object.assign(state, v); }
export function setActiveAudio(v) { activeAudio = v; }
export function setActiveRecordingId(v) { activeRecordingId = v; }
export function setProgressCache(v) { Object.assign(progressCache, v); }

export const allLessons = () =>
  orderedChapters().flatMap((chapter) =>
    chapter.lessons.map((lesson) => ({ ...lesson, chapter })),
  );
export const orderedChapters = () =>
  data.chapters
    .slice()
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ar"));
export const findLesson = (id) => allLessons().find((item) => item.id === id);
export const findQuarter = (id) =>
  data.hizbs
    .flatMap((hizb) => hizb.quarters.map((quarter) => ({ ...quarter, hizb })))
    .find((quarter) => quarter.id === id);
export const defaultQuarter = () => {
  const hizb = data.hizbs[0];
  if (!hizb?.quarters[0]) return null;
  return { ...hizb.quarters[0], hizb };
};
export const resolveLastLesson = () =>
  findLesson(read(STORAGE.lastLesson, state.lessonId)) || allLessons()[0];
export const resolveLastQuarter = () =>
  findQuarter(read(STORAGE.lastQuarter, state.quarterId)) || defaultQuarter();
export const progressLessons = () => progressCache.lessons;
export const lessonStatus = (id) => progressCache.lessons[id] || "not-started";
export const completedQuarters = () => progressCache.quarters;
export const chapterPercent = (chapter) =>
  chapter.lessons.length
    ? Math.round(
        (chapter.lessons.filter(
          (lesson) => lessonStatus(lesson.id) === "completed",
        ).length /
          chapter.lessons.length) *
          100,
      )
    : 0;
export const curriculumPercent = () => {
  const lessons = allLessons();
  return lessons.length
    ? Math.round(
        (lessons.filter((lesson) => lessonStatus(lesson.id) === "completed")
          .length /
          lessons.length) *
          100,
      )
    : 0;
};
export const totalQuarters = () => data.hizbs.reduce((sum, h) => sum + (h.quarters ? h.quarters.length : 0), 0);
export const quranPercent = () => { const total = totalQuarters(); return total ? Math.round((completedQuarters().length / total) * 100) : 0; };

export const audioPlayer = (recording, label) =>
  `<div class="audio rich-audio" data-recording-id="${esc(recording.id)}"><button class="play" aria-label="تشغيل ${esc(recording.title)}" onclick="playRecording(this,'${esc(recording.id)}')">▶</button><div class="audio-title"><b>${esc(recording.title)}</b><span>${esc(label)} · رفع ${fmt(recording.uploadedAt)} · ${esc(recording.duration || "")}${recording.version ? ` · الإصدار ${recording.version}` : ""}</span><div class="seek-row"><span>00:00</span><input type="range" min="0" max="100" value="0" aria-label="موقع التسجيل" oninput="seekRecording(this)"><span>${esc(recording.duration || "00:00")}</span></div></div><button class="speed" onclick="cycleSpeed(this)" aria-label="تغيير سرعة التشغيل">1×</button>${isAdmin(state.session) ? `<button class="btn-delete-sm" onclick="deleteRecording('${esc(recording.id)}')" aria-label="حذف التسجيل">✕</button>` : ""}</div>`;
export const resourceLink = (resource, meta = "") => {
  const inner = `▤ ${esc(resource.title)}<span>${esc(resource.kind)}${meta ? ` · ${meta}` : ""}</span>`;
  const deleteBtn = isAdmin(state.session) ? `<button class="btn-delete-sm resource-delete" onclick="event.preventDefault();event.stopPropagation();deleteResource('${esc(resource.id)}')" aria-label="حذف المورد">✕</button>` : "";
  if (!resource.fileUrl)
    return `<span class="resource resource-disabled">${inner}${deleteBtn}</span>`;
  return `<a class="resource" href="${esc(mediaUrl(resource.fileUrl))}" target="_blank" rel="noopener noreferrer">${inner}${deleteBtn}</a>`;
};
export function lessonRows(lessons) {
  return lessons.length
    ? lessons
        .map((lesson, index) => {
          const status = lessonStatus(lesson.id),
            statusLabel =
              status === "completed"
                ? "✓ مكتمل"
                : status === "in-progress"
                  ? "قيد التقدم"
                  : "لم يبدأ";
          const boardImage = (lesson.resources || []).find((r) => r.kind === "صورة" && r.fileUrl);
          const recCount = (lesson.recordings || []).length;
          const artHtml = boardImage
            ? `<img class="lesson-art-img" src="${esc(mediaUrl(boardImage.fileUrl))}" alt="${esc(lesson.title)}" loading="lazy">`
            : `<div class="lesson-art-fallback"><span>${String(index + 1).padStart(2, "0")}</span></div>`;
          return `<article class="card lesson-card"><div class="lesson-art">${artHtml}</div><div class="lesson-body"><span class="eyebrow">${esc(lesson.chapter.name)}</span><h3>${esc(lesson.title)}</h3><p>${esc(lesson.description || "")}</p><div class="lesson-meta"><span class="status status-${status}">${statusLabel}</span>${recCount ? `<span class="pill">${recCount} تسجيل</span>` : ""}</div><button class="open" onclick="openLesson('${esc(lesson.id)}')">فتح الدرس</button></div></article>`;
        })
        .join("")
    : empty("لا توجد نتائج مطابقة.");
}
export function activityHeatmap() {
  const days = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  progressCache.activity.forEach((item) => {
    const d = new Date(item.date);
    const jsDay = d.getDay();
    const arabicIdx = (jsDay + 1) % 7;
    counts[arabicIdx]++;
  });
  const max = Math.max(...counts, 1);
  return `<div class="heatmap">${days.map((day, i) => `<div class="heatmap-row"><span class="heatmap-label">${day}</span><div class="heatmap-bar-track"><div class="heatmap-bar" style="width:${Math.round((counts[i] / max) * 100)}%"></div></div><span class="heatmap-count">${counts[i]}</span></div>`).join("")}</div>`;
}
export function chapterOptions(selected = "") {
  return orderedChapters()
    .map(
      (chapter) =>
        `<option value="${esc(chapter.id)}" ${chapter.id === selected ? "selected" : ""}>${esc(chapter.name)}</option>`,
    )
    .join("");
}
export function getRecentUploads(limit = 5) {
  const items = [];
  allLessons().forEach((lesson) => {
    lesson.recordings.forEach((rec) =>
      items.push({
        uploadedAt: rec.uploadedAt,
        title: rec.title,
        meta: rec.duration,
        section: `درس`,
        action: `openLesson('${lesson.id}')`,
      }),
    );
    lesson.resources.forEach((res) =>
      items.push({
        uploadedAt: res.uploadedAt,
        title: res.title,
        meta: res.kind,
        section: `درس`,
        action: `openLesson('${lesson.id}')`,
      }),
    );
  });
  data.hizbs.forEach((hizb) => {
    hizb.quarters.forEach((quarter) => {
      quarter.recordings.forEach((rec) =>
        items.push({
          uploadedAt: rec.uploadedAt,
          title: rec.title,
          meta: rec.duration,
          section: `${hizb.title} · ${quarter.name}`,
          action: `openQuarter('${quarter.id}')`,
        }),
      );
      quarter.resources.forEach((res) =>
        items.push({
          uploadedAt: res.uploadedAt,
          title: res.title,
          meta: res.kind,
          section: `${hizb.title} · ${quarter.name}`,
          action: `openQuarter('${quarter.id}')`,
        }),
      );
    });
  });
  data.khutbahs.forEach((k) => {
    if (k.date || k.audioUrl)
      items.push({
        uploadedAt: k.date || TODAY,
        title: k.title,
        meta: k.duration,
        section: `خطبة`,
        action: `openKhutbah('${k.id}')`,
      });
    k.resources?.forEach((res) =>
      items.push({
        uploadedAt: res.uploadedAt,
        title: res.title,
        meta: res.kind,
        section: `خطبة`,
        action: `openKhutbah('${k.id}')`,
      }),
    );
  });
  return items
    .sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)))
    .slice(0, limit);
}
