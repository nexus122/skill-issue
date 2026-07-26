# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Skill Issue** is a Manifest V3 Chrome extension — a Pomodoro timer with site blocking. No build step, no bundler, no dependencies. All files are loaded directly by the browser.

To load it: open `chrome://extensions`, enable Developer Mode, click "Load unpacked", select this directory.

## Architecture

All state lives in `chrome.storage.local` under these keys: `settings`, `stats`, `timer`, `tasks`, `achievements`.

**`background.js`** — service worker; owns all timer logic, blocking rules, and achievement checks. All pages communicate with it via `chrome.runtime.sendMessage`. Messages: `START`, `STOP`, `COMPLETE_WORK`, `COMPLETE_BREAK`, `ESCAPE_ATTEMPT`, `UPDATE_BLOCKLIST`. It broadcasts back `WORK_COMPLETE`, `BREAK_COMPLETE`, `ACHIEVEMENT_UNLOCKED`. There is no pause — once a work session starts, the only way out is `STOP` (tracked as an aborted session), by design ("más disciplina").

**`offscreen.js`** — hidden offscreen document (via `chrome.offscreen`), the only place an MV3 service worker can play audio. `background.js` calls `playChime('work' | 'break')` on session/break completion; it lazily creates the offscreen document and messages it `PLAY_CHIME`. The chime is synthesized with the Web Audio API (two-tone oscillator), no audio asset needed.

**`popup/popup.js`** — reads storage and polls every second to render the timer. Sends messages to background for user actions. Visual hierarchy: the timer lives inside a `.timer-screen` bezel (the one framed/signature element on the page); streak/today/escapes render as a quiet single-line `.ambient-stats` readout under the header instead of a boxed stat bar; the task checklist is collapsed by default behind a `.tasks-toggle` disclosure (`.tasks-section.expanded` reveals `.tasks-body`) so the idle view stays timer-first.

**`blocked/blocked.js`** — shown when a blocked site is visited (via `declarativeNetRequest` redirect). Counts escape attempts, shows countdown, handles both work and break states.

**`options/options.js`** — settings page with three sections (Blocklist, Themes, Achievements). Saves to storage and sends `UPDATE_BLOCKLIST` to background.

## i18n

Translations live in `i18n/en.json` and `i18n/es.json`. Default language is Spanish (`es`). All pages fetch the translation file at runtime using `chrome.runtime.getURL`. Add new strings to both files in parallel.

## Themes & Achievements

Themes (`red`, `matrix`, `void`, `gold`) are applied via `document.body.className = 'theme-{id}'`. The non-default themes are locked behind achievements. Achievement IDs are defined in `background.js` (`ACHIEVEMENTS_DEF`) and their display strings are in the i18n files under `achievements`.

Blocking uses `chrome.declarativeNetRequest` dynamic rules. Rule IDs are assigned by blocklist index (1-based), so the entire rule set is replaced on every update.
