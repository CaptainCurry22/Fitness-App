// Unit-Tests für den Plan-Generator. Ausführen mit:  node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../generator.js');
const { KATALOG } = require('../catalog.js');

const MAP = new Map(KATALOG.map((e) => [e.id, e]));
const ex = (id) => MAP.get(id);
const entry = (id, pos, extra = {}) => ({ id, pos, saetze: ex(id).saetze, ...extra });
const allEntries = (plan) => G.DAYS.flatMap((d) => plan.days[d]);

/** Ein gültiger Beispielplan, von Hand gebaut */
function samplePlan() {
  return {
    days: {
      A: [entry('kniebeugen', 'beine'), entry('schraegbank_kh', 'brust'), entry('latziehen', 'vertikal'),
        entry('rudern_einarmig_maschine', 'horizontal'), entry('seitheben_kh', 'seitheben'),
        entry('hammer_curls', 'arme'), entry('plank', 'finisher', { optional: 'finisher' })],
      B: [entry('rumaenisches_kh', 'beine'), entry('dips_enges_bd', 'brust', { saetze: 3 }), entry('klimmzuege', 'vertikal'),
        entry('langhantel_rudern', 'horizontal'), entry('seitheben_maschine', 'seitheben'),
        entry('face_pulls', 'arme'), entry('hanging_leg_raises', 'finisher', { optional: 'finisher' })],
      C: [entry('beinpresse', 'beine'), entry('brustpresse_maschine', 'brust'), entry('lat_maschine', 'vertikal'),
        entry('kurzhantel_rudern', 'horizontal'), entry('seitheben_kabel', 'seitheben'),
        entry('schulterdruecken_kh', 'arme'), entry('cable_crunches', 'finisher', { optional: 'finisher' })],
    },
  };
}

test('Katalog: alle bisherigen IDs bleiben erhalten (Verlauf)', () => {
  const alt = ['kniebeugen', 'schraegbank_kh', 'latziehen', 'seitheben_kh', 'trizeps_ueberkopf', 'hanging_leg_raises',
    'rumaenisches_kh', 'klimmzuege', 'bankdruecken', 'seitheben_kabel', 'face_pulls', 'schraegbank_curls',
    'cable_crunches', 'beinpresse', 'rudern_brustauflage', 'schulterdruecken_kh', 'dips_enges_bd', 'hammer_curls', 'plank'];
  for (const id of alt) assert.ok(MAP.has(id), `fehlt: ${id}`);
});

test('Katalog: jede Übung hat gültige Felder', () => {
  const ids = new Set();
  for (const e of KATALOG) {
    assert.ok(!ids.has(e.id), `doppelte ID ${e.id}`); ids.add(e.id);
    assert.ok(e.name && e.gruppe, e.id);
    assert.ok(G.slotsOf(e).length > 0, `${e.id}: slot`);
    assert.ok(Number.isInteger(e.saetze) && e.saetze >= 1, `${e.id}: saetze`);
    assert.ok(e.wdhMin <= e.wdhMax, `${e.id}: wdh`);
    assert.ok(['gesamt', 'pro Seite', 'Körpergewicht'].includes(e.einheit), `${e.id}: einheit`);
    assert.ok(['grund', 'isolation'].includes(e.typ), `${e.id}: typ`);
    assert.ok(e.pauseSek > 0, `${e.id}: pause`);
    assert.ok(G.POSITIONEN.some((p) => G.fitsPos(e, p.key)), `${e.id}: passt in keinen Platz`);
  }
});

test('Dauer: Sätze × (Arbeit + Pause) + 1:30 Wechsel', () => {
  assert.equal(G.exerciseSeconds(ex('kniebeugen')), 3 * (45 + 120) + 90);
  assert.equal(G.exerciseSeconds(ex('high_row')), 4 * (45 + 120) + 90);
  assert.equal(G.exerciseSeconds(ex('high_row'), 3), 3 * (45 + 120) + 90);
  assert.equal(G.exerciseSeconds(ex('bankdruecken')), (3 + 2) * (45 + 150) + 90, 'Negativsätze zählen mit');
  assert.equal(G.exerciseSeconds(ex('curls_21er')), 3 * (75 + 120) + 90, '21er: 75 Sek. Arbeit');
  assert.equal(G.exerciseSeconds(ex('plank')), 3 * (60 + 60) + 90, 'Plank: Haltezeit + 1:00 Pause');
  assert.equal(G.exerciseSeconds(ex('cable_crunches')), 3 * (45 + 60) + 90, 'Core: 1:00 Pause');
});

test('Beispielplan erfüllt alle Regeln', () => {
  const ev = G.evaluate(samplePlan(), KATALOG);
  assert.deepEqual(ev.pflichtFehler.map((r) => r.key), []);
  assert.deepEqual(ev.wunschFehler.map((r) => r.key), []);
});

test('Regel: Kniebeugen, RDL, Beinpresse je genau 1×', () => {
  const p = samplePlan();
  p.days.C[0] = entry('kniebeugen', 'beine');
  const keys = G.evaluate(p, KATALOG).pflichtFehler.map((r) => r.key);
  assert.ok(keys.includes('beine'));
  assert.ok(keys.includes('doppelt'));
});

test('Regel: jeden Tag Seitheben', () => {
  const p = samplePlan();
  p.days.B = p.days.B.filter((e) => e.pos !== 'seitheben');
  assert.ok(G.evaluate(p, KATALOG).pflichtFehler.some((r) => r.key === 'seitheben'));
});

test('Regel: Schrägbankdrücken mindestens 1×', () => {
  const p = samplePlan();
  p.days.A[1] = entry('brustpresse_frei_gerade', 'brust');
  assert.ok(G.evaluate(p, KATALOG).pflichtFehler.some((r) => r.key === 'schraegbank'));
});

test('Regel: Bizeps und Trizeps; Dips zählen als Trizeps', () => {
  const p = samplePlan();
  let ev = G.evaluate(p, KATALOG);
  assert.ok(ev.ok.trizeps, 'Dips im Plan → Trizeps erfüllt');
  p.days.B[1] = entry('brustpresse_frei_gerade', 'brust');
  ev = G.evaluate(p, KATALOG);
  assert.ok(ev.pflichtFehler.some((r) => r.key === 'trizeps'));
  p.days.A = p.days.A.filter((e) => e.id !== 'hammer_curls');
  ev = G.evaluate(p, KATALOG);
  assert.ok(ev.pflichtFehler.some((r) => r.key === 'bizeps'));
});

test('Regel: Dauer 50–70 Minuten pro Tag', () => {
  const p = samplePlan();
  p.days.A = p.days.A.slice(0, 3);
  assert.ok(G.evaluate(p, KATALOG).pflichtFehler.some((r) => r.key === 'dauer'));
});

test('Wunschregeln: hintere Schulter, Schulterdrücken, 2× Core, Abwechslung', () => {
  const p = samplePlan();
  p.days.B[5] = entry('schraegbank_curls', 'arme');           // keine hintere Schulter mehr
  p.days.C[5] = entry('trizeps_seilzug', 'arme');             // kein Schulterdrücken mehr
  p.days.A[6] = entry('beinstrecker', 'finisher', { optional: 'finisher' });
  p.days.B[6] = entry('wadenmaschine', 'finisher', { optional: 'finisher' }); // nur noch 1× Core
  const ev = G.evaluate(p, KATALOG, samplePlan());
  assert.deepEqual(ev.wunschFehler.map((r) => r.key).sort(), ['abwechslung', 'core', 'hinten', 'schulterdruecken']);
  assert.ok(ev.pflichtOk);
});

test('fitDay: zu lange Tage → 4 Sätze auf 3, dann Finisher weglassen', () => {
  const day = [entry('kniebeugen', 'beine'), entry('dips_enges_bd', 'brust'), entry('high_row', 'vertikal'),
    entry('rudern_grosse_maschine', 'horizontal'), entry('seitheben_kh', 'seitheben'), entry('hammer_curls', 'arme'),
    entry('plank', 'finisher', { optional: 'finisher' })];
  assert.ok(G.dayMinutes(day, KATALOG) > 70);
  const fit = G.fitDay(day, KATALOG);
  assert.ok(G.dayMinutes(fit, KATALOG) <= 70);
  const vierer = (list) => list.filter((e) => e.saetze === 4).length;
  assert.ok(vierer(fit) < vierer(day), '4er auf 3 Sätze reduziert (nur so viele wie nötig)');
  assert.ok(fit.some((e) => e.id === 'plank'), 'Finisher passt nach Reduktion noch');

  const bankTag = [entry('kniebeugen', 'beine'), entry('bankdruecken', 'brust'), entry('latziehen', 'vertikal'),
    entry('langhantel_rudern', 'horizontal'), entry('seitheben_kh', 'seitheben'), entry('hammer_curls', 'arme'),
    entry('plank', 'finisher', { optional: 'finisher' })];
  const fit2 = G.fitDay(bankTag, KATALOG);
  assert.ok(!fit2.some((e) => e.id === 'plank'), 'Finisher fällt weg, wenn die Zeit nicht reicht');
  assert.ok(G.dayMinutes(fit2, KATALOG) <= 70);
});

test('Reihenfolge: Grundübungen vor Isolation, Finisher (Core) am Ende', () => {
  for (let s = 1; s <= 50; s++) {
    const { plan } = G.generate(KATALOG, { rng: G.makeRng(s) });
    for (const d of G.DAYS) {
      const list = plan.days[d];
      const fin = list.findIndex((e) => e.pos === 'finisher');
      if (fin !== -1) assert.equal(fin, list.length - 1, 'Finisher zuletzt');
      const main = list.filter((e) => e.pos !== 'finisher').map((e) => ex(e.id).typ);
      const firstIso = main.indexOf('isolation');
      if (firstIso !== -1) assert.ok(!main.slice(firstIso).includes('grund'), `Tag ${d}: Grund nach Isolation`);
      assert.equal(list[0].pos, 'beine', 'Beine zuerst');
    }
  }
});

test('Abnahme: 20× mischen → immer alle Pflichtregeln, 50–70 min pro Tag', () => {
  let prev = null;
  for (let i = 0; i < 20; i++) {
    const r = G.generate(KATALOG, { prevPlan: prev }); // echter Zufall wie in der App
    assert.deepEqual(r.evaluation.pflichtFehler.map((x) => x.key), [], `Durchlauf ${i + 1}`);
    for (const d of G.DAYS) {
      const m = r.evaluation.minutes[d];
      assert.ok(m >= 50 && m <= 70, `Durchlauf ${i + 1}, Tag ${d}: ${m.toFixed(1)} min`);
    }
    const ids = G.planIds(r.plan);
    assert.equal(new Set(ids).size, ids.length);
    prev = r.plan;
  }
});

test('Viele Seeds: Pflichtregeln immer erfüllt, Wunschregeln fast immer', () => {
  let prev = null, wunschFehler = 0;
  for (let s = 1; s <= 200; s++) {
    const r = G.generate(KATALOG, { rng: G.makeRng(s), prevPlan: prev });
    assert.ok(r.evaluation.pflichtOk, `Seed ${s}`);
    wunschFehler += r.evaluation.wunschFehler.length;
    prev = r.plan;
  }
  assert.ok(wunschFehler <= 10, `${wunschFehler} Wunschregeln nicht erfüllt`);
});

test('Angepinnte Übungen bleiben an ihrem Tag', () => {
  const base = samplePlan();
  base.days.A.find((e) => e.id === 'hammer_curls').pinned = true;
  base.days.C.find((e) => e.id === 'lat_maschine').pinned = true;
  for (let s = 1; s <= 30; s++) {
    const { plan } = G.generate(KATALOG, { rng: G.makeRng(s), pinnedFrom: base, prevPlan: base });
    assert.ok(plan.days.A.some((e) => e.id === 'hammer_curls' && e.pinned), `Seed ${s}: A`);
    assert.ok(plan.days.C.some((e) => e.id === 'lat_maschine' && e.pinned), `Seed ${s}: C`);
    assert.equal(G.planIds(plan).filter((id) => id === 'hammer_curls').length, 1);
  }
});

test('Deaktivierte Übungen werden nicht verwendet', () => {
  const cat = KATALOG.map((e) => (e.id === 'schraegbank_curls' || e.id === 'face_pulls' ? { ...e, aktiv: false } : e));
  for (let s = 1; s <= 30; s++) {
    const ids = G.planIds(G.generate(cat, { rng: G.makeRng(s) }).plan);
    assert.ok(!ids.includes('schraegbank_curls') && !ids.includes('face_pulls'));
  }
});

test('Unmögliche Regeln: bester Plan wird geliefert und die Regel benannt', () => {
  const cat = KATALOG.map((e) => (G.slotsOf(e).includes('seitheben') && e.id !== 'seitheben_kh' ? { ...e, aktiv: false } : e));
  const r = G.generate(cat, { rng: G.makeRng(1), maxAttempts: 50 });
  assert.ok(r.plan && r.plan.days.A.length > 0);
  assert.deepEqual(r.evaluation.pflichtFehler.map((x) => x.key), ['seitheben']);
});

test('Tauschen: nur gleicher Slot, keine Doppelten, keine neue Regelverletzung', () => {
  const p = samplePlan();
  const idx = p.days.B.findIndex((e) => e.id === 'klimmzuege');
  const cands = G.swapCandidates(p, 'B', idx, KATALOG);
  assert.ok(cands.length > 0);
  for (const c of cands) {
    assert.ok(G.fitsPos(ex(c.id), 'vertikal'));
    assert.ok(!G.planIds(p).includes(c.id));
    assert.ok(c.evaluation.pflichtOk);
  }
  // Schrägbankdrücken ist die einzige brust-oben-Übung → Tausch würde die Pflichtregel brechen
  const sIdx = p.days.A.findIndex((e) => e.id === 'schraegbank_kh');
  assert.deepEqual(G.swapCandidates(p, 'A', sIdx, KATALOG).map((c) => c.id), []);
  // Alle drei Seitheben-Varianten sind schon im Plan → kein Tauschpartner
  const shIdx = p.days.A.findIndex((e) => e.pos === 'seitheben');
  assert.deepEqual(G.swapCandidates(p, 'A', shIdx, KATALOG), []);
  // Tausch übernimmt Pin und Platz
  p.days.B[idx].pinned = true;
  const next = G.applySwap(p, 'B', idx, 'high_row', KATALOG);
  const e = next.days.B.find((x) => x.id === 'high_row');
  assert.ok(e.pinned && e.pos === 'vertikal');
});
