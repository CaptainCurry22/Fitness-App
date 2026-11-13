/* Trainings-Tracker – App-Logik (Vanilla JS, kein Build-Schritt).
 * Der Trainingsplan steht in plan.js (UEBUNGEN, TAGE). */
'use strict';

const APP_VERSION = '1.0.0';
const DAYS = Object.keys(TAGE);
const DEFAULT_SETTINGS = { theme: 'system', autoTimer: true, sound: true, restCompound: 150, restIsolation: 75 };

/* ================= Hilfsfunktionen ================= */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const pad = (n) => String(n).padStart(2, '0');

function isoDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayISO() { return isoDate(new Date()); }
function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
const fmtShort = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });
const fmtLong = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtTable = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
const dateShort = (iso) => fmtShort.format(parseISO(iso));
const dateLong = (iso) => fmtLong.format(parseISO(iso));

/** Zahl aus Eingabe lesen, Komma oder Punkt als Dezimaltrennzeichen. null = leer, NaN = ungültig */
function parseNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  if (!/^\d*\.?\d*$/.test(s) || s === '.') return NaN;
  return Number(s);
}
const fmtNum = (n) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 });
/** Zahl für ein Eingabefeld (mit Komma) */
const toInput = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
const fmtClock = (sec) => `${Math.floor(sec / 60)}:${pad(Math.max(0, sec) % 60)}`;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

function exDef(id, fallbackName) {
  return UEBUNGEN[id] || { name: fallbackName || id, art: 'isolation', messung: 'wdh', gewicht: 'optional' };
}
/** Körpergewicht- oder Zeitübung → Fortschritt als Summe statt Höchstgewicht */
const isVolumeMetric = (def) => def.gewicht === 'optional' || def.messung === 'sek';
const restFor = (def) => (def.art === 'grund' ? state.settings.restCompound : state.settings.restIsolation);

function formatSets(sets, def) {
  const groups = [];
  for (const s of sets) {
    const kg = s.kg > 0 ? s.kg : null;
    const g = groups[groups.length - 1];
    if (g && g.kg === kg) g.reps.push(s.reps); else groups.push({ kg, reps: [s.reps] });
  }
  return groups.map((g) => {
    const unit = def.messung === 'sek' ? ' s' : (g.kg === null ? ' Wdh.' : '');
    return (g.kg !== null ? `${fmtNum(g.kg)} kg × ` : '') + g.reps.map(fmtNum).join(', ') + unit;
  }).join(' · ');
}

/* ================= IndexedDB ================= */
const DB = (() => {
  let dbPromise;
  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('trainings-tracker', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  async function run(stores, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result;
      const req = fn(tx);
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  return {
    allSessions: () => run('sessions', 'readonly', (tx) => tx.objectStore('sessions').getAll()),
    putSession: (s) => run('sessions', 'readwrite', (tx) => tx.objectStore('sessions').put(s)),
    deleteSession: (id) => run('sessions', 'readwrite', (tx) => tx.objectStore('sessions').delete(id)),
    get: (key) => run('kv', 'readonly', (tx) => tx.objectStore('kv').get(key)),
    set: (key, val) => run('kv', 'readwrite', (tx) => tx.objectStore('kv').put(val, key)),
    del: (key) => run('kv', 'readwrite', (tx) => tx.objectStore('kv').delete(key)),
    replaceAll: (sessions, settings) => run(['sessions', 'kv'], 'readwrite', (tx) => {
      const ss = tx.objectStore('sessions');
      ss.clear();
      sessions.forEach((s) => ss.put(s));
      const kv = tx.objectStore('kv');
      kv.clear();
      kv.put(settings, 'settings');
    }),
  };
})();

/* ================= Zustand ================= */
const state = {
  sessions: [],          // neueste zuerst
  settings: { ...DEFAULT_SETTINGS },
  view: 'training',
  day: DAYS[0],
  editId: null,          // ID der Einheit, die gerade bearbeitet wird
  draft: null,           // { date, ex: { [uebungId]: [{kg, reps, done}] }, names: {} }
  expanded: new Set(),   // aufgeklappte Einträge im Verlauf
  progressId: null,
};

function sortSessions() {
  state.sessions.sort((a, b) => (b.date === a.date ? (b.createdAt || 0) - (a.createdAt || 0) : (b.date < a.date ? -1 : 1)));
}
function nextDay() {
  const last = state.sessions[0];
  if (!last) return DAYS[0];
  const i = DAYS.indexOf(last.day);
  return i === -1 ? DAYS[0] : DAYS[(i + 1) % DAYS.length];
}

/* ---------- Entwürfe ---------- */
const emptySet = () => ({ kg: '', reps: '', done: false });
const draftKey = () => (state.editId ? 'edit' : `draft:${state.day}`);
const draftHasValues = (d) => !!d && Object.values(d.ex).some((sets) => sets.some((s) => s.kg !== '' || s.reps !== ''));

function freshDraft(day) {
  const ex = {};
  for (const p of TAGE[day]) ex[p.uebung] = Array.from({ length: p.saetze }, emptySet);
  return { date: todayISO(), ex, names: {} };
}
async function loadDraft(day) {
  const saved = await DB.get(`draft:${day}`).catch(() => null);
  const draft = freshDraft(day);
  if (saved && saved.ex) {
    for (const id of Object.keys(draft.ex)) if (Array.isArray(saved.ex[id]) && saved.ex[id].length) draft.ex[id] = saved.ex[id];
    draft.date = draftHasValues(draft) && saved.date ? saved.date : todayISO();
  }
  return draft;
}
let saveTimer = null;
function saveDraftSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraftNow, 150);
}
function saveDraftNow() {
  clearTimeout(saveTimer);
  if (!state.draft) return Promise.resolve();
  const p = state.editId
    ? DB.set('edit', { editId: state.editId, day: state.day, draft: state.draft })
    : DB.set(draftKey(), state.draft);
  return p.catch((e) => console.error('Entwurf nicht gespeichert', e));
}

/** Übungen des aktuellen Tages (+ Übungen der bearbeiteten Einheit, die nicht mehr im Plan stehen) */
function currentEntries() {
  const plan = TAGE[state.day] || [];
  const list = plan.map((p) => ({ id: p.uebung, def: exDef(p.uebung), saetze: p.saetze, ziel: p.ziel }));
  for (const id of Object.keys(state.draft.ex)) {
    if (!list.some((e) => e.id === id)) list.push({ id, def: exDef(id, state.draft.names[id]), saetze: state.draft.ex[id].length, ziel: null });
  }
  return list;
}

/** Letzte Leistung einer Übung (gemeinsamer Verlauf über alle Tage) */
function previous(id) {
  const editing = state.editId ? state.sessions.find((s) => s.id === state.editId) : null;
  for (const s of state.sessions) {
    if (s.id === state.editId) continue;
    if (editing && (s.date > editing.date || (s.date === editing.date && (s.createdAt || 0) > (editing.createdAt || 0)))) continue;
    const ex = s.exercises.find((e) => e.id === id);
    if (ex && ex.sets.length) return { date: s.date, sets: ex.sets };
  }
  return null;
}

function progressionHint(entry, prev) {
  if (!prev || !entry.ziel) return null;
  const top = entry.ziel[1];
  if (prev.sets.length < entry.saetze || !prev.sets.every((s) => s.reps >= top)) return null;
  if (entry.def.messung === 'sek') return 'Oberes Ende erreicht – nächstes Mal länger halten oder Zusatzgewicht.';
  return entry.def.art === 'grund'
    ? 'Nächstes Mal mehr Gewicht: +2,5 kg (Grundübung)'
    : 'Nächstes Mal mehr Gewicht: +1 kg (Isolationsübung)';
}

/* ================= Rendering: Training ================= */
function renderWeek() {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const from = isoDate(monday), to = isoDate(sunday);
  const n = state.sessions.filter((s) => s.date >= from && s.date <= to).length;
  $('#week-count').innerHTML = `Diese Woche: <strong>${n} von 3</strong> Einheiten`;
}

function renderDayPicker() {
  const due = nextDay();
  $('#day-picker').innerHTML = DAYS.map((d) => {
    const sel = d === state.day;
    const tag = !state.editId && d === due ? 'Nächster' : '';
    return `<button type="button" class="day-btn" role="radio" data-day="${d}" aria-checked="${sel}"
      aria-label="Tag ${d}${tag ? ', als Nächstes fällig' : ''}" ${state.editId && !sel ? 'disabled' : ''}>
      <span class="letter">${d}</span><span class="tag">${tag}</span></button>`;
  }).join('');
}

const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';

function cardHTML(entry) {
  const { id, def, ziel } = entry;
  const sets = state.draft.ex[id];
  const prev = previous(id);
  const hint = progressionHint(entry, prev);
  const isSec = def.messung === 'sek';
  const repLabel = isSec ? 'Sek.' : 'Wdh.';
  const kgLabel = def.gewicht === 'optional' ? '+kg' : 'kg';
  const target = ziel ? `${entry.saetze} × ${ziel[0] === ziel[1] ? ziel[0] : `${ziel[0]}–${ziel[1]}`}${isSec ? ' s' : ''}` : '';
  const rows = sets.map((s, i) => {
    const p = prev ? (prev.sets[i] || prev.sets[prev.sets.length - 1]) : null;
    const phKg = p && p.kg > 0 ? toInput(p.kg) : (def.gewicht === 'optional' ? '–' : 'kg');
    const phReps = p ? String(p.reps) : (isSec ? 'Sek.' : 'Wdh.');
    return `<div class="set-row${s.done ? ' done' : ''}" data-i="${i}">
      <span class="set-num" aria-hidden="true">${i + 1}</span>
      <input type="text" inputmode="decimal" enterkeyhint="next" autocomplete="off" data-field="kg" value="${esc(s.kg)}" placeholder="${esc(phKg)}" aria-label="${esc(def.name)}, Satz ${i + 1}, Gewicht in kg${def.gewicht === 'optional' ? ' (optional)' : ''}">
      <input type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" autocomplete="off" data-field="reps" value="${esc(s.reps)}" placeholder="${esc(phReps)}" aria-label="${esc(def.name)}, Satz ${i + 1}, ${isSec ? 'Sekunden' : 'Wiederholungen'}">
      <button type="button" class="check" aria-pressed="${s.done}" aria-label="Satz ${i + 1} abhaken">${ICON_CHECK}</button>
    </div>`;
  }).join('');
  return `<article class="ex" data-ex="${esc(id)}">
    <div class="ex-head"><h2>${esc(def.name)}</h2>${target ? `<span class="ex-target">${target}</span>` : ''}</div>
    <p class="ex-last">${prev ? `Zuletzt am ${dateShort(prev.date)}: ${esc(formatSets(prev.sets, def))}` : 'Noch keine Einträge'}</p>
    ${hint ? `<p class="hint">${ICON_UP}<span>${esc(hint)}</span></p>` : ''}
    <div class="sets">
      <div class="set-head" aria-hidden="true"><span>#</span><span>${kgLabel}</span><span>${repLabel}</span><span></span></div>
      ${rows}
    </div>
    <div class="ex-actions">
      ${prev ? '<button type="button" class="btn btn-same" data-act="same">Wie letztes Mal</button>' : ''}
      <button type="button" class="btn" data-act="add" aria-label="Satz hinzufügen bei ${esc(def.name)}">+ Satz</button>
      <button type="button" class="btn" data-act="remove" aria-label="Letzten Satz entfernen bei ${esc(def.name)}" ${sets.length <= 1 ? 'disabled' : ''}>− Satz</button>
    </div>
  </article>`;
}

function renderExercises() {
  $('#exercise-list').innerHTML = currentEntries().map(cardHTML).join('');
}
function rerenderCard(id) {
  const entry = currentEntries().find((e) => e.id === id);
  const old = $(`.ex[data-ex="${CSS.escape(id)}"]`);
  if (!entry || !old) return;
  old.outerHTML = cardHTML(entry);
}

function renderTraining() {
  renderWeek();
  renderDayPicker();
  const editing = state.editId ? state.sessions.find((s) => s.id === state.editId) : null;
  $('#edit-banner').hidden = !editing;
  if (editing) $('#edit-banner-text').textContent = `Bearbeiten: Tag ${editing.day}, ${dateShort(editing.date)}`;
  $('#save-btn').textContent = editing ? 'Änderungen speichern' : 'Training speichern';
  $('#discard-btn').hidden = !!editing;
  $('#session-date').value = state.draft.date;
  renderExercises();
}

/* ================= Aktionen: Training ================= */
async function selectDay(day) {
  if (state.editId || day === state.day) return;
  await saveDraftNow();
  state.day = day;
  state.draft = await loadDraft(day);
  DB.set('activeDay', day).catch(() => {});
  renderTraining();
}

function onExerciseInput(e) {
  const input = e.target;
  if (!input.matches('input[data-field]')) return;
  const card = input.closest('.ex');
  const i = Number(input.closest('.set-row').dataset.i);
  const set = state.draft.ex[card.dataset.ex][i];
  set[input.dataset.field] = input.value;
  input.setAttribute('aria-invalid', String(Number.isNaN(parseNum(input.value))));
  saveDraftSoon();
}

function onExerciseClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  const card = btn.closest('.ex');
  if (!card) return;
  const id = card.dataset.ex;
  const sets = state.draft.ex[id];
  const def = exDef(id, state.draft.names[id]);

  if (btn.classList.contains('check')) {
    const row = btn.closest('.set-row');
    const i = Number(row.dataset.i);
    const set = sets[i];
    set.done = !set.done;
    if (set.done) {
      // Leere Felder mit den Werten vom letzten Mal füllen
      const kgIn = $('input[data-field="kg"]', row), repIn = $('input[data-field="reps"]', row);
      const prev = previous(id);
      const p = prev ? (prev.sets[i] || prev.sets[prev.sets.length - 1]) : null;
      if (p) {
        if (set.kg === '' && p.kg > 0) { set.kg = toInput(p.kg); kgIn.value = set.kg; }
        if (set.reps === '') { set.reps = String(p.reps); repIn.value = set.reps; }
      }
      if (state.settings.autoTimer) startTimer(restFor(def), def.name);
    }
    btn.setAttribute('aria-pressed', String(set.done));
    row.classList.toggle('done', set.done);
    saveDraftSoon();
    return;
  }
  const act = btn.dataset.act;
  if (act === 'add') {
    sets.push(emptySet());
  } else if (act === 'remove') {
    if (sets.length <= 1) return;
    const last = sets[sets.length - 1];
    if ((last.kg !== '' || last.reps !== '') && !confirm('Der letzte Satz enthält Werte. Trotzdem entfernen?')) return;
    sets.pop();
  } else if (act === 'same') {
    const prev = previous(id);
    if (!prev) return;
    while (sets.length < prev.sets.length) sets.push(emptySet());
    prev.sets.forEach((p, i) => {
      sets[i].kg = p.kg > 0 ? toInput(p.kg) : '';
      sets[i].reps = String(p.reps);
    });
  } else return;
  saveDraftSoon();
  rerenderCard(id);
  const again = $(`.ex[data-ex="${CSS.escape(id)}"] [data-act="${act}"]`);
  if (again) again.focus({ preventScroll: true });
}

async function saveSession() {
  const date = state.draft.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) { toast('Bitte ein gültiges Datum wählen.'); $('#session-date').focus(); return; }
  const exercises = [];
  for (const entry of currentEntries()) {
    const sets = [];
    for (const s of state.draft.ex[entry.id]) {
      const reps = parseNum(s.reps);
      if (reps === null || reps === 0) continue;
      const kg = parseNum(s.kg);
      if (Number.isNaN(reps) || Number.isNaN(kg)) {
        toast(`Ungültige Zahl bei „${entry.def.name}“`);
        return;
      }
      sets.push({ kg, reps });
    }
    if (sets.length) exercises.push({ id: entry.id, name: entry.def.name, sets });
  }
  if (!exercises.length) { toast('Noch keine Sätze mit Wiederholungen eingetragen.'); return; }

  const old = state.editId ? state.sessions.find((s) => s.id === state.editId) : null;
  const now = Date.now();
  const session = { id: old ? old.id : uid(), day: state.day, date, createdAt: old ? old.createdAt : now, updatedAt: now, exercises };
  try {
    await DB.putSession(session);
  } catch (e) {
    console.error(e);
    toast('Speichern fehlgeschlagen. Bitte erneut versuchen.');
    return;
  }
  state.sessions = state.sessions.filter((s) => s.id !== session.id);
  state.sessions.push(session);
  sortSessions();
  requestPersistence();

  if (old) {
    await DB.del('edit').catch(() => {});
    state.editId = null;
    state.day = nextDay();
    state.draft = await loadDraft(state.day);
    toast('Änderungen gespeichert ✓');
    renderTraining();
    showView('history');
    return;
  }
  await DB.del(`draft:${session.day}`).catch(() => {});
  stopTimer();
  state.day = nextDay();
  state.draft = await loadDraft(state.day);
  DB.set('activeDay', state.day).catch(() => {});
  const nSets = exercises.reduce((a, e) => a + e.sets.length, 0);
  toast(`Training gespeichert ✓ ${exercises.length} Übungen, ${nSets} Sätze. Nächstes Mal: Tag ${state.day}`);
  renderTraining();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function discardDraft() {
  if (!draftHasValues(state.draft)) { toast('Keine Eingaben vorhanden.'); return; }
  if (!confirm(`Alle Eingaben für Tag ${state.day} verwerfen?`)) return;
  await DB.del(`draft:${state.day}`).catch(() => {});
  state.draft = freshDraft(state.day);
  renderTraining();
  toast('Eingaben verworfen');
}

async function startEdit(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return;
  if (state.editId && state.editId !== id && !confirm('Die laufende Bearbeitung wird verworfen. Fortfahren?')) return;
  await saveDraftNow();
  state.editId = id;
  state.day = s.day in TAGE ? s.day : DAYS[0];
  const ex = {}, names = {};
  // Plan-Übungen des Tages, dann gespeicherte Übungen
  for (const p of TAGE[state.day]) ex[p.uebung] = [];
  for (const e of s.exercises) {
    ex[e.id] = e.sets.map((x) => ({ kg: x.kg > 0 ? toInput(x.kg) : '', reps: String(x.reps), done: true }));
    names[e.id] = e.name;
  }
  for (const p of TAGE[state.day]) if (!ex[p.uebung].length) ex[p.uebung] = Array.from({ length: p.saetze }, emptySet);
  state.draft = { date: s.date, ex, names };
  await saveDraftNow();
  renderTraining();
  showView('training');
}

async function cancelEdit() {
  if (!confirm('Bearbeitung abbrechen? Änderungen gehen verloren.')) return;
  await DB.del('edit').catch(() => {});
  state.editId = null;
  state.day = nextDay();
  state.draft = await loadDraft(state.day);
  renderTraining();
  showView('history');
}

/* ================= Pausen-Timer ================= */
const timer = { end: 0, total: 0, interval: null, finished: false, hideTimeout: null };
let audioCtx = null;

function unlockAudio() {
  // iOS erlaubt Ton erst nach einer Nutzerinteraktion
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* kein Ton verfügbar */ }
}
function beep() {
  if (!state.settings.sound || !audioCtx) return;
  try {
    const t0 = audioCtx.currentTime;
    [0, 0.25, 0.5].forEach((dt, i) => {
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 2 ? 1320 : 880;
      gain.gain.setValueAtTime(0.0001, t0 + dt);
      gain.gain.exponentialRampToValueAtTime(0.4, t0 + dt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.2);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + dt);
      osc.stop(t0 + dt + 0.22);
    });
  } catch (e) { /* ignorieren */ }
}

function startTimer(seconds, label) {
  clearTimeout(timer.hideTimeout);
  timer.total = seconds;
  timer.end = Date.now() + seconds * 1000;
  timer.finished = false;
  timer.label = label;
  try { localStorage.setItem('timer', JSON.stringify({ end: timer.end, total: timer.total, label })); } catch (e) {}
  const el = $('#timer');
  el.classList.remove('finished');
  el.hidden = false;
  $('#timer-label').textContent = `Pause · ${label}`;
  clearInterval(timer.interval);
  timer.interval = setInterval(tickTimer, 250);
  tickTimer();
}
function tickTimer() {
  if (!timer.end) return;
  const left = Math.max(0, Math.ceil((timer.end - Date.now()) / 1000));
  $('#timer-time').textContent = fmtClock(left);
  $('#timer-progress').style.transform = `scaleX(${timer.total ? left / timer.total : 0})`;
  if (left <= 0 && !timer.finished) finishTimer();
}
function finishTimer() {
  timer.finished = true;
  clearInterval(timer.interval);
  try { localStorage.removeItem('timer'); } catch (e) {}
  const el = $('#timer');
  el.classList.add('finished');
  $('#timer-label').textContent = 'Pause vorbei – nächster Satz!';
  $('#timer-time').textContent = '0:00';
  if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
  beep();
  timer.hideTimeout = setTimeout(stopTimer, 15000);
}
function stopTimer() {
  clearInterval(timer.interval);
  clearTimeout(timer.hideTimeout);
  timer.end = 0;
  try { localStorage.removeItem('timer'); } catch (e) {}
  $('#timer').hidden = true;
}
function adjustTimer(delta) {
  if (!timer.end || timer.finished) return;
  timer.end = Math.max(Date.now() + 1000, timer.end + delta * 1000);
  timer.total = Math.max(timer.total, Math.ceil((timer.end - Date.now()) / 1000));
  try { localStorage.setItem('timer', JSON.stringify({ end: timer.end, total: timer.total, label: timer.label })); } catch (e) {}
  tickTimer();
}
function restoreTimer() {
  try {
    const t = JSON.parse(localStorage.getItem('timer') || 'null');
    if (t && t.end > Date.now()) {
      startTimer(Math.ceil((t.end - Date.now()) / 1000), t.label || '');
      timer.total = t.total;
      timer.end = t.end;
      tickTimer();
    } else localStorage.removeItem('timer');
  } catch (e) {}
}

/* ================= Verlauf ================= */
const ICON_CHEV = '<svg class="h-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

function renderHistory() {
  const list = $('#history-list');
  const n = state.sessions.length;
  $('#history-count').textContent = n ? `${n} ${n === 1 ? 'Einheit' : 'Einheiten'}` : '';
  if (!n) {
    list.innerHTML = '<li class="empty"><strong>Noch keine Einheiten</strong>Gespeicherte Trainings erscheinen hier.</li>';
    return;
  }
  list.innerHTML = state.sessions.map((s) => {
    const open = state.expanded.has(s.id);
    const nSets = s.exercises.reduce((a, e) => a + e.sets.length, 0);
    const details = s.exercises.map((e) => {
      const def = exDef(e.id, e.name);
      return `<div class="h-ex"><strong>${esc(e.name || def.name)}</strong><span>${esc(formatSets(e.sets, def))}</span></div>`;
    }).join('');
    return `<li class="h-item">
      <button type="button" class="h-toggle" aria-expanded="${open}" aria-controls="hd-${s.id}" data-id="${s.id}">
        <span class="h-day" aria-label="Tag ${esc(s.day)}">${esc(s.day)}</span>
        <span><span class="h-date">${dateLong(s.date)}</span>
        <span class="h-meta">${s.exercises.length} Übungen · ${nSets} Sätze</span></span>
        ${ICON_CHEV}
      </button>
      <div class="h-details" id="hd-${s.id}" ${open ? '' : 'hidden'}>
        ${details}
        <div class="h-actions">
          <button type="button" class="btn btn-secondary" data-edit="${s.id}">Bearbeiten</button>
          <button type="button" class="btn btn-secondary" data-delete="${s.id}">Löschen</button>
        </div>
      </div>
    </li>`;
  }).join('');
}

async function onHistoryClick(e) {
  const toggle = e.target.closest('.h-toggle');
  if (toggle) {
    const id = toggle.dataset.id;
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    open ? state.expanded.add(id) : state.expanded.delete(id);
    toggle.setAttribute('aria-expanded', String(open));
    $(`#hd-${CSS.escape(id)}`).hidden = !open;
    return;
  }
  const edit = e.target.closest('[data-edit]');
  if (edit) { startEdit(edit.dataset.edit); return; }
  const del = e.target.closest('[data-delete]');
  if (del) {
    const s = state.sessions.find((x) => x.id === del.dataset.delete);
    if (!s || !confirm(`Einheit Tag ${s.day} vom ${dateLong(s.date)} wirklich löschen?`)) return;
    await DB.deleteSession(s.id);
    state.sessions = state.sessions.filter((x) => x.id !== s.id);
    if (state.editId === s.id) {
      await DB.del('edit').catch(() => {});
      state.editId = null;
      state.day = nextDay();
      state.draft = await loadDraft(state.day);
    }
    renderHistory();
    renderTraining();
    toast('Einheit gelöscht');
  }
}

/* ================= Fortschritt ================= */
function allExerciseOptions() {
  const ids = [];
  for (const d of DAYS) for (const p of TAGE[d]) if (!ids.includes(p.uebung)) ids.push(p.uebung);
  const names = {};
  for (const s of state.sessions) for (const e of s.exercises) {
    if (!ids.includes(e.id)) ids.push(e.id);
    if (!names[e.id]) names[e.id] = e.name;
  }
  return ids.map((id) => ({ id, name: exDef(id, names[id]).name }));
}

function progressData(id) {
  const points = [];
  for (let k = state.sessions.length - 1; k >= 0; k--) {
    const s = state.sessions[k];
    const ex = s.exercises.find((e) => e.id === id);
    if (!ex || !ex.sets.length) continue;
    const def = exDef(id, ex.name);
    let value;
    if (isVolumeMetric(def)) value = ex.sets.reduce((a, x) => a + x.reps, 0);
    else {
      const kgs = ex.sets.map((x) => x.kg).filter((x) => x > 0);
      if (!kgs.length) continue;
      value = Math.max(...kgs);
    }
    points.push({ date: s.date, value, sets: ex.sets });
  }
  return points;
}

function renderProgress() {
  const sel = $('#progress-exercise');
  const opts = allExerciseOptions();
  if (!state.progressId || !opts.some((o) => o.id === state.progressId)) {
    const withData = opts.find((o) => progressData(o.id).length);
    state.progressId = (withData || opts[0]).id;
  }
  sel.innerHTML = opts.map((o) => `<option value="${esc(o.id)}" ${o.id === state.progressId ? 'selected' : ''}>${esc(o.name)}</option>`).join('');

  const id = state.progressId;
  const def = exDef(id, (opts.find((o) => o.id === id) || {}).name);
  const pts = progressData(id);
  const body = $('#progress-body');
  if (!pts.length) {
    body.innerHTML = '<div class="empty"><strong>Noch keine Daten</strong>Sobald du diese Übung gespeichert hast, siehst du hier deinen Verlauf.</div>';
    return;
  }
  const vol = isVolumeMetric(def);
  const unit = vol ? (def.messung === 'sek' ? 's' : 'Wdh.') : 'kg';
  const metric = vol ? (def.messung === 'sek' ? 'Summe Sekunden pro Einheit' : 'Summe Wiederholungen pro Einheit') : 'Höchstes Gewicht pro Einheit (kg)';
  const first = pts[0].value, last = pts[pts.length - 1].value;
  const diff = last - first;
  const diffTxt = pts.length < 2 ? '–' : `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${fmtNum(Math.abs(diff))}`;
  const recent = pts.slice(-10).reverse();

  body.innerHTML = `
    <div class="stats">
      <div class="stat"><span class="stat-label">Zuletzt</span><span class="stat-value">${fmtNum(last)}</span> <span class="muted small">${unit}</span></div>
      <div class="stat"><span class="stat-label">Seit Start</span><span class="stat-value">${diffTxt}</span> <span class="muted small">${pts.length < 2 ? '' : unit}</span></div>
      <div class="stat"><span class="stat-label">Einheiten</span><span class="stat-value">${pts.length}</span></div>
    </div>
    <div class="chart-card">
      <p class="chart-title">${metric}</p>
      ${chartSVG(pts, unit)}
      <div class="chart-tip" id="chart-tip" hidden></div>
    </div>
    <div class="table-wrap">
      <h2>Letzte Einheiten</h2>
      <table>
        <thead><tr><th>Datum</th><th>Sätze</th><th class="num">${vol ? 'Summe' : 'Max.'}</th></tr></thead>
        <tbody>${recent.map((p) => `<tr><td class="num" style="text-align:left">${fmtTable.format(parseISO(p.date))}</td><td>${esc(formatSets(p.sets, def))}</td><td class="num">${fmtNum(p.value)} ${unit}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  bindChart(pts, unit);
}

function niceScale(min, max, count = 4) {
  if (min === max) { min -= Math.max(1, Math.abs(min) * 0.1); max += Math.max(1, Math.abs(max) * 0.1); }
  if (min < 0) min = 0;
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { lo, hi, ticks };
}

const CHART = { W: 340, H: 210, L: 40, R: 14, T: 14, B: 28 };
let chartGeom = null;

function chartSVG(pts, unit) {
  const { W, H, L, R, T, B } = CHART;
  const values = pts.map((p) => p.value);
  const { lo, hi, ticks } = niceScale(Math.min(...values), Math.max(...values));
  const times = pts.map((p) => parseISO(p.date).getTime());
  const t0 = times[0], t1 = times[times.length - 1];
  const x = (t, i) => (t1 === t0 ? (pts.length === 1 ? (L + W - R) / 2 : L + (i / (pts.length - 1)) * (W - L - R)) : L + ((t - t0) / (t1 - t0)) * (W - L - R));
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const xy = pts.map((p, i) => [x(times[i], i), y(p.value)]);
  chartGeom = { xy, W };

  const grid = ticks.map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-label" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${fmtNum(v)}</text>`).join('');
  const line = xy.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join('');
  const area = pts.length > 1 ? `<path class="area" d="${line}L${xy[xy.length - 1][0].toFixed(1)},${H - B}L${xy[0][0].toFixed(1)},${H - B}Z"/>` : '';
  const dots = xy.map(([a, b], i) => `<circle class="dot" data-i="${i}" cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="4.5"/>`).join('');
  const xl = `<text class="axis-label" x="${xy[0][0]}" y="${H - 8}" text-anchor="${pts.length > 1 ? 'start' : 'middle'}">${dateShort(pts[0].date)}</text>` +
    (pts.length > 1 ? `<text class="axis-label" x="${xy[xy.length - 1][0]}" y="${H - 8}" text-anchor="end">${dateShort(pts[pts.length - 1].date)}</text>` : '');
  const label = `Liniendiagramm mit ${pts.length} Einheiten von ${dateShort(pts[0].date)} bis ${dateShort(pts[pts.length - 1].date)}, von ${fmtNum(pts[0].value)} auf ${fmtNum(pts[pts.length - 1].value)} ${unit}.`;
  return `<svg class="chart" id="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    ${grid}${area}
    ${pts.length > 1 ? `<path class="line" d="${line}"/>` : ''}
    <line class="cross" id="chart-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
    ${dots}${xl}
    <rect x="0" y="0" width="${W}" height="${H}" fill="transparent"/>
  </svg>`;
}

function bindChart(pts, unit) {
  const svg = $('#chart'), tip = $('#chart-tip'), cross = $('#chart-cross');
  if (!svg) return;
  const show = (clientX) => {
    const r = svg.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * chartGeom.W;
    let best = 0;
    chartGeom.xy.forEach(([a], i) => { if (Math.abs(a - sx) < Math.abs(chartGeom.xy[best][0] - sx)) best = i; });
    const [px] = chartGeom.xy[best];
    cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
    $$('.dot', svg).forEach((d) => d.classList.toggle('sel', Number(d.dataset.i) === best));
    const p = pts[best];
    tip.textContent = `${dateShort(p.date)}: ${fmtNum(p.value)} ${unit}`;
    tip.hidden = false;
    const card = svg.parentElement.getBoundingClientRect();
    const left = r.left - card.left + (px / chartGeom.W) * r.width;
    const half = tip.offsetWidth / 2;
    tip.style.left = `${Math.min(Math.max(left, half + 4), card.width - half - 4)}px`;
  };
  svg.addEventListener('pointerdown', (e) => show(e.clientX));
  svg.addEventListener('pointermove', (e) => show(e.clientX));
  svg.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); $$('.dot.sel', svg).forEach((d) => d.classList.remove('sel')); }
  });
}

/* ================= Einstellungen ================= */
function applyTheme() {
  const t = state.settings.theme;
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
  try { localStorage.setItem('theme', t); } catch (e) {}
  const metas = $$('meta[name="theme-color"]');
  metas.forEach((m) => {
    const media = m.dataset.media || m.getAttribute('media');
    m.dataset.media = media;
    if (t === 'system') { m.setAttribute('media', media); m.content = media.includes('dark') ? '#0e1116' : '#f4f5f7'; }
    else { m.removeAttribute('media'); m.content = t === 'dark' ? '#0e1116' : '#f4f5f7'; }
  });
}

function renderSettings() {
  $$('#theme-picker button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeValue === state.settings.theme)));
  $('#auto-timer').checked = state.settings.autoTimer;
  $('#timer-sound').checked = state.settings.sound;
  $('#rest-compound').textContent = fmtClock(state.settings.restCompound);
  $('#rest-isolation').textContent = fmtClock(state.settings.restIsolation);
  $('#app-version').textContent = `Version ${APP_VERSION}.`;
  renderStorageStatus();
}
async function renderStorageStatus() {
  const el = $('#storage-status');
  let txt = '';
  try {
    if (navigator.storage && navigator.storage.persisted) {
      const p = await navigator.storage.persisted();
      txt = p ? 'Dauerhafter Speicher ist aktiv.' : 'Dauerhafter Speicher wurde vom Browser (noch) nicht bestätigt – exportiere regelmäßig ein Backup.';
    }
  } catch (e) {}
  el.textContent = `${txt} ${state.sessions.length} gespeicherte Einheiten.`.trim();
}
function saveSettings() {
  DB.set('settings', state.settings).catch((e) => console.error(e));
}

async function exportData() {
  const data = {
    app: 'trainings-tracker',
    format: 1,
    exportedAt: new Date().toISOString(),
    sessions: [...state.sessions].reverse(),
    settings: state.settings,
  };
  const json = JSON.stringify(data, null, 2);
  const name = `training-backup-${todayISO()}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Trainings-Backup' });
      toast('Backup erstellt');
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('Backup heruntergeladen');
}

function validateImport(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.sessions)) throw new Error('Die Datei enthält keine Trainingsdaten.');
  return data.sessions.map((s, idx) => {
    if (!s || typeof s.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !Array.isArray(s.exercises)) {
      throw new Error(`Eintrag ${idx + 1} ist ungültig.`);
    }
    const exercises = s.exercises.map((e) => {
      if (!e || typeof e.id !== 'string' || !Array.isArray(e.sets)) throw new Error(`Übung in Eintrag ${idx + 1} ist ungültig.`);
      const sets = e.sets.map((x) => ({
        kg: typeof x.kg === 'number' && isFinite(x.kg) ? x.kg : null,
        reps: Number(x.reps),
      })).filter((x) => isFinite(x.reps) && x.reps > 0);
      return { id: e.id, name: String(e.name || exDef(e.id).name), sets };
    }).filter((e) => e.sets.length);
    return {
      id: typeof s.id === 'string' && s.id ? s.id : uid(),
      day: s.day,
      date: s.date,
      createdAt: Number(s.createdAt) || parseISO(s.date).getTime(),
      updatedAt: Number(s.updatedAt) || Date.now(),
      exercises,
    };
  });
}

async function importData(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const sessions = validateImport(data);
    if (!confirm(`${sessions.length} Einheiten importieren?\n\nAlle aktuellen Daten auf diesem Gerät (inkl. Entwürfe) werden dadurch ersetzt.`)) return;
    const settings = { ...DEFAULT_SETTINGS, ...(data.settings && typeof data.settings === 'object' ? data.settings : {}) };
    await DB.replaceAll(sessions, settings);
    state.sessions = sessions;
    sortSessions();
    state.settings = settings;
    state.editId = null;
    state.expanded.clear();
    state.day = nextDay();
    state.draft = await loadDraft(state.day);
    applyTheme();
    renderAll();
    toast(`${sessions.length} Einheiten importiert ✓`);
  } catch (e) {
    console.error(e);
    toast(`Import fehlgeschlagen: ${e instanceof SyntaxError ? 'Keine gültige JSON-Datei.' : e.message}`);
  }
}

async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch (e) { /* nicht unterstützt */ }
}

/* ================= Navigation & UI ================= */
function showView(view) {
  state.view = view;
  for (const v of ['training', 'history', 'progress', 'settings']) $(`#view-${v}`).hidden = v !== view;
  $$('.tab').forEach((t) => (t.dataset.view === view ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current')));
  if (view === 'history') renderHistory();
  if (view === 'progress') renderProgress();
  if (view === 'settings') renderSettings();
  window.scrollTo(0, 0);
}

let toastTimeout;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove('show'), 3200);
}

function renderAll() {
  renderTraining();
  if (state.view === 'history') renderHistory();
  if (state.view === 'progress') renderProgress();
  renderSettings();
}

function bindEvents() {
  $$('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
  $('#day-picker').addEventListener('click', (e) => {
    const b = e.target.closest('.day-btn');
    if (b && !b.disabled) selectDay(b.dataset.day);
  });
  $('#day-picker').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key) || state.editId) return;
    const i = DAYS.indexOf(state.day);
    const d = DAYS[(i + (e.key === 'ArrowRight' ? 1 : DAYS.length - 1)) % DAYS.length];
    selectDay(d).then(() => $(`.day-btn[data-day="${d}"]`).focus());
  });
  $('#session-date').addEventListener('change', (e) => {
    if (!e.target.value) { e.target.value = state.draft.date; return; }
    state.draft.date = e.target.value;
    saveDraftSoon();
  });
  const list = $('#exercise-list');
  list.addEventListener('input', onExerciseInput);
  list.addEventListener('click', onExerciseClick);
  $('#save-btn').addEventListener('click', saveSession);
  $('#discard-btn').addEventListener('click', discardDraft);
  $('#edit-cancel').addEventListener('click', cancelEdit);

  $('#timer-stop').addEventListener('click', stopTimer);
  $('#timer-plus').addEventListener('click', () => adjustTimer(15));
  $('#timer-minus').addEventListener('click', () => adjustTimer(-15));

  $('#history-list').addEventListener('click', onHistoryClick);
  $('#progress-exercise').addEventListener('change', (e) => { state.progressId = e.target.value; renderProgress(); });

  $('#theme-picker').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.settings.theme = b.dataset.themeValue;
    applyTheme(); saveSettings(); renderSettings();
  });
  $('#auto-timer').addEventListener('change', (e) => { state.settings.autoTimer = e.target.checked; saveSettings(); });
  $('#timer-sound').addEventListener('change', (e) => { state.settings.sound = e.target.checked; saveSettings(); if (e.target.checked) { unlockAudio(); beep(); } });
  $$('[data-rest]').forEach((b) => b.addEventListener('click', () => {
    const key = b.dataset.rest;
    state.settings[key] = Math.min(600, Math.max(15, state.settings[key] + Number(b.dataset.step)));
    saveSettings(); renderSettings();
  }));
  $('#export-btn').addEventListener('click', exportData);
  $('#import-file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importData(f);
    e.target.value = '';
  });

  // Ton auf iOS freischalten (benötigt eine Nutzerinteraktion)
  document.addEventListener('touchend', unlockAudio, { passive: true });
  document.addEventListener('click', unlockAudio);

  // Entwurf sichern, wenn die App in den Hintergrund geht
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveDraftNow();
    else { tickTimer(); renderWeek(); }
  });
  window.addEventListener('pagehide', saveDraftNow);
}

/* ================= Start ================= */
async function init() {
  try {
    const [settings, sessions, edit, activeDay] = await Promise.all([
      DB.get('settings'), DB.allSessions(), DB.get('edit'), DB.get('activeDay'),
    ]);
    state.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    state.sessions = sessions || [];
    sortSessions();

    if (edit && state.sessions.some((s) => s.id === edit.editId) && edit.day in TAGE) {
      state.editId = edit.editId;
      state.day = edit.day;
      state.draft = edit.draft;
    } else {
      // Angefangene Einheit fortsetzen, sonst den fälligen Tag vorauswählen
      let day = nextDay();
      if (activeDay && activeDay in TAGE && activeDay !== day) {
        const d = await loadDraft(activeDay);
        if (draftHasValues(d)) day = activeDay;
      }
      state.day = day;
      state.draft = await loadDraft(day);
    }
  } catch (e) {
    console.error(e);
    state.draft = freshDraft(state.day);
    toast('Speicher nicht verfügbar – Daten werden nicht gesichert.');
  }
  applyTheme();
  bindEvents();
  renderAll();
  restoreTimer();
  requestPersistence();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('service-worker.js').catch((e) => console.warn('Service Worker:', e));
  }
}

init();
