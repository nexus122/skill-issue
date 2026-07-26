// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  language: 'es',
  theme: 'red',
  workDuration: 25,
  breakDuration: 5,
  blocklist: [
    'twitter.com', 'x.com', 'reddit.com', 'youtube.com', 'tiktok.com',
    'instagram.com', 'facebook.com', 'twitch.tv', 'netflix.com', 'discord.com'
  ]
};

const DEFAULT_STATS = {
  streak: 0,
  lastStreakDate: null,
  totalSessions: 0,
  todaySessions: 0,
  todayDate: null,
  focusMinutes: 0,
  escapeAttempts: 0,
};

const DEFAULT_TIMER = {
  state: 'idle', // idle | work | break
  startedAt: null,
  currentTask: '',
  sessionId: null,
};

const ACHIEVEMENTS_DEF = [
  { id: 'first_blood',   check: (s) => s.totalSessions >= 1 },
  { id: 'skill_checked', check: (s) => s.escapeAttempts >= 10 },
  { id: 'no_life',       check: (s) => s.todaySessions >= 8 },
  { id: 'enlightened',   check: (s) => s.streak >= 7 },
  { id: 'veteran',       check: (s) => s.totalSessions >= 10 },
  { id: 'century',       check: (s) => s.totalSessions >= 100 },
  { id: 'time_lord',     check: (s) => s.focusMinutes >= 600 },
  { id: 'addict',        check: (s) => s.streak >= 30 },
];

// ─── Init ─────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(null);
  if (!data.settings)     await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  if (!data.stats)        await chrome.storage.local.set({ stats: DEFAULT_STATS });
  if (!data.achievements) await chrome.storage.local.set({ achievements: [] });
  if (!data.timer)        await chrome.storage.local.set({ timer: { ...DEFAULT_TIMER } });
  if (!data.sessions)     await chrome.storage.local.set({ sessions: [] });
  // Migrate old global tasks → pendingTasks
  if (!data.pendingTasks) await chrome.storage.local.set({ pendingTasks: data.tasks || [] });
  if (data.carryOverDismissedId === undefined) {
    await chrome.storage.local.set({ carryOverDismissedId: null });
  }
});

// ─── Sound ────────────────────────────────────────────────────────────────────

let creatingOffscreen = null;

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existing.length > 0) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play a short chime when a Pomodoro session or break ends',
    });
  }
  await creatingOffscreen;
  creatingOffscreen = null;
}

async function playChime(variant) {
  await ensureOffscreen();
  chrome.runtime.sendMessage({ type: 'PLAY_CHIME', variant }).catch(() => {});
}

// ─── Session helpers ──────────────────────────────────────────────────────────

async function saveSession(session) {
  const { sessions = [] } = await chrome.storage.local.get(['sessions']);
  const idx = sessions.findIndex(s => s.id === session.id);
  let updated;
  if (idx >= 0) {
    updated = sessions.map(s => s.id === session.id ? session : s);
  } else {
    updated = [session, ...sessions].slice(0, 15);
  }
  await chrome.storage.local.set({ sessions: updated });
}

async function getSession(sessionId) {
  const { sessions = [] } = await chrome.storage.local.get(['sessions']);
  return sessions.find(s => s.id === sessionId) || null;
}

// ─── Alarm heartbeat (checks timer completion) ────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'pomodoro-check') return;

  const { timer, settings } = await chrome.storage.local.get(['timer', 'settings']);
  if (!timer || timer.state === 'idle') return;

  const durationMs = (timer.state === 'work' ? settings.workDuration : settings.breakDuration) * 60 * 1000;
  const elapsed = Date.now() - timer.startedAt;

  if (elapsed >= durationMs) {
    if (timer.state === 'work')  await completeWork();
    else if (timer.state === 'break') await completeBreak();
  }
});

// ─── Timer actions ────────────────────────────────────────────────────────────

async function startWork(taskName) {
  const now = Date.now();
  const { settings, pendingTasks = [] } = await chrome.storage.local.get(['settings', 'pendingTasks']);

  const session = {
    id: now,
    startedAt: now,
    completedAt: null,
    aborted: false,
    focus: taskName || '',
    tasks: pendingTasks,
    plannedDuration: settings.workDuration,
    actualMinutes: null,
  };

  await saveSession(session);
  await chrome.storage.local.set({
    pendingTasks: [],
    carryOverDismissedId: null,
    timer: {
      state: 'work',
      startedAt: now,
      currentTask: taskName || '',
      sessionId: now,
    }
  });
  await applyBlockingRules();
  chrome.alarms.create('pomodoro-check', { periodInMinutes: 1 });
}

async function stopTimer() {
  const { timer } = await chrome.storage.local.get(['timer']);

  if (timer?.sessionId && timer.state === 'work') {
    const session = await getSession(timer.sessionId);
    if (session && !session.completedAt) {
      const elapsed = Date.now() - timer.startedAt;
      await saveSession({
        ...session,
        completedAt: Date.now(),
        aborted: true,
        actualMinutes: Math.round(elapsed / 60000),
      });
    }
  }

  await chrome.storage.local.set({ timer: { ...DEFAULT_TIMER } });
  await clearBlockingRules();
  await chrome.alarms.clear('pomodoro-check');
}

async function completeWork() {
  const { settings, stats, timer } = await chrome.storage.local.get(['settings', 'stats', 'timer']);

  // Archive session as completed
  if (timer?.sessionId) {
    const session = await getSession(timer.sessionId);
    if (session) {
      await saveSession({
        ...session,
        completedAt: Date.now(),
        aborted: false,
        actualMinutes: settings.workDuration,
      });
    }
  }

  const today = new Date().toDateString();
  const newStats = { ...stats };

  if (newStats.todayDate !== today) {
    newStats.todaySessions = 0;
    newStats.todayDate = today;
  }
  newStats.totalSessions = (newStats.totalSessions || 0) + 1;
  newStats.todaySessions = (newStats.todaySessions || 0) + 1;
  newStats.focusMinutes  = (newStats.focusMinutes || 0) + settings.workDuration;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  if (newStats.lastStreakDate === yesterdayStr) {
    newStats.streak = (newStats.streak || 0) + 1;
  } else if (newStats.lastStreakDate !== today) {
    newStats.streak = 1;
  }
  newStats.lastStreakDate = today;

  await chrome.storage.local.set({ stats: newStats });
  await checkAchievements(newStats);

  await chrome.storage.local.set({
    timer: { state: 'break', startedAt: Date.now(), currentTask: '', sessionId: null }
  });
  await clearBlockingRules();
  chrome.alarms.create('pomodoro-check', { periodInMinutes: 1 });
  broadcast({ type: 'WORK_COMPLETE' });
  playChime('work');
}

async function completeBreak() {
  await chrome.storage.local.set({ timer: { ...DEFAULT_TIMER } });
  await clearBlockingRules();
  await chrome.alarms.clear('pomodoro-check');
  broadcast({ type: 'BREAK_COMPLETE' });
  playChime('break');
}

// ─── Blocking rules ───────────────────────────────────────────────────────────

async function applyBlockingRules() {
  const { settings } = await chrome.storage.local.get(['settings']);
  const blocklist = settings?.blocklist || DEFAULT_SETTINGS.blocklist;

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map(r => r.id);

  const addRules = blocklist.map((domain, i) => ({
    id: i + 1,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { extensionPath: '/blocked/blocked.html' }
    },
    condition: {
      urlFilter: `||${domain}`,
      resourceTypes: ['main_frame']
    }
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeIds, addRules });
}

async function clearBlockingRules() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map(r => r.id);
  if (removeIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeIds, addRules: [] });
  }
}

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'START':          await startWork(msg.task);  break;
      case 'STOP':           await stopTimer();           break;
      case 'COMPLETE_WORK':  await completeWork();        break;
      case 'COMPLETE_BREAK': await completeBreak();       break;

      case 'ESCAPE_ATTEMPT': {
        const { stats } = await chrome.storage.local.get(['stats']);
        const newStats = { ...stats, escapeAttempts: (stats.escapeAttempts || 0) + 1 };
        await chrome.storage.local.set({ stats: newStats });
        await checkAchievements(newStats);
        sendResponse({ escapeAttempts: newStats.escapeAttempts });
        return;
      }

      case 'UPDATE_BLOCKLIST': {
        const { settings } = await chrome.storage.local.get(['settings']);
        await chrome.storage.local.set({ settings: { ...settings, blocklist: msg.blocklist } });
        const { timer } = await chrome.storage.local.get(['timer']);
        if (timer.state === 'work') {
          await applyBlockingRules();
        }
        break;
      }
    }
    sendResponse({ ok: true });
  })();
  return true;
});

// ─── Achievements ─────────────────────────────────────────────────────────────

async function checkAchievements(stats) {
  const { achievements } = await chrome.storage.local.get(['achievements']);
  const unlocked = new Set(achievements || []);
  const newOnes = [];

  for (const def of ACHIEVEMENTS_DEF) {
    if (!unlocked.has(def.id) && def.check(stats)) {
      unlocked.add(def.id);
      newOnes.push(def.id);
    }
  }

  if (newOnes.length > 0) {
    await chrome.storage.local.set({ achievements: [...unlocked] });
    broadcast({ type: 'ACHIEVEMENT_UNLOCKED', ids: newOnes });
  }
}

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}
