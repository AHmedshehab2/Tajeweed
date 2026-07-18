/* ═══════════════════════════════════════════
   Global Audio Player (Singleton)
   One HTMLAudioElement for the entire SPA.
   ═══════════════════════════════════════════ */

import { mediaUrl } from "./utils.js";

let audio = null;
let currentRecordingId = null;
let currentRecording = null;
let updateCallback = null;
let endedCallback = null;

function ensureAudio() {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("timeupdate", notify);
    audio.addEventListener("play", notify);
    audio.addEventListener("pause", notify);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("loadedmetadata", notify);
    audio.addEventListener("error", notify);
    audio.addEventListener("durationchange", () => {
      notify();
      if (Number.isFinite(audio.duration) && audio.currentTime > audio.duration) {
        audio.currentTime = audio.duration;
      }
    });
  }
  return audio;
}

function notify() {
  if (updateCallback) updateCallback(getState());
}

function handleEnded() {
  notify();
  if (endedCallback) endedCallback(getState());
}

export function getState() {
  const a = ensureAudio();
  return {
    currentRecordingId,
    recordingTitle: currentRecording?.title || "",
    recordingUrl: currentRecording?.audioUrl || "",
    currentTime: a.currentTime || 0,
    duration: (Number.isFinite(a.duration) ? a.duration : 0),
    isPlaying: !a.paused && !a.ended,
    playbackRate: a.playbackRate,
    paused: a.paused,
  };
}

export function onUpdate(fn) {
  updateCallback = fn;
  return () => { if (updateCallback === fn) updateCallback = null; };
}

export function onEnded(fn) {
  endedCallback = fn;
  return () => { if (endedCallback === fn) endedCallback = null; };
}

export function play(recording) {
  const a = ensureAudio();
  const url = mediaUrl(recording.audioUrl);

  if (currentRecordingId === recording.id) {
    if (a.paused) a.play().catch(() => {});
    else a.pause();
    return;
  }

  a.pause();
  a.src = url;
  a.currentTime = 0;
  a.load();
  currentRecordingId = recording.id;
  currentRecording = recording;
  notify();
  a.play().catch(() => {});
}

export function pause() {
  ensureAudio().pause();
}

export function seek(seconds) {
  const a = ensureAudio();
  if (Number.isFinite(seconds)) a.currentTime = Math.max(0, seconds);
}

export function seekPercent(percent) {
  const a = ensureAudio();
  const dur = Number.isFinite(a.duration) ? a.duration : 0;
  if (dur > 0) {
    const target = (Math.max(0, Math.min(100, percent)) / 100) * dur;
    a.currentTime = Math.min(target, dur);
  }
}

export function setSpeed(rate) {
  ensureAudio().playbackRate = rate;
}

export function stop() {
  const a = ensureAudio();
  a.pause();
  a.removeAttribute("src");
  a.load();
  currentRecordingId = null;
  currentRecording = null;
  notify();
}
