import { esc, fmt, isAdmin, empty, adminTable, showConfirm, showPrompt, toast } from "./utils.js";
import { data, state, orderedChapters, allLessons, findLesson, chapterOptions, chapterPercent, curriculumPercent, uploadTargets, resourceLink, getRecentUploads, DAY_LABELS, TAG_LABELS } from "./state.js";
import { apiFetch, loadAll } from "./api.js";
import { getState as getAudioState, stop as audioStop } from "./audio-player.js";

export function admin() {
  if (!isAdmin(state.session))
    return `<div class="shell"><section class="card access-denied"><h1>هذه الصفحة خاصة بالإدارة</h1><p class="sub">ليس لديك صلاحية الوصول إلى إدارة المحتوى.</p><button class="primary" onclick="go('home')">العودة للرئيسية</button></section></div>`;
  const tabs = [
    ["overview", "نظرة عامة"],
    ["upload", "رفع مورد"],
    ["curriculum", "الأبواب والدروس"],
    ["quran", "القرآن"],
    ["khutbahs", "الخطب"],
    ["announcements", "الإعلانات"],
    ["schedule", "المواعيد"],
  ];
  return `<div class="shell"><div class="page-heading"><div><span class="eyebrow">منطقة خاصة</span><h1 class="headline">لوحة الإدارة</h1></div><button class="primary" style="margin:0" onclick="adminTab('upload')">+ رفع مورد</button></div><section class="admin-layout"><aside class="card admin-menu">${tabs.map(([id, label]) => `<button class="${state.adminTab === id ? "active" : ""}" onclick="adminTab('${id}')">${label}</button>`).join("")}</aside><div class="card admin-content">${adminContent2()}</div></section></div>`;
}
function adminContent() {
  if (state.adminTab === "upload") return uploadForm();
  if (state.adminTab === "curriculum") return curriculumAdmin();
  if (state.adminTab === "quran")
    return `<div class="admin-section"><div class="section-title"><h2>إدارة القرآن</h2><button class="primary" onclick="document.getElementById('hizb-form')?.scrollIntoView()">+ إضافة حزب</button></div><form id="hizb-form" class="editor-form" onsubmit="addHizb(event)"><h3>إضافة حزب جديد</h3><div class="form-grid"><div class="field"><label>رقم الحزب</label><input id="hizb-number" required type="number" min="1" placeholder="مثال: 61"></div><div class="field"><label>الجزء</label><input id="hizb-juz" type="number" min="1" max="30" placeholder="اترك فارغاً للحساب التلقائي"></div></div><div class="field"><label>العنوان</label><input id="hizb-title" required placeholder="مثال: الحزب 61"></div><button class="primary" type="submit">إضافة حزب</button></form><section class="admin-list">${data.hizbs.length ? data.hizbs.map((h) => `<article class="admin-item"><div style="flex:1"><b>${esc(h.title)}</b><span>الجزء ${h.juz} · ${h.quarters ? h.quarters.length : 0} أرباع</span><div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">${(h.quarters || []).map((q) => `<span class="pill" style="display:inline-flex;align-items:center;gap:4px">${esc(q.name)}<button class="text-link" style="padding:0;font-size:11px" onclick="deleteQuarter('${esc(h.id)}','${esc(q.id)}')"><span class="icon">close</span></button></span>`).join("")}<button class="text-link" style="font-size:12px" onclick="addQuarter('${esc(h.id)}')">+ ربع</button></div></div><div><button class="text-link" onclick="deleteHizb('${esc(h.id)}')">حذف الحزب</button></div></article>`).join("") : empty("لا توجد أحزاب بعد. أضف حزباً من النموذج أعلاه.")}</section></div>`;
  if (state.adminTab === "khutbahs")
    return `<div class="admin-section"><div class="section-title"><h2>إدارة الخطب</h2><button class="primary" onclick="document.getElementById('khutbah-form')?.scrollIntoView()">+ إضافة خطبة</button></div><form id="khutbah-form" class="editor-form" onsubmit="addKhutbah(event)"><h3>إضافة خطبة جديدة</h3><div class="form-grid"><div class="field"><label>العنوان</label><input id="khutbah-title" required placeholder="مثال: فضل الصبر"></div><div class="field"><label>التاريخ</label><input id="khutbah-date" required type="date"></div></div><div class="field"><label>الوصف</label><input id="khutbah-description" placeholder="وصف مختصر للخطبة"></div><button class="primary" type="submit">إضافة</button></form><section class="admin-list">${data.khutbahs.length ? data.khutbahs.map((k) => `<article class="admin-item"><div><b>${esc(k.title)}</b><span>${fmt(k.date)}${k.recordings && k.recordings.length ? ` · ${k.recordings.length} تسجيل(ات)` : ""}</span></div><div><button class="text-link" onclick="deleteKhutbah('${esc(k.id)}')">حذف</button></div></article>`).join("") : empty("لا توجد خطب بعد. أضف خطبة جديدة من النموذج أعلاه.")}</section></div>`;
  if (state.adminTab === "announcements")
    return `<h2>الإعلانات</h2>${adminTable(
      ["العنوان", "ينتهي في", "الأولوية"],
      data.announcements.map((a) => [
        a.title,
        a.expiresAt ? fmt(a.expiresAt) : "بدون انتهاء",
        a.priority === "important" ? "مهم" : "عادي",
      ]),
    )}`;
  const recentUploads = getRecentUploads(8);
  return `<h2>آخر المحتوى</h2><p class="sub">أضف الملفات من «رفع مورد»، وأدر أبواب المنهج ودروسه من القسم المخصص.</p>${recentUploads.length ? adminTable(
    ["العنوان", "القسم", "التاريخ"],
    recentUploads.map((item) => [
      item.title,
      item.section,
      fmt(item.uploadedAt),
    ]),
  ) : empty("لا يوجد محتوى بعد.")}`;
}
function curriculumAdmin() {
  const chapter = state.chapterEditor
    ? data.chapters.find((item) => item.id === state.chapterEditor)
    : null;
  const lesson = state.lessonEditor ? findLesson(state.lessonEditor) : null;
  return `<div class="admin-section"><div class="section-title"><h2>إدارة الأبواب والدروس</h2><button class="primary" style="margin:0" onclick="newChapter()">+ إضافة باب جديد</button></div>${chapterForm(chapter)}<section class="admin-list"><h3>الأبواب</h3>${orderedChapters()
    .map(
      (item) =>
        `<article class="admin-item"><div><b>${esc(item.name)}</b><span>الترتيب ${item.order} · ${item.lessons.length} دروس</span></div><div><button class="open" onclick="editChapter('${esc(item.id)}')">تعديل</button><button class="text-link" onclick="deleteChapter('${esc(item.id)}')">حذف</button></div></article>`,
    )
    .join(
      "",
    )}</section><div class="section-title"><h3>الدروس</h3><button class="open" onclick="newLesson()">+ إضافة درس</button></div>${lessonForm(lesson)}<section class="admin-list">${allLessons()
    .map(
      (item) =>
        `<article class="admin-item"><div><b>${esc(item.title)}</b><span>${esc(item.chapter.name)}</span></div><button class="open" onclick="editLesson('${esc(item.id)}')">تعديل أو نقل</button></article>`,
    )
    .join("")}</section></div>`;
}
function chapterForm(chapter) {
  if (state.chapterEditor == null) return "";
  const isNew = state.chapterEditor === "new";
  return `<form class="editor-form" onsubmit="saveChapter(event)"><h3>${isNew ? "إضافة باب جديد" : "تعديل الباب"}</h3><input type="hidden" id="chapter-id" value="${esc(chapter?.id || "")}"><div class="form-grid"><div class="field"><label>اسم الباب</label><input id="chapter-name" required value="${esc(chapter?.name || "")}"></div><div class="field"><label>الترتيب</label><input id="chapter-order" required type="number" min="1" value="${chapter?.order || data.chapters.length + 1}"></div></div><div class="field"><label>وصف اختياري</label><input id="chapter-description" value="${esc(chapter?.description || "")}"></div><button class="primary" type="submit">حفظ الباب</button><button class="text-link" type="button" onclick="cancelEditors()">إلغاء</button></form>`;
}
function lessonForm(lesson) {
  if (state.lessonEditor == null) return "";
  const isNew = state.lessonEditor === "new";
  const objectivesText = lesson?.objectives?.length ? lesson.objectives.join("\n") : "";
  return `<form class="editor-form" onsubmit="saveLesson(event)"><h3>${isNew ? "إضافة درس" : "تعديل أو نقل الدرس"}</h3><input type="hidden" id="lesson-id" value="${esc(lesson?.id || "")}"><input type="hidden" id="source-chapter" value="${esc(lesson?.chapter.id || "")}"><div class="form-grid"><div class="field"><label>عنوان الدرس</label><input id="lesson-title" required value="${esc(lesson?.title || "")}"></div><div class="field"><label>الباب</label><select id="lesson-chapter" required>${chapterOptions(lesson?.chapter.id)}</select></div></div><div class="field"><label>وصف</label><input id="lesson-description" value="${esc(lesson?.description || "")}"></div><div class="field"><label>أهداف الدرس</label><textarea id="lesson-objectives" rows="4" placeholder="هدف واحد في كل سطر">${esc(objectivesText)}</textarea><small>اكتب كل هدف في سطر منفصل.</small></div><button class="primary" type="submit">حفظ الدرس</button><button class="text-link" type="button" onclick="cancelEditors()">إلغاء</button></form>`;
}
function uploadForm() {
  const globalResources = data.resources || [];
  return `<h2>رفع مورد جديد</h2><p class="sub">يرتبط كل ملف مباشرة بالدرس أو الربع أو الخطبة المختارة، أو يمكن رفعه كمورد تجويد عام.</p><form class="upload-form" onsubmit="uploadResource(event)"><div class="form-grid"><div class="field"><label for="upload-area">قسم المحتوى</label><select id="upload-area" onchange="refreshUploadTargets()"><option value="curriculum">المنهج</option><option value="quran">القرآن</option><option value="khutbah">الخطب</option><option value="general">موارد التجويد العامة</option></select></div><div class="field" id="upload-target-field"><label for="upload-target">المحتوى المرتبط</label><select id="upload-target">${uploadTargets("curriculum")}</select></div><div class="field"><label for="upload-title">عنوان المورد</label><input id="upload-title" required placeholder="مثال: تسجيل شرح الإظهار"></div><div class="field"><label for="upload-type">نوع المورد</label><select id="upload-type"><option value="recording">تسجيل صوتي</option><option value="video">تسجيل فيديو</option><option value="pdf">ملف PDF أو مذكرة</option><option value="image">صورة سبورة / صورة</option><option value="attachment">ملف إضافي</option></select></div></div><div class="field upload-file"><label for="upload-file">اختر الملف</label><input id="upload-file" type="file" required accept="audio/*,video/*,.pdf,image/*,.doc,.docx,.ppt,.pptx"><small>يُخزَّن الملف على الخادم ويُعرض للطلاب بعد الرفع.</small></div><div class="field upload-file upload-board" style="display:none"><label for="upload-board">صورة السبورة (اختياري)</label><input id="upload-board" type="file" accept="image/*"><small>تُستخدم كصورة بديلة للدرس إذا لم تتوفر صورة مرفقة مسبقًا.</small></div><button class="primary" type="submit">رفع وإرفاق المورد</button></form><section class="admin-section" style="margin-top:28px"><h3>الموارد العامة الحالية</h3><section class="admin-list">${globalResources.length ? globalResources.map((r) => `<article class="admin-item"><div style="flex:1"><b>${esc(r.title)}</b><span>${esc(r.kind)}</span></div><div>${resourceLink(r)}<button class="text-link" onclick="deleteResource('${esc(r.id)}')">حذف</button></div></article>`).join("") : empty("لا توجد موارد عامة بعد.")}</section></section>`;
}

function adminContent2() {
  if (state.adminTab === "announcements") return announcementsAdmin();
  if (state.adminTab === "schedule") return scheduleAdmin();
  return adminContent();
}
function announcementsAdmin() {
  const items = data.announcements
    .slice()
    .sort((a, b) =>
      String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")),
    );
  const editing = state.announcementEditor ? data.announcements.find(a => a.id === state.announcementEditor) : null;
  const formTitle = editing ? 'تعديل إعلان' : 'إضافة إعلان';
  const submitLabel = editing ? 'حفظ التعديلات' : 'إضافة';

  const titleVal = editing ? esc(editing.title) : '';
  const bodyVal = editing ? esc(editing.body) : '';
  const expiresVal = editing && editing.expiresAt ? editing.expiresAt : '';
  const priorityVal = editing ? editing.priority : 'normal';
  const cancelBtn = editing ? `<button class="text-link" type="button" onclick="cancelEditors()">إلغاء</button>` : '';

  const listHtml = items.length ? items.map(a => {
    const resolvedBadge = a.resolvedAt ? '<span class="pill" style="opacity:0.6">تم الحل</span>' : '';
    return `<article class="admin-item"><div><b>${esc(a.title)}</b>${resolvedBadge}<span>${a.expiresAt ? fmt(a.expiresAt) : "بدون انتهاء"} · ${a.priority === "important" ? "مهم" : "عادي"}</span></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="open" onclick="editAnnouncement('${esc(a.id)}')">تعديل</button><button class="text-link" onclick="resolveAnnouncement('${esc(a.id)}')">حل</button><button class="text-link" onclick="deleteAnnouncement('${esc(a.id)}')">حذف</button></div></article>`;
  }).join('') : empty("لا توجد إعلانات بعد.");

  return `<div class="admin-section"><div class="section-title"><h2>الإعلانات</h2>${editing ? '' : `<button class="primary" style="margin:0" onclick="document.getElementById('announcement-form')?.scrollIntoView()">+ إضافة إعلان</button>`}</div><form id="announcement-form" class="editor-form" onsubmit="addAnnouncement(event)"><h3>${formTitle}</h3><input type="hidden" id="announcement-id" value="${esc(editing?.id || '')}"><div class="form-grid"><div class="field"><label for="announcement-title">العنوان</label><input id="announcement-title" required value="${titleVal}"></div><div class="field"><label for="announcement-expires">ينتهي في</label><input id="announcement-expires" type="date" value="${expiresVal}"></div><div class="field"><label for="announcement-priority">الأولوية</label><select id="announcement-priority"><option value="normal"${priorityVal === 'normal' ? ' selected' : ''}>عادي</option><option value="important"${priorityVal === 'important' ? ' selected' : ''}>مهم</option></select></div></div><div class="field"><label for="announcement-body">النص</label><textarea id="announcement-body" required>${bodyVal}</textarea></div><div style="display:flex;gap:8px;align-items:center">${cancelBtn}<button class="primary" type="submit">${submitLabel}</button></div></form><section class="admin-items">${listHtml}</section></div>`;
}

export function adminTab(id) {
  state.adminTab = id;
  state.chapterEditor = null;
  state.lessonEditor = null;
  state.announcementEditor = null;
  window._render();
}
export function newChapter() {
  state.chapterEditor = "new";
  window._render();
}
export function editChapter(id) {
  state.chapterEditor = id;
  window._render();
}
export function cancelEditors() {
  state.chapterEditor = null;
  state.lessonEditor = null;
  state.announcementEditor = null;
  window._render();
}
export async function saveChapter(event) {
  event.preventDefault();
  if (!isAdmin(state.session)) return;
  const id = document.querySelector("#chapter-id").value,
    name = document.querySelector("#chapter-name").value.trim(),
    order = Number(document.querySelector("#chapter-order").value),
    description = document.querySelector("#chapter-description").value.trim();
  if (!name || !Number.isFinite(order) || order < 1) return;
  try {
    if (id)
      await apiFetch(`/chapters/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, order, description }),
      });
    else
      await apiFetch("/chapters", {
        method: "POST",
        body: JSON.stringify({ name, order, description }),
      });
    await loadAll();
    state.chapterEditor = null;
    window._render();
  } catch (err) {
    toast(err.message, "error");
  }
}
export async function deleteChapter(id) {
  if (!isAdmin(state.session)) return;
  const chapter = data.chapters.find((item) => item.id === id);
  if (!chapter) return;
  const message = chapter.lessons.length
    ? `يحتوي هذا الباب على ${chapter.lessons.length} درس. هل تريد حذف الباب وكل دروسه؟`
    : "هل تريد حذف هذا الباب؟";
  if (!await showConfirm("حذف الباب", message)) return;
  try {
    await apiFetch(`/chapters/${id}`, { method: "DELETE" });
    await loadAll();
    state.chapterId = orderedChapters()[0]?.id;
    window._render();
  } catch (err) {
    toast(err.message, "error");
  }
}
export function newLesson() {
  state.lessonEditor = "new";
  window._render();
}
export function editLesson(id) {
  state.lessonEditor = id;
  window._render();
}
export async function saveLesson(event) {
  event.preventDefault();
  if (!isAdmin(state.session)) return;
  const id = document.querySelector("#lesson-id").value,
    targetId = document.querySelector("#lesson-chapter").value,
    title = document.querySelector("#lesson-title").value.trim(),
    description = document.querySelector("#lesson-description").value.trim(),
    objectives = (document.querySelector("#lesson-objectives").value || "").split("\n").map((s) => s.trim()).filter(Boolean);
  if (!targetId || !title) return;
  try {
    if (!id)
      await apiFetch("/lessons", {
        method: "POST",
        body: JSON.stringify({ chapterId: targetId, title, description, objectives }),
      });
    else
      await apiFetch(`/lessons/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ chapterId: targetId, title, description, objectives }),
      });
    await loadAll();
    state.lessonEditor = null;
    window._render();
  } catch (err) {
    toast(err.message, "error");
  }
}
export async function uploadResource(event) {
  event.preventDefault();
  if (!isAdmin(state.session)) return;
  const btn = event.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "جاري الرفع...";

  console.log("[upload 1] FormData built, calling apiFetch...");
  try {
    const area = document.querySelector("#upload-area").value,
      targetId = document.querySelector("#upload-target")?.value,
      title = document.querySelector("#upload-title").value.trim(),
      type = document.querySelector("#upload-type").value,
      file = document.querySelector("#upload-file").files[0];
    if (!title || !file) return;
    const form = new FormData();
    form.append("area", area);
    if (area !== "general") form.append("targetId", targetId);
    form.append("title", title);
    form.append("type", type);
    form.append("file", file);
    const boardEl = document.querySelector("#upload-board");
    const boardFile = boardEl && boardEl.files[0];
    if (boardFile) form.append("board", boardFile);

    const res = await apiFetch("/upload", { method: "POST", body: form, timeout: 120000 });
    console.log("[upload 2] apiFetch resolved OK");

    await loadAll();
    console.log("[upload 3] loadAll done");

    toast(area === "general" ? "تم رفع المورد العام بنجاح." : "تم رفع المورد وربطه بالمحتوى المختار.", "success");
    window._render();
  } catch (err) {
    console.log("[upload ERR]", err.message);
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}
export async function addAnnouncement(event) {
  event.preventDefault();
  if (!isAdmin(state.session)) return;
  const title = document.querySelector("#announcement-title").value.trim();
  const body = document.querySelector("#announcement-body").value.trim();
  const expires = document.querySelector("#announcement-expires").value;
  const priority = document.querySelector("#announcement-priority").value || "normal";
  if (!title || !body) return;
  try {
    const editingId = state.announcementEditor;
    if (editingId) {
      await apiFetch(`/announcements/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({ title, body, priority, expiresAt: expires || null }),
      });
    } else {
      await apiFetch("/announcements", {
        method: "POST",
        body: JSON.stringify({ title, body, priority, expiresAt: expires || null }),
      });
    }
    state.announcementEditor = null;
    await loadAll();
    document.getElementById("announcement-form")?.reset();
    window._render();
  } catch (err) {
    toast(err.message, "error");
  }
}
export function editAnnouncement(id) {
  state.announcementEditor = id;
  window._render();
  setTimeout(() => document.getElementById("announcement-form")?.scrollIntoView({ behavior: "smooth" }), 50);
}

export async function deleteAnnouncement(id) {
  if (!isAdmin(state.session)) return;
  if (!await showConfirm("حذف الإعلان", "هل تريد حذف هذا الإعلان؟ لا يمكن التراجع عن هذا الإجراء.")) return;
  try {
    await apiFetch(`/announcements/${id}`, { method: "DELETE" });
    await loadAll();
    window._render();
  } catch (err) {
    toast(err.message, "error");
  }
}
export async function deleteKhutbah(id) {
  if (!isAdmin(state.session)) return;
  if (!await showConfirm("حذف الخطبة", "هل تريد حذف هذه الخطبة؟ سيتم حذف جميع التسجيلات والملفات المرتبطة. لا يمكن التراجع عن هذا الإجراء.")) return;
  try {
    await apiFetch(`/khutbahs/${id}`, { method: "DELETE" });
    await loadAll();
    window._render();
  } catch (err) {
    toast(err.message, "error");
  }
}
export async function addKhutbah(event) {
  event.preventDefault();
  if (!isAdmin(state.session)) return;
  const title = document.querySelector("#khutbah-title").value.trim();
  const date = document.querySelector("#khutbah-date").value;
  const description = document.querySelector("#khutbah-description").value.trim();
  try {
    await apiFetch("/khutbahs", {
      method: "POST",
      body: JSON.stringify({ title, date, description }),
    });
    await loadAll();
    window._render();
  } catch (err) {
    toast(err.message, "error");
  }
}
export async function addHizb(event) {
  event.preventDefault();
  if (!isAdmin(state.session)) return;
  const number = document.querySelector("#hizb-number").value;
  const juz = document.querySelector("#hizb-juz").value || undefined;
  const title = document.querySelector("#hizb-title").value.trim();
  try {
    await apiFetch("/quran", {
      method: "POST",
      body: JSON.stringify({ number, juz, title }),
    });
    await loadAll();
    window._render();
  } catch (err) {
    toast(err.message, "error");
  }
}
export async function deleteHizb(id) {
  if (!isAdmin(state.session)) return;
  if (!await showConfirm("حذف الحزب", "هل تريد حذف هذا الحزب وكل أرباعه وتسجيلاته؟ لا يمكن التراجع.")) return;
  try {
    await apiFetch(`/quran/${id}`, { method: "DELETE" });
    await loadAll();
    window._render();
  } catch (err) {
    toast(err.message, "error");
  }
}
export async function addQuarter(hizbId) {
  if (!isAdmin(state.session)) return;
  const name = await showPrompt("اسم الربع الجديد:", "مثال: الربع الأول");
  if (!name) return;
  try {
    await apiFetch(`/quran/${hizbId}/quarters`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    await loadAll();
    window._render();
  } catch (err) {
    toast(err.message, "error");
  }
}
export async function deleteQuarter(hizbId, quarterId) {
  if (!isAdmin(state.session)) return;
  if (!await showConfirm("حذف الربع", "هل تريد حذف هذا الربع وتسجيلاته؟")) return;
  try {
    await apiFetch(`/quran/${hizbId}/quarters/${quarterId}`, { method: "DELETE" });
    await loadAll();
    window._render();
  } catch (err) {
    toast(err.message, "error");
  }
}
export async function deleteRecording(id) {
  if (!isAdmin(state.session)) return;
  if (!await showConfirm("حذف التسجيل", "هل تريد حذف هذا التسجيل؟ لا يمكن التراجع عن هذا الإجراء.")) return;
  try {
    await apiFetch(`/upload/recordings/${id}`, { method: "DELETE" });
    if (getAudioState().currentRecordingId === id) audioStop();
    await loadAll();
    if (state.page === "lesson") window.openLesson(state.lessonId);
    else if (state.page === "khutbah") window.openKhutbah(state.khutbahId);
    else if (state.page === "quarter") window.openQuarter(state.quarterId);
    else window._render();
  } catch (err) {
    toast(err.message, "error");
  }
}
export async function deleteResource(id) {
  if (!isAdmin(state.session)) return;
  if (!await showConfirm("حذف المورد", "هل تريد حذف هذا المورد؟ لا يمكن التراجع عن هذا الإجراء.")) return;
  try {
    await apiFetch(`/upload/resources/${id}`, { method: "DELETE" });
    await loadAll();
    if (state.page === "lesson") window.openLesson(state.lessonId);
    else if (state.page === "khutbah") window.openKhutbah(state.khutbahId);
    else if (state.page === "quarter") window.openQuarter(state.quarterId);
    else window._render();
  } catch (err) {
    toast(err.message, "error");
  }
}

function scheduleAdmin() {
  const templates = state.scheduleTemplates || [];
  const templateMap = {};
  templates.forEach(t => { templateMap[t.dayOfWeek] = t; });

  const dayRows = [0,1,2,3,4,5,6].map(d => {
    const t = templateMap[d] || {};
    const dayType = t.dayType || 'NONE';
    const tag = t.lessonTag || '';
    const start = t.startTime || '09:00';
    const end = t.endTime || '11:30';
    const fixedHtml = dayType === 'FIXED'
      ? `<select class="tmpl-tag" data-day="${d}"><option value="TAJWEED"${tag === 'TAJWEED' ? ' selected' : ''}>تجويد</option><option value="IQRAA"${tag === 'IQRAA' ? ' selected' : ''}>إقراء</option></select><input type="time" class="tmpl-start" data-day="${d}" value="${esc(start)}"><span>—</span><input type="time" class="tmpl-end" data-day="${d}" value="${esc(end)}">`
      : '';
    const optionalHtml = dayType === 'OPTIONAL'
      ? `<select class="tmpl-tag" data-day="${d}"><option value="">بدون</option><option value="TAJWEED"${tag === 'TAJWEED' ? ' selected' : ''}>تجويد</option><option value="IQRAA"${tag === 'IQRAA' ? ' selected' : ''}>إقراء</option></select><input type="time" class="tmpl-start" data-day="${d}" value="${esc(start)}"><span>—</span><input type="time" class="tmpl-end" data-day="${d}" value="${esc(end)}">`
      : '';
    return `<tr><td>${DAY_LABELS[d]}</td><td><select class="tmpl-type" data-day="${d}"><option value="NONE"${dayType === 'NONE' ? ' selected' : ''}>بدون حصص</option><option value="FIXED"${dayType === 'FIXED' ? ' selected' : ''}>ثابت</option><option value="OPTIONAL"${dayType === 'OPTIONAL' ? ' selected' : ''}>اختياري</option></select></td><td class="tmpl-tag-cell">${dayType === 'FIXED' ? fixedHtml : dayType === 'OPTIONAL' ? optionalHtml : '<span class="muted">—</span>'}</td></tr>`;
  }).join('');

  return `<div class="admin-section"><div class="section-title"><h2>إدارة المواعيد</h2></div><p class="sub">جدول الأيام الثابتة والاختيارية. لإلغاء يوم ثابت أو إضافة حصة استثنائية استخدم الاستثناءات أدناه.</p><form id="template-form" onsubmit="saveScheduleTemplates(event)"><table class="admin-table schedule-template-table"><thead><tr><th>اليوم</th><th>النوع</th><th>التصنيف والوقت</th></tr></thead><tbody>${dayRows}</tbody></table><button class="primary" type="submit">حفظ الجدول</button></form><div style="margin-top:32px"><div class="section-title"><h3>الاستثناءات</h3><button class="text-link" onclick="showAddException()">+ إضافة استثناء</button></div><div id="exception-form-container"></div><div id="exception-list">${empty("لا توجد استثناءات بعد.")}</div></div></div>`;
}

export async function saveScheduleTemplates(event) {
  event.preventDefault();
  if (!isAdmin(state.session)) return;
  const rows = document.querySelectorAll(".tmpl-type");
  const entries = [];
  rows.forEach(sel => {
    const dayOfWeek = parseInt(sel.dataset.day);
    const dayType = sel.value;
    const tagSel = document.querySelector(`.tmpl-tag[data-day="${dayOfWeek}"]`);
    const startSel = document.querySelector(`.tmpl-start[data-day="${dayOfWeek}"]`);
    const endSel = document.querySelector(`.tmpl-end[data-day="${dayOfWeek}"]`);
    entries.push({
      dayOfWeek,
      dayType,
      lessonTag: tagSel ? tagSel.value || null : null,
      startTime: startSel ? startSel.value : null,
      endTime: endSel ? endSel.value : null,
    });
  });
  try {
    await apiFetch("/schedule/templates", {
      method: "PUT",
      body: JSON.stringify({ entries }),
    });
    state.scheduleTemplates = await apiFetch("/schedule/templates");
    await loadAll();
    toast("تم حفظ جدول المواعيد بنجاح.", "success");
    window._render();
  } catch (err) {
    toast(err.message, "error");
  }
}

export async function resolveAnnouncement(id) {
  if (!isAdmin(state.session)) return;
  if (!await showConfirm("حل الإعلان", "هل تريد وضع علامة أن هذا الإعلان قد تم حله؟")) return;
  try {
    await apiFetch(`/announcements/${id}/resolve`, { method: "PATCH" });
    await loadAll();
    window._render();
  } catch (err) {
    toast(err.message, "error");
  }
}

export async function loadScheduleExceptions() {
  try {
    const exceptions = await apiFetch("/schedule/exceptions");
    state.scheduleExceptions = exceptions;
    const container = document.getElementById("exception-list");
    if (container) {
      container.innerHTML = exceptions.length
        ? exceptions.map(e => {
            const date = e.date;
            let label = '';
            if (e.isCancelled) label = 'إلغاء';
            else if (e.isAdded) label = 'إضافة';
            return `<div class="admin-item"><div><b>${date}</b> <span class="pill">${esc(label)}</span>${e.note ? ` — ${esc(e.note)}` : ''}</div><button class="text-link" onclick="deleteException(${e.id})">حذف</button></div>`;
          }).join('')
        : empty("لا توجد استثناءات بعد.");
    }
  } catch (err) {
    toast(err.message, "error");
  }
}

export function showAddException() {
  const container = document.getElementById("exception-form-container");
  if (!container) return;
  container.innerHTML = `<form id="exception-form" class="editor-form" onsubmit="saveException(event)" style="margin-top:12px"><div class="form-grid"><div class="field"><label>التاريخ</label><input type="date" id="exc-date" required></div><div class="field"><label>النوع</label><select id="exc-type"><option value="cancel">إلغاء</option><option value="add">إضافة</option></select></div></div><div class="form-grid"><div class="field"><label>التصنيف</label><select id="exc-tag"><option value="">—</option><option value="TAJWEED">تجويد</option><option value="IQRAA">إقراء</option></select></div><div class="field"><label>من</label><input type="time" id="exc-start" value="09:00"></div><div class="field"><label>إلى</label><input type="time" id="exc-end" value="11:30"></div></div><div class="field"><label>ملاحظة</label><input id="exc-note" placeholder="اختياري"></div><div style="display:flex;gap:8px"><button class="primary" type="submit">حفظ</button><button class="text-link" type="button" onclick="document.getElementById('exception-form-container').innerHTML=''">إلغاء</button></div></form>`;
}

export async function saveException(event) {
  event.preventDefault();
  if (!isAdmin(state.session)) return;
  const date = document.getElementById("exc-date").value;
  const type = document.getElementById("exc-type").value;
  const tag = document.getElementById("exc-tag").value || null;
  const startTime = document.getElementById("exc-start").value;
  const endTime = document.getElementById("exc-end").value;
  const note = document.getElementById("exc-note").value.trim() || null;
  try {
    await apiFetch("/schedule/exceptions", {
      method: "POST",
      body: JSON.stringify({
        date,
        isCancelled: type === "cancel",
        isAdded: type === "add",
        lessonTag: tag,
        startTime,
        endTime,
        note,
      }),
    });
    await loadScheduleExceptions();
    document.getElementById("exception-form-container").innerHTML = "";
    toast("تمت إضافة الاستثناء.", "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

export async function deleteException(id) {
  if (!isAdmin(state.session)) return;
  if (!await showConfirm("حذف الاستثناء", "هل تريد حذف هذا الاستثناء؟")) return;
  try {
    await apiFetch(`/schedule/exceptions/${id}`, { method: "DELETE" });
    await loadScheduleExceptions();
    toast("تم الحذف.", "success");
  } catch (err) {
    toast(err.message, "error");
  }
}
