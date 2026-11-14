/*
 * Plan-Generator: verteilt die Übungen aus dem Katalog auf die Tage A, B, C.
 * Läuft im Browser (window.Generator) und in Node (require) für die Unit-Tests.
 *
 * Ein Plan: { createdAt, days: { A: [Eintrag], B: [...], C: [...] } }
 * Eintrag:  { id, pos, saetze, optional?: 'extra' | 'finisher', pinned?: true }
 */
(function (root) {
  'use strict';

  const DAYS = ['A', 'B', 'C'];

  /** Aufbau eines Tages, in dieser Reihenfolge */
  const POSITIONEN = [
    { key: 'beine', label: 'Beine', slots: ['beine'] },
    { key: 'brust', label: 'Brust', slots: ['brust', 'brust-oben'] },
    { key: 'vertikal', label: 'Rücken vertikal', slots: ['vertikal'] },
    { key: 'horizontal', label: 'Rücken horizontal', slots: ['horizontal'] },
    { key: 'seitheben', label: 'Seitheben', slots: ['seitheben'] },
    { key: 'arme', label: 'Arme / Ergänzung', slots: ['arme', 'ergaenzung'] },
    { key: 'finisher', label: 'Finisher', slots: ['finisher'] },
  ];
  const POS_INDEX = Object.fromEntries(POSITIONEN.map((p, i) => [p.key, i]));

  const DAUER = {
    arbeitSek: 45,        // Arbeitszeit pro Satz
    wechselSek: 90,       // Wechsel / Aufwärmen pro Übung
    minMin: 50,           // Zielbereich pro Tag (Minuten)
    maxMin: 70,
    zielMin: 60,
  };

  /** IDs, auf die sich Regeln beziehen */
  const REGEL_IDS = {
    beinePflicht: ['kniebeugen', 'rumaenisches_kh', 'beinpresse'],
    schulterdruecken: ['schulterdruecken_kh', 'schultermaschine'],
  };
  const NAMEN_BEINE = 'Kniebeugen, Rumänisches Kreuzheben und Beinpresse';

  /* ---------- Hilfen ---------- */
  function makeRng(seed) {
    // mulberry32: kleiner, reproduzierbarer Zufallsgenerator für Tests
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const slotsOf = (ex) => (Array.isArray(ex.slot) ? ex.slot : String(ex.slot || '').split(/\s*[,|]\s*/)).filter(Boolean);
  const fitsPos = (ex, posKey) => {
    const pos = POSITIONEN[POS_INDEX[posKey]];
    return !!pos && slotsOf(ex).some((s) => pos.slots.includes(s));
  };
  const hasGroup = (ex, name) => String(ex.gruppe || '').toLowerCase().split('/').map((s) => s.trim()).includes(name.toLowerCase());
  const catMapOf = (catalog) => (catalog instanceof Map ? catalog : new Map(catalog.map((e) => [e.id, e])));
  const activeOf = (catalog) => [...catMapOf(catalog).values()].filter((e) => e.aktiv !== false);
  const clonePlan = (plan) => ({ ...plan, days: Object.fromEntries(DAYS.map((d) => [d, (plan.days[d] || []).map((e) => ({ ...e }))])) });
  const planIds = (plan) => DAYS.flatMap((d) => (plan.days[d] || []).map((e) => e.id));

  /* ---------- Dauer ---------- */
  /** Sekunden für eine Übung: Sätze × (Arbeit + Pause) + Wechsel */
  function exerciseSeconds(ex, saetze) {
    const n = (saetze ?? ex.saetze) + (ex.negativSaetze || 0);
    const arbeit = ex.arbeitSek || (ex.messung === 'sek' ? (ex.wdhMax || 60) : DAUER.arbeitSek);
    const pause = ex.pauseSek ?? 120;
    return n * (arbeit + pause) + DAUER.wechselSek;
  }
  function dayMinutes(entries, catalog) {
    const map = catMapOf(catalog);
    return entries.reduce((sum, e) => {
      const ex = map.get(e.id);
      return sum + (ex ? exerciseSeconds(ex, e.saetze) : 0);
    }, 0) / 60;
  }

  /* ---------- Reihenfolge: Grund vor Isolation, Finisher (Core) am Ende ---------- */
  function sortDay(entries, catalog) {
    const map = catMapOf(catalog);
    const rank = (e) => {
      const ex = map.get(e.id) || {};
      if (e.pos === 'finisher') return 2;
      return ex.typ === 'grund' ? 0 : 1;
    };
    return entries
      .map((e, i) => ({ e, i }))
      .sort((a, b) => rank(a.e) - rank(b.e) || POS_INDEX[a.e.pos] - POS_INDEX[b.e.pos] || a.i - b.i)
      .map((x) => x.e);
  }

  /** Tag kürzen, wenn er zu lang ist: 4 Sätze → 3, dann Finisher, dann Zusatzübung weglassen */
  function fitDay(entries, catalog) {
    const map = catMapOf(catalog);
    let list = entries.map((e) => ({ ...e }));
    let guard = 0;
    while (dayMinutes(list, map) > DAUER.maxMin && guard++ < 50) {
      const reducible = list.filter((e) => e.saetze > 3);
      if (reducible.length) {
        reducible.sort((a, b) => b.saetze - a.saetze);
        reducible[0].saetze = 3;
        continue;
      }
      const fin = list.findIndex((e) => e.optional === 'finisher');
      if (fin !== -1) { list.splice(fin, 1); continue; }
      const extra = list.findIndex((e) => e.optional === 'extra');
      if (extra !== -1) { list.splice(extra, 1); continue; }
      break;
    }
    return sortDay(list, map);
  }

  /* ---------- Regeln ---------- */
  const PFLICHT = [
    { key: 'beine', text: `${NAMEN_BEINE} je genau 1× pro Woche` },
    { key: 'seitheben', text: 'Jeden Tag eine Seitheben-Variante' },
    { key: 'schraegbank', text: 'Schrägbankdrücken mindestens 1× pro Woche' },
    { key: 'bizeps', text: 'Mindestens 1× Bizeps pro Woche' },
    { key: 'trizeps', text: 'Mindestens 1× Trizeps pro Woche (Dips zählen)' },
    { key: 'doppelt', text: 'Keine Übung zweimal pro Woche' },
    { key: 'dauer', text: `Jeder Tag ${DAUER.minMin}–${DAUER.maxMin} Minuten` },
  ];
  /* Wunschregeln. Bei Konflikten werden sie in dieser Reihenfolge zuerst gelockert:
     die erste Regel hat das kleinste Gewicht. */
  const WUNSCH = [
    { key: 'hinten', text: 'Mindestens 1× hintere Schulter', gewicht: 10 },
    { key: 'schulterdruecken', text: 'Mindestens 1× Schulterdrücken oder Schultermaschine', gewicht: 20 },
    { key: 'core', text: 'Mindestens 2× Core pro Woche', gewicht: 40 },
    { key: 'abwechslung', text: 'Abwechslung: mindestens die Hälfte der austauschbaren Übungen neu', gewicht: 80 },
  ];
  const AUSTAUSCHBAR = ['brust', 'vertikal', 'horizontal', 'arme', 'finisher'];

  function evaluate(plan, catalog, prevPlan) {
    const map = catMapOf(catalog);
    const all = DAYS.flatMap((d) => (plan.days[d] || []).map((e) => ({ ...e, day: d, ex: map.get(e.id) || { id: e.id } })));
    const count = (pred) => all.filter(pred).length;
    const minutes = Object.fromEntries(DAYS.map((d) => [d, dayMinutes(plan.days[d] || [], map)]));
    const ids = all.map((x) => x.id);

    const activeLegs = REGEL_IDS.beinePflicht.filter((id) => map.has(id) && map.get(id).aktiv !== false);
    let neu = 0, austauschbar = 0;
    if (prevPlan) {
      const prevIds = new Set(planIds(prevPlan));
      for (const x of all) if (AUSTAUSCHBAR.includes(x.pos)) { austauschbar++; if (!prevIds.has(x.id)) neu++; }
    }
    const ok = {
      beine: activeLegs.every((id) => ids.filter((x) => x === id).length === 1),
      seitheben: DAYS.every((d) => (plan.days[d] || []).some((e) => fitsPos(map.get(e.id) || {}, 'seitheben'))),
      schraegbank: all.some((x) => slotsOf(x.ex).includes('brust-oben')),
      bizeps: all.some((x) => hasGroup(x.ex, 'Bizeps')),
      trizeps: all.some((x) => hasGroup(x.ex, 'Trizeps')),
      doppelt: new Set(ids).size === ids.length,
      dauer: DAYS.every((d) => minutes[d] >= DAUER.minMin - 1e-9 && minutes[d] <= DAUER.maxMin + 1e-9),
      hinten: all.some((x) => hasGroup(x.ex, 'hintere Schulter')),
      schulterdruecken: all.some((x) => REGEL_IDS.schulterdruecken.includes(x.id)),
      core: count((x) => hasGroup(x.ex, 'Core')) >= 2,
      abwechslung: !prevPlan || austauschbar === 0 || neu / austauschbar >= 0.5,
    };
    const pflichtFehler = PFLICHT.filter((r) => !ok[r.key]);
    const wunschFehler = WUNSCH.filter((r) => !ok[r.key]);
    const abweichung = DAYS.reduce((s, d) => s + Math.abs(minutes[d] - DAUER.zielMin), 0);
    const score = pflichtFehler.length * 1000 + wunschFehler.reduce((s, r) => s + r.gewicht, 0) + abweichung / 10;
    return { ok, pflichtFehler, wunschFehler, pflichtOk: pflichtFehler.length === 0, minutes, score, neu, austauschbar };
  }

  /* ---------- Generieren ---------- */
  /** Bedarf für die Arme/Ergänzung-Plätze: was in der Woche noch fehlt */
  const BEDARF = [
    (ex) => hasGroup(ex, 'Bizeps'),
    (ex) => hasGroup(ex, 'Trizeps'),
    (ex) => hasGroup(ex, 'hintere Schulter'),
    (ex) => REGEL_IDS.schulterdruecken.includes(ex.id),
  ];
  function weightedPick(cands, prevIds, rng, bonus) {
    if (!cands.length) return null;
    // Abwechslung bevorzugen (×3), fehlende Muskelgruppen bevorzugen (×4)
    const w = cands.map((c) => (prevIds.has(c.id) ? 1 : 3) * (bonus && bonus(c) ? 4 : 1));
    let r = rng() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cands.length; i++) { r -= w[i]; if (r < 0) return cands[i]; }
    return cands[cands.length - 1];
  }
  function shuffled(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function buildAttempt(active, pinnedPlan, prevIds, rng) {
    const map = new Map(active.map((e) => [e.id, e]));
    const days = Object.fromEntries(DAYS.map((d) => [d, (pinnedPlan[d] || []).map((e) => ({ ...e }))]));
    const used = new Set(DAYS.flatMap((d) => days[d].map((e) => e.id)));
    const chosen = () => DAYS.flatMap((x) => days[x]).map((e) => map.get(e.id)).filter(Boolean);
    const offenerBedarf = () => { const c = chosen(); return BEDARF.filter((f) => !c.some(f)); };

    const pick = (posKey) => {
      let cands = active.filter((ex) => !used.has(ex.id) && fitsPos(ex, posKey));
      if (posKey === 'beine') {
        const pflicht = cands.filter((ex) => REGEL_IDS.beinePflicht.includes(ex.id));
        if (pflicht.length) cands = pflicht;
      }
      let bonus = null;
      if (posKey === 'arme') {
        const offen = offenerBedarf();
        bonus = (ex) => offen.some((f) => f(ex));
      } else if (posKey === 'finisher') {
        const core = chosen().filter((ex) => hasGroup(ex, 'Core')).length;
        if (core < 2) bonus = (ex) => hasGroup(ex, 'Core');
      }
      const ex = weightedPick(cands, prevIds, rng, bonus);
      if (ex) used.add(ex.id);
      return ex;
    };

    // 1.–7. je Tag ein Platz pro Position (Finisher nur, wenn die Zeit reicht → fitDay)
    for (const pos of POSITIONEN) {
      for (const d of shuffled(DAYS, rng)) {
        if (days[d].some((e) => e.pos === pos.key)) continue;
        const ex = pick(pos.key);
        if (!ex) continue;
        const entry = { id: ex.id, pos: pos.key, saetze: ex.saetze };
        if (pos.key === 'finisher') entry.optional = 'finisher';
        days[d].push(entry);
      }
    }
    for (const d of DAYS) days[d] = fitDay(days[d], active);

    // Fehlt noch Bizeps/Trizeps/hintere Schulter/Schulterdrücken: zweite Arme-/Ergänzungsübung,
    // bevorzugt an einem Tag, der ohnehin keinen Finisher mehr hat
    let guard = 0;
    while (offenerBedarf().length && guard++ < 3) {
      if (rng() < 0.25) break;
      const order = shuffled(DAYS, rng).sort((a, b) =>
        (days[a].some((e) => e.pos === 'finisher') ? 1 : 0) - (days[b].some((e) => e.pos === 'finisher') ? 1 : 0) ||
        dayMinutes(days[a], map) - dayMinutes(days[b], map));
      const d = order.find((x) => days[x].filter((e) => e.pos === 'arme').length < 2);
      if (!d) break;
      const offen = offenerBedarf();
      const cands = active.filter((ex) => !used.has(ex.id) && fitsPos(ex, 'arme') && offen.some((f) => f(ex)));
      const ex = weightedPick(cands, prevIds, rng);
      if (!ex) break;
      used.add(ex.id);
      days[d] = fitDay([...days[d], { id: ex.id, pos: 'arme', saetze: ex.saetze, optional: 'extra' }], active);
    }
    return { days };
  }

  /**
   * Erzeugt einen neuen Plan. Angepinnte Übungen aus `pinnedFrom` bleiben an ihrem Tag.
   * Bis zu maxAttempts zufällige Versuche; der erste Plan, der alle Pflicht- und Wunschregeln
   * erfüllt, wird genommen. Sonst der beste gefundene (Pflichtregeln zuerst, dann Wunschregeln,
   * dann Nähe zu 60 min); evaluation.pflichtFehler / wunschFehler nennen, was fehlt.
   */
  function generate(catalog, opts = {}) {
    const rng = opts.rng || Math.random;
    const maxAttempts = opts.maxAttempts || 500;
    const map = catMapOf(catalog);
    const active = activeOf(map);
    const prevPlan = opts.prevPlan || null;
    const prevIds = new Set(prevPlan ? planIds(prevPlan) : []);
    const pinnedPlan = {};
    for (const d of DAYS) {
      pinnedPlan[d] = ((opts.pinnedFrom && opts.pinnedFrom.days[d]) || [])
        .filter((e) => e.pinned && map.has(e.id))
        .map((e) => ({ ...e, saetze: map.get(e.id).saetze }));
    }
    let best = null;
    let attempts = 0;
    for (; attempts < maxAttempts; attempts++) {
      const plan = buildAttempt(active, pinnedPlan, prevIds, rng);
      const ev = evaluate(plan, map, prevPlan);
      if (!best || ev.score < best.evaluation.score) best = { plan, evaluation: ev };
      if (ev.pflichtOk && !ev.wunschFehler.length) break; // erster Plan, der alle Regeln erfüllt
    }
    best.plan.createdAt = Date.now();
    best.attempts = Math.min(attempts + 1, maxAttempts);
    return best;
  }

  /* ---------- Tauschen ---------- */
  function applySwap(plan, day, index, newId, catalog) {
    const map = catMapOf(catalog);
    const next = clonePlan(plan);
    const old = next.days[day][index];
    const ex = map.get(newId);
    const entry = { id: newId, pos: old.pos, saetze: ex.saetze };
    if (old.optional) entry.optional = old.optional;
    if (old.pinned) entry.pinned = true;
    next.days[day][index] = entry;
    next.days[day] = fitDay(next.days[day], map);
    return next;
  }

  /** Mögliche Tauschpartner: gleicher Slot, nicht schon im Plan, keine neue Pflichtregel-Verletzung */
  function swapCandidates(plan, day, index, catalog, prevPlan) {
    const map = catMapOf(catalog);
    const entry = plan.days[day][index];
    const used = new Set(planIds(plan));
    const before = new Set(evaluate(plan, map, prevPlan).pflichtFehler.map((r) => r.key));
    const out = [];
    for (const ex of activeOf(map)) {
      if (used.has(ex.id) || !fitsPos(ex, entry.pos)) continue;
      const next = applySwap(plan, day, index, ex.id, map);
      if (!next.days[day].some((e) => e.id === ex.id)) continue; // wäre aus Zeitgründen rausgefallen
      const ev = evaluate(next, map, prevPlan);
      if (ev.pflichtFehler.some((r) => !before.has(r.key))) continue;
      out.push({ id: ex.id, plan: next, evaluation: ev, minutes: ev.minutes[day] });
    }
    return out;
  }

  const api = {
    DAYS, POSITIONEN, DAUER, REGEL_IDS, PFLICHT, WUNSCH,
    makeRng, slotsOf, fitsPos, hasGroup, exerciseSeconds, dayMinutes, sortDay, fitDay,
    evaluate, generate, applySwap, swapCandidates, clonePlan, planIds,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Generator = api;
})(typeof self !== 'undefined' ? self : this);
