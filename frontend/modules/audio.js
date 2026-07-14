import { TODAY } from "./utils.js";
import { activeAudio, activeRecordingId, setActiveAudio, setActiveRecordingId, progressCache, allLessons, data } from "./state.js";
import { mediaUrl } from "./utils.js";
import { apiFetch } from "./api.js";

export function parseDuration(str) {
  if (!str) return 0;
  const parts = String(str).split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}
export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
export function audioDuration(container) {
  if (activeAudio?.duration && Number.isFinite(activeAudio.duration))
    return activeAudio.duration;
  const label = container?.querySelector(".seek-row span:last-child")?.textContent;
  return parseDuration(label) || 0;
}
export function updateAudioSeek(container, reset = false) {
  if (!container) return;
  const seek = container.querySelector(".seek-row input");
  const timeEl = container.querySelector(".seek-row span");
  if (!seek || !timeEl) return;
  const dur = audioDuration(container);
  if (reset || !dur || !activeAudio) {
    seek.value = 0;
    timeEl.textContent = "00:00";
    return;
  }
  seek.value = String(Math.round((activeAudio.currentTime / dur) * 100));
  timeEl.textContent = formatTime(activeAudio.currentTime);
}
export function seekRecording(input) {
  const container = input.closest(".rich-audio");
  const dur = audioDuration(container);
  if (!activeAudio || !dur) return;
  activeAudio.currentTime = (Number(input.value) / 100) * dur;
  const timeEl = input.previousElementSibling;
  if (timeEl) timeEl.textContent = formatTime(activeAudio.currentTime);
}
export function resetPlayButtons(except) {
  document.querySelectorAll(".rich-audio .play").forEach((btn) => {
    if (btn !== except) btn.textContent = "▶";
  });
}
export function cycleSpeed(button) {
  const rates = [0.75, 1, 1.25, 1.5];
  const labels = ["0.75×", "1×", "1.25×", "1.5×"];
  const idx = (labels.indexOf(button.textContent) + 1) % labels.length;
  button.textContent = labels[idx];
  const container = button.closest(".rich-audio");
  if (container?.dataset.recordingId === activeRecordingId && activeAudio)
    activeAudio.playbackRate = rates[idx];
}
export function playRecording(button, id) {
  const recording = allLessons()
    .flatMap((item) => item.recordings)
    .concat(data.hizbs.flatMap((h) => h.quarters.flatMap((q) => q.recordings)))
    .find((item) => item.id === id);
  const item = recording || data.khutbahs.find((k) => k.id === id);
  if (!item?.audioUrl) return;

  const url = mediaUrl(item.audioUrl);
  const container = button.closest(".rich-audio");

  if (activeAudio && activeRecordingId === id && !activeAudio.paused) {
    activeAudio.pause();
    button.textContent = "▶";
    return;
  }

  if (!activeAudio || activeRecordingId !== id) {
    activeAudio?.pause();
    resetPlayButtons();
    setActiveAudio(new Audio(url));
    setActiveRecordingId(id);
    const speedBtn = container?.querySelector(".speed");
    const speedLabels = ["0.75×", "1×", "1.25×", "1.5×"];
    const speedRates = [0.75, 1, 1.25, 1.5];
    const speedIdx = Math.max(0, speedLabels.indexOf(speedBtn?.textContent));
    activeAudio.playbackRate = speedRates[speedIdx];
    activeAudio.addEventListener("timeupdate", () => updateAudioSeek(container));
    activeAudio.addEventListener("ended", () => {
      button.textContent = "▶";
      updateAudioSeek(container, true);
    });
  }

  activeAudio
    .play()
    .then(() => {
      button.textContent = "❚❚";
      resetPlayButtons(button);
    })
    .catch(() => {
      button.textContent = "▶";
    });

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
