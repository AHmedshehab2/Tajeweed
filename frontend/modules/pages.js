import { TODAY, HOME_PHOTO, API_BASE, esc, fmt, mediaUrl, isAdmin, formatTime, progressBar, empty, crumbs, adminTable, currentTheme } from "./utils.js";
import { data, state, progressCache, allLessons, orderedChapters, findLesson, findQuarter, resolveLastLesson, resolveLastQuarter, lessonStatus, completedQuarters, chapterPercent, curriculumPercent, totalQuarters, quranPercent, audioPlayer, resourceLink, lessonRows, chapterOptions, getRecentUploads, activityHeatmap } from "./state.js";
import { admin } from "./admin.js";
import { syncAudioUI, startAudioUIListener, stopAudioUIListener, startAudioEndListener, isMiniHidden, isMiniExpanded } from "./audio.js";
import { getState as getAudioState } from "./audio-player.js";

export function render() {
  document.documentElement.lang = "ar";
  document.documentElement.dir = "rtl";
  document.title = "مدرسة القرآن";
  document.querySelector("#app").innerHTML = state.session
    ? `${nav()}<main>${({ home, curriculum, lesson, quran, quarter, khutbahs, khutbah, profile, admin, search }[state.page] || home)()}</main>${mobileNav()}${miniPlayer()}`
    : state.authView === "register"
      ? register()
      : login();
  syncAudioUI();
  startAudioUIListener();
  startAudioEndListener();
}
function nav() {
  return `<header class="topbar"><div class="shell"><button class="brand" onclick="go('home')"><span class="brand-mark">م</span>مدرسة القرآن</button><nav class="nav" aria-label="التنقل الرئيسي">${[
    ["home", "الرئيسية"],
    ["curriculum", "المنهج"],
    ["quran", "القرآن"],
    ["khutbahs", "الخطب"],
    ["profile", "حسابي"],
  ]
    .map(
      ([page, label]) =>
        `<button class="${state.page === page ? "active" : ""}" onclick="go('${page}')">${label}</button>`,
    )
    .join(
      "",
    )}</nav><div class="actions"><button class="theme-toggle" onclick="toggleTheme()" aria-label="تبديل المظهر">${currentTheme() === "dark" ? "☀" : "☾"}</button><button class="icon-btn" onclick="go('search')" aria-label="بحث">⌕</button>${isAdmin(state.session) ? `<button class="icon-btn" onclick="go('admin')" aria-label="لوحة الإدارة">⚙</button>` : ""}<button class="avatar" onclick="go('profile')">${esc(state.session.name.slice(0, 2))}</button><button class="text-link" onclick="logout()">خروج</button></div></div></header>`;
}
function mobileNav() {
  return `<nav class="mobile-nav" aria-label="تنقل الجوال">${[
    ["home", "الرئيسية"],
    ["curriculum", "المنهج"],
    ["quran", "القرآن"],
    ["khutbahs", "الخطب"],
    ["profile", "حسابي"],
  ]
    .map(
      ([page, label]) =>
        `<button class="${state.page === page ? "active" : ""}" onclick="go('${page}')">${label}</button>`,
    )
    .join("")}</nav>`;
}
function miniPlayer() {
  const gs = getAudioState();
  if (!gs.currentRecordingId) return "";
  const label = gs.isPlaying ? "❚❚" : "▶";
  const dur = gs.duration > 0 ? formatTime(gs.duration) : "";
  const hidden = isMiniHidden();
  const expanded = isMiniExpanded();
  const expandIcon = expanded ? "✕" : "⤢";
  return `<div class="mini-player${expanded ? " expanded" : ""}" id="mini-player" data-hidden="${hidden ? "1" : "0"}" style="${hidden ? "display:none" : ""}"><div class="mp-inner"><button class="mp-close" onclick="miniClose()" aria-label="إغلاق">✕</button><div class="mp-expanded-art" aria-hidden="true"><div class="mp-artwork">🎙</div></div><div class="mp-top"><div class="mp-title" id="mp-title">${esc(gs.recordingTitle)}</div></div><div class="mp-seek-row"><span id="mp-elapsed">${formatTime(gs.currentTime)}</span><input type="range" min="0" max="100" value="${gs.duration > 0 ? Math.round((gs.currentTime / gs.duration) * 100) : 0}" aria-label="موقع التسجيل" oninput="miniSeek(this)"><span id="mp-dur">${dur}</span></div><div class="mp-transport"><button class="mp-ctrl mp-prev" onclick="miniPrevLesson()" aria-label="الدرس السابق">▶▶</button><button class="mp-play" onclick="miniPlayPause()" aria-label="تشغيل/إيقاف">${label}</button><button class="mp-ctrl mp-next" onclick="miniNextLesson()" aria-label="الدرس التالي">◀◀</button></div><div class="mp-utils"><button class="mp-speed" onclick="miniCycleSpeed(this)" aria-label="تغيير السرعة">${gs.playbackRate}×</button><button class="mp-ctrl mp-expand" onclick="miniExpand()" aria-label="توسيع"><span class="mp-expand-icon">${expandIcon}</span></button></div></div></div>${hidden ? `<button class="mini-player-fab" id="mini-player-fab" onclick="miniReopen()" aria-label="إعادة فتح المشغل">▶</button>` : `<button class="mini-player-fab" id="mini-player-fab" style="display:none" onclick="miniReopen()" aria-label="إعادة فتح المشغل">▶</button>`}`;
}

function socialButtons() {
  const googleUrl = `${API_BASE.replace(/\/api\/?$/, '')}/api/auth/google`;
  const facebookUrl = `${API_BASE.replace(/\/api\/?$/, '')}/api/auth/facebook`;
  return `<div class="auth-divider"><span>أو</span></div><a href="${googleUrl}" class="btn-social btn-google"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> متابعة باستخدام Google</a><a href="${facebookUrl}" class="btn-social btn-facebook"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg> متابعة باستخدام Facebook</a>`;
}
function login() {
  return `<main class="login"><button class="theme-toggle login-theme-toggle" onclick="toggleTheme()" aria-label="تبديل المظهر">${currentTheme() === "dark" ? "☀" : "☾"}</button><section class="card login-card"><div class="brand"><span class="brand-mark">م</span>مدرسة القرآن</div><h1 class="headline">مرحباً بعودتك</h1><p class="sub">سجل دخولك لمتابعة رحلة تعلّم التجويد.</p><form onsubmit="signIn(event)"><div class="field"><label for="email">البريد الإلكتروني</label><input id="email" required type="email" placeholder="example@email.com"></div><div class="field"><label for="password">كلمة المرور</label><input id="password" required type="password" placeholder="••••••••"></div><button class="primary" type="submit">تسجيل الدخول</button></form>${socialButtons()}<p class="compact">ليس لديك حساب؟ <button class="text-link" onclick="showRegister()">إنشاء حساب جديد</button></p></section></main>`;
}
function register() {
  return `<main class="login"><button class="theme-toggle login-theme-toggle" onclick="toggleTheme()" aria-label="تبديل المظهر">${currentTheme() === "dark" ? "☀" : "☾"}</button><section class="card login-card"><div class="brand"><span class="brand-mark">م</span>مدرسة القرآن</div><h1 class="headline">إنشاء حساب جديد</h1><p class="sub">سجّل للانضمام إلى رحلة تعلّم التجويد.</p><form onsubmit="signUp(event)"><div class="field"><label for="reg-name">الاسم</label><input id="reg-name" required type="text" placeholder="الاسم الكامل"></div><div class="field"><label for="reg-email">البريد الإلكتروني</label><input id="reg-email" required type="email" placeholder="example@email.com"></div><div class="field"><label for="reg-password">كلمة المرور</label><input id="reg-password" required type="password" minlength="4" placeholder="4 أحرف على الأقل"></div><button class="primary" type="submit">إنشاء الحساب</button></form>${socialButtons()}<p class="compact">لديك حساب بالفعل؟ <button class="text-link" onclick="showLogin()">تسجيل الدخول</button></p></section></main>`;
}
function home() {
  const last = resolveLastLesson();
  const announcements = data.announcements.filter(
    (item) => !item.expiresAt || item.expiresAt >= TODAY,
  );
  const totalLessons = allLessons().length;
  const completedLessons = Object.values(progressCache.lessons).filter(
    (s) => s === "completed",
  ).length;
  const lessonPercent = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const resumeCard = last
    ? `<article class="resume-card"><div class="resume-info"><span class="eyebrow">${esc(last.chapter.name)}</span><h3>${esc(last.title)}</h3><p>آخر درس: ${lessonStatus(last.id) === "completed" ? "اكتمل" : "قيد التعلّم"}</p></div><div class="resume-progress"><span class="resume-percent">${lessonPercent}%</span>${progressBar(lessonPercent)}<button class="open" onclick="openLesson('${esc(last.id)}')">متابعة</button></div></article>`
    : `<article class="resume-card"><div class="resume-info"><span class="eyebrow">ابدأ رحلتك</span><h3>منهج التجويد</h3><p>استكشف الدروس وابدأ من الباب الأول.</p></div><button class="open" onclick="go('curriculum')">عرض المنهج</button></article>`;
  const totalQuartersCount = data.hizbs.reduce((sum, h) => sum + (h.quarters ? h.quarters.length : 0), 0);
  const completedQuartersCount = completedQuarters().length;
  return `<div class="shell"><section class="hero-section"><img class="hero-photo" src="${esc(HOME_PHOTO)}" alt="صورة الشيخ" loading="lazy"><div class="hero-text"><h1 class="hero-ayah">إِنَّ الَّذِينَ يَتْلُونَ كِتَابَ اللَّهِ وَأَقَامُوا الصَّلَاةَ وَأَنفَقُوا مِمَّا رَزَقْنَاهُمْ سِرًّا وَعَلَانِيَةً يَرْجُونَ تِجَارَةً لَّن تَبُورَ</h1><p class="hero-sub">كل ما تحتاجه لمتابعة دروسك ومراجعة تلاوتك، في مكان واحد.</p><div class="hero-cta"><button class="primary" onclick="go('curriculum')">ابدأ رحلتك الآن</button><button class="btn-outline" onclick="go('quran')">استكشف القرآن</button></div></div><div class="hero-progress"><article class="hero-stat"><span class="eyebrow">المنهج</span><h3>${completedLessons} / ${totalLessons}</h3><p>درس مكتمل · ${lessonPercent}%</p></article><article class="hero-stat"><span class="eyebrow">القرآن</span><h3>${completedQuartersCount} / ${totalQuartersCount}</h3><p>ربع مكتمل · ${totalQuartersCount ? Math.round((completedQuartersCount / totalQuartersCount) * 100) : 0}%</p></article></div></section><section style="margin-top:28px">${resumeCard}</section><section class="announcement-stack">${announcements.map((item) => `<article class="announcement ${item.priority === "important" ? "important" : ""}"><span class="announce-tag">${item.priority === "important" ? "مهم" : "تذكير"} · ${item.target === "all" ? "لكل الطلاب" : esc(item.target)}</span><strong>${esc(item.title)}:</strong> ${esc(item.body)}</article>`).join("")}</section></div>`;
}
function curriculum() {
  const chapters = orderedChapters();
  if (!chapters.length)
    return `<div class="shell">${empty("لا يوجد منهج بعد. أضف أبواباً من لوحة الإدارة.")}</div>`;
  const selected =
    chapters.find((chapter) => chapter.id === state.chapterId) || chapters[0];
  state.chapterId = selected.id;
  return `<div class="shell"><div class="page-heading"><div><span class="eyebrow">المنهج الدراسي</span><h1 class="headline">منهج التجويد</h1><p class="sub">${curriculumPercent()}% مكتمل في رحلتك التعليمية.</p></div><input class="search" oninput="filterCurriculum(this.value)" placeholder="ابحث عن درس أو قاعدة…" aria-label="البحث في المنهج"></div><section class="curriculum"><aside class="card side-topic" aria-label="أبواب المنهج">${chapters.map((chapter) => `<button class="topic-link ${chapter.id === selected.id ? "active" : ""}" onclick="selectChapter('${esc(chapter.id)}')">${esc(chapter.name)}<small>${chapterPercent(chapter)}% مكتمل · ${chapter.lessons.length} دروس</small></button>`).join("")}</aside><div class="card lesson-list"><div class="topic-header"><span class="eyebrow">الباب ${selected.order} · ${chapterPercent(selected)}% مكتمل</span><h2>${esc(selected.name)}</h2>${progressBar(chapterPercent(selected))}</div><div id="curriculum-results">${lessonRows(selected.lessons.map((lesson) => ({ ...lesson, chapter: selected })))}</div></div></section></div>`;
}
function lesson() {
  const lessonObj = findLesson(state.lessonId);
  if (!lessonObj) return empty("الدرس غير موجود.");
  const lessons = allLessons(),
    index = lessons.findIndex((item) => item.id === lessonObj.id),
    previous = lessons[index - 1],
    next = lessons[index + 1];
  const recordings = lessonObj.recordings
    .slice()
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const boardImage = (lessonObj.resources || []).find((r) => r.kind === "صورة" && r.fileUrl);
  const heroUrl = boardImage ? mediaUrl(boardImage.fileUrl) : "";
  const boardHero = boardImage
    ? `<div class="lesson-hero" onclick="openImageOverlay('${esc(heroUrl)}', '${esc(lessonObj.title)}')" role="button" tabindex="0" aria-label="عرض صورة السبورة"><img src="${esc(heroUrl)}" alt="${esc(lessonObj.title)}" loading="lazy"><span class="lesson-hero-badge">عرض الصورة</span></div>`
    : "";
  return `<div class="shell lesson-page">${crumbs(["المنهج", lessonObj.chapter.name, lessonObj.title])}${boardHero}<h1>${esc(lessonObj.title)}</h1><p class="sub">${esc(lessonObj.description)}</p><section class="card objectives"><div class="section-title"><h3>أهداف الدرس</h3><button class="open" onclick="advanceLesson('${esc(lessonObj.id)}')">${lessonStatus(lessonObj.id) === "completed" ? "✓ مكتمل" : lessonStatus(lessonObj.id) === "in-progress" ? "تحديد كمكتمل" : "بدء الدرس"}</button></div><ul>${lessonObj.objectives.map((objective) => `<li>${esc(objective)}</li>`).join("")}</ul></section><section class="card recording-section"><div class="section-title"><h3>تسجيلات الدرس</h3></div>${
    recordings.length
      ? `${audioPlayer(recordings[0], "أحدث تسجيل")}${
          recordings.length > 1
            ? `<h4 class="archive-title">تسجيلات سابقة</h4>${recordings
                .slice(1)
                .map((recording) => audioPlayer(recording, "تسجيل سابق"))
                .join("")}`
            : ""
        }`
      : empty("لم يتم رفع تسجيل لهذا الدرس حتى الآن.")
  }</section><section class="card resource-block"><div class="section-title"><h3>الموارد والمرفقات</h3></div><div class="resources">${lessonObj.resources.map((resource) => resourceLink(resource, `رفع ${fmt(resource.uploadedAt)}`)).join("") || empty("لا تتوفر ملفات أو صور لهذا الدرس بعد.")}</div></section><nav class="lesson-pager" aria-label="التنقل بين الدروس">${previous ? `<button class="resource" onclick="openLesson('${esc(previous.id)}')">→ الدرس السابق<span>${esc(previous.title)}</span></button>` : "<span></span>"}<button class="open" onclick="selectChapter('${esc(lessonObj.chapter.id)}');go('curriculum')">العودة إلى الباب</button>${next ? `<button class="resource" onclick="openLesson('${esc(next.id)}')">الدرس التالي ←<span>${esc(next.title)}</span></button>` : "<span></span>"}</nav></div>`;
}
function quran() {
  return `<div class="shell"><div class="page-heading"><div><span class="eyebrow">التلاوة والتصحيح</span><h1 class="headline">القرآن</h1><p class="sub">اختر الحزب ثم الربع الذي تريد مراجعته.</p></div><div class="card progress-summary"><b>${completedQuarters().length} / ${totalQuarters()}</b>${progressBar(quranPercent())}<small>ربعاً مكتملًا</small></div></div><input id="quran-search" class="search quran-search" oninput="filterQuran(this.value)" placeholder="ابحث بالجزء أو الحزب أو الربع…" aria-label="البحث في القرآن"><section id="hizb-grid" class="hizb-grid">${data.hizbs.map(hizbCard).join("")}</section></div>`;
}
function hizbCard(hizb) {
  const text =
    `${hizb.juz} ${hizb.number} الجزء ${hizb.title} ${hizb.quarters.map((q) => `${q.number} ${q.name} ${q.notes}`).join(" ")}`.toLowerCase();
  return `<article class="card hizb-card" data-search="${esc(text)}"><div class="hizb-head"><span class="eyebrow">الجزء ${hizb.juz}</span><h3>${esc(hizb.title)}</h3></div><div class="hizb-quarters">${hizb.quarters
    .map((quarter) => {
      const done = completedQuarters().includes(quarter.id),
        available = quarter.recordings.length > 0;
      return `<button class="quarter-button ${done ? "done" : ""}" onclick="openQuarter('${esc(quarter.id)}')"><b>${esc(quarter.name)}</b><span>${done ? "✓ مكتمل" : available ? "● تسجيل متاح" : "بانتظار التسجيل"}</span></button>`;
    })
    .join("")}</div></article>`;
}
function quarter() {
  const quarterObj = findQuarter(state.quarterId);
  if (!quarterObj) return empty("الربع غير موجود.");
  const recordings = quarterObj.recordings
      .slice()
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
    done = completedQuarters().includes(quarterObj.id);
  return `<div class="shell lesson-page">${crumbs(["القرآن", `الجزء ${quarterObj.hizb.juz}`, quarterObj.hizb.title, quarterObj.name])}<h1>${quarterObj.hizb.title} · ${quarterObj.name}</h1><p class="sub">استمع إلى التصحيح وارجع إليه متى شئت.</p><section class="card recording-section"><div class="section-title"><h3>تسجيلات التصحيح</h3></div>${
    recordings.length
      ? `${audioPlayer(recordings[0], `${quarterObj.hizb.title} · ${quarterObj.name}`)}${
          recordings.length > 1
            ? `<h4 class="archive-title">تسجيلات سابقة</h4>${recordings
                .slice(1)
                .map((recording) =>
                  audioPlayer(
                    recording,
                    `${quarterObj.hizb.title} · ${quarterObj.name}`,
                  ),
                )
                .join("")}`
            : ""
        }`
      : empty("لا يوجد تسجيل مرفوع لهذا الربع حتى الآن.")
  }${quarterObj.notes ? `<p class="note"><b>ملاحظة الشيخ:</b> ${esc(quarterObj.notes)}</p>` : ""}${quarterObj.resources.length ? `<div class="resources">${quarterObj.resources.map((resource) => resourceLink(resource)).join("")}</div>` : ""}<button class="primary" onclick="toggleQuarter('${esc(quarterObj.id)}')">${done ? "✓ تمت المراجعة" : "تحديد كمكتمل"}</button></section></div>`;
}
function khutbahs() {
  const list = data.khutbahs
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="shell"><div class="page-heading"><div><span class="eyebrow">خطب ودروس عامة</span><h1 class="headline">الخطب</h1><p class="sub">مكتبة خطب الشيخ الأسبوعية.</p></div><input class="search" oninput="filterKhutbahs(this.value)" placeholder="ابحث في الخطب…" aria-label="البحث في الخطب"></div><section id="khutbah-grid" class="khutbahs">${list.map(khutbahCard).join("")}</section></div>`;
}
function khutbahCard(khutbah) {
  const recCount = (khutbah.recordings || []).length;
  return `<article class="card khutbah" data-search="${esc(`${khutbah.title} ${khutbah.description}`.toLowerCase())}"><div class="khutbah-body"><span class="eyebrow">خطبة الجمعة${recCount ? ` · ${recCount} تسجيل(ات)` : ""}</span><h3>${esc(khutbah.title)}</h3><p>${fmt(khutbah.date)}${khutbah.duration ? ` · ${khutbah.duration}` : ""}</p><button class="text-link" onclick="openKhutbah('${esc(khutbah.id)}')">استمع للخطبة ←</button></div></article>`;
}
function khutbah() {
  const item = data.khutbahs.find((khutbah) => khutbah.id === state.khutbahId);
  if (!item) return empty("الخطبة غير موجودة.");
  const recordings = item.recordings || [];
  const legacyRecording = item.audioUrl && !recordings.length
    ? [{ id: item.id, title: item.title, duration: item.duration, uploadedAt: item.date, audioUrl: item.audioUrl }]
    : [];
  const allRecordings = [...recordings, ...legacyRecording];
  const recordingsHtml = allRecordings.length
    ? allRecordings.map((rec) => `<div class="recording-section">${audioPlayer({ ...rec, uploadedAt: rec.uploadedAt || item.date }, "خطبة الجمعة")}</div>`).join("")
    : empty("لم يتم رفع تسجيل لهذه الخطبة بعد.");
  const resourcesHtml = (item.resources || []).length
    ? `<div class="resources">${item.resources.map((resource) => resourceLink(resource)).join("")}</div>`
    : "";
  return `<div class="shell lesson-page">${crumbs(["الخطب", item.title])}<h1>${esc(item.title)}</h1><p class="sub">${fmt(item.date)}</p><section class="card recording-section"><p>${esc(item.description)}</p>${recordingsHtml}${resourcesHtml}</section></div>`;
}
function profile() {
  const last = resolveLastLesson();
  const lastQuarter = resolveLastQuarter();
  const activity = progressCache.activity;
  return `<div class="shell profile"><div class="profile-head"><div class="avatar">${esc(state.session.name.slice(0, 2))}</div><div><h1 class="headline" style="margin:0">${esc(state.session.name)}</h1><p class="sub">طالب في مدرسة القرآن</p></div></div><section class="grid activity-grid"><article class="card"><span class="eyebrow">آخر درس</span><h3>${last ? esc(last.title) : "لم تبدأ بعد"}</h3>${last ? `<button class="text-link" onclick="openLesson('${esc(last.id)}')">استئناف الدرس ←</button>` : `<button class="text-link" onclick="go('curriculum')">استكشف المنهج ←</button>`}</article><article class="card"><span class="eyebrow">آخر ربع</span><h3>${lastQuarter ? `${esc(lastQuarter.hizb.title)} · ${esc(lastQuarter.name)}` : "لم تُراجع بعد"}</h3>${lastQuarter ? `<button class="text-link" onclick="openQuarter('${esc(lastQuarter.id)}')">فتح الربع ←</button>` : `<button class="text-link" onclick="go('quran')">عرض القرآن ←</button>`}</article><article class="card"><span class="eyebrow">تقدّم المنهج</span><h3>${allLessons().filter((lesson) => lessonStatus(lesson.id) === "completed").length} من ${allLessons().length} درس</h3>${progressBar(curriculumPercent())}</article></section><section class="card" style="margin-top:17px"><div class="section-title"><h3>نشاط الاستماع الأخير</h3></div>${activity.length ? activity.map((item) => `<div class="activity-row"><b>${esc(item.title)}</b><span>${esc(item.kind)} · ${fmt(item.date)}</span></div>`).join("") : empty("ابدأ الاستماع إلى أي تسجيل ليظهر نشاطك هنا.")}</section><section class="card" style="margin-top:17px"><div class="section-title"><h3>نشاط أسبوعي</h3></div>${activityHeatmap()}</section></div>`;
}
function search() {
  return `<div class="shell"><div class="page-heading"><div><span class="eyebrow">بحث شامل</span><h1 class="headline">ابحث في محتوى التعلّم</h1><p class="sub">الدروس والأبواب والقرآن والخطب في مكان واحد.</p></div><input id="global-search" autofocus class="search" oninput="filterGlobal(this.value)" placeholder="مثال: الإقلاب" aria-label="بحث شامل"></div><section id="global-results">${empty("اكتب كلمة للبحث في جميع المحتوى.")}</section></div>`;
}
function updateCard(type, title, meta, action) {
  return `<button class="update" onclick="${action}"><div class="update-type">${esc(type)}</div><h4>${esc(title)}</h4><p>${esc(meta)}</p></button>`;
}
