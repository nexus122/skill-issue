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

function applyI18n() {
  document.getElementById('appTitle').textContent         = t.popup.title;
  document.getElementById('labelStreak').textContent      = t.popup.streak;
  document.getElementById('labelToday').textContent       = t.popup.today;
  document.getElementById('labelEscapes').textContent     = t.popup.escapes;
  document.getElementById('tasksTitle').textContent       = t.popup.tasksTitle;
  document.getElementById('taskInput').placeholder        = t.popup.taskPlaceholder;
  document.getElementById('taskAddInput').placeholder     = t.popup.addTaskPlaceholder;
  document.getElementById('historyTitle').textContent     = t.popup.historyTitle;
  document.getElementById('historyBackLabel').textContent = t.popup.historyBack;
  document.getElementById('carryOverYes').textContent     = t.popup.carryOverYes;
  document.getElementById('carryOverNo').textContent      = t.popup.carryOverNo;
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

// ─── UI update ────────────────────────────────────────────────────────────────

async function updateUI() {
  const { timer, settings, stats } = await chrome.storage.local.get(['timer', 'settings', 'stats']);
  if (!timer || !settings) return;

  const state = timer.state;
  const remainingMs = getRemainingMs(timer, settings);

  // Apply theme
  document.body.className = `theme-${settings.theme || 'red'}`;

  // Timer display
  const timerEl    = document.getElementById('timerDisplay');
  const stateLabel = document.getElementById('timerStateLabel');
  const taskLabel  = document.getElementById('timerTask');
  const statusEl   = document.getElementById('appStatus');

  timerEl.className    = 'timer-display';
  stateLabel.className = 'timer-state-label';

  if (state === 'work') {
    timerEl.className    += ' work';
    stateLabel.className += ' active';
    stateLabel.textContent = 'WORKING';
    statusEl.textContent   = t.popup.statusWork;
    timerEl.textContent    = remainingMs !== null ? formatMs(remainingMs) : `${settings.workDuration}:00`;
    taskLabel.textContent  = timer.currentTask ? `▸ ${timer.currentTask.toUpperCase()}` : '';
  } else if (state === 'break') {
    timerEl.className    += ' break';
    stateLabel.className += ' break';
    stateLabel.textContent = 'BREAK';
    statusEl.textContent   = t.popup.statusBreak;
    timerEl.textContent    = remainingMs !== null ? formatMs(remainingMs) : `${settings.breakDuration}:00`;
    taskLabel.textContent  = '';
  } else {
    stateLabel.textContent = 'IDLE';
    statusEl.textContent   = t.popup.statusIdle;
    timerEl.textContent    = `${String(settings.workDuration).padStart(2, '0')}:00`;
    taskLabel.textContent  = '';
  }

  // Buttons
  const primaryBtn = document.getElementById('primaryBtn');
  const stopBtn    = document.getElementById('stopBtn');
  const taskWrap   = document.getElementById('taskInputWrap');

  if (state === 'idle') {
    primaryBtn.textContent   = t.popup.btnStart;
    primaryBtn.style.display = '';
    stopBtn.style.display    = 'none';
    taskWrap.style.display   = '';
  } else if (state === 'work') {
    primaryBtn.style.display = 'none';
    stopBtn.style.display    = '';
    stopBtn.textContent      = t.popup.btnStop;
    taskWrap.style.display   = 'none';
  } else if (state === 'break') {
    primaryBtn.style.display = 'none';
    stopBtn.style.display    = '';
    stopBtn.textContent      = t.popup.btnStop;
    taskWrap.style.display   = 'none';
  }

  // Stats
  document.getElementById('statStreak').textContent  = stats?.streak || 0;
  document.getElementById('statToday').textContent   = stats?.todaySessions || 0;
  document.getElementById('statEscapes').textContent = stats?.escapeAttempts || 0;

  // Auto-complete detection (popup drives completion when background alarm hasn't fired)
  if (remainingMs !== null && remainingMs <= 0) {
    if (state === 'work')  chrome.runtime.sendMessage({ type: 'COMPLETE_WORK' });
    if (state === 'break') chrome.runtime.sendMessage({ type: 'COMPLETE_BREAK' });
  }
}

// ─── Task helpers ─────────────────────────────────────────────────────────────

async function getActiveTasks() {
  const { timer } = await chrome.storage.local.get(['timer']);
  const state = timer?.state || 'idle';

  if (state === 'work') {
    if (timer.sessionId) {
      const { sessions = [] } = await chrome.storage.local.get(['sessions']);
      const session = sessions.find(s => s.id === timer.sessionId);
      if (session) return { tasks: session.tasks || [], source: 'session', sessionId: timer.sessionId };
    }
    return { tasks: [], source: 'none' };
  }

  // idle or break: use pendingTasks
  const { pendingTasks = [] } = await chrome.storage.local.get(['pendingTasks']);
  return { tasks: pendingTasks, source: 'pending' };
}

async function saveTasks(tasks, source, sessionId) {
  if (source === 'pending') {
    await chrome.storage.local.set({ pendingTasks: tasks });
  } else if (source === 'session' && sessionId) {
    const { sessions = [] } = await chrome.storage.local.get(['sessions']);
    const updated = sessions.map(s => s.id === sessionId ? { ...s, tasks } : s);
    await chrome.storage.local.set({ sessions: updated });
  }
}

// ─── Task list ────────────────────────────────────────────────────────────────

async function renderTasks() {
  const { tasks } = await getActiveTasks();
  const list = document.getElementById('taskList');
  list.innerHTML = '';

  (tasks || []).forEach((task) => {
    const li = document.createElement('li');
    li.className = `task-item${task.done ? ' done' : ''}`;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = task.done;
    cb.addEventListener('change', () => toggleTask(task.id));

    const span = document.createElement('span');
    span.className = 'task-item-text';
    span.textContent = task.text;

    const del = document.createElement('button');
    del.className = 'task-item-del';
    del.textContent = '×';
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteTask(task.id); });

    li.appendChild(cb);
    li.appendChild(span);
    li.appendChild(del);
    list.appendChild(li);
  });
}

async function addTask(text) {
  if (!text.trim()) return;
  const { tasks, source, sessionId } = await getActiveTasks();
  const newTasks = [...(tasks || []), { id: Date.now(), text: text.trim(), done: false }];
  await saveTasks(newTasks, source, sessionId);
  renderTasks();
}

async function toggleTask(id) {
  const { tasks, source, sessionId } = await getActiveTasks();
  const updated = tasks.map(t => t.id === id ? { ...t, done: !t.done } : t);
  await saveTasks(updated, source, sessionId);
  renderTasks();
}

async function deleteTask(id) {
  const { tasks, source, sessionId } = await getActiveTasks();
  await saveTasks(tasks.filter(t => t.id !== id), source, sessionId);
  renderTasks();
}

// ─── Carry-over ───────────────────────────────────────────────────────────────

async function checkCarryOver() {
  const { timer, sessions = [], pendingTasks = [], carryOverDismissedId } =
    await chrome.storage.local.get(['timer', 'sessions', 'pendingTasks', 'carryOverDismissedId']);

  const banner = document.getElementById('carryOverBanner');

  if (timer?.state !== 'idle' || !sessions.length) {
    banner.style.display = 'none';
    return;
  }

  const lastSession = sessions[0];

  if (carryOverDismissedId === lastSession.id || pendingTasks.length > 0) {
    banner.style.display = 'none';
    return;
  }

  const incomplete = (lastSession.tasks || []).filter(t => !t.done);
  if (!incomplete.length) {
    banner.style.display = 'none';
    return;
  }

  const focusLabel = lastSession.focus || t.popup.noFocus || '—';
  const displayFocus = focusLabel.length > 22 ? focusLabel.slice(0, 22) + '…' : focusLabel;
  document.getElementById('carryOverMsg').textContent =
    (t.popup.carryOverMsg || '{n} tarea(s) de "{focus}"')
      .replace('{n}', incomplete.length)
      .replace('{focus}', displayFocus);

  banner.style.display = '';
}

async function doCarryOver() {
  const { sessions = [] } = await chrome.storage.local.get(['sessions']);
  if (!sessions.length) return;

  const lastSession = sessions[0];
  const incomplete = (lastSession.tasks || []).filter(t => !t.done);
  const carried = incomplete.map((task, i) => ({ ...task, id: Date.now() + i, done: false }));

  await chrome.storage.local.set({
    pendingTasks: carried,
    carryOverDismissedId: lastSession.id,
  });
  document.getElementById('carryOverBanner').style.display = 'none';
  renderTasks();
}

async function dismissCarryOver() {
  const { sessions = [] } = await chrome.storage.local.get(['sessions']);
  if (sessions.length) {
    await chrome.storage.local.set({ carryOverDismissedId: sessions[0].id });
  }
  document.getElementById('carryOverBanner').style.display = 'none';
}

// ─── History ──────────────────────────────────────────────────────────────────

function formatSessionDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const day   = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('default', { month: 'short' });
  const h     = String(d.getHours()).padStart(2, '0');
  const m     = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} · ${h}:${m}`;
}

async function renderHistory() {
  const { sessions = [] } = await chrome.storage.local.get(['sessions']);
  const list = document.getElementById('historyList');
  list.innerHTML = '';

  if (!sessions.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = t.popup.historyEmpty || 'No sessions yet.';
    list.appendChild(empty);
    return;
  }

  sessions.forEach(session => {
    const tasks       = session.tasks || [];
    const incomplete  = tasks.filter(t => !t.done);
    const doneCount   = tasks.length - incomplete.length;
    const actual      = session.actualMinutes !== null ? session.actualMinutes : session.plannedDuration;

    const card = document.createElement('div');
    card.className = 'session-card';

    // Top: focus label + status badge
    const top = document.createElement('div');
    top.className = 'session-card-top';

    const focus = document.createElement('span');
    focus.className = 'session-focus' + (session.focus ? '' : ' no-focus');
    focus.textContent = session.focus || (t.popup.noFocus || '—');

    const badge = document.createElement('span');
    badge.className = 'session-badge ' + (session.aborted ? 'aborted' : 'done');
    badge.textContent = session.aborted
      ? (t.popup.sessionAborted || 'ABORTED')
      : (t.popup.sessionDone || 'DONE');

    top.appendChild(focus);
    top.appendChild(badge);

    // Meta: date · time · task count
    const meta = document.createElement('div');
    meta.className = 'session-meta';

    const dateEl = document.createElement('span');
    dateEl.textContent = formatSessionDate(session.startedAt);

    const timeEl = document.createElement('span');
    timeEl.className = 'session-time' + (!session.aborted ? ' full' : '');
    timeEl.textContent = `⏱ ${actual}/${session.plannedDuration} min`;

    meta.appendChild(dateEl);
    meta.appendChild(timeEl);

    if (tasks.length > 0) {
      const tasksEl = document.createElement('span');
      tasksEl.textContent = `✓ ${doneCount}/${tasks.length}`;
      meta.appendChild(tasksEl);
    }

    card.appendChild(top);
    card.appendChild(meta);

    // Footer: incomplete count + reuse button
    if (incomplete.length > 0) {
      const footer = document.createElement('div');
      footer.className = 'session-card-footer';

      const incLabel = document.createElement('span');
      incLabel.className = 'session-incomplete-label';
      incLabel.textContent = (t.popup.sessionIncomplete || '{n} sin completar')
        .replace('{n}', incomplete.length);

      const reuseBtn = document.createElement('button');
      reuseBtn.className = 'session-reuse-btn';
      reuseBtn.textContent = t.popup.sessionReuse || 'RETOMAR →';
      reuseBtn.addEventListener('click', () => reuseSession(session));

      footer.appendChild(incLabel);
      footer.appendChild(reuseBtn);
      card.appendChild(footer);
    }

    list.appendChild(card);
  });
}

function showHistory() {
  renderHistory();
  document.getElementById('historyPanel').style.display = 'flex';
}

function hideHistory() {
  document.getElementById('historyPanel').style.display = 'none';
}

async function reuseSession(session) {
  const incomplete = (session.tasks || []).filter(t => !t.done);
  const carried = incomplete.map((task, i) => ({ ...task, id: Date.now() + i, done: false }));

  await chrome.storage.local.set({
    pendingTasks: carried,
    carryOverDismissedId: null,
  });

  if (session.focus) {
    document.getElementById('taskInput').value = session.focus;
  }

  hideHistory();
  await renderTasks();
  // pendingTasks is now populated, carry-over banner won't show
  await checkCarryOver();
}

// ─── Achievement toast ────────────────────────────────────────────────────────

async function showAchievementToast(id) {
  const toast     = document.getElementById('achievementToast');
  const toastText = document.getElementById('achievementToastText');
  const achData   = t.achievements?.[id];
  if (!achData) return;

  toastText.textContent = achData.name;
  toast.style.display   = 'flex';

  setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

// ─── Event listeners ──────────────────────────────────────────────────────────

function bindEvents() {
  document.getElementById('primaryBtn').addEventListener('click', async () => {
    const taskInput = document.getElementById('taskInput');
    chrome.runtime.sendMessage({ type: 'START', task: taskInput.value.trim() });
    taskInput.value = '';
    document.getElementById('carryOverBanner').style.display = 'none';

    setTimeout(async () => {
      await updateUI();
      await renderTasks();
    }, 100);
  });

  document.getElementById('stopBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP' });
    setTimeout(async () => {
      await updateUI();
      await renderTasks();
      await checkCarryOver();
    }, 150);
  });

  document.getElementById('taskInput').addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const val = e.target.value.trim();
      if (val) await addTask(val);
      e.target.value = '';
    }
  });

  document.getElementById('taskAddBtn').addEventListener('click', async () => {
    const input = document.getElementById('taskAddInput');
    await addTask(input.value);
    input.value = '';
  });

  document.getElementById('taskAddInput').addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      await addTask(e.target.value);
      e.target.value = '';
    }
  });

  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('achievementsBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html#achievements') });
  });

  document.getElementById('historyBtn').addEventListener('click', showHistory);
  document.getElementById('historyBack').addEventListener('click', hideHistory);

  document.getElementById('carryOverYes').addEventListener('click', doCarryOver);
  document.getElementById('carryOverNo').addEventListener('click', dismissCarryOver);

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'WORK_COMPLETE' || msg.type === 'BREAK_COMPLETE') {
      updateUI();
      renderTasks();
    }
    if (msg.type === 'BREAK_COMPLETE') {
      checkCarryOver();
    }
    if (msg.type === 'ACHIEVEMENT_UNLOCKED') {
      msg.ids.forEach(id => showAchievementToast(id));
    }
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function init() {
  await loadI18n();
  applyI18n();
  await updateUI();
  await renderTasks();
  await checkCarryOver();
  bindEvents();

  // Update timer display every second
  tickInterval = setInterval(updateUI, 1000);
}

init();
