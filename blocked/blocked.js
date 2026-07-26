let t = {};
let tickInterval = null;

// ─── i18n ─────────────────────────────────────────────────────────────────────

async function loadI18n() {
  const { settings } = await chrome.storage.local.get(['settings']);
  const lang = settings?.language || 'es';
  const url = chrome.runtime.getURL(`i18n/${lang}.json`);
  const res = await fetch(url);
  t = await res.json();
}

// ─── Timer math ───────────────────────────────────────────────────────────────

function getRemainingMs(timer, settings) {
  if (!timer || timer.state === 'idle') return null;
  const totalMs = (timer.state === 'work' ? settings.workDuration : settings.breakDuration) * 60 * 1000;
  return Math.max(0, totalMs - (Date.now() - timer.startedAt));
}

function formatMs(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Random shame phrase ──────────────────────────────────────────────────────

function getRandomPhrase() {
  const phrases = t.blocked?.phrases || ['Skill issue.'];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ─── UI update ────────────────────────────────────────────────────────────────

async function updateScreen() {
  const { timer, settings, stats } = await chrome.storage.local.get(['timer', 'settings', 'stats']);
  if (!timer || !settings) return;

  const state = timer.state;

  // Apply theme
  document.body.className = `theme-${settings.theme || 'red'}`;

  if (state === 'break') {
    showBreakScreen(timer, settings);
  } else if (state === 'idle') {
    // Session ended, redirect to new tab
    window.location.href = 'chrome://newtab';
  } else {
    showWorkScreen(timer, settings, stats);
  }
}

function showWorkScreen(timer, settings, stats) {
  document.getElementById('screenWork').style.display = '';
  document.getElementById('screenBreak').style.display = 'none';

  document.getElementById('blockedTitle').textContent    = t.blocked.title;
  document.getElementById('blockedSubtitle').textContent = t.blocked.subtitle;
  document.getElementById('timerLabel').textContent      = t.blocked.timerLabel;

  const remainingMs = getRemainingMs(timer, settings);
  document.getElementById('countdown').textContent = remainingMs !== null ? formatMs(remainingMs) : '--:--';

  const attempts = stats?.escapeAttempts || 0;
  document.getElementById('shameCount').textContent =
    t.blocked.shameLabel.replace('{n}', attempts);

  // Trigger work complete if timer ran out
  if (remainingMs !== null && remainingMs <= 0) {
    chrome.runtime.sendMessage({ type: 'COMPLETE_WORK' });
  }
}

function showBreakScreen(timer, settings) {
  document.getElementById('screenWork').style.display = 'none';
  document.getElementById('screenBreak').style.display = '';

  document.getElementById('breakTitle').textContent    = t.blocked.breakTitle;
  document.getElementById('breakSubtitle').textContent = t.blocked.breakSubtitle;
  document.getElementById('breakMessage').textContent  = t.blocked.breakMessage;

  const remainingMs = getRemainingMs(timer, settings);
  document.getElementById('breakCountdown').textContent = remainingMs !== null ? formatMs(remainingMs) : '--:--';

  if (remainingMs !== null && remainingMs <= 0) {
    chrome.runtime.sendMessage({ type: 'COMPLETE_BREAK' });
  }
}

// ─── Track escape attempt ──────────────────────────────────────────────────────

async function trackEscape() {
  const { timer } = await chrome.storage.local.get(['timer']);
  // Only count as escape if we're mid work session
  if (timer?.state === 'work') {
    chrome.runtime.sendMessage({ type: 'ESCAPE_ATTEMPT' });
  }
}

// ─── Listen for background events ────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'WORK_COMPLETE') {
    updateScreen();
  }
  if (msg.type === 'BREAK_COMPLETE') {
    window.location.href = 'chrome://newtab';
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function init() {
  await loadI18n();

  // Set shame phrase immediately
  document.getElementById('shamePhrase').textContent = getRandomPhrase();

  await trackEscape();
  await updateScreen();

  // Update every second
  tickInterval = setInterval(updateScreen, 1000);
}

init();
