/* Trainings-Tracker – App-Logik (Vanilla JS, kein Build-Schritt).
 * Übungskatalog: catalog.js (KATALOG) · Plan-Generator: generator.js (Generator) */
'use strict';

const APP_VERSION = '2.0.0';
const SCHEMA_VERSION = 2;
const DAYS = Generator.DAYS;
const DEFAULT_SETTINGS = { theme: 'system', autoTimer: true, sound: true };
const GRUPPEN = ['Beine', 'Brust', 'Brust/Trizeps', 'Rücken', 'Schulter', 'hintere Schulter', 'Nacken', 'Trizeps', 'Bizeps', 'Core'];
const SLOTS = [
  ['beine', 'Beine (Hauptübung)'], ['brust', 'Brust'], ['brust-oben', 'Brust oben (Schrägbank)'],
  ['vertikal', 'Rücken vertikal'], ['horizontal', 'Rücken horizontal'], ['seitheben', 'Seitheben'],
  ['arme', 'Arme'], ['ergaenzung', 'Ergänzung'], ['finisher', 'Finisher (Core, Waden, Beinstrecker)'],
];
const POS_LABEL = Object.fromEntries(Generator.POSITIONEN.map((p) => [p.key, p.label]));

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
const dateDots = (iso) => { const d = parseISO(iso); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`; };

/** Zahl aus Eingabe lesen, Komma oder Punkt als Dezimaltrennzeichen. null = leer, NaN = ungültig */
function parseNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  if (!/^\d*\.?\d*$/.test(s) || s === '.') return NaN;
  return Number(s);
}
const fmtNum = (n) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 });
const toInput = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
const fmtClock = (sec) => `${Math.floor(sec / 60)}:${pad(Math.max(0, sec) % 60)}`;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const deepCopy = (o) => JSON.parse(JSON.stringify(o));

/* ---------- Einheiten ---------- */
const isBW = (ex, einheit) => (einheit || ex.einheit) === 'Körpergewicht';
const isSec = (ex) => ex.messung === 'sek';
const isVolumeMetric = (ex) => isBW(ex) || isSec(ex);
function kgUnit(einheit) { return einheit === 'pro Seite' ? 'kg/Seite' : einheit === 'Körpergewicht' ? '+kg' : 'kg'; }
function kgText(kg, einheit) {
  if (einheit === 'pro Seite') return `${fmtNum(kg)} kg/Seite`;
  if (einheit === 'Körpergewicht') return `KG +${fmtNum(kg)} kg`;
  return `${fmtNum(kg)} kg`;
}
function wdhText(ex) {
  if (ex.wdhMin == null) return '';
  const r = ex.wdhMin === ex.wdhMax ? `${ex.wdhMin}` : `${ex.wdhMin}–${ex.wdhMax}`;
  return isSec(ex) ? `${r} s` : r;
}
function targetText(ex, saetze) {
  const w = wdhText(ex);
  return `${saetze}${w ? ` × ${w}` : ' Sätze'}${ex.negativSaetze ? ` + ${ex.negativSaetze} Neg.` : ''}`;
}

/** Sätze als Text, z. B. „40 kg/Seite × 10, 10, 9 · Neg. 15 kg × 6, 5“ */
function formatSets(sets, ex, einheit = ex.einheit) {
  const part = (list) => {
    const groups = [];
    for (const s of list) {
      const kg = s.kg > 0 ? s.kg : null;
      const g = groups[groups.length - 1];
      if (g && g.kg === kg) g.reps.push(s.reps); else groups.push({ kg, reps: [s.reps] });
    }
    return groups.map((g) => {
      let prefix = '';
      if (g.kg !== null) prefix = isSec(ex) ? `+${fmtNum(g.kg)} kg × ` : `${kgText(g.kg, einheit)} × `;
      else if (einheit === 'Körpergewicht' && !isSec(ex)) prefix = 'KG × ';
      const suffix = isSec(ex) ? ' s' : (g.kg === null && einheit !== 'Körpergewicht' ? ' Wdh.' : '');
      return prefix + g.reps.map(fmtNum).join(', ') + suffix;
    }).join(' · ');
  };
  const main = sets.filter((s) => !s.neg), neg = sets.filter((s) => s.neg);
  return [main.length ? part(main) : '', neg.length ? `Neg. ${part(neg)}` : ''].filter(Boolean).join(' · ');
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
    /** Mehrere Sitzungen und Schlüssel in EINER Transaktion schreiben (alles oder nichts) */
    write: (sessions, kv, { clear = false, delKeys = [] } = {}) => run(['sessions', 'kv'], 'readwrite', (tx) => {
      const ss = tx.objectStore('sessions'), ks = tx.objectStore('kv');
      if (clear) { ss.clear(); ks.clear(); }
      (sessions || []).forEach((s) => ss.put(s));
      Object.entries(kv || {}).forEach(([k, v]) => ks.put(v, k));
      delKeys.forEach((k) => ks.delete(k));
    }),
  };
})();

/* ================= Zustand ================= */
const state = {
  sessions: [],          // neueste zuerst
  settings: { ...DEFAULT_SETTINGS },
  catOverrides: { over: {}, custom: [] },
  catalog: [],           // wirksamer Katalog (Standard + eigene Änderungen)
  catMap: new Map(),
  plan: null,            // { createdAt, days: { A: [...], B: [...], C: [...] } }
  planPrev: null,        // Plan vor dem letzten Mischen (für „Rückgängig“)
  view: 'training',
  day: DAYS[0],
  editId: null,
  draft: null,           // { date, ex: { [id]: [{kg, reps, done, neg?}] }, names: {}, order?: [] }
  expanded: new Set(),
  progressId: null,
  planOpen: true,
};

/* ---------- Katalog ---------- */
function buildCatalog() {
  const { over, custom } = state.catOverrides;
  const list = KATALOG.map((e) => ({ ...e, ...(over[e.id] || {}), builtin: true }));
  for (const c of custom) list.push({ ...c, ...(over[c.id] || {}), builtin: false });
  state.catalog = list;
  state.catMap = new Map(list.map((e) => [e.id, e]));
}
function exInfo(id, snap) {
  return state.catMap.get(id) || {
    id, name: (snap && snap.name) || id, gruppe: '', slot: [], saetze: 3, wdhMin: null, wdhMax: null,
    startgewicht: null, einheit: (snap && snap.einheit) || 'gesamt', pauseSek: STANDARD_PAUSE, typ: 'isolation', hinweis: '',
  };
}
const saveCatalog = () => DB.set('catalog', state.catOverrides).catch((e) => console.error(e));

function sortSessions() {
  state.sessions.sort((a, b) => (b.date === a.date ? (b.createdAt || 0) - (a.createdAt || 0) : (b.date < a.date ? -1 : 1)));
}
function nextDay() {
  const last = state.sessions[0];
  if (!last) return DAYS[0];
  const i = DAYS.indexOf(last.day);
  return i === -1 ? DAYS[0] : DAYS[(i + 1) % DAYS.length];
}
const dayMinutes = (day, plan = state.plan) => Generator.dayMinutes(plan.days[day] || [], state.catMap);

/* ---------- Entwürfe ---------- */
const emptySet = (neg) => (neg ? { kg: '', reps: '', done: false, neg: true } : { kg: '', reps: '', done: false });
function freshSets(id, saetze) {
  const ex = exInfo(id);
  return [...Array.from({ length: saetze }, () => emptySet()), ...Array.from({ length: ex.negativSaetze || 0 }, () => emptySet(true))];
}
const draftKey = () => (state.editId ? 'edit' : `draft:${state.day}`);
const draftHasValues = (d) => !!d && Object.values(d.ex).some((sets) => sets.some((s) => s.kg !== '' || s.reps !== ''));

function freshDraft(day) {
  const ex = {};
  for (const e of state.plan.days[day] || []) ex[e.id] = freshSets(e.id, e.saetze);
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
function saveDraftSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveDraftNow, 150); }
function saveDraftNow() {
  clearTimeout(saveTimer);
  if (!state.draft) return Promise.resolve();
  const p = state.editId
    ? DB.set('edit', { editId: state.editId, day: state.day, draft: state.draft })
    : DB.set(draftKey(), state.draft);
  return p.catch((e) => console.error('Entwurf nicht gespeichert', e));
}

/** Übungen im Training: Plan des Tages, beim Bearbeiten die Übungen der Einheit */
function currentEntries() {
  if (state.editId) {
    const order = state.draft.order || Object.keys(state.draft.ex);
    return order.map((id) => {
      const ex = exInfo(id, { name: state.draft.names[id] });
      return { id, ex, saetze: state.draft.ex[id].filter((s) => !s.neg).length || ex.saetze };
    });
  }
  return (state.plan.days[state.day] || []).map((e) => ({ ...e, ex: exInfo(e.id) }));
}

/** Letzte Leistung einer Übung – unabhängig vom Tag */
function previous(id) {
  const editing = state.editId ? state.sessions.find((s) => s.id === state.editId) : null;
  for (const s of state.sessions) {
    if (s.id === state.editId) continue;
    if (editing && (s.date > editing.date || (s.date === editing.date && (s.createdAt || 0) > (editing.createdAt || 0)))) continue;
    const ex = s.exercises.find((e) => e.id === id);
    if (ex && ex.sets.length) return { date: s.date, sets: ex.sets, einheit: ex.einheit };
  }
  return null;
}

/** „40 kg/Seite × 10 · 12.11.“ bzw. „Start: 40 kg/Seite“ */
function lastLabel(id) {
  const ex = exInfo(id);
  const prev = previous(id);
  if (prev) {
    const einheit = prev.einheit || ex.einheit;
    const main = prev.sets.filter((s) => !s.neg);
    const list = main.length ? main : prev.sets;
    const best = list.reduce((b, s) => ((s.kg || 0) > (b.kg || 0) || ((s.kg || 0) === (b.kg || 0) && s.reps > b.reps) ? s : b));
    let t;
    if (isSec(ex)) t = `${best.kg > 0 ? `+${fmtNum(best.kg)} kg × ` : ''}${fmtNum(best.reps)} s`;
    else if (best.kg > 0) t = `${kgText(best.kg, einheit)} × ${fmtNum(best.reps)}`;
    else t = einheit === 'Körpergewicht' ? `KG × ${fmtNum(best.reps)}` : `${fmtNum(best.reps)} Wdh.`;
    return { text: `${t} · ${dateDots(prev.date)}`, start: false };
  }
  if (isBW(ex)) return { text: 'Start: KG', start: true };
  if (ex.startgewicht != null) return { text: `Start: ${kgText(ex.startgewicht, ex.einheit).replace('KG +', '+')}`, start: true };
  return null;
}
function lastLabelHTML(id) {
  const l = lastLabel(id);
  return l ? ` <span class="lw${l.start ? ' lw-start' : ''}">${esc(l.text)}</span>` : '';
}

function progressionHint(entry, prev) {
  const ex = entry.ex;
  if (!prev || ex.wdhMax == null) return null;
  const main = prev.sets.filter((s) => !s.neg);
  if (main.length < entry.saetze || !main.every((s) => s.reps >= ex.wdhMax)) return null;
  if (isSec(ex)) return 'Oberes Ende erreicht – nächstes Mal länger halten oder Zusatzgewicht.';
  const einheit = prev.einheit || ex.einheit;
  if (ex.typ === 'grund') {
    if (einheit === 'pro Seite') return 'Nächstes Mal mehr Gewicht: +1,25 kg pro Seite';
    if (einheit === 'Körpergewicht') return 'Nächstes Mal mehr Gewicht: +2,5 kg Zusatzgewicht';
    return 'Nächstes Mal mehr Gewicht: +2,5 kg';
  }
  if (einheit === 'Körpergewicht') return 'Nächstes Mal mehr Gewicht: +1 kg Zusatzgewicht';
  if (ex.maschine) return 'Nächstes Mal mehr Gewicht: nächste Stufe an der Maschine';
  return einheit === 'pro Seite' ? 'Nächstes Mal mehr Gewicht: +1 kg pro Seite' : 'Nächstes Mal mehr Gewicht: +1 kg';
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
    const isDue = !state.editId && d === due;
    const min = Math.round(dayMinutes(d));
    return `<button type="button" class="day-btn" role="radio" data-day="${d}" aria-checked="${sel}"
      aria-label="Tag ${d}, ca. ${min} Minuten${isDue ? ', als Nächstes fällig' : ''}" ${state.editId && !sel ? 'disabled' : ''}>
      <span class="letter">${d}</span><span class="tag">${isDue ? 'Nächster' : ''}</span><span class="dur">ca. ${min} min</span></button>`;
  }).join('');
}

const ICON_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6zM12 15v6"/></svg>';

function planRowHTML(e, i, { interactive = true } = {}) {
  const ex = exInfo(e.id);
  const meta = [targetText(ex, e.saetze), e.pos === 'finisher' ? 'Finisher' : POS_LABEL[e.pos]].filter(Boolean).join(' · ');
  const inner = `<span class="pr-name">${esc(ex.name)}${lastLabelHTML(e.id)}</span><span class="pr-meta">${esc(meta)}${ex.aktiv === false ? ' · deaktiviert' : ''}</span>`;
  if (!interactive) {
    return `<li class="plan-row static"><div class="plan-main">${inner}</div>${e.pinned ? `<span class="pin-flag" title="angepinnt" aria-label="angepinnt">${ICON_PIN}</span>` : ''}</li>`;
  }
  return `<li class="plan-row">
    <button type="button" class="plan-main" data-swap="${i}" aria-label="${esc(ex.name)} tauschen">${inner}</button>
    <button type="button" class="pin" data-pin="${i}" aria-pressed="${!!e.pinned}" aria-label="${esc(ex.name)} ${e.pinned ? 'lösen' : 'anpinnen'}">${ICON_PIN}</button>
  </li>`;
}

function ruleSummaryHTML(ev) {
  const parts = [];
  if (ev.pflichtFehler.length) parts.push(`<p><strong>Pflichtregel nicht erfüllbar:</strong> ${ev.pflichtFehler.map((r) => esc(r.text)).join('; ')}</p>`);
  if (ev.wunschFehler.length) parts.push(`<p>Nicht erfüllt (Wunsch): ${ev.wunschFehler.map((r) => esc(r.text)).join('; ')}</p>`);
  return parts.join('');
}

function renderPlanCard() {
  const card = $('#plan-card');
  card.hidden = !!state.editId;
  if (state.editId) return;
  $('#plan-toggle').setAttribute('aria-expanded', String(state.planOpen));
  $('#plan-body').hidden = !state.planOpen;
  $('#plan-dur').textContent = `Tag ${state.day} · ca. ${Math.round(dayMinutes(state.day))} min`;
  $('#plan-list').innerHTML = (state.plan.days[state.day] || []).map((e, i) => planRowHTML(e, i)).join('');
  const ev = Generator.evaluate(state.plan, state.catMap);
  const warn = $('#plan-warn');
  warn.innerHTML = ruleSummaryHTML(ev);
  warn.hidden = !warn.innerHTML;
  $('#undo-btn').hidden = !state.planPrev;
}

const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';

/** Platzhalter für einen Satz: letzter Wert, sonst Startgewicht */
function placeholderFor(entry, prev, set, i) {
  const ex = entry.ex;
  const sets = state.draft.ex[entry.id];
  let p = null;
  if (prev) {
    const same = prev.sets.filter((s) => !!s.neg === !!set.neg);
    const idx = set.neg ? sets.filter((s, k) => s.neg && k < i).length : i;
    p = same[idx] || same[same.length - 1] || null;
  }
  let kg = '';
  if (p && p.kg > 0) kg = toInput(p.kg);
  else if (!p && set.neg && ex.negativGewicht) kg = toInput(ex.negativGewicht);
  else if (!p && !set.neg && ex.startgewicht != null) kg = toInput(ex.startgewicht);
  return { kg, reps: p ? String(p.reps) : '' };
}

function cardHTML(entry) {
  const { id, ex } = entry;
  const sets = state.draft.ex[id];
  const prev = previous(id);
  const hint = progressionHint(entry, prev);
  const sec = isSec(ex);
  const repLabel = sec ? 'Sek.' : 'Wdh.';
  const unit = kgUnit(prev?.einheit || ex.einheit);
  const notes = [ex.hinweis, Generator.hasGroup(ex, 'Rücken') ? HINWEIS_RUECKEN : ''].filter(Boolean);
  let nMain = 0, nNeg = 0;
  const rows = sets.map((s, i) => {
    const ph = placeholderFor(entry, prev, s, i);
    const label = s.neg ? `N${++nNeg}` : String(++nMain);
    const what = s.neg ? `Negativsatz ${nNeg}` : `Satz ${nMain}`;
    return `<div class="set-row${s.done ? ' done' : ''}${s.neg ? ' neg' : ''}" data-i="${i}">
      <span class="set-num" aria-hidden="true">${label}</span>
      <input type="text" inputmode="decimal" enterkeyhint="next" autocomplete="off" data-field="kg" value="${esc(s.kg)}" placeholder="${esc(ph.kg || (isBW(ex) ? '–' : unit))}" aria-label="${esc(ex.name)}, ${what}, Gewicht in ${esc(unit)}${isBW(ex) ? ' (optional)' : ''}">
      <input type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" autocomplete="off" data-field="reps" value="${esc(s.reps)}" placeholder="${esc(ph.reps || repLabel)}" aria-label="${esc(ex.name)}, ${what}, ${sec ? 'Sekunden' : 'Wiederholungen'}">
      <button type="button" class="check" aria-pressed="${s.done}" aria-label="${what} abhaken">${ICON_CHECK}</button>
    </div>`;
  }).join('');
  const sameBtn = prev
    ? '<button type="button" class="btn btn-same" data-act="same">Wie letztes Mal</button>'
    : (ex.startgewicht != null ? '<button type="button" class="btn btn-same" data-act="same">Startgewicht eintragen</button>' : '');
  return `<article class="ex" data-ex="${esc(id)}">
    <div class="ex-head"><h2>${esc(ex.name)}${lastLabelHTML(id)}</h2><span class="ex-target">${esc(targetText(ex, entry.saetze))}</span></div>
    <p class="ex-last">${prev ? `Zuletzt am ${dateShort(prev.date)}: ${esc(formatSets(prev.sets, ex, prev.einheit || ex.einheit))}` : 'Noch keine Einträge'}</p>
    ${notes.length ? `<p class="ex-note">${notes.map(esc).join(' · ')}</p>` : ''}
    ${hint ? `<p class="hint">${ICON_UP}<span>${esc(hint)}</span></p>` : ''}
    <div class="sets">
      <div class="set-head" aria-hidden="true"><span>#</span><span>${esc(unit)}</span><span>${repLabel}</span><span></span></div>
      ${rows}
    </div>
    <div class="ex-actions">
      ${sameBtn}
      <button type="button" class="btn" data-act="add" aria-label="Satz hinzufügen bei ${esc(ex.name)}">+ Satz</button>
      <button type="button" class="btn" data-act="remove" aria-label="Letzten Satz entfernen bei ${esc(ex.name)}" ${sets.filter((s) => !s.neg).length <= 1 ? 'disabled' : ''}>− Satz</button>
    </div>
  </article>`;
}

function renderExercises() { $('#exercise-list').innerHTML = currentEntries().map(cardHTML).join(''); }
function rerenderCard(id) {
  const entry = currentEntries().find((e) => e.id === id);
  const old = $(`.ex[data-ex="${CSS.escape(id)}"]`);
  if (entry && old) old.outerHTML = cardHTML(entry);
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
  renderPlanCard();
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
  state.draft.ex[card.dataset.ex][i][input.dataset.field] = input.value;
  input.setAttribute('aria-invalid', String(Number.isNaN(parseNum(input.value))));
  saveDraftSoon();
}

function onExerciseClick(e) {
  const btn = e.target.closest('button');
  const card = btn && btn.closest('.ex');
  if (!card) return;
  const id = card.dataset.ex;
  const sets = state.draft.ex[id];
  const entry = currentEntries().find((x) => x.id === id);
  if (!entry) return;
  const ex = entry.ex;

  if (btn.classList.contains('check')) {
    const row = btn.closest('.set-row');
    const i = Number(row.dataset.i);
    const set = sets[i];
    set.done = !set.done;
    if (set.done) {
      // Leere Felder mit dem letzten Wert bzw. Startgewicht füllen
      const ph = placeholderFor(entry, previous(id), set, i);
      if (set.kg === '' && ph.kg) { set.kg = ph.kg; $('input[data-field="kg"]', row).value = set.kg; }
      if (set.reps === '' && ph.reps) { set.reps = ph.reps; $('input[data-field="reps"]', row).value = set.reps; }
      if (state.settings.autoTimer) startTimer(ex.pauseSek || STANDARD_PAUSE, ex.name);
    }
    btn.setAttribute('aria-pressed', String(set.done));
    row.classList.toggle('done', set.done);
    saveDraftSoon();
    return;
  }
  const act = btn.dataset.act;
  const firstNeg = () => { const k = sets.findIndex((s) => s.neg); return k === -1 ? sets.length : k; };
  if (act === 'add') {
    sets.splice(firstNeg(), 0, emptySet());
  } else if (act === 'remove') {
    const k = firstNeg() - 1;
    if (k < 1) return;
    if ((sets[k].kg !== '' || sets[k].reps !== '') && !confirm('Der letzte Satz enthält Werte. Trotzdem entfernen?')) return;
    sets.splice(k, 1);
  } else if (act === 'same') {
    const prev = previous(id);
    if (prev) {
      const pMain = prev.sets.filter((s) => !s.neg), pNeg = prev.sets.filter((s) => s.neg);
      while (sets.filter((s) => !s.neg).length < pMain.length) sets.splice(firstNeg(), 0, emptySet());
      while (sets.filter((s) => s.neg).length < pNeg.length) sets.push(emptySet(true));
      let m = 0, n = 0;
      for (const s of sets) {
        const p = s.neg ? pNeg[n++] : pMain[m++];
        if (!p) continue;
        s.kg = p.kg > 0 ? toInput(p.kg) : '';
        s.reps = String(p.reps);
      }
    } else {
      for (const s of sets) {
        if (s.kg !== '') continue;
        const kg = s.neg ? ex.negativGewicht : ex.startgewicht;
        if (kg != null) s.kg = toInput(kg);
      }
    }
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
      if (Number.isNaN(reps) || Number.isNaN(kg)) { toast(`Ungültige Zahl bei „${entry.ex.name}“`); return; }
      sets.push(s.neg ? { kg, reps, neg: true } : { kg, reps });
    }
    if (sets.length) exercises.push({ id: entry.id, name: entry.ex.name, einheit: entry.ex.einheit, sets });
  }
  if (!exercises.length) { toast('Noch keine Sätze mit Wiederholungen eingetragen.'); return; }

  const old = state.editId ? state.sessions.find((s) => s.id === state.editId) : null;
  const now = Date.now();
  const session = { id: old ? old.id : uid(), day: state.day, date, createdAt: old ? old.createdAt : now, updatedAt: now, exercises };
  if (old) exercises.forEach((e) => { const o = old.exercises.find((x) => x.id === e.id); if (o && o.einheit) e.einheit = o.einheit; });
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
  state.day = DAYS.includes(s.day) ? s.day : DAYS[0];
  const ex = {}, names = {}, order = [];
  for (const e of s.exercises) {
    ex[e.id] = e.sets.map((x) => ({ kg: x.kg > 0 ? toInput(x.kg) : '', reps: String(x.reps), done: true, ...(x.neg ? { neg: true } : {}) }));
    names[e.id] = e.name;
    order.push(e.id);
  }
  state.draft = { date: s.date, ex, names, order };
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

/* ================= Plan: mischen, tauschen, anpinnen ================= */
async function savePlan() {
  const kv = { plan: state.plan };
  if (state.planPrev) kv.planPrev = state.planPrev;
  await DB.write([], kv, { delKeys: state.planPrev ? [] : ['planPrev'] }).catch((e) => console.error(e));
}
async function afterPlanChange() {
  await saveDraftNow();
  await savePlan();
  if (!state.editId) state.draft = await loadDraft(state.day);
  renderTraining();
}

function openSheet(html) {
  const dlg = $('#sheet');
  $('#sheet-body').innerHTML = html;
  if (!dlg.open) {
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  $('#sheet-body').scrollTop = 0;
  const first = $('#sheet-body [autofocus]') || $('#sheet-body h2');
  if (first) { first.setAttribute('tabindex', '-1'); first.focus({ preventScroll: true }); }
}
function closeSheet() {
  const dlg = $('#sheet');
  if (dlg.open) { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
}

let preview = null;
function startShuffle() {
  if (draftHasValues(state.draft) && !confirm('Im laufenden Training stehen bereits Eingaben.\n\nTrotzdem neu mischen? Eingaben zu Übungen, die danach nicht mehr im Plan stehen, gehen verloren.')) return;
  preview = Generator.generate(state.catalog, { prevPlan: state.plan, pinnedFrom: state.plan });
  renderPreview();
}
function renderPreview() {
  const ev = preview.evaluation;
  const ok = !ev.pflichtFehler.length && !ev.wunschFehler.length;
  const days = DAYS.map((d) => `
    <section class="pv-day">
      <h3>Tag ${d} <span class="pv-dur">ca. ${Math.round(ev.minutes[d])} min</span></h3>
      <ol class="plan-list">${preview.plan.days[d].map((e, i) => planRowHTML(e, i, { interactive: false })).join('')}</ol>
    </section>`).join('');
  openSheet(`
    <h2 id="sheet-title">Neuer Plan – Vorschau</h2>
    <div class="pv-rules">${ok ? '<p class="ok">✓ Alle Regeln erfüllt.</p>' : ruleSummaryHTML(ev)}
      ${ev.austauschbar ? `<p class="muted small">${ev.neu} von ${ev.austauschbar} austauschbaren Übungen sind neu.</p>` : ''}</div>
    ${days}
    <div class="sheet-actions">
      <button type="button" class="btn btn-primary" data-sheet="apply">Übernehmen</button>
      <button type="button" class="btn btn-secondary" data-sheet="again">Nochmal mischen</button>
      <button type="button" class="btn btn-ghost" data-sheet="close">Abbrechen</button>
    </div>`);
}
async function applyPreview() {
  if (!preview) return;
  state.planPrev = state.plan;
  state.plan = preview.plan;
  preview = null;
  closeSheet();
  await afterPlanChange();
  toast('Neuer Plan übernommen');
}
async function undoShuffle() {
  if (!state.planPrev) return;
  if (!confirm('Letztes Mischen rückgängig machen? Der vorherige Plan wird wiederhergestellt.')) return;
  state.plan = state.planPrev;
  state.planPrev = null;
  await afterPlanChange();
  toast('Vorheriger Plan wiederhergestellt');
}

async function togglePin(i) {
  const e = state.plan.days[state.day][i];
  if (!e) return;
  if (e.pinned) delete e.pinned; else e.pinned = true;
  await savePlan();
  renderPlanCard();
  toast(e.pinned ? `${exInfo(e.id).name} angepinnt` : `${exInfo(e.id).name} gelöst`);
}

let swapCtx = null;
function openSwap(i) {
  const day = state.day;
  const entry = state.plan.days[day][i];
  if (!entry) return;
  const ex = exInfo(entry.id);
  const cands = Generator.swapCandidates(state.plan, day, i, state.catMap);
  swapCtx = { day, i, cands };
  const list = cands.length
    ? `<ul class="swap-list">${cands.map((c, k) => {
      const cx = exInfo(c.id);
      const e2 = c.plan.days[day].find((x) => x.id === c.id);
      return `<li><button type="button" class="swap-opt" data-cand="${k}">
          <span class="pr-name">${esc(cx.name)}${lastLabelHTML(c.id)}</span>
          <span class="pr-meta">${esc(targetText(cx, e2.saetze))} · Tag dann ca. ${Math.round(c.minutes)} min${c.evaluation.wunschFehler.length ? ` · ${esc(c.evaluation.wunschFehler.map((r) => r.text).join('; '))} fehlt` : ''}</span>
        </button></li>`;
    }).join('')}</ul>`
    : '<p class="muted">Keine andere Übung aus diesem Slot möglich, ohne eine Pflichtregel zu verletzen oder eine Übung doppelt zu planen.</p>';
  openSheet(`
    <h2 id="sheet-title">${esc(ex.name)} tauschen</h2>
    <p class="muted small">Tag ${day} · ${esc(POS_LABEL[entry.pos] || '')} · aktuell ca. ${Math.round(dayMinutes(day))} min</p>
    ${list}
    <div class="sheet-actions">
      <button type="button" class="btn btn-secondary" data-sheet="pin">${entry.pinned ? 'Anpinnen lösen' : 'Anpinnen'}</button>
      <button type="button" class="btn btn-ghost" data-sheet="close">Abbrechen</button>
    </div>`);
}
async function applySwap(k) {
  const c = swapCtx && swapCtx.cands[k];
  if (!c) return;
  const old = state.plan.days[swapCtx.day][swapCtx.i];
  const vals = state.draft.ex[old.id];
  if (vals && vals.some((s) => s.kg !== '' || s.reps !== '') && !confirm(`Für ${exInfo(old.id).name} stehen schon Eingaben. Trotzdem tauschen?`)) return;
  state.plan = c.plan;
  closeSheet();
  await afterPlanChange();
  toast(`Getauscht: ${exInfo(c.id).name}`);
}

function onSheetClick(e) {
  const dlg = $('#sheet');
  if (e.target === dlg) { closeSheet(); return; } // Tipp auf den Hintergrund
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.cand !== undefined) { applySwap(Number(b.dataset.cand)); return; }
  const act = b.dataset.sheet;
  if (act === 'close') closeSheet();
  else if (act === 'apply') applyPreview();
  else if (act === 'again') { preview = Generator.generate(state.catalog, { prevPlan: state.plan, pinnedFrom: state.plan }); renderPreview(); }
  else if (act === 'pin' && swapCtx) { closeSheet(); togglePin(swapCtx.i); }
  else if (act === 'cat-save') saveCatalogForm();
  else if (act === 'cat-reset') resetCatalogEntry();
}

/* ================= Pausen-Timer ================= */
const timer = { end: 0, total: 0, interval: null, finished: false, hideTimeout: null };
let audioCtx = null;

function unlockAudio() {
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
  $('#timer').classList.add('finished');
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
      const ex = exInfo(e.id, e);
      return `<div class="h-ex"><strong>${esc(ex.name)}</strong><span>${esc(formatSets(e.sets, ex, e.einheit || ex.einheit))}</span></div>`;
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
  const withData = new Set(state.sessions.flatMap((s) => s.exercises.map((e) => e.id)));
  const names = {};
  for (const s of state.sessions) for (const e of s.exercises) if (!names[e.id]) names[e.id] = e;
  const out = state.catalog.filter((e) => e.aktiv !== false || withData.has(e.id)).map((e) => ({ id: e.id, name: e.name }));
  for (const id of withData) if (!state.catMap.has(id)) out.push({ id, name: names[id].name || id });
  return out;
}

function progressData(id) {
  const points = [];
  for (let k = state.sessions.length - 1; k >= 0; k--) {
    const s = state.sessions[k];
    const e = s.exercises.find((x) => x.id === id);
    if (!e || !e.sets.length) continue;
    const ex = exInfo(id, e);
    const main = e.sets.filter((x) => !x.neg);
    if (!main.length) continue;
    let value;
    if (isVolumeMetric(ex)) value = main.reduce((a, x) => a + x.reps, 0);
    else {
      const kgs = main.map((x) => x.kg).filter((x) => x > 0);
      if (!kgs.length) continue;
      value = Math.max(...kgs);
    }
    points.push({ date: s.date, value, sets: e.sets, einheit: e.einheit || ex.einheit });
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
  const ex = exInfo(id, opts.find((o) => o.id === id));
  const pts = progressData(id);
  const body = $('#progress-body');
  if (!pts.length) {
    const l = lastLabel(id);
    body.innerHTML = `<div class="empty"><strong>Noch keine Daten</strong>Sobald du diese Übung gespeichert hast, siehst du hier deinen Verlauf.${l ? `<br>${esc(l.text)}` : ''}</div>`;
    return;
  }
  const vol = isVolumeMetric(ex);
  const unit = vol ? (isSec(ex) ? 's' : 'Wdh.') : kgUnit(ex.einheit);
  const metric = vol ? (isSec(ex) ? 'Summe Sekunden pro Einheit' : 'Summe Wiederholungen pro Einheit') : `Höchstes Gewicht pro Einheit (${kgUnit(ex.einheit)})`;
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
      <p class="chart-title">${esc(metric)}</p>
      ${chartSVG(pts, unit)}
      <div class="chart-tip" id="chart-tip" hidden></div>
    </div>
    <div class="table-wrap">
      <h2>Letzte Einheiten</h2>
      <table>
        <thead><tr><th>Datum</th><th>Sätze</th><th class="num">${vol ? 'Summe' : 'Max.'}</th></tr></thead>
        <tbody>${recent.map((p) => `<tr><td class="num" style="text-align:left">${fmtTable.format(parseISO(p.date))}</td><td>${esc(formatSets(p.sets, ex, p.einheit))}</td><td class="num">${fmtNum(p.value)} ${unit}</td></tr>`).join('')}</tbody>
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

/* ================= Katalog ansehen und bearbeiten ================= */
function catMeta(ex) {
  const start = isBW(ex) ? 'Körpergewicht' : ex.startgewicht != null ? `Start ${kgText(ex.startgewicht, ex.einheit)}` : 'kein Startgewicht';
  const slots = Generator.slotsOf(ex).map((s) => (SLOTS.find((x) => x[0] === s) || [s, s])[1]).join(' oder ');
  return `${targetText(ex, ex.saetze)} · ${start} · Pause ${fmtClock(ex.pauseSek || STANDARD_PAUSE)} · ${slots} · ${ex.typ === 'grund' ? 'Grundübung' : 'Isolation'}`;
}
function renderCatalog() {
  const active = state.catalog.filter((e) => e.aktiv !== false).length;
  $('#catalog-count').textContent = `${state.catalog.length} Übungen, ${active} aktiv`;
  const groups = [...GRUPPEN, ...new Set(state.catalog.map((e) => e.gruppe).filter((g) => !GRUPPEN.includes(g)))];
  $('#catalog-list').innerHTML = groups.map((g) => {
    const list = state.catalog.filter((e) => e.gruppe === g);
    if (!list.length) return '';
    return `<h2 class="cat-group">${esc(g)}</h2><ul class="cat-ul">${list.map((ex) => `
      <li class="cat-row${ex.aktiv === false ? ' inactive' : ''}">
        <button type="button" class="cat-main" data-cat-edit="${esc(ex.id)}">
          <span class="pr-name">${esc(ex.name)}${ex.builtin ? '' : ' <span class="lw">eigene</span>'}</span>
          <span class="pr-meta">${esc(catMeta(ex))}</span>
        </button>
        <input type="checkbox" class="switch" data-cat-active="${esc(ex.id)}" ${ex.aktiv === false ? '' : 'checked'} aria-label="${esc(ex.name)} aktiv">
      </li>`).join('')}</ul>`;
  }).join('');
}

function setCatalogFields(id, fields) {
  const isBuiltin = KATALOG.some((e) => e.id === id);
  if (isBuiltin) {
    const def = KATALOG.find((e) => e.id === id);
    const over = { ...(state.catOverrides.over[id] || {}), ...fields };
    for (const k of Object.keys(over)) if (JSON.stringify(over[k]) === JSON.stringify(def[k] ?? (k === 'aktiv' ? true : undefined))) delete over[k];
    if (Object.keys(over).length) state.catOverrides.over[id] = over; else delete state.catOverrides.over[id];
  } else {
    const c = state.catOverrides.custom.find((e) => e.id === id);
    if (c) Object.assign(c, fields);
  }
  buildCatalog();
  saveCatalog();
}

let catEditId = null;
function openCatalogForm(id) {
  catEditId = id;
  const ex = id ? exInfo(id) : { name: '', gruppe: 'Brust', slot: 'brust', saetze: 3, wdhMin: 8, wdhMax: 12, startgewicht: null, einheit: 'gesamt', pauseSek: STANDARD_PAUSE, typ: 'grund', hinweis: '' };
  const slots = Generator.slotsOf(ex);
  const opt = (list, val) => list.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const changed = id && state.catOverrides.over[id] && KATALOG.some((e) => e.id === id);
  openSheet(`
    <h2 id="sheet-title">${id ? 'Übung bearbeiten' : 'Neue Übung'}</h2>
    <form id="cat-form" class="form" novalidate>
      <label>Name<input name="name" required value="${esc(ex.name)}" autocomplete="off"></label>
      <label>Gruppe<select name="gruppe">${opt(GRUPPEN.map((g) => [g, g]), ex.gruppe)}</select></label>
      <div class="form-2">
        <label>Slot<select name="slot">${opt(SLOTS, slots[0])}</select></label>
        <label>2. Slot (optional)<select name="slot2"><option value="">–</option>${opt(SLOTS, slots[1] || '')}</select></label>
      </div>
      <div class="form-3">
        <label>Sätze<input name="saetze" inputmode="numeric" value="${esc(ex.saetze)}"></label>
        <label>Wdh. von<input name="wdhMin" inputmode="numeric" value="${esc(ex.wdhMin ?? '')}"></label>
        <label>bis<input name="wdhMax" inputmode="numeric" value="${esc(ex.wdhMax ?? '')}"></label>
      </div>
      <label>Messung<select name="messung">${opt([['wdh', 'Wiederholungen'], ['sek', 'Sekunden (Haltezeit)']], ex.messung === 'sek' ? 'sek' : 'wdh')}</select></label>
      <div class="form-2">
        <label>Startgewicht (kg)<input name="startgewicht" inputmode="decimal" value="${esc(toInput(ex.startgewicht))}" placeholder="–"></label>
        <label>Einheit<select name="einheit">${opt([['gesamt', 'kg gesamt'], ['pro Seite', 'kg pro Seite'], ['Körpergewicht', 'Körpergewicht']], ex.einheit)}</select></label>
      </div>
      <div class="form-2">
        <label>Pause (Sek.)<input name="pauseSek" inputmode="numeric" value="${esc(ex.pauseSek ?? STANDARD_PAUSE)}"></label>
        <label>Typ<select name="typ">${opt([['grund', 'Grundübung'], ['isolation', 'Isolation']], ex.typ)}</select></label>
      </div>
      <div class="form-2">
        <label>Negativsätze<input name="negativSaetze" inputmode="numeric" value="${esc(ex.negativSaetze || 0)}"></label>
        <label>Gewicht Negativ (kg)<input name="negativGewicht" inputmode="decimal" value="${esc(toInput(ex.negativGewicht ?? null))}" placeholder="–"></label>
      </div>
      <label>Hinweis<input name="hinweis" value="${esc(ex.hinweis || '')}" autocomplete="off"></label>
      <label class="switch-row"><span>Maschine / Seilzug (Steigerung: nächste Stufe)</span><input type="checkbox" class="switch" name="maschine" ${ex.maschine ? 'checked' : ''}></label>
      <label class="switch-row"><span>Aktiv (wird beim Mischen verwendet)</span><input type="checkbox" class="switch" name="aktiv" ${ex.aktiv === false ? '' : 'checked'}></label>
      <p id="cat-error" class="form-error" role="alert"></p>
    </form>
    <div class="sheet-actions">
      <button type="button" class="btn btn-primary" data-sheet="cat-save">Speichern</button>
      ${changed ? '<button type="button" class="btn btn-secondary" data-sheet="cat-reset">Auf Standard zurücksetzen</button>' : ''}
      <button type="button" class="btn btn-ghost" data-sheet="close">Abbrechen</button>
    </div>`);
}

function saveCatalogForm() {
  const f = $('#cat-form');
  const v = (n) => f.elements[n].value.trim();
  const err = (msg) => { $('#cat-error').textContent = msg; };
  const int = (n) => { const x = parseNum(v(n)); return x === null ? null : Number.isInteger(x) ? x : NaN; };
  const name = v('name');
  if (!name) return err('Bitte einen Namen eingeben.');
  const saetze = int('saetze'), wdhMin = int('wdhMin'), wdhMax = int('wdhMax'), pauseSek = int('pauseSek'), negativSaetze = int('negativSaetze') || 0;
  const startgewicht = parseNum(v('startgewicht')), negativGewicht = parseNum(v('negativGewicht'));
  if (!(saetze >= 1 && saetze <= 10)) return err('Sätze: bitte eine Zahl von 1 bis 10.');
  if (!(wdhMin >= 1 && wdhMax >= wdhMin)) return err('Wiederholungen: „von“ muss mindestens 1 und höchstens „bis“ sein.');
  if (!(pauseSek >= 15 && pauseSek <= 600)) return err('Pause: bitte 15 bis 600 Sekunden.');
  if (Number.isNaN(startgewicht) || Number.isNaN(negativGewicht) || Number.isNaN(negativSaetze)) return err('Bitte gültige Zahlen eingeben (Komma erlaubt).');
  const slot = [v('slot'), v('slot2')].filter((s, i, a) => s && a.indexOf(s) === i);
  const fields = {
    name, gruppe: v('gruppe'), slot: slot.length > 1 ? slot : slot[0], saetze, wdhMin, wdhMax, startgewicht,
    einheit: v('einheit'), pauseSek, typ: v('typ'), hinweis: v('hinweis'),
    aktiv: f.elements.aktiv.checked,
  };
  if (v('messung') === 'sek') fields.messung = 'sek'; else fields.messung = undefined;
  fields.maschine = f.elements.maschine.checked || undefined;
  fields.negativSaetze = negativSaetze || undefined;
  fields.negativGewicht = negativSaetze && negativGewicht != null ? negativGewicht : undefined;
  if (catEditId) {
    setCatalogFields(catEditId, fields);
  } else {
    const slug = name.toLowerCase().replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c])).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
    const clean = Object.fromEntries(Object.entries(fields).filter(([, x]) => x !== undefined));
    state.catOverrides.custom.push({ id: `eigene_${slug}_${Date.now().toString(36)}`, ...clean });
    buildCatalog();
    saveCatalog();
  }
  closeSheet();
  renderCatalog();
  renderTraining();
  toast(catEditId ? 'Übung gespeichert' : 'Übung hinzugefügt');
}
function resetCatalogEntry() {
  if (!catEditId || !confirm('Alle eigenen Änderungen an dieser Übung verwerfen?')) return;
  delete state.catOverrides.over[catEditId];
  buildCatalog();
  saveCatalog();
  closeSheet();
  renderCatalog();
  renderTraining();
  toast('Auf Standard zurückgesetzt');
}

/* ================= Einstellungen ================= */
function applyTheme() {
  const t = state.settings.theme;
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
  try { localStorage.setItem('theme', t); } catch (e) {}
  $$('meta[name="theme-color"]').forEach((m) => {
    const media = m.dataset.media || m.getAttribute('media');
    m.dataset.media = media;
    if (t === 'system') { m.setAttribute('media', media); m.content = media.includes('dark') ? '#0e1116' : '#f4f5f7'; }
    else { m.removeAttribute('media'); m.content = t === 'dark' ? '#0e1116' : '#f4f5f7'; }
  });
}

async function renderSettings() {
  $$('#theme-picker button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeValue === state.settings.theme)));
  $('#auto-timer').checked = state.settings.autoTimer;
  $('#timer-sound').checked = state.settings.sound;
  $('#app-version').textContent = `Version ${APP_VERSION}.`;
  const active = state.catalog.filter((e) => e.aktiv !== false).length;
  $('#catalog-summary').textContent = `${state.catalog.length} Übungen, davon ${active} aktiv. Änderungen wirken beim nächsten Mischen.`;
  const backup = await DB.get('backup:v1').catch(() => null);
  const bb = $('#backup-old-btn');
  bb.hidden = !backup;
  if (backup) bb.textContent = `Automatisches Backup vom ${fmtTable.format(new Date(backup.createdAt))} (vor dem Update) sichern`;
  renderStorageStatus();
}
async function renderStorageStatus() {
  let txt = '';
  try {
    if (navigator.storage && navigator.storage.persisted) {
      txt = (await navigator.storage.persisted())
        ? 'Dauerhafter Speicher ist aktiv.'
        : 'Dauerhafter Speicher wurde vom Browser (noch) nicht bestätigt – exportiere regelmäßig ein Backup.';
    }
  } catch (e) {}
  $('#storage-status').textContent = `${txt} ${state.sessions.length} gespeicherte Einheiten.`.trim();
}
const saveSettings = () => DB.set('settings', state.settings).catch((e) => console.error(e));

async function shareOrDownload(json, name) {
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

function exportData() {
  const data = {
    app: 'trainings-tracker', format: 2, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(),
    sessions: [...state.sessions].reverse(), settings: state.settings,
    catalog: state.catOverrides, plan: state.plan, planPrev: state.planPrev,
  };
  shareOrDownload(JSON.stringify(data, null, 2), `training-backup-${todayISO()}.json`);
}
async function exportOldBackup() {
  const b = await DB.get('backup:v1').catch(() => null);
  if (b) shareOrDownload(b.json, `training-backup-vor-update-${isoDate(new Date(b.createdAt))}.json`);
}

/* ---------- Migration ---------- */
const defaultEinheit = (id) => (KATALOG.find((e) => e.id === id) || {}).einheit || 'gesamt';
/** Sitzungen auf Schema 2 bringen: Einheit (kg gesamt / pro Seite / KG) je Übung festhalten */
function migrateSessions(sessions) {
  return sessions.map((s) => ({ ...s, exercises: s.exercises.map((e) => ({ ...e, einheit: e.einheit || defaultEinheit(e.id) })) }));
}

function validateImport(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.sessions)) throw new Error('Die Datei enthält keine Trainingsdaten.');
  return migrateSessions(data.sessions.map((s, idx) => {
    if (!s || typeof s.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !Array.isArray(s.exercises)) throw new Error(`Eintrag ${idx + 1} ist ungültig.`);
    const exercises = s.exercises.map((e) => {
      if (!e || typeof e.id !== 'string' || !Array.isArray(e.sets)) throw new Error(`Übung in Eintrag ${idx + 1} ist ungültig.`);
      const sets = e.sets.map((x) => {
        const set = { kg: typeof x.kg === 'number' && isFinite(x.kg) ? x.kg : null, reps: Number(x.reps) };
        if (x.neg) set.neg = true;
        return set;
      }).filter((x) => isFinite(x.reps) && x.reps > 0);
      const out = { id: e.id, name: String(e.name || exInfo(e.id).name), sets };
      if (['gesamt', 'pro Seite', 'Körpergewicht'].includes(e.einheit)) out.einheit = e.einheit;
      return out;
    }).filter((e) => e.sets.length);
    return {
      id: typeof s.id === 'string' && s.id ? s.id : uid(), day: s.day, date: s.date,
      createdAt: Number(s.createdAt) || parseISO(s.date).getTime(), updatedAt: Number(s.updatedAt) || Date.now(), exercises,
    };
  }));
}
const validPlan = (p) => p && p.days && DAYS.every((d) => Array.isArray(p.days[d]) && p.days[d].every((e) => e && typeof e.id === 'string' && typeof e.pos === 'string' && e.saetze > 0));

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    const sessions = validateImport(data);
    if (!confirm(`${sessions.length} Einheiten importieren?\n\nAlle aktuellen Daten auf diesem Gerät (inkl. Entwürfe, Plan und Katalog-Änderungen) werden dadurch ersetzt.`)) return;
    const settings = { ...DEFAULT_SETTINGS, ...(data.settings && typeof data.settings === 'object' ? data.settings : {}) };
    delete settings.restCompound; delete settings.restIsolation;
    const cat = data.catalog && typeof data.catalog === 'object' ? { over: data.catalog.over || {}, custom: Array.isArray(data.catalog.custom) ? data.catalog.custom : [] } : { over: {}, custom: [] };
    state.catOverrides = cat;
    buildCatalog();
    const plan = validPlan(data.plan) ? data.plan : Generator.generate(state.catalog).plan;
    const planPrev = validPlan(data.planPrev) ? data.planPrev : null;
    const kv = { settings, catalog: cat, plan, schemaVersion: SCHEMA_VERSION };
    if (planPrev) kv.planPrev = planPrev;
    await DB.write(sessions, kv, { clear: true });
    Object.assign(state, { sessions, settings, plan, planPrev, editId: null });
    sortSessions();
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

/**
 * Datenmigration mit Versionsnummer (kv „schemaVersion“).
 * v1 → v2: vorher automatisches JSON-Backup (kv „backup:v1“), dann Einheit je Übung ergänzen.
 * Übungs-IDs bleiben gleich, daher bleibt der Verlauf den richtigen Übungen zugeordnet.
 */
async function migrate() {
  let ver = await DB.get('schemaVersion');
  const sessions = await DB.allSessions();
  const settings = await DB.get('settings');
  if (ver === undefined) ver = sessions.length || settings ? 1 : SCHEMA_VERSION;
  if (ver < 2) {
    const drafts = {};
    for (const d of DAYS) drafts[d] = await DB.get(`draft:${d}`);
    const backup = {
      app: 'trainings-tracker', format: 1, schemaVersion: 1, exportedAt: new Date().toISOString(),
      note: 'Automatisches Backup vor dem Update auf Version 2', sessions, settings: settings || null,
      drafts, edit: (await DB.get('edit')) || null,
    };
    await DB.set('backup:v1', { createdAt: Date.now(), json: JSON.stringify(backup, null, 2) });
    const newSettings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    delete newSettings.restCompound; delete newSettings.restIsolation;
    await DB.write(migrateSessions(sessions), { settings: newSettings, schemaVersion: 2 });
    return { migrated: true, count: sessions.length };
  }
  if (ver !== SCHEMA_VERSION) await DB.set('schemaVersion', SCHEMA_VERSION);
  return { migrated: false };
}

async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch (e) { /* nicht unterstützt */ }
}

/* ================= Navigation & UI ================= */
function showView(view) {
  state.view = view;
  for (const v of ['training', 'history', 'progress', 'settings', 'catalog']) $(`#view-${v}`).hidden = v !== view;
  const tab = view === 'catalog' ? 'settings' : view;
  $$('.tab').forEach((t) => (t.dataset.view === tab ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current')));
  if (view === 'training') renderTraining();
  if (view === 'history') renderHistory();
  if (view === 'progress') renderProgress();
  if (view === 'settings') renderSettings();
  if (view === 'catalog') renderCatalog();
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
  if (state.view === 'catalog') renderCatalog();
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

  // Plan
  $('#plan-toggle').addEventListener('click', () => {
    state.planOpen = !state.planOpen;
    try { localStorage.setItem('planOpen', state.planOpen ? '1' : '0'); } catch (e) {}
    renderPlanCard();
  });
  $('#plan-list').addEventListener('click', (e) => {
    const pin = e.target.closest('[data-pin]');
    if (pin) { togglePin(Number(pin.dataset.pin)); return; }
    const sw = e.target.closest('[data-swap]');
    if (sw) openSwap(Number(sw.dataset.swap));
  });
  $('#shuffle-btn').addEventListener('click', startShuffle);
  $('#undo-btn').addEventListener('click', undoShuffle);
  $('#sheet').addEventListener('click', onSheetClick);
  $('#sheet').addEventListener('close', () => { preview = null; swapCtx = null; });

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
  $('#export-btn').addEventListener('click', exportData);
  $('#backup-old-btn').addEventListener('click', exportOldBackup);
  $('#import-file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importData(f);
    e.target.value = '';
  });

  // Katalog
  $('#catalog-open').addEventListener('click', () => showView('catalog'));
  $('#catalog-back').addEventListener('click', () => showView('settings'));
  $('#catalog-add').addEventListener('click', () => openCatalogForm(null));
  $('#catalog-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat-edit]');
    if (b) openCatalogForm(b.dataset.catEdit);
  });
  $('#catalog-list').addEventListener('change', (e) => {
    const id = e.target.dataset.catActive;
    if (!id) return;
    setCatalogFields(id, { aktiv: e.target.checked });
    e.target.closest('.cat-row').classList.toggle('inactive', !e.target.checked);
    $('#catalog-count').textContent = `${state.catalog.length} Übungen, ${state.catalog.filter((x) => x.aktiv !== false).length} aktiv`;
    toast(`${exInfo(id).name} ${e.target.checked ? 'aktiviert' : 'deaktiviert'}`);
  });

  // Ton auf iOS freischalten (benötigt eine Nutzerinteraktion)
  document.addEventListener('touchend', unlockAudio, { passive: true });
  document.addEventListener('click', unlockAudio);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveDraftNow();
    else { tickTimer(); renderWeek(); }
  });
  window.addEventListener('pagehide', saveDraftNow);
}

/* ================= Start ================= */
async function init() {
  let migration = { migrated: false };
  try {
    migration = await migrate();
    const [settings, sessions, edit, activeDay, cat, plan, planPrev] = await Promise.all([
      DB.get('settings'), DB.allSessions(), DB.get('edit'), DB.get('activeDay'), DB.get('catalog'), DB.get('plan'), DB.get('planPrev'),
    ]);
    state.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    state.sessions = sessions || [];
    sortSessions();
    if (cat && cat.over) state.catOverrides = { over: cat.over, custom: cat.custom || [] };
    buildCatalog();
    if (validPlan(plan)) state.plan = plan;
    else {
      state.plan = Generator.generate(state.catalog).plan;
      await DB.set('plan', state.plan);
    }
    state.planPrev = validPlan(planPrev) ? planPrev : null;

    if (edit && state.sessions.some((s) => s.id === edit.editId) && DAYS.includes(edit.day)) {
      state.editId = edit.editId;
      state.day = edit.day;
      state.draft = edit.draft;
      if (!state.draft.order) state.draft.order = Object.keys(state.draft.ex).filter((id) => state.draft.ex[id].length);
    } else {
      let day = nextDay();
      if (activeDay && DAYS.includes(activeDay) && activeDay !== day && draftHasValues(await loadDraft(activeDay))) day = activeDay;
      state.day = day;
      state.draft = await loadDraft(day);
    }
  } catch (e) {
    console.error(e);
    buildCatalog();
    if (!state.plan) state.plan = Generator.generate(state.catalog).plan;
    state.draft = freshDraft(state.day);
    toast('Speicher nicht verfügbar – Daten werden nicht gesichert.');
  }
  try { state.planOpen = localStorage.getItem('planOpen') !== '0'; } catch (e) {}
  applyTheme();
  bindEvents();
  renderAll();
  restoreTimer();
  requestPersistence();
  if (migration.migrated) toast(`Update installiert ✓ ${migration.count} Einheiten übernommen, Backup gespeichert.`);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // Neue Version: nach dem Aktivieren einmal neu laden (Entwürfe sind gespeichert)
    if (navigator.serviceWorker.controller) {
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', async () => {
        if (reloading) return;
        reloading = true;
        await saveDraftNow();
        location.reload();
      });
    }
    navigator.serviceWorker.register('service-worker.js').catch((e) => console.warn('Service Worker:', e));
  }
}

init();
