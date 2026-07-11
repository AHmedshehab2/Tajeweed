/* Client-side LMS prototype. Content and learner state are persisted separately for future API replacement. */
const API_BASE = window.API_BASE || 'http://localhost:4000/api';
const STORAGE = { lastLesson:'tajweed-last-lesson', lastQuarter:'tajweed-last-quarter', theme:'tajweed-theme', token:'tajweed-token', user:'tajweed-user' };
const clone = value => JSON.parse(JSON.stringify(value));
const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmt = date => new Intl.DateTimeFormat('ar-EG',{day:'numeric',month:'long',year:'numeric'}).format(new Date(date));
const TODAY = new Date().toISOString().slice(0,10);

function getToken(){ return localStorage.getItem(STORAGE.token) }
function setToken(token){ token ? localStorage.setItem(STORAGE.token, token) : localStorage.removeItem(STORAGE.token) }

async function apiFetch(path, options = {}){
  const headers = Object.assign({}, options.headers);
  if(!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if(token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if(res.status === 401){ logout(); throw new Error('غير مصرح'); }
  if(!res.ok){ const body = await res.json().catch(()=>({})); throw new Error(body.error || 'حدث خطأ في الاتصال بالخادم'); }
  return res.status === 204 ? null : res.json();
}

async function loadAll(){
  const [content, progress] = await Promise.all([apiFetch('/content'), apiFetch('/progress/me')]);
  data = content;
  progressCache = { lessons: progress.lessons, quarters: progress.quarters, activity: progress.activity };
  const firstLesson = getFirstLesson();
  const firstQuarter = getFirstQuarter();
  if (firstLesson && !findLesson(state.lessonId)) state.lessonId = firstLesson.id;
  if (firstQuarter && !findQuarter(state.quarterId)) state.quarterId = firstQuarter.id;
  if (!state.chapterId && data.chapters[0]) state.chapterId = data.chapters[0].id;
}

function defaultContent(){
  const chapters = [
    {id:'noon',name:'باب النون الساكنة والتنوين',description:'قواعد النون الساكنة والتنوين وتطبيقاتها.',order:1,lessons:[
      {id:'izhar',title:'أحكام الإظهار',description:'التعريف بحروف الإظهار وأمثلة عملية من القرآن الكريم.',objectives:['تمييز حروف الإظهار الستة','تطبيق الإظهار عند التلاوة'],recordings:[{id:'r-izhar',title:'شرح أحكام الإظهار',duration:'36:12',uploadedAt:'2026-06-05',version:1,audioUrl:''}],resources:[{id:'res-izhar',title:'مذكرة الإظهار',kind:'PDF',uploadedAt:'2026-06-05'}]},
      {id:'idgham',title:'أحكام الإدغام',description:'الإدغام بغنة وبغير غنة مع التطبيقات العملية.',objectives:['التفريق بين نوعي الإدغام','معرفة حروف يرملون'],recordings:[{id:'r-idgham-2',title:'مراجعة الإدغام',duration:'18:40',uploadedAt:'2026-06-13',version:2,audioUrl:''},{id:'r-idgham-1',title:'الشرح الأسبوعي للإدغام',duration:'42:06',uploadedAt:'2026-06-11',version:1,audioUrl:''}],resources:[{id:'res-idgham',title:'مذكرة الإدغام',kind:'PDF',uploadedAt:'2026-06-11'}]},
      {id:'iqlab',title:'أحكام الإقلاب',description:'قلب النون الساكنة والتنوين ميماً مخفاة عند الباء.',objectives:['معرفة حرف الإقلاب','فهم الإخفاء الشفوي'],recordings:[],resources:[{id:'res-iqlab',title:'مخطط أحكام الإقلاب',kind:'صورة سبورة',uploadedAt:'2026-06-18'}]},
      {id:'ikhfa',title:'أحكام الإخفاء',description:'مراتب الإخفاء وحروفه الخمسة عشر.',objectives:['حفظ حروف الإخفاء','تمييز مراتب الإخفاء'],recordings:[],resources:[]}
    ]},
    {id:'meem',name:'باب الميم الساكنة',description:'أحكام الميم الساكنة.',order:2,lessons:[
      {id:'ikhfa-shafawi',title:'الإخفاء الشفوي',description:'أحكام الميم الساكنة عند الباء.',objectives:['معرفة مواضع الإخفاء الشفوي'],recordings:[],resources:[]},
      {id:'idgham-mimi',title:'الإدغام الشفوي',description:'إدغام الميم الساكنة في مثلها.',objectives:['تطبيق الإدغام الشفوي'],recordings:[],resources:[]}
    ]},
    {id:'madd',name:'المدود',description:'المدود وأسبابها ومقاديرها.',order:3,lessons:[{id:'natural-madd',title:'المد الطبيعي',description:'مقدار المد الأصلي وأسبابه.',objectives:['معرفة مقدار المد الطبيعي'],recordings:[],resources:[]}]}
  ];
  const hizbs = Array.from({length:60},(_,index)=>{const number=index+1; return {id:`h${number}`,number,title:`الحزب ${number}`,juz:Math.ceil(number/2),quarters:['الأول','الثاني','الثالث','الرابع'].map((name,i)=>({id:`h${number}q${i+1}`,number:i+1,name:`الربع ${name}`,notes:number===3&&i===1?'مواضع تحتاج عناية عند الوصل.':'',recordings:number===3&&i===1?[{id:'q-correction-2',title:'تصحيح تلاوة الربع الثاني',duration:'18:06',uploadedAt:'2026-06-15',version:2,audioUrl:''},{id:'q-correction-1',title:'التصحيح السابق',duration:'15:21',uploadedAt:'2026-06-08',version:1,audioUrl:''}]:[],resources:[]}))}});
  return {chapters,hizbs,khutbahs:[
    {id:'k1',title:'الاستقامة طريق النجاة',date:'2026-06-14',description:'خطبة حول الثبات على طاعة الله في تقلبات الحياة.',duration:'28:06',audioUrl:'',resources:[]},
    {id:'k2',title:'فضل الذكر في حياة المسلم',date:'2026-06-07',description:'تذكير بفضل ذكر الله وأثره على القلب.',duration:'31:22',audioUrl:'',resources:[]},
    {id:'k3',title:'القرآن ربيع القلوب',date:'2026-05-31',description:'كيف نجعل القرآن رفيقاً يومياً لنا.',duration:'26:44',audioUrl:'',resources:[]}
  ],announcements:[{id:'a1',title:'لا يوجد درس هذا الأسبوع',body:'يستأنف الدرس القادم يوم السبت بإذن الله.',target:'all',priority:'important',publishedAt:'2026-06-16',expiresAt:'2026-07-18'}]};
}
function read(key,fallback){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback}catch(_){return fallback}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value))}
function currentTheme(){return read(STORAGE.theme, window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')}
function applyTheme(){document.documentElement.setAttribute('data-theme',currentTheme())}
function toggleTheme(){write(STORAGE.theme,currentTheme()==='dark'?'light':'dark');applyTheme();render()}
let data = {chapters:[],hizbs:[],khutbahs:[],announcements:[]};
let state = {page:'home',session:read(STORAGE.user,null),chapterId:'noon',lessonId:read(STORAGE.lastLesson,'iqlab'),quarterId:read(STORAGE.lastQuarter,'h3q2'),khutbahId:'k1',adminTab:'overview',chapterEditor:null,lessonEditor:null};
let activeAudio = null;
let progressCache = {lessons:{}, quarters:[], activity:[]};

const $ = selector => document.querySelector(selector);
const allLessons = () => orderedChapters().flatMap(chapter=>chapter.lessons.map(lesson=>({...lesson,chapter})));
const orderedChapters = () => data.chapters.slice().sort((a,b)=>a.order-b.order || a.name.localeCompare(b.name,'ar'));
const findLesson = id => allLessons().find(item=>item.id===id);
const findQuarter = id => data.hizbs.flatMap(hizb=>hizb.quarters.map(quarter=>({...quarter,hizb}))).find(quarter=>quarter.id===id);
const getFirstLesson = () => allLessons()[0] || null;
const getFirstQuarter = () => data.hizbs.flatMap(hizb=>hizb.quarters.map(quarter=>({...quarter,hizb}))).find(Boolean) || null;
const getSavedLesson = () => findLesson(read(STORAGE.lastLesson,state.lessonId)) || getFirstLesson();
const getSavedQuarter = () => findQuarter(read(STORAGE.lastQuarter,state.quarterId)) || getFirstQuarter();
const progressLessons = () => progressCache.lessons;
const lessonStatus = id => progressCache.lessons[id] || 'not-started';
const completedQuarters = () => progressCache.quarters;
const chapterPercent = chapter => chapter.lessons.length ? Math.round(chapter.lessons.filter(lesson=>lessonStatus(lesson.id)==='completed').length/chapter.lessons.length*100) : 0;
const curriculumPercent = () => { const lessons=allLessons(); return lessons.length ? Math.round(lessons.filter(lesson=>lessonStatus(lesson.id)==='completed').length/lessons.length*100) : 0; };
const quranPercent = () => Math.round(completedQuarters().length/240*100);
const audioPlayer = (recording,label) => `<div class="audio rich-audio"><button class="play" aria-label="تشغيل ${esc(recording.title)}" onclick="playRecording(this,'${recording.id}')">▶</button><div class="audio-title"><b>${esc(recording.title)}</b><span>${esc(label)} · رفع ${fmt(recording.uploadedAt)} · ${recording.duration}${recording.version?` · الإصدار ${recording.version}`:''}</span><div class="seek-row"><span>00:00</span><input type="range" min="0" max="100" value="0" aria-label="موقع التسجيل" oninput="this.previousElementSibling.textContent='00:'+String(Math.round(this.value*.6)).padStart(2,'0')"><span>${recording.duration}</span></div></div><button class="speed" onclick="cycleSpeed(this)" aria-label="تغيير سرعة التشغيل">1×</button></div>`;
const progressBar = value => `<div class="progress-line" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><i style="width:${value}%"></i></div>`;
const empty = text => `<div class="empty-state"><span>◌</span><p>${esc(text)}</p></div>`;
const crumbs = items => `<nav class="breadcrumb" aria-label="مسار الصفحة">${items.map(esc).join(' ← ')}</nav>`;

function getRecentUploads(limit=5){
  const items = [];
  // Lesson recordings and resources
  allLessons().forEach(lesson=>{
    lesson.recordings.forEach(rec=>items.push({uploadedAt:rec.uploadedAt,title:rec.title,meta:rec.duration,section:`درس`,action:`openLesson('${lesson.id}')`}));
    lesson.resources.forEach(res=>items.push({uploadedAt:res.uploadedAt,title:res.title,meta:res.kind,section:`درس`,action:`openLesson('${lesson.id}')`}));
  });
  // Quran quarter recordings and resources
  data.hizbs.forEach(hizb=>{
    hizb.quarters.forEach(quarter=>{
      quarter.recordings.forEach(rec=>items.push({uploadedAt:rec.uploadedAt,title:rec.title,meta:rec.duration,section:`${hizb.title} · ${quarter.name}`,action:`openQuarter('${quarter.id}')`}));
      quarter.resources.forEach(res=>items.push({uploadedAt:res.uploadedAt,title:res.title,meta:res.kind,section:`${hizb.title} · ${quarter.name}`,action:`openQuarter('${quarter.id}')`}));
    })
  });
  // Khutbahs and their resources
  data.khutbahs.forEach(k=>{
    if(k.date || k.audioUrl) items.push({uploadedAt:k.date||TODAY,title:k.title,meta:k.duration,section:`خطبة`,action:`openKhutbah('${k.id}')`});
    k.resources.forEach(res=>items.push({uploadedAt:res.uploadedAt,title:res.title,meta:res.kind,section:`خطبة`,action:`openKhutbah('${k.id}')`}));
  });
  return items.sort((a,b)=>String(b.uploadedAt).localeCompare(String(a.uploadedAt))).slice(0,limit);
}

function render(){
  document.documentElement.lang='ar'; document.documentElement.dir='rtl'; document.title='مدرسة القرآن';
  $('#app').innerHTML = state.session ? `${nav()}<main>${({home,curriculum,lesson,quran,quarter,khutbahs,khutbah,profile,admin,search}[state.page] || home)()}</main>${mobileNav()}` : login();
  // Post-render: replace home updates with the dynamic recent uploads
  if(state.session && state.page==='home'){
    const recent = getRecentUploads(5);
    const recentHtml = recent.length ? recent.map(item=>updateCard(item.section,item.title,`رفع ${fmt(item.uploadedAt)}${item.meta?` · ${item.meta}`:''}`,item.action)).join('') : empty('لا توجد موارد حديثة.');
    document.querySelectorAll('.updates').forEach(el=>el.innerHTML = recentHtml);
  }
}
function nav(){return `<header class="topbar"><div class="shell"><button class="brand" onclick="go('home')"><span class="brand-mark">م</span>مدرسة القرآن</button><nav class="nav" aria-label="التنقل الرئيسي">${[['home','الرئيسية'],['curriculum','المنهج'],['quran','القرآن'],['khutbahs','الخطب'],['profile','حسابي']].map(([page,label])=>`<button class="${state.page===page?'active':''}" onclick="go('${page}')">${label}</button>`).join('')}</nav><div class="actions"><button class="theme-toggle" onclick="toggleTheme()" aria-label="تبديل المظهر">${currentTheme()==='dark'?'☀':'☾'}</button><button class="icon-btn" onclick="go('search')" aria-label="بحث">⌕</button><button class="icon-btn" onclick="go('admin')" aria-label="لوحة الإدارة">⚙</button><button class="avatar" onclick="go('profile')">${esc(state.session.name.slice(0,2))}</button><button class="text-link" onclick="logout()">خروج</button></div></div></header>`}
function mobileNav(){return `<nav class="mobile-nav" aria-label="تنقل الجوال">${[['home','الرئيسية'],['curriculum','المنهج'],['quran','القرآن'],['khutbahs','الخطب'],['profile','حسابي']].map(([page,label])=>`<button class="${state.page===page?'active':''}" onclick="go('${page}')">${label}</button>`).join('')}</nav>`}
function login(){return `<main class="login"><button class="theme-toggle login-theme-toggle" onclick="toggleTheme()" aria-label="تبديل المظهر">${currentTheme()==='dark'?'☀':'☾'}</button><section class="card login-card"><div class="brand"><span class="brand-mark">م</span>مدرسة القرآن</div><h1 class="headline">مرحباً بعودتك</h1><p class="sub">سجل دخولك لمتابعة رحلة تعلّم التجويد.</p><form onsubmit="signIn(event)"><div class="field"><label for="email">البريد الإلكتروني</label><input id="email" required type="email" value="ahmed@example.com"></div><div class="field"><label for="password">كلمة المرور</label><input id="password" required type="password" value="student"></div><button class="primary" type="submit">تسجيل الدخول</button></form><p class="compact">تجربة: <button class="text-link" onclick="quickLogin('student')">طالب</button> أو <button class="text-link" onclick="quickLogin('admin')">مدير</button></p></section></main>`}
function home(){
  const last = getSavedLesson();
  const lastQuarter = getSavedQuarter();
  const lessonRecording=allLessons().flatMap(lesson=>lesson.recordings.map(recording=>({lesson,recording}))).sort((a,b)=>b.recording.uploadedAt.localeCompare(a.recording.uploadedAt))[0];
  const quranRecording=data.hizbs.flatMap(hizb=>hizb.quarters.flatMap(quarter=>quarter.recordings.map(recording=>({hizb,quarter,recording})))).sort((a,b)=>b.recording.uploadedAt.localeCompare(a.recording.uploadedAt))[0];
  const khutbah=data.khutbahs.slice().sort((a,b)=>b.date.localeCompare(a.date))[0];
  const announcements=data.announcements.filter(item=>!item.expiresAt||item.expiresAt>=TODAY);
  const recent = getRecentUploads(5);
  const recentHtml = recent.length ? recent.map(item=>updateCard(item.section,item.title,`رفع ${fmt(item.uploadedAt)}${item.meta?` · ${item.meta}`:''}`,item.action)).join('') : empty('لا توجد موارد حديثة.');
  return `<div class="shell"><div class="home-head"><img class="home-avatar" src="${esc(state.session.avatar||'home.jpg')}" alt="صورة المدير" loading="lazy"><div><span class="eyebrow">السلام عليكم، ${esc(state.session.name)}</span><h1 class="headline">إِنَّ الَّذِينَ يَتْلُونَ كِتَابَ اللَّهِ وَأَقَامُوا الصَّلَاةَ وَأَنفَقُوا مِمَّا رَزَقْنَاهُمْ سِرًّا وَعَلَانِيَةً يَرْجُونَ تِجَارَةً لَّن تَبُورَ</h1></div></div><p class="sub">كل ما تحتاجه لمتابعة دروسك ومراجعة تلاوتك، في مكان واحد.</p><section class="grid dashboard-grid"><article class="card hero"><span class="eyebrow">تابع التعلّم</span><h2>${esc(last.title)}</h2><p>${esc(last.chapter.name)}</p><div class="lesson-path"><span>آخر درس زرته</span><span>•</span><b>${lessonStatus(last.id)==='completed'?'اكتمل — انتقل لما بعده':'تابع من حيث توقفت'}</b></div><button class="primary" onclick="openLesson('${last.id}')">تابع التعلّم ←</button></article><article class="card"><div class="section-title"><h3>تقدمك في القرآن</h3><button class="text-link" onclick="go('quran')">عرض القرآن</button></div><div class="progress-ring" style="background:conic-gradient(var(--gold) 0 ${quranPercent()}%,var(--line) ${quranPercent()}%)"><div>${quranPercent()}%<small>${completedQuarters().length} من 240 ربعاً</small></div></div><p class="compact">آخر ربع: <button class="text-link" onclick="openQuarter('${lastQuarter.id}')">${esc(lastQuarter.hizb.title)} · ${esc(lastQuarter.name)}</button></p></article><div class="updates">${lessonRecording?updateCard('أحدث تسجيل درس',lessonRecording.lesson.title,`رفع ${fmt(lessonRecording.recording.uploadedAt)} · ${lessonRecording.recording.duration}`,`openLesson('${lessonRecording.lesson.id}')`):empty('لا توجد تسجيلات دروس بعد.')}${quranRecording?updateCard('أحدث تصحيح قرآن',`${quranRecording.hizb.title} · ${quranRecording.quarter.name}`,`رفع ${fmt(quranRecording.recording.uploadedAt)} · ${quranRecording.recording.duration}`,`openQuarter('${quranRecording.quarter.id}')`):empty('لا توجد تسجيلات قرآن بعد.')}${updateCard('أحدث خطبة',khutbah.title,`${fmt(khutbah.date)} · ${khutbah.duration}`,`openKhutbah('${khutbah.id}')`)}</div></section><section class="recent-section"><div class="section-title"><div><span class="eyebrow">هذا الأسبوع</span><h3>أضيف حديثاً</h3></div></div><div class="updates">${lessonRecording?updateCard('درس',lessonRecording.recording.title,lessonRecording.lesson.title,`openLesson('${lessonRecording.lesson.id}')`):''}${quranRecording?updateCard('القرآن',quranRecording.recording.title,`${quranRecording.hizb.title} · ${quranRecording.quarter.name}`,`openQuarter('${quranRecording.quarter.id}')`):''}${updateCard('خطبة',khutbah.title,fmt(khutbah.date),`openKhutbah('${khutbah.id}')`)}</div></section><section class="announcement-stack">${announcements.map(item=>`<article class="announcement ${item.priority==='important'?'important':''}"><span class="announce-tag">${item.priority==='important'?'مهم':'تذكير'} · ${item.target==='all'?'لكل الطلاب':esc(item.target)}</span><strong>${esc(item.title)}:</strong> ${esc(item.body)}</article>`).join('')}</section></div>`;
}
function updateCard(type,title,meta,action){return `<button class="update" onclick="${action}"><div class="update-type">${esc(type)}</div><h4>${esc(title)}</h4><p>${esc(meta)}</p></button>`}
function curriculum(){const chapters=orderedChapters(); const selected=chapters.find(chapter=>chapter.id===state.chapterId)||chapters[0]; state.chapterId=selected?.id; return `<div class="shell"><div class="page-heading"><div><span class="eyebrow">المنهج الدراسي</span><h1 class="headline">منهج التجويد</h1><p class="sub">${curriculumPercent()}% مكتمل في رحلتك التعليمية.</p></div><input class="search" oninput="filterCurriculum(this.value)" placeholder="ابحث عن درس أو قاعدة…" aria-label="البحث في المنهج"></div><section class="curriculum"><aside class="card side-topic" aria-label="أبواب المنهج">${chapters.map(chapter=>`<button class="topic-link ${chapter.id===selected.id?'active':''}" onclick="selectChapter('${chapter.id}')">${esc(chapter.name)}<small>${chapterPercent(chapter)}% مكتمل · ${chapter.lessons.length} دروس</small></button>`).join('')}</aside><div class="card lesson-list"><div class="topic-header"><span class="eyebrow">الباب ${selected.order} · ${chapterPercent(selected)}% مكتمل</span><h2>${esc(selected.name)}</h2>${progressBar(chapterPercent(selected))}</div><div id="curriculum-results">${lessonRows(selected.lessons.map(lesson=>({...lesson,chapter:selected})))}</div></div></section></div>`}
function lessonRows(lessons){return lessons.length?lessons.map((lesson,index)=>{const status=lessonStatus(lesson.id),statusLabel=status==='completed'?'✓ مكتمل':status==='in-progress'?'قيد التقدم':'لم يبدأ';return `<article class="lesson-row"><span class="number">${String(index+1).padStart(2,'0')}</span><div><h3>${esc(lesson.title)}</h3><p>${esc(lesson.description)}</p></div><span class="status status-${status}">${statusLabel}</span><button class="open" onclick="openLesson('${lesson.id}')">فتح الدرس</button></article>`}).join(''):empty('لا توجد نتائج مطابقة.')}
function lesson(){const lesson=findLesson(state.lessonId); if(!lesson)return empty('الدرس غير موجود.'); const lessons=allLessons(),index=lessons.findIndex(item=>item.id===lesson.id),previous=lessons[index-1],next=lessons[index+1]; const recordings=lesson.recordings.slice().sort((a,b)=>b.uploadedAt.localeCompare(a.uploadedAt)); return `<div class="shell lesson-page">${crumbs(['المنهج',lesson.chapter.name,lesson.title])}<h1>${esc(lesson.title)}</h1><p class="sub">${esc(lesson.description)}</p><section class="card objectives"><div class="section-title"><h3>أهداف الدرس</h3><button class="open" onclick="advanceLesson('${lesson.id}')">${lessonStatus(lesson.id)==='completed'?'✓ مكتمل':lessonStatus(lesson.id)==='in-progress'?'تحديد كمكتمل':'بدء الدرس'}</button></div><ul>${lesson.objectives.map(objective=>`<li>${esc(objective)}</li>`).join('')}</ul></section><section class="card recording-section"><div class="section-title"><h3>تسجيلات الدرس</h3></div>${recordings.length?`${audioPlayer(recordings[0],'أحدث تسجيل')}${recordings.length>1?`<h4 class="archive-title">تسجيلات سابقة</h4>${recordings.slice(1).map(recording=>audioPlayer(recording,'تسجيل سابق')).join('')}`:''}`:empty('لم يتم رفع تسجيل لهذا الدرس حتى الآن.')}</section><section class="card resource-block"><div class="section-title"><h3>الموارد والمرفقات</h3></div><div class="resources">${lesson.resources.map(resource=>`<button class="resource">▤ ${esc(resource.title)}<span>${esc(resource.kind)} · رفع ${fmt(resource.uploadedAt)}</span></button>`).join('')||empty('لا تتوفر ملفات أو صور لهذا الدرس بعد.')}</div></section><nav class="lesson-pager" aria-label="التنقل بين الدروس">${previous?`<button class="resource" onclick="openLesson('${previous.id}')">→ الدرس السابق<span>${esc(previous.title)}</span></button>`:'<span></span>'}<button class="open" onclick="selectChapter('${lesson.chapter.id}');go('curriculum')">العودة إلى الباب</button>${next?`<button class="resource" onclick="openLesson('${next.id}')">الدرس التالي ←<span>${esc(next.title)}</span></button>`:'<span></span>'}</nav></div>`}
function quran(){return `<div class="shell"><div class="page-heading"><div><span class="eyebrow">التلاوة والتصحيح</span><h1 class="headline">القرآن</h1><p class="sub">اختر الحزب ثم الربع الذي تريد مراجعته.</p></div><div class="card progress-summary"><b>${completedQuarters().length} / 240</b>${progressBar(quranPercent())}<small>ربعاً مكتملًا</small></div></div><input id="quran-search" class="search quran-search" oninput="filterQuran(this.value)" placeholder="ابحث بالجزء أو الحزب أو الربع…" aria-label="البحث في القرآن"><section id="hizb-grid" class="hizb-grid">${data.hizbs.map(hizbCard).join('')}</section></div>`}
function hizbCard(hizb){const text=`${hizb.juz} ${hizb.number} الجزء ${hizb.title} ${hizb.quarters.map(q=>`${q.number} ${q.name} ${q.notes}`).join(' ')}`.toLowerCase();return `<article class="card hizb-card" data-search="${esc(text)}"><div class="hizb-head"><span class="eyebrow">الجزء ${hizb.juz}</span><h3>${esc(hizb.title)}</h3></div><div class="hizb-quarters">${hizb.quarters.map(quarter=>{const done=completedQuarters().includes(quarter.id),available=quarter.recordings.length>0;return `<button class="quarter-button ${done?'done':''}" onclick="openQuarter('${quarter.id}')"><b>${esc(quarter.name)}</b><span>${done?'✓ مكتمل':available?'● تسجيل متاح':'بانتظار التسجيل'}</span></button>`}).join('')}</div></article>`}
function quarter(){const quarter=findQuarter(state.quarterId);if(!quarter)return empty('الربع غير موجود.');const recordings=quarter.recordings.slice().sort((a,b)=>b.uploadedAt.localeCompare(a.uploadedAt)),done=completedQuarters().includes(quarter.id);return `<div class="shell lesson-page">${crumbs(['القرآن',`الجزء ${quarter.hizb.juz}`,quarter.hizb.title,quarter.name])}<h1>${quarter.hizb.title} · ${quarter.name}</h1><p class="sub">استمع إلى التصحيح وارجع إليه متى شئت.</p><section class="card recording-section"><div class="section-title"><h3>تسجيلات التصحيح</h3></div>${recordings.length?`${audioPlayer(recordings[0],`${quarter.hizb.title} · ${quarter.name}`)}${recordings.length>1?`<h4 class="archive-title">تسجيلات سابقة</h4>${recordings.slice(1).map(recording=>audioPlayer(recording,`${quarter.hizb.title} · ${quarter.name}`)).join('')}`:''}`:empty('لا يوجد تسجيل مرفوع لهذا الربع حتى الآن.')}${quarter.notes?`<p class="note"><b>ملاحظة الشيخ:</b> ${esc(quarter.notes)}</p>`:''}${quarter.resources.length?`<div class="resources">${quarter.resources.map(resource=>`<button class="resource">▤ ${esc(resource.title)}<span>${esc(resource.kind)}</span></button>`).join('')}</div>`:''}<button class="primary" onclick="toggleQuarter('${quarter.id}')">${done?'✓ تمت المراجعة':'تحديد كمكتمل'}</button></section></div>`}
function khutbahs(){const list=data.khutbahs.slice().sort((a,b)=>b.date.localeCompare(a.date));return `<div class="shell"><div class="page-heading"><div><span class="eyebrow">خطب ودروس عامة</span><h1 class="headline">الخطب</h1><p class="sub">مكتبة خطب الشيخ الأسبوعية.</p></div><input class="search" oninput="filterKhutbahs(this.value)" placeholder="ابحث في الخطب…" aria-label="البحث في الخطب"></div><section id="khutbah-grid" class="khutbahs">${list.map(khutbahCard).join('')}</section></div>`}
function khutbahCard(khutbah){return `<article class="card khutbah" data-search="${esc(`${khutbah.title} ${khutbah.description}`.toLowerCase())}"><div class="khutbah-art">وَعِظْ</div><div class="khutbah-body"><span class="eyebrow">خطبة الجمعة</span><h3>${esc(khutbah.title)}</h3><p>${fmt(khutbah.date)} · ${khutbah.duration}</p><button class="text-link" onclick="openKhutbah('${khutbah.id}')">استمع للخطبة ←</button></div></article>`}
function khutbah(){const item=data.khutbahs.find(khutbah=>khutbah.id===state.khutbahId);if(!item)return empty('الخطبة غير موجودة.');return `<div class="shell lesson-page">${crumbs(['الخطب',item.title])}<h1>${esc(item.title)}</h1><p class="sub">${fmt(item.date)}</p><section class="card recording-section"><p>${esc(item.description)}</p>${audioPlayer({id:item.id,title:item.title,duration:item.duration,uploadedAt:item.date,audioUrl:item.audioUrl},'خطبة الجمعة')}<div class="resources">${item.resources.map(resource=>`<button class="resource">▤ ${esc(resource.title)}<span>${esc(resource.kind)}</span></button>`).join('')}</div></section></div>`}
function profile(){const last=getSavedLesson(),lastQuarter=getSavedQuarter(),activity=progressCache.activity;return `<div class="shell profile"><div class="profile-head"><div class="avatar">${esc(state.session.name.slice(0,2))}</div><div><h1 class="headline" style="margin:0">${esc(state.session.name)}</h1><p class="sub">طالب في مدرسة القرآن</p></div></div><section class="grid activity-grid"><article class="card"><span class="eyebrow">آخر درس</span><h3>${esc(last?.title || 'لا توجد دروس بعد')}</h3>${last?`<button class="text-link" onclick="openLesson('${last.id}')">استئناف الدرس ←</button>`:''}</article><article class="card"><span class="eyebrow">آخر ربع</span><h3>${lastQuarter?`${esc(lastQuarter.hizb.title)} · ${esc(lastQuarter.name)}`:'لا توجد أرباع بعد'}</h3>${lastQuarter?`<button class="text-link" onclick="openQuarter('${lastQuarter.id}')">فتح الربع ←</button>`:''}</article><article class="card"><span class="eyebrow">تقدّم المنهج</span><h3>${allLessons().filter(lesson=>lessonStatus(lesson.id)==='completed').length} من ${allLessons().length} درس</h3>${progressBar(curriculumPercent())}</article></section><section class="card" style="margin-top:17px"><div class="section-title"><h3>نشاط الاستماع الأخير</h3></div>${activity.length?activity.map(item=>`<div class="activity-row"><b>${esc(item.title)}</b><span>${esc(item.kind)} · ${fmt(item.date)}</span></div>`).join(''):empty('ابدأ الاستماع إلى أي تسجيل ليظهر نشاطك هنا.')}</section></div>`}
function search(){return `<div class="shell"><div class="page-heading"><div><span class="eyebrow">بحث شامل</span><h1 class="headline">ابحث في محتوى التعلّم</h1><p class="sub">الدروس والأبواب والقرآن والخطب في مكان واحد.</p></div><input id="global-search" autofocus class="search" oninput="filterGlobal(this.value)" placeholder="مثال: الإقلاب" aria-label="بحث شامل"></div><section id="global-results">${empty('اكتب كلمة للبحث في جميع المحتوى.')}</section></div>`}
function admin(){const isAdmin = String(state.session?.role || '').toUpperCase() === 'ADMIN'; if(!isAdmin)return `<div class="shell"><section class="card access-denied"><h1>هذه الصفحة خاصة بالإدارة</h1><p class="sub">سجل الدخول بحساب المدير للوصول إلى إدارة المحتوى.</p><button class="primary" onclick="logout()">تسجيل الدخول كمدير</button></section></div>`;const tabs=[['overview','نظرة عامة'],['upload','رفع مورد'],['curriculum','الأبواب والدروس'],['quran','القرآن'],['khutbahs','الخطب'],['announcements','الإعلانات']];return `<div class="shell"><div class="page-heading"><div><span class="eyebrow">منطقة خاصة</span><h1 class="headline">لوحة الإدارة</h1></div><button class="primary" style="margin:0" onclick="adminTab('upload')">+ رفع مورد</button></div><section class="admin-layout"><aside class="card admin-menu">${tabs.map(([id,label])=>`<button class="${state.adminTab===id?'active':''}" onclick="adminTab('${id}')">${label}</button>`).join('')}</aside><div class="card admin-content">${adminContent2()}</div></section></div>`}
function adminContent(){if(state.adminTab==='upload')return uploadForm();if(state.adminTab==='curriculum')return curriculumAdmin();if(state.adminTab==='quran')return `<h2>إدارة القرآن</h2>${adminTable(['الحزب','الجزء','الأرباع'],data.hizbs.map(h=>[h.title,`الجزء ${h.juz}`,'إدارة التسجيلات من «رفع مورد»']))}`;if(state.adminTab==='khutbahs')return `<h2>إدارة الخطب</h2>${adminTable(['العنوان','التاريخ','إدارة'],data.khutbahs.map(k=>[k.title,fmt(k.date),'رفع تسجيل أو ملف داعم']))}`;if(state.adminTab==='announcements')return `<h2>الإعلانات</h2>${adminTable(['العنوان','ينتهي في','الأولوية'],data.announcements.map(a=>[a.title,fmt(a.expiresAt),a.priority==='important'?'مهم':'عادي']))}`;return `<h2>آخر المحتوى</h2><p class="sub">أضف الملفات من «رفع مورد»، وأدر أبواب المنهج ودروسه من القسم المخصص.</p>${adminTable(['العنوان','النوع','التاريخ'],[['أحكام الإدغام','تسجيل درس','13 يونيو 2026'],['الحزب 3 · الربع الثاني','تصحيح قرآن','15 يونيو 2026'],['الاستقامة طريق النجاة','خطبة','14 يونيو 2026']])}`}
function adminTable(headers,rows){return `<div class="table-wrap"><table class="admin-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((cell,i)=>`<td data-label="${headers[i]}">${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
function chapterOptions(selected=''){return orderedChapters().map(chapter=>`<option value="${chapter.id}" ${chapter.id===selected?'selected':''}>${esc(chapter.name)}</option>`).join('')}
function curriculumAdmin(){const chapter=state.chapterEditor?data.chapters.find(item=>item.id===state.chapterEditor):null;const lesson=state.lessonEditor?findLesson(state.lessonEditor):null;return `<div class="admin-section"><div class="section-title"><h2>إدارة الأبواب والدروس</h2><button class="primary" style="margin:0" onclick="newChapter()">+ إضافة باب جديد</button></div>${chapterForm(chapter)}<section class="admin-list"><h3>الأبواب</h3>${orderedChapters().map(item=>`<article class="admin-item"><div><b>${esc(item.name)}</b><span>الترتيب ${item.order} · ${item.lessons.length} دروس</span></div><div><button class="open" onclick="editChapter('${item.id}')">تعديل</button><button class="text-link" onclick="deleteChapter('${item.id}')">حذف</button></div></article>`).join('')}</section><div class="section-title"><h3>الدروس</h3><button class="open" onclick="newLesson()">+ إضافة درس</button></div>${lessonForm(lesson)}<section class="admin-list">${allLessons().map(item=>`<article class="admin-item"><div><b>${esc(item.title)}</b><span>${esc(item.chapter.name)}</span></div><button class="open" onclick="editLesson('${item.id}')">تعديل أو نقل</button></article>`).join('')}</section></div>`}
function chapterForm(chapter){if(!state.chapterEditor && state.chapterEditor!== 'new')return '';const isNew=state.chapterEditor==='new';return `<form class="editor-form" onsubmit="saveChapter(event)"><h3>${isNew?'إضافة باب جديد':'تعديل الباب'}</h3><input type="hidden" id="chapter-id" value="${chapter?.id||''}"><div class="form-grid"><div class="field"><label>اسم الباب</label><input id="chapter-name" required value="${esc(chapter?.name||'')}"></div><div class="field"><label>الترتيب</label><input id="chapter-order" required type="number" min="1" value="${chapter?.order||data.chapters.length+1}"></div></div><div class="field"><label>وصف اختياري</label><input id="chapter-description" value="${esc(chapter?.description||'')}"></div><button class="primary" type="submit">حفظ الباب</button><button class="text-link" type="button" onclick="cancelEditors()">إلغاء</button></form>`}
function lessonForm(lesson){if(!state.lessonEditor && state.lessonEditor!=='new')return '';const isNew=state.lessonEditor==='new';return `<form class="editor-form" onsubmit="saveLesson(event)"><h3>${isNew?'إضافة درس':'تعديل أو نقل الدرس'}</h3><input type="hidden" id="lesson-id" value="${lesson?.id||''}"><input type="hidden" id="source-chapter" value="${lesson?.chapter.id||''}"><div class="form-grid"><div class="field"><label>عنوان الدرس</label><input id="lesson-title" required value="${esc(lesson?.title||'')}"></div><div class="field"><label>الباب</label><select id="lesson-chapter" required>${chapterOptions(lesson?.chapter.id)}</select></div></div><div class="field"><label>وصف</label><input id="lesson-description" value="${esc(lesson?.description||'')}"></div><button class="primary" type="submit">حفظ الدرس</button><button class="text-link" type="button" onclick="cancelEditors()">إلغاء</button></form>`}
function uploadForm(){return `<h2>رفع مورد جديد</h2><p class="sub">يرتبط كل ملف مباشرة بالدرس أو الربع أو الخطبة المختارة.</p><form class="upload-form" onsubmit="uploadResource(event)"><div class="form-grid"><div class="field"><label for="upload-area">قسم المحتوى</label><select id="upload-area" onchange="refreshUploadTargets()"><option value="curriculum">المنهج</option><option value="quran">القرآن</option><option value="khutbah">الخطب</option></select></div><div class="field"><label for="upload-target">المحتوى المرتبط</label><select id="upload-target">${uploadTargets('curriculum')}</select></div><div class="field"><label for="upload-title">عنوان المورد</label><input id="upload-title" required placeholder="مثال: تسجيل شرح الإظهار"></div><div class="field"><label for="upload-type">نوع المورد</label><select id="upload-type"><option value="recording">تسجيل صوتي</option><option value="pdf">ملف PDF أو مذكرة</option><option value="image">صورة سبورة / صورة</option><option value="attachment">ملف إضافي</option></select></div></div><div class="field upload-file"><label for="upload-file">اختر الملف</label><input id="upload-file" type="file" required accept="audio/*,.pdf,image/*,.doc,.docx,.ppt,.pptx"><small>يبقى الملف متاحاً داخل جلسة المتصفح؛ يحتاج الإنتاج الفعلي إلى خادم تخزين للملفات.</small></div><button class="primary" type="submit">رفع وإرفاق المورد</button></form>`}
function uploadTargets(area){if(area==='curriculum')return allLessons().map(item=>`<option value="${item.id}">${esc(item.chapter.name)} — ${esc(item.title)}</option>`).join('');if(area==='quran')return data.hizbs.flatMap(h=>h.quarters.map(q=>`<option value="${q.id}">${esc(h.title)} — ${esc(q.name)}</option>`)).join('');return data.khutbahs.map(item=>`<option value="${item.id}">${esc(item.title)}</option>`).join('')}

function go(page){state.page=page;render();window.scrollTo(0,0)}
function openLesson(id){if(!findLesson(id))return;state.lessonId=id;write(STORAGE.lastLesson,id);state.page='lesson';render();window.scrollTo(0,0)}
function openQuarter(id){if(!findQuarter(id))return;state.quarterId=id;write(STORAGE.lastQuarter,id);state.page='quarter';render();window.scrollTo(0,0)}
function openKhutbah(id){if(!data.khutbahs.some(item=>item.id===id))return;state.khutbahId=id;state.page='khutbah';render();window.scrollTo(0,0)}
function selectChapter(id){state.chapterId=id;state.page='curriculum';render()}
function filterCurriculum(query){const current=orderedChapters().find(chapter=>chapter.id===state.chapterId);const results=allLessons().filter(item=>`${item.title} ${item.description} ${item.chapter.name}`.includes(query.trim()));$('#curriculum-results').innerHTML=query.trim()?lessonRows(results):lessonRows(current.lessons.map(lesson=>({...lesson,chapter:current})))}
function filterQuran(query){
  const normalized = String(query||'').trim().toLowerCase();
  const grid = $('#hizb-grid');
  document.querySelectorAll('.hizb-card').forEach(card=>{
    const text = (card.dataset.search||'').toLowerCase();
    card.hidden = Boolean(normalized) && !text.includes(normalized);
  });
  const existing = grid && grid.querySelector('.no-results');
  const anyVisible = grid ? grid.querySelectorAll('.hizb-card:not([hidden])').length > 0 : true;
  if(normalized && !anyVisible){ if(!existing) grid.insertAdjacentHTML('beforeend', `<div class="no-results">${empty('لم يتم العثور على نتائج.')}</div>`); }
  else if(existing) existing.remove();
}
function filterKhutbahs(query){
  const normalized = String(query||'').trim().toLowerCase();
  document.querySelectorAll('.khutbah').forEach(card=>{
    const text = (card.dataset.search||'').toLowerCase();
    card.hidden = Boolean(normalized) && !text.includes(normalized);
  });
}
function filterGlobal(query){const term=query.trim().toLowerCase();if(!term){$('#global-results').innerHTML=empty('اكتب كلمة للبحث في جميع المحتوى.');return}const chapters=orderedChapters().filter(chapter=>chapter.name.toLowerCase().includes(term)),lessons=allLessons().filter(item=>`${item.title} ${item.description} ${item.chapter.name}`.toLowerCase().includes(term)),quarters=data.hizbs.flatMap(h=>h.quarters.map(q=>({...q,hizb:h}))).filter(item=>`${item.hizb.juz} ${item.hizb.number} ${item.hizb.title} ${item.number} ${item.name} ${item.notes}`.toLowerCase().includes(term)),khutbahItems=data.khutbahs.filter(item=>`${item.title} ${item.description}`.toLowerCase().includes(term));$('#global-results').innerHTML=`<section class="search-groups"><div class="card"><h3>الأبواب</h3>${chapters.length?chapters.map(chapter=>`<button class="search-result" onclick="selectChapter('${chapter.id}')">${esc(chapter.name)}<span>${chapter.lessons.length} دروس</span></button>`).join(''):empty('لا توجد أبواب مطابقة.')}</div><div class="card"><h3>الدروس</h3>${lessonRows(lessons)}</div><div class="card"><h3>القرآن</h3>${quarters.length?quarters.slice(0,12).map(item=>`<button class="search-result" onclick="openQuarter('${item.id}')">الجزء ${item.hizb.juz} · ${esc(item.hizb.title)} · ${esc(item.name)}</button>`).join(''):empty('لا توجد أرباع مطابقة.')}</div><div class="card"><h3>الخطب</h3>${khutbahItems.length?khutbahItems.map(item=>`<button class="search-result" onclick="openKhutbah('${item.id}')">${esc(item.title)}<span>${fmt(item.date)}</span></button>`).join(''):empty('لا توجد خطب مطابقة.')}</div></section>`}
async function advanceLesson(id){try{const {status}=await apiFetch(`/progress/lessons/${id}`,{method:'POST'});progressCache.lessons[id]=status;render()}catch(err){alert(err.message)}}
async function toggleQuarter(id){try{const {completed}=await apiFetch(`/progress/quarters/${id}`,{method:'POST'});progressCache.quarters=completed?[...progressCache.quarters,id]:progressCache.quarters.filter(item=>item!==id);render()}catch(err){alert(err.message)}}
function cycleSpeed(button){const values=['0.75×','1×','1.25×','1.5×'];button.textContent=values[(values.indexOf(button.textContent)+1)%values.length]}
function playRecording(button,id){button.textContent=button.textContent==='▶'?'❚❚':'▶';const recording=allLessons().flatMap(item=>item.recordings).concat(data.hizbs.flatMap(h=>h.quarters.flatMap(q=>q.recordings))).find(item=>item.id===id);const item=recording||data.khutbahs.find(k=>k.id===id);if(item){apiFetch('/progress/activity',{method:'POST',body:JSON.stringify({refId:id,title:item.title,kind:'استماع'})}).then(()=>{progressCache.activity=[{id,title:item.title,kind:'استماع',date:TODAY},...progressCache.activity.filter(entry=>entry.id!==id)].slice(0,5)}).catch(()=>{});if(item.audioUrl){if(activeAudio?.src!==item.audioUrl){activeAudio?.pause();activeAudio=new Audio(item.audioUrl)}activeAudio.paused?activeAudio.play().catch(()=>{}):activeAudio.pause()}}}
async function signIn(event){event.preventDefault();const email=$('#email').value.trim(),password=$('#password').value;try{const {token,user}=await apiFetch('/auth/login',{method:'POST',body:JSON.stringify({email,password})});setToken(token);write(STORAGE.user,user);state.session=user;await loadAll();render()}catch(err){alert(err.message)}}
async function quickLogin(role){const email=role==='admin'?'admin@example.com':'ahmed@example.com',password=role==='admin'?'admin':'student';try{const {token,user}=await apiFetch('/auth/login',{method:'POST',body:JSON.stringify({email,password})});setToken(token);write(STORAGE.user,user);state.session=user;await loadAll();render()}catch(err){alert(err.message)}}
function logout(){activeAudio?.pause();activeAudio=null;setToken(null);localStorage.removeItem(STORAGE.user);state.session=null;render()}
function adminTab(id){state.adminTab=id;state.chapterEditor=null;state.lessonEditor=null;render()}
function newChapter(){state.chapterEditor='new';render()}
function editChapter(id){state.chapterEditor=id;render()}
function cancelEditors(){state.chapterEditor=null;state.lessonEditor=null;render()}
async function saveChapter(event){event.preventDefault();const id=$('#chapter-id').value,name=$('#chapter-name').value.trim(),order=Number($('#chapter-order').value),description=$('#chapter-description').value.trim();if(!name||!Number.isFinite(order)||order<1)return;try{if(id)await apiFetch(`/chapters/${id}`,{method:'PATCH',body:JSON.stringify({name,order,description})});else await apiFetch('/chapters',{method:'POST',body:JSON.stringify({name,order,description})});await loadAll();state.chapterEditor=null;render()}catch(err){alert(err.message)}}
async function deleteChapter(id){const chapter=data.chapters.find(item=>item.id===id);if(!chapter)return;const message=chapter.lessons.length?`يحتوي هذا الباب على ${chapter.lessons.length} درس. هل تريد حذف الباب وكل دروسه؟`:'هل تريد حذف هذا الباب؟';if(!window.confirm(message))return;try{await apiFetch(`/chapters/${id}`,{method:'DELETE'});await loadAll();state.chapterId=orderedChapters()[0]?.id;render()}catch(err){alert(err.message)}}
function newLesson(){state.lessonEditor='new';render()}
function editLesson(id){state.lessonEditor=id;render()}
async function saveLesson(event){event.preventDefault();const id=$('#lesson-id').value,targetId=$('#lesson-chapter').value,title=$('#lesson-title').value.trim(),description=$('#lesson-description').value.trim();if(!targetId||!title)return;try{if(!id)await apiFetch('/lessons',{method:'POST',body:JSON.stringify({chapterId:targetId,title,description})});else await apiFetch(`/lessons/${id}`,{method:'PATCH',body:JSON.stringify({chapterId:targetId,title,description})});await loadAll();state.lessonEditor=null;render()}catch(err){alert(err.message)}}
function refreshUploadTargets(){const target=$('#upload-target');target.innerHTML=uploadTargets($('#upload-area').value)}
async function uploadResource(event){event.preventDefault();if(String(state.session?.role || '').toUpperCase() !== 'ADMIN')return;const area=$('#upload-area').value,targetId=$('#upload-target').value,title=$('#upload-title').value.trim(),type=$('#upload-type').value,file=$('#upload-file').files[0];if(!title||!file)return;const form=new FormData();form.append('area',area);form.append('targetId',targetId);form.append('title',title);form.append('type',type);form.append('file',file);try{await apiFetch('/upload',{method:'POST',body:form});await loadAll();event.target.reset();alert('تم رفع المورد وربطه بالمحتوى المختار.');render()}catch(err){alert(err.message)}}
function adminContent2(){
  if(state.adminTab==='announcements') return announcementsAdmin();
  return adminContent();
}

function announcementsAdmin(){
  const items = data.announcements.slice().sort((a,b)=>String(b.publishedAt||b.publishedAt||'').localeCompare(String(a.publishedAt||a.publishedAt||'')));
  return `<div class="admin-section"><div class="section-title"><h2>الإعلانات</h2><button class="primary" style="margin:0" onclick="document.getElementById('announcement-form')?.scrollIntoView()">+ إضافة إعلان</button></div><form id="announcement-form" class="editor-form" onsubmit="addAnnouncement(event)"><h3>إضافة إعلان</h3><div class="form-grid"><div class="field"><label for="announcement-title">العنوان</label><input id="announcement-title" required></div><div class="field"><label for="announcement-expires">ينتهي في</label><input id="announcement-expires" type="date"></div><div class="field"><label for="announcement-priority">الأولوية</label><select id="announcement-priority"><option value="normal">عادي</option><option value="important">مهم</option></select></div></div><div class="field"><label for="announcement-body">النص</label><textarea id="announcement-body" required></textarea></div><button class="primary" type="submit">إضافة</button></form><section class="admin-list">${items.length?items.map(a=>`<article class="admin-item"><div><b>${esc(a.title)}</b><span>${a.expiresAt?fmt(a.expiresAt):'بدون انتهاء'} · ${a.priority==='important'?'مهم':'عادي'}</span></div><div><button class="text-link" onclick="deleteAnnouncement('${a.id}')">حذف</button></div></article>`).join(''):empty('لا توجد إعلانات.')}</section></div>`}

async function addAnnouncement(event){
  event.preventDefault();
  if(String(state.session?.role || '').toUpperCase() !== 'ADMIN')return;
  const title = $('#announcement-title').value.trim();
  const body = $('#announcement-body').value.trim();
  const expires = $('#announcement-expires').value;
  const priority = $('#announcement-priority').value || 'normal';
  if(!title||!body) return;
  try{
    await apiFetch('/announcements',{method:'POST',body:JSON.stringify({title,body,priority,expiresAt:expires||null})});
    await loadAll();
    document.getElementById('announcement-form')?.reset();
    render();
  }catch(err){ alert(err.message); }
}

async function deleteAnnouncement(id){
  if(String(state.session?.role || '').toUpperCase() !== 'ADMIN')return;
  if(!window.confirm('هل تريد حذف هذا الإعلان؟')) return;
  try{
    await apiFetch(`/announcements/${id}`,{method:'DELETE'});
    await loadAll();
    render();
  }catch(err){ alert(err.message); }
}

async function init(){
  applyTheme();
  const token = getToken();
  const cachedUser = read(STORAGE.user, null);
  if(token && cachedUser){
    state.session = cachedUser;
    try{
      await loadAll();
    }catch(err){
      // Token expired/invalid: apiFetch already logged out on 401, otherwise show login.
      state.session = null;
    }
  }
  render();
}
init();
