let t = {};
let currentSettings = {};
let currentStats = {};
let currentAchievements = [];

const PRESETS = ['twitter.com', 'x.com', 'reddit.com', 'youtube.com', 'tiktok.com',
                 'instagram.com', 'facebook.com', 'twitch.tv', 'netflix.com', 'discord.com',
                 'linkedin.com', 'pinterest.com'];

const THEMES = [
  { id: 'red',    color: '#cc0000', unlockKey: null },
  { id: 'matrix', color: '#00cc44', unlockKey: 'veteran' },   // 10 sessions
  { id: 'void',   color: '#ffffff', unlockKey: 'addict' },    // 30 day streak
  { id: 'gold',   color: '#ffd700', unlockKey: 'century' },   // 100 sessions
];

const ACHIEVEMENT_ICONS = {
  first_blood:   '🎖',
  skill_checked: '😤',
  no_life:       '💀',
  enlightened:   '🔥',
  veteran:       '🪖',
  century:       '💯',
  time_lord:     '⏰',
  addict:        '🧠',
};

// ─── i18n ─────────────────────────────────────────────────────────────────────

async function loadI18n(lang) {
  const url = chrome.runtime.getURL(`i18n/${lang}.json`);
  const res = await fetch(url);
  t = await res.json();
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function initNav() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.dataset.section;
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
      link.classList.add('active');
      document.getElementById(`section-${section}`).classList.remove('hidden');
    });
  });
}

// ─── Render: Blocklist ────────────────────────────────────────────────────────

function renderBlocklist() {
  const blocklist = currentSettings.blocklist || [];

  // Preset chips
  const chipsEl = document.getElementById('presetChips');
  chipsEl.innerHTML = '';
  PRESETS.forEach(domain => {
    const chip = document.createElement('span');
    chip.className = `chip${blocklist.includes(domain) ? ' active' : ''}`;
    chip.textContent = domain.replace('.com', '').replace('.tv', '');
    chip.title = domain;
    chip.addEventListener('click', () => {
      if (blocklist.includes(domain)) {
        currentSettings.blocklist = blocklist.filter(d => d !== domain);
      } else {
        currentSettings.blocklist = [...blocklist, domain];
      }
      renderBlocklist();
    });
    chipsEl.appendChild(chip);
  });

  // Custom list
  const listEl = document.getElementById('blocklistItems');
  listEl.innerHTML = '';
  blocklist.forEach(domain => {
    if (PRESETS.includes(domain)) return; // Presets shown as chips
    const li = document.createElement('li');
    li.className = 'blocklist-item';

    const span = document.createElement('span');
    span.textContent = domain;

    const del = document.createElement('button');
    del.className = 'blocklist-item-del';
    del.textContent = '×';
    del.title = 'Remove';
    del.addEventListener('click', () => {
      currentSettings.blocklist = currentSettings.blocklist.filter(d => d !== domain);
      renderBlocklist();
    });

    li.appendChild(span);
    li.appendChild(del);
    listEl.appendChild(li);
  });
}

function addToBlocklist() {
  const input = document.getElementById('blocklistInput');
  let domain = input.value.trim().toLowerCase();
  if (!domain) return;

  // Strip protocol/path
  domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');

  if (!domain.includes('.')) { alert('Enter a valid domain (e.g. example.com)'); return; }
  if (currentSettings.blocklist.includes(domain)) { input.value = ''; return; }

  currentSettings.blocklist = [...(currentSettings.blocklist || []), domain];
  input.value = '';
  renderBlocklist();
}

// ─── Render: Themes ───────────────────────────────────────────────────────────

function renderThemes() {
  const grid = document.getElementById('themeGrid');
  grid.innerHTML = '';

  THEMES.forEach(({ id, color, unlockKey }) => {
    const unlocked = !unlockKey || currentAchievements.includes(unlockKey);
    const selected = currentSettings.theme === id;

    const card = document.createElement('div');
    card.className = `theme-card${selected ? ' selected' : ''}${!unlocked ? ' locked' : ''}`;

    const swatch = document.createElement('div');
    swatch.className = 'theme-swatch';
    swatch.style.background = color;
    swatch.style.border = `2px solid ${color}55`;

    const name = document.createElement('div');
    name.className = 'theme-name';
    name.textContent = id.toUpperCase();

    const desc = document.createElement('div');
    desc.className = 'theme-unlock';
    desc.textContent = t.themes?.[id] || id;

    if (!unlocked) {
      const lock = document.createElement('span');
      lock.className = 'theme-lock-icon';
      lock.textContent = '🔒';
      card.appendChild(lock);
    }

    card.appendChild(swatch);
    card.appendChild(name);
    card.appendChild(desc);
    grid.appendChild(card);

    if (unlocked) {
      card.addEventListener('click', () => {
        currentSettings.theme = id;
        document.body.className = `theme-${id}`;
        renderThemes();
      });
    }
  });
}

// ─── Render: Achievements ─────────────────────────────────────────────────────

function renderAchievements() {
  const grid = document.getElementById('achievementsGrid');
  grid.innerHTML = '';

  Object.keys(ACHIEVEMENT_ICONS).forEach(id => {
    const unlocked = currentAchievements.includes(id);
    const achData = t.achievements?.[id] || { name: id, desc: '' };

    const item = document.createElement('div');
    item.className = `achievement-item${unlocked ? ' unlocked' : ''}`;

    const icon = document.createElement('span');
    icon.className = 'achievement-icon';
    icon.textContent = ACHIEVEMENT_ICONS[id];

    const info = document.createElement('div');
    info.className = 'achievement-info';

    const name = document.createElement('div');
    name.className = 'achievement-name';
    name.textContent = achData.name;

    const desc = document.createElement('div');
    desc.className = 'achievement-desc';
    desc.textContent = achData.desc;

    const badge = document.createElement('span');
    badge.className = 'achievement-badge';
    badge.textContent = unlocked ? '✓ UNLOCKED' : 'LOCKED';

    info.appendChild(name);
    info.appendChild(desc);

    item.appendChild(icon);
    item.appendChild(info);
    item.appendChild(badge);
    grid.appendChild(item);
  });
}

// ─── Save ─────────────────────────────────────────────────────────────────────

async function save() {
  const workVal  = parseInt(document.getElementById('workDuration').value, 10);
  const breakVal = parseInt(document.getElementById('breakDuration').value, 10);
  const lang     = document.getElementById('languageSelect').value;

  if (isNaN(workVal) || workVal < 1 || workVal > 120) return;
  if (isNaN(breakVal) || breakVal < 1 || breakVal > 60) return;

  currentSettings.workDuration  = workVal;
  currentSettings.breakDuration = breakVal;
  currentSettings.language      = lang;

  await chrome.storage.local.set({ settings: currentSettings });

  // Notify background to refresh blocking rules if active
  chrome.runtime.sendMessage({ type: 'UPDATE_BLOCKLIST', blocklist: currentSettings.blocklist });

  // Reload i18n if language changed
  await loadI18n(lang);
  renderAll();

  const btn = document.getElementById('saveBtn');
  const original = btn.textContent;
  btn.textContent = t.options?.saved || 'SAVED ✓';
  btn.style.background = '#2d8c2d';
  setTimeout(() => {
    btn.textContent = original;
    btn.style.background = '';
  }, 2000);
}

function renderAll() {
  // Apply i18n to static elements
  document.getElementById('saveBtn').textContent = t.options?.btnSave || 'SAVE';
  document.getElementById('blocklistInput').placeholder = t.options?.addSitePlaceholder || 'domain.com';

  renderBlocklist();
  renderThemes();
  renderAchievements();
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function init() {
  const data = await chrome.storage.local.get(['settings', 'stats', 'achievements']);
  currentSettings     = data.settings     || {};
  currentStats        = data.stats        || {};
  currentAchievements = data.achievements || [];

  await loadI18n(currentSettings.language || 'es');

  // Apply theme
  document.body.className = `theme-${currentSettings.theme || 'red'}`;

  // Populate form fields
  document.getElementById('workDuration').value   = currentSettings.workDuration || 25;
  document.getElementById('breakDuration').value  = currentSettings.breakDuration || 5;
  document.getElementById('languageSelect').value = currentSettings.language || 'es';

  initNav();
  renderAll();

  // Deep-link support, e.g. options.html#achievements
  const targetSection = location.hash.slice(1);
  if (targetSection) {
    const link = document.querySelector(`.nav-link[data-section="${targetSection}"]`);
    if (link) link.click();
  }

  // Event listeners
  document.getElementById('blocklistAddBtn').addEventListener('click', addToBlocklist);
  document.getElementById('blocklistInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addToBlocklist();
  });

  document.getElementById('saveBtn').addEventListener('click', save);

  document.getElementById('resetStatsBtn').addEventListener('click', async () => {
    const msg = t.options?.confirmReset || 'Are you sure?';
    if (confirm(msg)) {
      const defaultStats = {
        streak: 0, lastStreakDate: null, totalSessions: 0,
        todaySessions: 0, todayDate: null, focusMinutes: 0, escapeAttempts: 0
      };
      await chrome.storage.local.set({ stats: defaultStats, achievements: [] });
      currentStats        = defaultStats;
      currentAchievements = [];
      renderAchievements();
    }
  });
}

init();
