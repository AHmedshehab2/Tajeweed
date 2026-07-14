import { esc, fmt, isAdmin, empty, adminTable, showConfirm, toast } from "./utils.js";
import { data, state, orderedChapters, allLessons, findLesson, chapterOptions, chapterPercent, curriculumPercent } from "./state.js";
import { apiFetch, loadAll } from "./api.js";

export function admin() {
  if (!isAdmin(state.session))
    return `<div class="shell"><section class="card access-denied"><h1>هذه الصفحة خاصة بالإدارة</h1><p class="sub">سجل الدخول بحساب المدير للوصول إلى إدارة المحتوى.</p><button class="primary" onclick="logout()">تسجيل الدخول كمدير</button></section></div>`;
  const tabs = [
    ["overview", "نظرة عامة"],
    ["upload", "رفع مورد"],
    ["curriculum", "الأبواب والدروس"],
    ["quran", "القرآن"],
    ["khutbahs", "الخطب"],
    ["announcements", "الإعلانات"],
  ];
  return `<div class="shell"><div class="page-heading"><div><span class="eyebrow">منطقة خاصة</span><h1 class="headline">لوحة الإدارة</h1></div><button class="primary" style="margin:0" onclick="adminTab('upload')">+ رفع مورد</button></div><section class="admin-layout"><aside class="card admin-menu">${tabs.map(([id, label]) => `<button class="${state.adminTab === id ? "active" : ""}" onclick="adminTab('${id}')">${label}</button>`).join("")}</aside><div class="card admin-content">${adminContent2()}</div></section></div>`;
}
function adminContent() {
  if (state.adminTab === "upload") return uploadForm();
  if (state.adminTab === "curriculum") return curriculumAdmin();
  if (state.adminTab === "quran")
    return `<div class="admin-section"><div class="section-title"><h2>إدارة القرآن</h2><button class="primary" onclick="document.getElementById('hizb-form')?.scrollIntoView()">+ إضافة حزب</button></div><form id="hizb-form" class="editor-form" onsubmit="addHizb(event)"><h3>إضافة حزب جديد</h3><div class="form-grid"><div class="field"><label>رقم الحزب</label><input id="hizb-number" required type="number" min="1" placeholder="مثال: 61"></div><div class="field"><label>الجزء</label><input id="hizb-juz" type="number" min="1" max="30" placeholder="اترك فارغاً للحساب التلقائي"></div></div><div class="field"><label>العنوان</label><input id="hizb-title" required placeholder="مثال: الحزب 61"></div><button class="primary" type="submit">إضافةحزب</button></form><section class="admin-list">${data.hizbs.length ? data.hizbs.map((h) => `<article class="admin-item"><div style="flex:1"><b>${esc(h.title)}</b><span>الجزء ${h.juz} · ${h.quarters ? h.quarters.length : 0} أرباع</span><div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">${(h.quarters || []).map((q) => `<span class="pill" style="display:inline-flex;align-items:center;gap:4px">${esc(q.name)}<button class="text-link" style="padding:0;font-size:11px" onclick="deleteQuarter('${esc(h.id)}','${esc(q.id)}')">✕</button></span>`).join("")}<button class="text-link" style="font-size:12px" onclick="addQuarter('${esc(h.id)}')">+ ربع</button></div></div><div><button class="text-link" onclick="deleteHizb('${esc(h.id)}')">حذف الحزب</button></div></article>`).join("") : empty("لا توجد أحزاب بعد. أضف حزباً من النموذج أعلاه.")}</section></div>`;
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
  return `<h2>آخر المحتوى</h2><p class="sub">أضف الملفات من «رفع مورد»، وأدر أبواب المنهج ودروسه من القسم المخصص.</p>${adminTable(
    ["العنوان", "النوع", "التاريخ"],
    [
      ["أحكام الإدغام", "تسجيل درس", "13 يونيو 2026"],
      ["الحزب 3 · الربع الثاني", "تصحيح قرآن", "15 يونيو 2026"],
      ["الاستقامة طريق النجاة", "خطبة", "14 يونيو 2026"],
    ],
  )}`;
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
  return `<h2>رفع مورد جديد</h2><p class="sub">يرتبط كل ملف مباشرة بالدرس أو الربع أو الخطبة المختارة.</p><form class="upload-form" onsubmit="uploadResource(event)"><div class="form-grid"><div class="field"><label for="upload-area">قسم المحتوى</label><select id="upload-area" onchange="refreshUploadTargets()"><option value="curriculum">المنهج</option><option value="quran">القرآن</option><option value="khutbah">الخطب</option></select></div><div class="field"><label for="upload-target">المحتوى المرتبط</label><select id="upload-target">${uploadTargets("curriculum")}</select></div><div class="field"><label for="upload-title">عنوان المورد</label><input id="upload-title" required placeholder="مثال: تسجيل شرح الإظهار"></div><div class="field"><label for="upload-type">نوع المورد</label><select id="upload-type"><option value="recording">تسجيل صوتي</option><option value="pdf">ملف PDF أو مذكرة</option><option value="image">صورة سبورة / صورة</option><option value="attachment">ملف إضافي</option></select></div></div><div class="field upload-file"><label for="upload-file">اختر الملف</label><input id="upload-file" type="file" required accept="audio/*,.pdf,image/*,.doc,.docx,.ppt,.pptx"><small>يُخزَّن الملف على الخادم ويُعرض للطلاب بعد الرفع.</small></div><div class="field upload-file upload-board" style="display:none"><label for="upload-board">صورة السبورة (اختياري)</label><input id="upload-board" type="file" accept="image/*"><small>تُستخدم كصورة بديلة للدرس إذا لم تتوفر صورة مرفقة مسبقًا.</small></div><button class="primary" type="submit">رفع وإرفاق المورد</button></form>`;
}
function uploadTargets(area) {
  if (area === "curriculum")
    return allLessons()
      .map(
        (item) =>
          `<option value="${esc(item.id)}">${esc(item.chapter.name)} — ${esc(item.title)}</option>`,
      )
      .join("");
  if (area === "quran")
    return data.hizbs
      .flatMap((h) =>
        h.quarters.map(
          (q) =>
            `<option value="${esc(q.id)}">${esc(h.title)} — ${esc(q.name)}</option>`,
        ),
      )
      .join("");
  return data.khutbahs
    .map((item) => `<option value="${esc(item.id)}">${esc(item.title)}</option>`)
    .join("");
}
function adminContent2() {
  if (state.adminTab === "announcements") return announcementsAdmin();
  return adminContent();
}
function announcementsAdmin() {
  const items = data.announcements
    .slice()
    .sort((a, b) =>
      String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")),
    );
  return `<div class="admin-section"><div class="section-title"><h2>الإعلانات</h2><button class="primary" style="margin:0" onclick="document.getElementById('announcement-form')?.scrollIntoView()">+ إضافة إعلان</button></div><form id="announcement-form" class="editor-form" onsubmit="addAnnouncement(event)"><h3>إضافة إعلان</h3><div class="form-grid"><div class="field"><label for="announcement-title">العنوان</label><input id="announcement-title" required></div><div class="field"><label for="announcement-expires">ينتهي في</label><input id="announcement-expires" type="date"></div><div class="field"><label for="announcement-priority">الأولوية</label><select id="announcement-priority"><option value="normal">عادي</option><option value="important">مهم</option></select></div></div><div class="field"><label for="announcement-body">النص</label><textarea id="announcement-body" required></textarea></div><button class="primary" type="submit">إضافة</button></form><section class="admin-list">${items.length ? items.map((a) => `<article class="admin-item"><div><b>${esc(a.title)}</b><span>${a.expiresAt ? fmt(a.expiresAt) : "بدون انتهاء"} · ${a.priority === "important" ? "مهم" : "عادي"}</span></div><div><button class="text-link" onclick="deleteAnnouncement('${esc(a.id)}')">حذف</button></div></article>`).join("") : empty("لا توجد إعلانات.")}</section></div>`;
}

export function adminTab(id) {
  state.adminTab = id;
  state.chapterEditor = null;
  state.lessonEditor = null;
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
  window._render();
}
export async function saveChapter(event) {
  event.preventDefault();
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
  const chapter = data.chapters.find((item) => item.id === id);
  if (!chapter) return;
  const message = chapter.lessons.length
    ? `يحتوي هذا الباب على ${chapter.lessons.length} درس. هل تريد حذف الباب وكل دروسه؟`
    : "هل تريد حذف هذا الباب؟";
  if (!window.confirm(message)) return;
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
  const area = document.querySelector("#upload-area").value,
    targetId = document.querySelector("#upload-target").value,
    title = document.querySelector("#upload-title").value.trim(),
    type = document.querySelector("#upload-type").value,
    file = document.querySelector("#upload-file").files[0];
  if (!title || !file) return;
  const form = new FormData();
  form.append("area", area);
  form.append("targetId", targetId);
  form.append("title", title);
  form.append("type", type);
  form.append("file", file);
  const boardEl = document.querySelector("#upload-board");
  const boardFile = boardEl && boardEl.files[0];
  if (boardFile) form.append("board", boardFile);
  try {
    await apiFetch("/upload", { method: "POST", body: form });
    await loadAll();
    event.target.reset();
    if (boardFile) {
      const boardContainer = document.querySelector(".upload-board");
      if (boardContainer) boardContainer.style.display = "none";
    }
    toast("تم رفع المورد وربطه بالمحتوى المختار.", "success");
    window._render();
  } catch (err) {
    toast(err.message, "error");
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
    await apiFetch("/announcements", {
      method: "POST",
      body: JSON.stringify({ title, body, priority, expiresAt: expires || null }),
    });
    await loadAll();
    document.getElementById("announcement-form")?.reset();
    window._render();
  } catch (err) {
    toast(err.message, "error");
  }
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
  const name = prompt("اسم الربع الجديد:");
  if (!name || !name.trim()) return;
  try {
    await apiFetch(`/quran/${hizbId}/quarters`, {
      method: "POST",
      body: JSON.stringify({ name: name.trim() }),
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
