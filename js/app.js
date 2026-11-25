import { randomInt, shuffleArray } from './rng.js';
import {
  loadDraft,
  saveDraft,
  getSavedLists,
  upsertSavedList,
  deleteSavedList,
  exportAllData,
  importAllData,
  loadPreferences,
  savePreferences
} from './storage.js';
import { parseWeightedLine, pickWeightedWinners } from './picker.js';
import { splitIntoNamedTeams, formatTeamsText } from './teams.js';
import { buildBracket, scoreMatchSlot, cloneBracket, formatBracketText } from './bracket.js';

const SAMPLE_ENTRIES = [
  'Chuy99 x3',
  'Meli_GG',
  'DonTaco x2',
  'ValeriaK',
  'PacoRueda',
  'Nadia.exe x4',
  'BetoSalsa',
  'Kike_04'
];

const state = {
  activeMode: 'picker',
  isRolling: false,
  rollTimer: null,
  lastWinners: [],
  winnerHistory: [],
  lastTeams: [],
  initialBracket: null,
  currentBracket: null,
  prefs: {
    theme: 'dark',
    sound: true,
    animation: true,
    dedupeAuto: false,
    weights: true
  }
};

const dom = {
  html: document.documentElement,
  themeMeta: document.querySelector('meta[name="theme-color"]'),
  btnExportJson: document.getElementById('btn-export-json'),
  btnImportJson: document.getElementById('btn-import-json'),
  fileImportJson: document.getElementById('file-import-json'),
  btnSound: document.getElementById('btn-sound-toggle'),
  btnTheme: document.getElementById('btn-theme-toggle'),
  entryCounter: document.getElementById('entry-counter'),
  ticketCounter: document.getElementById('ticket-counter'),
  savedListsSelect: document.getElementById('saved-lists-select'),
  btnSaveList: document.getElementById('btn-save-list'),
  btnDeleteList: document.getElementById('btn-delete-list'),
  entriesInput: document.getElementById('entries-input'),
  excludeInput: document.getElementById('exclude-input'),
  btnLoadSample: document.getElementById('btn-load-sample'),
  btnShuffleInput: document.getElementById('btn-shuffle-input'),
  btnSortInput: document.getElementById('btn-sort-input'),
  btnDedupe: document.getElementById('btn-dedupe'),
  btnClearInput: document.getElementById('btn-clear-input'),
  toggleWeights: document.getElementById('toggle-weights'),
  toggleAnimation: document.getElementById('toggle-animation'),
  toggleDedupeAuto: document.getElementById('toggle-dedupe-auto'),
  modeTabs: document.querySelectorAll('.tab-btn'),
  modeViews: document.querySelectorAll('.tool-pane'),
  pickerCount: document.getElementById('picker-count'),
  pickerRollSpeed: document.getElementById('picker-roll-speed'),
  pickerRemoveWinner: document.getElementById('picker-remove-winner'),
  btnPickWinner: document.getElementById('btn-pick-winner'),
  btnCopyWinners: document.getElementById('btn-copy-winners'),
  pickerStage: document.getElementById('picker-stage'),
  winnerHistoryWrap: document.getElementById('winner-history-wrap'),
  winnerHistoryList: document.getElementById('winner-history-list'),
  btnExcludeHistory: document.getElementById('btn-exclude-history'),
  btnClearHistory: document.getElementById('btn-clear-history'),
  teamsSplitBy: document.getElementById('teams-split-by'),
  teamsValueLabel: document.getElementById('teams-value-label'),
  teamsValue: document.getElementById('teams-value'),
  teamsCustomNames: document.getElementById('teams-custom-names'),
  btnGenerateTeams: document.getElementById('btn-generate-teams'),
  btnCopyTeams: document.getElementById('btn-copy-teams'),
  teamsStage: document.getElementById('teams-stage'),
  bracketSeeding: document.getElementById('bracket-seeding'),
  bracketSeries: document.getElementById('bracket-series'),
  bracketThirdPlace: document.getElementById('bracket-third-place'),
  btnGenerateBracket: document.getElementById('btn-generate-bracket'),
  btnResetBracket: document.getElementById('btn-reset-bracket'),
  btnCopyBracket: document.getElementById('btn-copy-bracket'),
  bracketStage: document.getElementById('bracket-stage'),
  toastRegion: document.getElementById('toast-region'),
  confettiCanvas: document.getElementById('confetti-canvas')
};

let audioCtx = null;

function playTone(freq, duration = 0.08, type = 'sine', gainValue = 0.055, delay = 0) {
  if (!state.prefs.sound) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  if (!audioCtx) audioCtx = new AudioContextClass();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const now = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(gainValue, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

function playTickSound() {
  playTone(500 + randomInt(190), 0.038, 'triangle', 0.035);
}

function playWinSound() {
  playTone(523.25, 0.13, 'triangle', 0.065, 0);
  playTone(659.25, 0.13, 'triangle', 0.065, 0.075);
  playTone(783.99, 0.16, 'triangle', 0.075, 0.15);
  playTone(1046.5, 0.3, 'sine', 0.08, 0.22);
}

function playClickSound() {
  playTone(420, 0.045, 'sine', 0.035);
}

function showToast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  dom.toastRegion.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    el.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
    setTimeout(() => el.remove(), 190);
  }, 2400);
}

function launchConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = dom.confettiCanvas;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const palette = ['#f59e0b', '#34d399', '#fb7185', '#f3efe6', '#fbbf24'];
  const particles = Array.from({ length: 75 }, () => ({
    x: canvas.width * (0.28 + Math.random() * 0.44),
    y: canvas.height * 0.45,
    vx: (Math.random() - 0.5) * 13,
    vy: -5.5 - Math.random() * 9,
    size: 5 + Math.random() * 5,
    color: palette[randomInt(palette.length)],
    rotation: Math.random() * 360,
    vRot: (Math.random() - 0.5) * 12,
    alpha: 1
  }));

  let frameId = null;
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = 0;
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35;
      p.vx *= 0.99;
      p.rotation += p.vRot;
      p.alpha -= 0.012;
      if (p.alpha <= 0) continue;
      alive++;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    if (alive > 0) {
      frameId = requestAnimationFrame(render);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cancelAnimationFrame(frameId);
    }
  }
  requestAnimationFrame(render);
}

function getExcludedSet() {
  const tokens = dom.excludeInput.value
    .split(/[\r\n,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set(tokens);
}

function getActiveRoster() {
  const excluded = getExcludedSet();
  const lines = dom.entriesInput.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = [];
  const seen = new Set();

  for (const line of lines) {
    const item = parseWeightedLine(line, state.prefs.weights);
    if (!item) continue;
    const key = item.name.toLowerCase();
    if (excluded.has(key)) continue;

    if (state.prefs.dedupeAuto) {
      if (seen.has(key)) continue;
      seen.add(key);
    }

    parsed.push(item);
  }

  return parsed;
}

function updateEntryCounter(bump = false) {
  const roster = getActiveRoster();
  const count = roster.length;
  const totalTickets = roster.reduce((sum, item) => sum + item.weight, 0);

  dom.entryCounter.textContent = `${count} ${count === 1 ? 'name' : 'names'}`;
  if (state.prefs.weights && totalTickets !== count && count > 0) {
    dom.ticketCounter.hidden = false;
    dom.ticketCounter.textContent = `${totalTickets} tickets`;
  } else {
    dom.ticketCounter.hidden = true;
  }

  if (bump) {
    dom.entryCounter.classList.remove('is-bump');
    void dom.entryCounter.offsetWidth;
    dom.entryCounter.classList.add('is-bump');
  }
}

let draftSaveTimer = null;
function scheduleDraftSave() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    saveDraft(dom.entriesInput.value);
  }, 250);
}

function applyTheme(theme) {
  state.prefs.theme = theme === 'light' ? 'light' : 'dark';
  dom.html.setAttribute('data-theme', state.prefs.theme);
  if (dom.themeMeta) {
    dom.themeMeta.setAttribute('content', state.prefs.theme === 'dark' ? '#121110' : '#f6f3ec');
  }
}

function applySoundPref(enabled) {
  state.prefs.sound = Boolean(enabled);
  dom.btnSound.setAttribute('aria-pressed', String(state.prefs.sound));
  const label = dom.btnSound.querySelector('.btn-label');
  if (label) label.textContent = state.prefs.sound ? 'Audio: On' : 'Audio: Off';
}

function persistPrefs() {
  savePreferences(state.prefs);
}

function refreshSavedListsSelect(selectedId = '') {
  const lists = getSavedLists();
  dom.savedListsSelect.innerHTML = '';

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = lists.length ? `Saved rosters (${lists.length})` : 'Saved rosters';
  dom.savedListsSelect.appendChild(defaultOpt);

  for (const list of lists) {
    const opt = document.createElement('option');
    opt.value = list.id;
    opt.textContent = `${list.name} (${list.entries.length})`;
    dom.savedListsSelect.appendChild(opt);
  }

  dom.savedListsSelect.value = selectedId;
  dom.btnDeleteList.disabled = !dom.savedListsSelect.value;
}

function switchMode(mode) {
  if (state.activeMode === mode) return;
  state.activeMode = mode;

  dom.modeTabs.forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });

  dom.modeViews.forEach((view) => {
    const active = view.id === `panel-${mode}`;
    view.classList.toggle('is-active', active);
    view.hidden = !active;
  });

  playClickSound();
}

function renderWinnerCards(winners, rolling = false) {
  dom.pickerStage.innerHTML = '';
  const showcase = document.createElement('div');
  showcase.className = 'winner-showcase';

  winners.forEach((entry, idx) => {
    const item = typeof entry === 'string' ? { name: entry, weight: 1, totalWeight: 0 } : entry;
    const card = document.createElement('article');
    card.className = `winner-card${rolling ? ' is-rolling' : ''}`;

    const badge = document.createElement('span');
    badge.className = 'winner-rank';
    badge.textContent = rolling
      ? 'Rolling'
      : winners.length > 1
        ? `Pick #${idx + 1}`
        : 'Winner';

    const title = document.createElement('h2');
    title.className = 'winner-name';
    title.textContent = item.name;

    card.append(badge, title);

    if (!rolling && state.prefs.weights && item.totalWeight > 0) {
      const pct = ((item.weight / item.totalWeight) * 100).toFixed(1);
      const odds = document.createElement('p');
      odds.className = 'winner-odds';
      odds.textContent = `${item.weight} ${item.weight === 1 ? 'ticket' : 'tickets'} (${pct}% odds)`;
      card.appendChild(odds);
    }

    showcase.appendChild(card);
  });

  dom.pickerStage.appendChild(showcase);
}

function renderWinnerHistory() {
  if (!state.winnerHistory.length) {
    dom.winnerHistoryWrap.hidden = true;
    dom.winnerHistoryList.innerHTML = '';
    return;
  }
  dom.winnerHistoryWrap.hidden = false;
  dom.winnerHistoryList.innerHTML = '';
  for (const name of state.winnerHistory) {
    const li = document.createElement('li');
    li.textContent = name;
    dom.winnerHistoryList.appendChild(li);
  }
}

function removeEntriesFromTextarea(namesToRemove) {
  const counts = new Map();
  for (const name of namesToRemove) {
    const key = name.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const lines = dom.entriesInput.value.split(/\r?\n/);
  const remaining = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = parseWeightedLine(trimmed, state.prefs.weights);
    const key = parsed.name.toLowerCase();
    const left = counts.get(key) || 0;
    if (left > 0) {
      counts.set(key, left - 1);
    } else {
      remaining.push(trimmed);
    }
  }

  dom.entriesInput.value = remaining.join('\n');
  updateEntryCounter(true);
  scheduleDraftSave();
}

function finalizeWinners(winners) {
  state.isRolling = false;
  dom.btnPickWinner.disabled = false;
  const names = winners.map((w) => w.name);
  state.lastWinners = names;
  state.winnerHistory.push(...names);

  renderWinnerCards(winners, false);
  renderWinnerHistory();
  dom.btnCopyWinners.disabled = false;

  if (dom.pickerRemoveWinner.checked) {
    removeEntriesFromTextarea(names);
  }

  playWinSound();
  launchConfetti();
}

function handlePickWinner() {
  if (state.isRolling) return;
  const roster = getActiveRoster();
  if (!roster.length) {
    showToast('Add at least 1 active name first.');
    dom.entriesInput.focus();
    return;
  }

  const requestedCount = Math.max(1, Math.min(100, Number.parseInt(dom.pickerCount.value, 10) || 1));
  dom.pickerCount.value = String(requestedCount);
  const winners = pickWeightedWinners(roster, requestedCount);

  if (!state.prefs.animation || roster.length === 1) {
    finalizeWinners(winners);
    return;
  }

  state.isRolling = true;
  dom.btnPickWinner.disabled = true;

  let step = 0;
  const totalSteps = Number.parseInt(dom.pickerRollSpeed.value, 10) || 16;

  function tick() {
    step++;
    if (step >= totalSteps) {
      finalizeWinners(winners);
      return;
    }
    const preview = Array.from({ length: winners.length }, () => roster[randomInt(roster.length)].name);
    renderWinnerCards(preview, true);
    playTickSound();
    const nextDelay = 42 + Math.pow(step / totalSteps, 2) * 130;
    state.rollTimer = setTimeout(tick, nextDelay);
  }

  tick();
}

function renderTeams(teams) {
  dom.teamsStage.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'teams-grid';

  teams.forEach((team, index) => {
    const card = document.createElement('article');
    card.className = 'team-card';
    card.style.animationDelay = `${Math.min(index * 35, 280)}ms`;

    const header = document.createElement('header');
    header.className = 'team-card-header';

    const title = document.createElement('h3');
    title.className = 'team-name';
    title.textContent = team.name;

    const badge = document.createElement('span');
    badge.className = 'team-count';
    badge.textContent = `${team.members.length}`;

    header.append(title, badge);

    const list = document.createElement('ul');
    list.className = 'team-members';
    for (const member of team.members) {
      const li = document.createElement('li');
      li.textContent = member;
      list.appendChild(li);
    }

    card.append(header, list);
    grid.appendChild(card);
  });

  dom.teamsStage.appendChild(grid);
}

function handleGenerateTeams() {
  const roster = getActiveRoster();
  if (roster.length < 2) {
    showToast('Need at least 2 active names for teams.');
    dom.entriesInput.focus();
    return;
  }

  const mode = dom.teamsSplitBy.value;
  const rawValue = Math.max(1, Number.parseInt(dom.teamsValue.value, 10) || 2);
  const customNames = dom.teamsCustomNames.value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const names = roster.map((r) => r.name);
  const teams = splitIntoNamedTeams(names, { mode, value: rawValue, teamNames: customNames });

  state.lastTeams = teams;
  renderTeams(teams);
  dom.btnCopyTeams.disabled = false;
  playClickSound();
}

function buildMatchCardElement(match, rIdx, mIdx, bestOf, isBronze = false) {
  const card = document.createElement('div');
  card.className = `match-card${isBronze ? ' is-bronze' : ''}`;

  match.slots.forEach((participant, sIdx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'match-slot';

    const isBye = participant === 'BYE';
    const isTbd = !participant;
    const isWinner = Boolean(participant && !isBye && match.winner === participant);
    const isEliminated = Boolean(match.winner && participant && !isBye && match.winner !== participant);

    if (isBye) btn.classList.add('is-bye');
    if (isTbd) btn.classList.add('is-tbd');
    if (isWinner) btn.classList.add(isBronze ? 'is-bronze-winner' : 'is-winner');
    if (isEliminated) btn.classList.add('is-eliminated');

    const nameSpan = document.createElement('span');
    nameSpan.textContent = isTbd ? 'TBD' : participant;
    btn.appendChild(nameSpan);

    if (bestOf > 1 && participant && !isBye) {
      const scoreBadge = document.createElement('span');
      scoreBadge.className = 'slot-score';
      scoreBadge.textContent = String(match.scores?.[sIdx] || 0);
      btn.appendChild(scoreBadge);
    } else if (isWinner) {
      const check = document.createElement('span');
      check.textContent = '✓';
      check.setAttribute('aria-hidden', 'true');
      btn.appendChild(check);
    }

    const otherSlot = match.slots[1 - sIdx];
    const canInteract = Boolean(participant && !isBye && otherSlot !== 'BYE');
    btn.disabled = !canInteract;

    if (canInteract) {
      btn.addEventListener('click', () => {
        const updated = scoreMatchSlot(state.currentBracket, rIdx, mIdx, sIdx, 1, isBronze);
        state.currentBracket = updated;
        renderBracket(updated);
        playClickSound();

        if (!isBronze) {
          const finalRound = updated.rounds[updated.rounds.length - 1];
          const champion = finalRound?.matches[0]?.winner;
          if (champion && rIdx === updated.rounds.length - 1) {
            playWinSound();
            launchConfetti();
            showToast(`Champion: ${champion}`);
          }
        }
      });

      btn.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        if (bestOf <= 1) return;
        const updated = scoreMatchSlot(state.currentBracket, rIdx, mIdx, sIdx, -1, isBronze);
        state.currentBracket = updated;
        renderBracket(updated);
        playClickSound();
      });
    }

    card.appendChild(btn);
  });

  return card;
}

function renderBracket(bracket) {
  dom.bracketStage.innerHTML = '';
  if (!bracket || !bracket.rounds.length) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'bracket-layout';

  const tree = document.createElement('div');
  tree.className = 'bracket-tree';

  bracket.rounds.forEach((round, rIdx) => {
    const roundCol = document.createElement('div');
    roundCol.className = 'bracket-round';

    const heading = document.createElement('h3');
    heading.className = 'bracket-round-title';
    heading.textContent = round.name;
    roundCol.appendChild(heading);

    round.matches.forEach((match, mIdx) => {
      roundCol.appendChild(buildMatchCardElement(match, rIdx, mIdx, bracket.bestOf, false));
    });

    tree.appendChild(roundCol);
  });

  wrapper.appendChild(tree);

  if (bracket.thirdPlaceMatch) {
    const bronzeWrap = document.createElement('div');
    const bronzeHeading = document.createElement('h3');
    bronzeHeading.className = 'bracket-round-title is-bronze';
    bronzeHeading.textContent = '3rd Place Match';
    bronzeWrap.append(
      bronzeHeading,
      buildMatchCardElement(bracket.thirdPlaceMatch, 0, 0, bracket.bestOf, true)
    );
    wrapper.appendChild(bronzeWrap);
  }

  dom.bracketStage.appendChild(wrapper);
}

function handleGenerateBracket() {
  const roster = getActiveRoster();
  if (roster.length < 2) {
    showToast('Need at least 2 active names for a bracket.');
    dom.entriesInput.focus();
    return;
  }

  const seedingMode = dom.bracketSeeding.value;
  let orderedNames;
  if (seedingMode === 'weighted') {
    orderedNames = [...roster]
      .sort((a, b) => b.weight - a.weight)
      .map((item) => item.name);
  } else {
    orderedNames = roster.map((item) => item.name);
  }

  const bestOf = Number.parseInt(dom.bracketSeries.value, 10) || 1;
  const thirdPlace = dom.bracketThirdPlace.checked;
  const bracket = buildBracket(orderedNames, {
    seeding: seedingMode === 'weighted' ? 'seeded' : seedingMode,
    bestOf,
    thirdPlace
  });

  state.initialBracket = cloneBracket(bracket);
  state.currentBracket = bracket;

  renderBracket(bracket);
  dom.btnResetBracket.disabled = false;
  dom.btnCopyBracket.disabled = false;
  playClickSound();
}

async function copyText(text, successMsg) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg);
  } catch {
    showToast('Copy blocked by browser.');
  }
}

function bindEvents() {
  dom.btnTheme.addEventListener('click', () => {
    applyTheme(state.prefs.theme === 'dark' ? 'light' : 'dark');
    persistPrefs();
    playClickSound();
  });

  dom.btnSound.addEventListener('click', () => {
    applySoundPref(!state.prefs.sound);
    persistPrefs();
    if (state.prefs.sound) playClickSound();
  });

  dom.btnExportJson.addEventListener('click', () => {
    const blob = new Blob([exportAllData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `draw-bracket-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Exported JSON backup.');
  });

  dom.btnImportJson.addEventListener('click', () => {
    dom.fileImportJson.click();
  });

  dom.fileImportJson.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const count = importAllData(text);
      refreshSavedListsSelect();
      showToast(`Imported backup (${count} rosters).`);
    } catch {
      showToast('Invalid JSON backup file.');
    } finally {
      dom.fileImportJson.value = '';
    }
  });

  dom.entriesInput.addEventListener('input', () => {
    updateEntryCounter(false);
    scheduleDraftSave();
  });

  dom.excludeInput.addEventListener('input', () => {
    updateEntryCounter(false);
  });

  dom.btnLoadSample.addEventListener('click', () => {
    dom.entriesInput.value = SAMPLE_ENTRIES.join('\n');
    updateEntryCounter(true);
    scheduleDraftSave();
    playClickSound();
    showToast('Loaded sample with weights.');
  });

  dom.btnShuffleInput.addEventListener('click', () => {
    const lines = dom.entriesInput.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) return;
    dom.entriesInput.value = shuffleArray(lines).join('\n');
    updateEntryCounter(true);
    scheduleDraftSave();
    playClickSound();
    showToast('Mixed lines.');
  });

  dom.btnSortInput.addEventListener('click', () => {
    const lines = dom.entriesInput.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) return;
    lines.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    dom.entriesInput.value = lines.join('\n');
    updateEntryCounter(true);
    scheduleDraftSave();
    playClickSound();
    showToast('Sorted A–Z.');
  });

  dom.btnDedupe.addEventListener('click', () => {
    const raw = dom.entriesInput.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const seen = new Set();
    const unique = raw.filter((line) => {
      const key = parseWeightedLine(line, state.prefs.weights).name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const removed = raw.length - unique.length;
    dom.entriesInput.value = unique.join('\n');
    updateEntryCounter(true);
    scheduleDraftSave();
    playClickSound();
    showToast(removed > 0 ? `Trimmed ${removed} duplicate${removed === 1 ? '' : 's'}.` : 'No duplicates.');
  });

  dom.btnClearInput.addEventListener('click', () => {
    dom.entriesInput.value = '';
    dom.savedListsSelect.value = '';
    dom.btnDeleteList.disabled = true;
    updateEntryCounter(true);
    scheduleDraftSave();
    playClickSound();
  });

  dom.toggleWeights.addEventListener('change', () => {
    state.prefs.weights = dom.toggleWeights.checked;
    persistPrefs();
    updateEntryCounter(true);
  });

  dom.toggleAnimation.addEventListener('change', () => {
    state.prefs.animation = dom.toggleAnimation.checked;
    persistPrefs();
  });

  dom.toggleDedupeAuto.addEventListener('change', () => {
    state.prefs.dedupeAuto = dom.toggleDedupeAuto.checked;
    persistPrefs();
    updateEntryCounter(true);
  });

  dom.btnSaveList.addEventListener('click', () => {
    const rawLines = dom.entriesInput.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!rawLines.length) {
      showToast('Add at least 1 name to save.');
      return;
    }
    const currentId = dom.savedListsSelect.value;
    const existing = getSavedLists().find((item) => item.id === currentId);
    const defaultName = existing ? existing.name : `Roster (${rawLines.length})`;
    const name = window.prompt('Roster name:', defaultName);
    if (!name || !name.trim()) return;

    const saved = upsertSavedList({
      id: existing ? existing.id : undefined,
      name: name.trim(),
      entries: rawLines
    });
    refreshSavedListsSelect(saved.id);
    showToast(`Saved "${saved.name}".`);
  });

  dom.savedListsSelect.addEventListener('change', () => {
    const id = dom.savedListsSelect.value;
    dom.btnDeleteList.disabled = !id;
    if (!id) return;
    const found = getSavedLists().find((item) => item.id === id);
    if (!found) return;
    dom.entriesInput.value = found.entries.join('\n');
    updateEntryCounter(true);
    scheduleDraftSave();
    playClickSound();
    showToast(`Loaded "${found.name}".`);
  });

  dom.btnDeleteList.addEventListener('click', () => {
    const id = dom.savedListsSelect.value;
    if (!id) return;
    deleteSavedList(id);
    refreshSavedListsSelect('');
    showToast('Removed roster.');
  });

  dom.modeTabs.forEach((tab) => {
    tab.addEventListener('click', () => switchMode(tab.dataset.mode));
  });

  dom.btnPickWinner.addEventListener('click', handlePickWinner);

  dom.btnCopyWinners.addEventListener('click', () => {
    if (!state.lastWinners.length) return;
    const text = state.lastWinners.length === 1
      ? state.lastWinners[0]
      : state.lastWinners.map((w, i) => `${i + 1}. ${w}`).join('\n');
    copyText(text, 'Copied.');
  });

  dom.btnExcludeHistory.addEventListener('click', () => {
    if (!state.winnerHistory.length) return;
    const current = dom.excludeInput.value
      .split(/[\r\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const merged = Array.from(new Set([...current, ...state.winnerHistory]));
    dom.excludeInput.value = merged.join(', ');
    updateEntryCounter(true);
    showToast('Added past winners to exclusions.');
  });

  dom.btnClearHistory.addEventListener('click', () => {
    state.winnerHistory = [];
    renderWinnerHistory();
    playClickSound();
  });

  dom.teamsSplitBy.addEventListener('change', () => {
    const isCount = dom.teamsSplitBy.value === 'count';
    dom.teamsValueLabel.textContent = isCount ? 'Teams' : 'Per team';
    dom.teamsValue.min = isCount ? '2' : '1';
  });

  dom.btnGenerateTeams.addEventListener('click', handleGenerateTeams);

  dom.btnCopyTeams.addEventListener('click', () => {
    if (!state.lastTeams.length) return;
    copyText(formatTeamsText(state.lastTeams), 'Copied teams.');
  });

  dom.btnGenerateBracket.addEventListener('click', handleGenerateBracket);

  dom.btnResetBracket.addEventListener('click', () => {
    if (!state.initialBracket) return;
    state.currentBracket = cloneBracket(state.initialBracket);
    renderBracket(state.currentBracket);
    playClickSound();
    showToast('Reset matches.');
  });

  dom.btnCopyBracket.addEventListener('click', () => {
    if (!state.currentBracket) return;
    copyText(formatBracketText(state.currentBracket), 'Copied bracket.');
  });

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      if (state.activeMode === 'picker') handlePickWinner();
      else if (state.activeMode === 'teams') handleGenerateTeams();
      else if (state.activeMode === 'bracket') handleGenerateBracket();
    }
  });
}

function init() {
  const savedPrefs = loadPreferences();
  state.prefs = { ...state.prefs, ...savedPrefs };

  applyTheme(state.prefs.theme);
  applySoundPref(state.prefs.sound);
  dom.toggleWeights.checked = state.prefs.weights;
  dom.toggleAnimation.checked = state.prefs.animation;
  dom.toggleDedupeAuto.checked = state.prefs.dedupeAuto;

  const draft = loadDraft();
  if (draft) {
    dom.entriesInput.value = draft;
  }

  refreshSavedListsSelect();
  updateEntryCounter(false);
  bindEvents();
}

init();