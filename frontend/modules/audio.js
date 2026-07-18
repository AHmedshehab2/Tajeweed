import { TODAY, mediaUrl, formatTime, esc } from "./utils.js";
import { progressCache, allLessons, data, findLessonForRecording, nextLesson, lessonStatus, findLesson } from "./state.js";
import { apiFetch } from "./api.js";
import { play as apPlay, pause as apPause, seekPercent as apSeekPercent, setSpeed as apSetSpeed, getState as apState, onUpdate as apOnUpdate, onEnded as apOnEnded } from "./audio-player.js";

export function parseDuration(str) {
  if (!str) return 0;
  const parts = String(str).split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}


export function resetPlayButtons(except) {
  document.querySelectorAll(".rich-audio .play").forEach((btn) => {
    if (btn !== except) btn.innerHTML = '<span class="icon">play_arrow</span>';
  });
}

export function cycleSpeed(button) {
  const rates = [0.75, 1, 1.25, 1.5];
  const labels = ["0.75×", "1×", "1.25×", "1.5×"];
  const idx = (labels.indexOf(button.textContent) + 1) % labels.length;
  button.textContent = labels[idx];
  const container = button.closest(".rich-audio");
  if (container?.dataset.recordingId === apState().currentRecordingId)
    apSetSpeed(rates[idx]);
}

function syncSeekVisual(container, pct) {
  const fill = container.querySelector(".seek-track-fill");
  const thumb = container.querySelector(".seek-track-thumb");
  if (fill) fill.style.width = pct + "%";
  if (thumb) thumb.style.right = pct + "%";
}

function doSeek(clientX, track) {
  const container = track.closest(".rich-audio, .mini-player");
  if (!container) return;
  const rect = track.getBoundingClientRect();
  const x = clientX - rect.left;
  const pct = Math.round(Math.max(0, Math.min(100, (1 - x / rect.width) * 100)));
  apSeekPercent(pct);
  syncSeekVisual(container, pct);
  const dur = audioDuration(container);
  const seekRow = container.querySelector(".seek-row, .mp-seek-row");
  const timeEl = seekRow?.querySelector("span:first-child");
  if (timeEl && dur > 0) timeEl.textContent = formatTime((pct / 100) * dur);
}

export function onSeekTrackPointerDown(event) {
  const track = event.currentTarget;
  track.setPointerCapture(event.pointerId);
  doSeek(event.clientX, track);
  track.addEventListener("pointermove", onSeekTrackPointerMove);
  track.addEventListener("pointerup", onSeekTrackPointerUp);
  track.addEventListener("pointercancel", onSeekTrackPointerUp);
}

function onSeekTrackPointerMove(event) {
  doSeek(event.clientX, event.currentTarget);
}

function onSeekTrackPointerUp(event) {
  const track = event.currentTarget;
  try {
    if (track.hasPointerCapture?.(event.pointerId)) {
      track.releasePointerCapture(event.pointerId);
    }
  } catch (_) {}
  track.removeEventListener("pointermove", onSeekTrackPointerMove);
  track.removeEventListener("pointerup", onSeekTrackPointerUp);
  track.removeEventListener("pointercancel", onSeekTrackPointerUp);
}

export function updateAudioSeek(container, reset = false) {
  if (!container) return;
  const seek = container.querySelector(".seek-track");
  const timeEl = container.querySelector(".seek-row span:first-child");
  if (!seek || !timeEl) return;
  const gs = apState();
  if (reset || gs.currentRecordingId !== container.dataset.recordingId) {
    timeEl.textContent = "00:00";
    syncSeekVisual(container, 0);
    return;
  }
  const dur = gs.duration || audioDuration(container);
  if (dur > 0) {
    const pct = Math.round((gs.currentTime / dur) * 100);
    syncSeekVisual(container, pct);
  }
  timeEl.textContent = formatTime(gs.currentTime);
}

export function audioDuration(container) {
  const gs = apState();
  if (gs.currentRecordingId === container?.dataset.recordingId && gs.duration)
    return gs.duration;
  const label = container?.querySelector(".seek-row span:last-child")?.textContent;
  return parseDuration(label) || 0;
}

const _pendingStarts = new Map();

function startLessonIfNeeded(lessonId) {
  if (!lessonId) return Promise.resolve();
  const status = lessonStatus(lessonId);
  if (status !== "not-started") return Promise.resolve();
  if (_pendingStarts.has(lessonId)) return _pendingStarts.get(lessonId);
  progressCache.lessons[lessonId] = "in-progress";
  window._render();
  const pending = apiFetch(`/progress/lessons/${lessonId}`, {
    method: "POST",
    body: JSON.stringify({ state: "in-progress" }),
  })
    .then(({ status: newStatus }) => {
      progressCache.lessons[lessonId] = newStatus;
    })
    .catch(() => {
      if (progressCache.lessons[lessonId] === "in-progress") {
        delete progressCache.lessons[lessonId];
        window._render();
      }
    })
    .finally(() => {
      _pendingStarts.delete(lessonId);
    });
  _pendingStarts.set(lessonId, pending);
  return pending;
}

async function completeLessonIfNeeded(lessonId) {
  if (!lessonId) return;
  await (_pendingStarts.get(lessonId) || Promise.resolve());
  const status = lessonStatus(lessonId);
  if (status !== "in-progress") return;
  try {
    const { status: newStatus } = await apiFetch(`/progress/lessons/${lessonId}`, {
      method: "POST",
      body: JSON.stringify({ state: "completed" }),
    });
    progressCache.lessons[lessonId] = newStatus;
    window._render();
    if (newStatus === "completed") showCompletionCountdown(lessonId);
  } catch (_) {}
}

let _countdownTimer = null;
let _countdownEl = null;

function showCompletionCountdown(completedLessonId) {
  clearCountdown();
  const next = nextLesson(completedLessonId);
  if (!next) {
    const el = document.createElement("div");
    el.className = "completion-toast";
    el.innerHTML = `<div class="completion-toast-inner"><div class="completion-toast-icon"><span class="icon">celebration</span></div><div class="completion-toast-text">تهانينا!<br>لقد أكملت هذا الباب.</div></div>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
    return;
  }
  let count = 5;
  _countdownEl = document.createElement("div");
  _countdownEl.className = "completion-countdown";
  _countdownEl.innerHTML = buildCountdownHTML(count, next);
  document.body.appendChild(_countdownEl);
  _countdownTimer = setInterval(() => {
    count--;
    if (count <= 0) {
      clearCountdown();
      openLessonAutoPlay(next.id);
      return;
    }
    if (_countdownEl) {
      _countdownEl.querySelector(".countdown-number").textContent = count;
    }
  }, 1000);
}

function buildCountdownHTML(count, nextLessonObj) {
  return `<div class="countdown-inner"><div class="countdown-check"><span class="icon">check_circle</span> تم إكمال الدرس</div><div class="countdown-next-title">الدرس التالي: ${esc(nextLessonObj.title)}</div><div class="countdown-timer">يبدأ خلال <span class="countdown-number">${count}</span></div><button class="countdown-cancel" onclick="cancelCountdown()">إلغاء</button></div>`;
}



function clearCountdown() {
  if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
  if (_countdownEl) { _countdownEl.remove(); _countdownEl = null; }
}

export function cancelCountdown() {
  clearCountdown();
}

function openLessonAutoPlay(lessonId) {
  const lesson = findLesson(lessonId);
  if (!lesson || !lesson.recordings.length) return;
  const firstRec = lesson.recordings.find((r) => r.audioUrl) || lesson.recordings[0];
  if (!firstRec?.audioUrl) return;
  import("./routing.js").then((m) => {
    m.openLesson(lessonId);
    setTimeout(() => {
      const btn = document.querySelector(`.rich-audio[data-recording-id="${firstRec.id}"] .play`);
      if (btn) playRecording(btn, firstRec.id);
    }, 300);
  });
}

export function playRecording(button, id) {
  const item = findRecordingById(id);
  if (!item?.audioUrl) return;

  const parentLesson = findLessonForRecording(id);
  if (parentLesson) {
    startLessonIfNeeded(parentLesson.id);
  }

  const gs = apState();
  const sameRecording = gs.currentRecordingId === id;

  if (sameRecording && gs.isPlaying) {
    apPlay(item);
    button.innerHTML = '<span class="icon">play_arrow</span>';
    return;
  }

  if (sameRecording && !gs.isPlaying) {
    apPlay(item);
    button.innerHTML = '<span class="icon">pause</span>';
    resetPlayButtons(button);
    return;
  }

  resetPlayButtons();
  apPlay(item);
  button.innerHTML = '<span class="icon">pause</span>';

  apiFetch("/progress/activity", {
    method: "POST",
    body: JSON.stringify({ refId: id, title: item.title, kind: "استماع" }),
  })
    .then(() => {
      progressCache.activity = [
        { id, title: item.title, kind: "استماع", date: TODAY },
        ...progressCache.activity.filter((entry) => entry.id !== id),
      ].slice(0, 5);
    })
    .catch(() => {});
}

export function syncAudioUI() {
  const gs = apState();
  if (!gs.currentRecordingId) {
    const mini = document.getElementById("mini-player");
    const fab = document.getElementById("mini-player-fab");
    if (mini) mini.style.display = "none";
    if (fab) fab.style.display = "none";
    return;
  }

  const container = document.querySelector(`.rich-audio[data-recording-id="${gs.currentRecordingId}"]`);
  if (container) {
    const playBtn = container.querySelector(".play");
    const seek = container.querySelector(".seek-track");
    const timeEl = container.querySelector(".seek-row span:first-child");
    const speedBtn = container.querySelector(".speed");
    if (playBtn) playBtn.innerHTML = gs.isPlaying ? '<span class="icon">pause</span>' : '<span class="icon">play_arrow</span>';
    if (seek && gs.duration > 0) {
      const pct = Math.round((gs.currentTime / gs.duration) * 100);
      syncSeekVisual(container, pct);
    }
    if (timeEl) timeEl.textContent = formatTime(gs.currentTime);
    if (speedBtn) {
      const labels = ["0.75×", "1×", "1.25×", "1.5×"];
      const rates = [0.75, 1, 1.25, 1.5];
      const idx = rates.indexOf(gs.playbackRate);
      speedBtn.textContent = idx >= 0 ? labels[idx] : "1×";
    }
  }

  const mini = document.getElementById("mini-player");
  if (mini) {
    const isHidden = mini.dataset.hidden === "1";
    mini.style.display = isHidden ? "none" : "";
    const fab = document.getElementById("mini-player-fab");
    if (fab) fab.style.display = isHidden ? "" : "none";

    const playBtn = mini.querySelector(".mp-play");
    const seek = mini.querySelector(".mp-seek-row .seek-track");
    const elapsedEl = mini.querySelector("#mp-elapsed");
    const durEl = mini.querySelector("#mp-dur");
    const speedBtn = mini.querySelector(".mp-speed");
    const titleEl = mini.querySelector("#mp-title");
    if (playBtn) playBtn.innerHTML = gs.isPlaying ? '<span class="icon">pause</span>' : '<span class="icon">play_arrow</span>';
    if (seek && gs.duration > 0) {
      const pct = Math.round((gs.currentTime / gs.duration) * 100);
      syncSeekVisual(mini, pct);
    }
    if (elapsedEl) elapsedEl.textContent = formatTime(gs.currentTime);
    if (durEl && gs.duration > 0) durEl.textContent = formatTime(gs.duration);
    if (speedBtn) speedBtn.textContent = gs.playbackRate + "×";
    if (titleEl && gs.recordingTitle) titleEl.textContent = gs.recordingTitle;
  }
}

export function miniPlayPause() {
  const gs = apState();
  if (!gs.currentRecordingId) return;
  const recording = findRecordingById(gs.currentRecordingId);
  if (recording) {
    const parentLesson = findLessonForRecording(gs.currentRecordingId);
    if (parentLesson) startLessonIfNeeded(parentLesson.id);
    const btn = document.querySelector(`.rich-audio[data-recording-id="${gs.currentRecordingId}"] .play`);
    if (btn) playRecording(btn, gs.currentRecordingId);
    else apPlay(recording);
  }
}

export function miniCycleSpeed(button) {
  const rates = [0.75, 1, 1.25, 1.5];
  const labels = ["0.75×", "1×", "1.25×", "1.5×"];
  const gs = apState();
  const idx = (rates.indexOf(gs.playbackRate) + 1) % rates.length;
  apSetSpeed(rates[idx]);
  button.textContent = labels[idx];
}

export function miniPrevLesson() {
  const gs = apState();
  if (!gs.currentRecordingId) return;
  const parentLesson = findLessonForRecording(gs.currentRecordingId);
  if (!parentLesson) return;
  const prev = (() => { const list = allLessons(); const i = list.findIndex((l) => l.id === parentLesson.id); return i > 0 ? list[i - 1] : null; })();
  if (!prev) return;
  import("./routing.js").then((m) => {
    m.openLesson(prev.id);
    setTimeout(() => {
      const rec = prev.recordings.find((r) => r.audioUrl) || prev.recordings[0];
      if (rec) {
        const btn = document.querySelector(`.rich-audio[data-recording-id="${rec.id}"] .play`);
        if (btn) playRecording(btn, rec.id);
      }
    }, 300);
  });
}

export function miniNextLesson() {
  const gs = apState();
  if (!gs.currentRecordingId) return;
  const parentLesson = findLessonForRecording(gs.currentRecordingId);
  if (!parentLesson) return;
  const next = nextLesson(parentLesson.id);
  if (!next) return;
  import("./routing.js").then((m) => {
    m.openLesson(next.id);
    setTimeout(() => {
      const rec = next.recordings.find((r) => r.audioUrl) || next.recordings[0];
      if (rec) {
        const btn = document.querySelector(`.rich-audio[data-recording-id="${rec.id}"] .play`);
        if (btn) playRecording(btn, rec.id);
      }
    }, 300);
  });
}

export function miniClose() {
  _miniHidden = true;
  _miniExpanded = false;
  const mini = document.getElementById("mini-player");
  const fab = document.getElementById("mini-player-fab");
  if (mini) { mini.dataset.hidden = "1"; mini.classList.remove("expanded"); mini.style.display = "none"; }
  if (fab) fab.style.display = "";
}

export function miniReopen() {
  _miniHidden = false;
  _miniNeedsAnimation = true;
  window._render();
}

export function miniExpand() {
  if (_miniExpanded) {
    miniCollapse();
  } else {
    _miniExpanded = true;
    const mini = document.getElementById("mini-player");
    if (mini) {
      mini.classList.add("expanded");
      const btn = mini.querySelector(".mp-expand-icon");
      if (btn) btn.innerHTML = '<span class="icon">close_fullscreen</span>';
    }
  }
}

export function miniCollapse() {
  _miniExpanded = false;
  const mini = document.getElementById("mini-player");
  if (mini) {
    mini.classList.remove("expanded");
    const btn = mini.querySelector(".mp-expand-icon");
    if (btn) btn.innerHTML = '<span class="icon">open_in_full</span>';
  }
}

function findRecordingById(id) {
  const rec = allLessons()
    .flatMap((item) => item.recordings || [])
    .concat(data.hizbs.flatMap((h) => h.quarters.flatMap((q) => q.recordings || [])))
    .concat(data.khutbahs.flatMap((k) => k.recordings || []))
    .find((item) => item.id === id);
  if (rec) return rec;
  // Legacy khutbahs may store audioUrl on the document itself
  const khutbah = data.khutbahs.find((k) => k.id === id && k.audioUrl);
  if (!khutbah) return null;
  return {
    id: khutbah.id,
    title: khutbah.title,
    duration: khutbah.duration,
    uploadedAt: khutbah.date,
    audioUrl: khutbah.audioUrl,
  };
}

let _unsub = null;
let _endedUnsub = null;
let _miniHidden = false;
let _miniExpanded = false;
let _miniNeedsAnimation = true;

export function isMiniHidden() { return _miniHidden; }
export function isMiniExpanded() { return _miniExpanded; }
export function isMiniAnimating() {
  if (_miniNeedsAnimation) { _miniNeedsAnimation = false; return true; }
  return false;
}
export function startAudioUIListener() {
  if (_unsub) _unsub();
  _unsub = apOnUpdate(() => syncAudioUI());
}
export function startAudioEndListener() {
  if (_endedUnsub) _endedUnsub();
  _endedUnsub = apOnEnded((gs) => {
    if (!gs.currentRecordingId) return;
    const parentLesson = findLessonForRecording(gs.currentRecordingId);
    if (!parentLesson) return;
    completeLessonIfNeeded(parentLesson.id);
  });
}
export function stopAudioUIListener() {
  if (_unsub) { _unsub(); _unsub = null; }
}
export function stopAudioEndListener() {
  if (_endedUnsub) { _endedUnsub(); _endedUnsub = null; }
}
