// Runs in a hidden offscreen document — the only place an MV3 service worker
// can trigger real audio playback (chrome.offscreen, reason AUDIO_PLAYBACK).

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PLAY_CHIME') playChime(msg.variant);
});

function playTone(ctx, freq, startTime, duration) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

function playChime(variant) {
  const ctx = new AudioContext();
  // work done → rising two-note chime (reward). break over → falling (back to it).
  const notes = variant === 'break' ? [659.25, 523.25] : [523.25, 659.25];
  const now = ctx.currentTime;
  playTone(ctx, notes[0], now, 0.15);
  playTone(ctx, notes[1], now + 0.15, 0.25);
}
