/*
 * Übungskatalog
 * =============
 * Alle Übungen sind gleichwertig. Der Wochenplan (Tage A, B, C) wird daraus
 * von generator.js zusammengestellt und in der App gespeichert.
 *
 * Übungen kannst du auch direkt in der App ändern:
 * Einstellungen → Übungskatalog (bearbeiten, hinzufügen, deaktivieren).
 * Änderungen hier in der Datei gelten als neuer Standard. Nach einer Änderung
 * in service-worker.js CACHE_VERSION um 1 erhöhen (siehe README).
 *
 * Felder
 *   id            feste ID; unter ihr wird der Verlauf gespeichert (nicht mehr ändern!)
 *   name          Anzeigename
 *   gruppe        Muskelgruppe: Rücken, Brust, Brust/Trizeps, Schulter,
 *                 hintere Schulter, Nacken, Trizeps, Bizeps, Beine, Core
 *   slot          Platz im Trainingstag (auch mehrere möglich, z. B. ['brust', 'arme']):
 *                 beine, brust, brust-oben, vertikal, horizontal, seitheben,
 *                 arme, ergaenzung, finisher
 *   saetze        Anzahl Arbeitssätze
 *   wdhMin/wdhMax Wiederholungsbereich (gleich = feste Zahl, z. B. 4 × 12)
 *   startgewicht  kg (null = keine Angabe)
 *   einheit       'gesamt' | 'pro Seite' | 'Körpergewicht'
 *   pauseSek      Pause zwischen den Sätzen in Sekunden
 *   typ           'grund' | 'isolation'
 *   hinweis       kurzer Text, wird beim Training angezeigt
 * Optional
 *   messung       'sek' = Zeit statt Wiederholungen (Plank)
 *   arbeitSek     Arbeitszeit pro Satz für die Dauerschätzung (Standard 45 Sek.)
 *   negativSaetze, negativGewicht   zusätzliche Negativsätze (Bankdrücken)
 *   maschine      true = Steigerung über die nächste Stufe an der Maschine
 */

const STANDARD_PAUSE = 120;
const HINWEIS_RUECKEN = 'Negativ langsam (ca. 3 Sek.)';

const KATALOG = [
  // ---------- Rücken ----------
  { id: 'rudern_grosse_maschine', name: 'Rudern große Maschine (freie Gewichte)', gruppe: 'Rücken', slot: 'horizontal', saetze: 4, wdhMin: 8, wdhMax: 10, startgewicht: 40, einheit: 'pro Seite', pauseSek: 120, typ: 'grund', hinweis: 'Untergriff, Handflächen zu dir' },
  { id: 'rudern_enger_griff', name: 'Rudern enger Griff', gruppe: 'Rücken', slot: 'horizontal', saetze: 4, wdhMin: 12, wdhMax: 12, startgewicht: 60, einheit: 'gesamt', pauseSek: 120, typ: 'grund', hinweis: '' },
  { id: 'rudern_kleine_maschine', name: 'Rudern kleine Maschine', gruppe: 'Rücken', slot: 'horizontal', saetze: 4, wdhMin: 12, wdhMax: 12, startgewicht: 50, einheit: 'gesamt', pauseSek: 120, typ: 'grund', hinweis: '' },
  { id: 'rudern_einarmig_maschine', name: 'Rudern einarmig (Maschine)', gruppe: 'Rücken', slot: 'horizontal', saetze: 3, wdhMin: 10, wdhMax: 12, startgewicht: 27.5, einheit: 'pro Seite', pauseSek: 120, typ: 'grund', hinweis: '' },
  { id: 'langhantel_rudern', name: 'Langhantel-Rudern', gruppe: 'Rücken', slot: 'horizontal', saetze: 3, wdhMin: 10, wdhMax: 12, startgewicht: 15, einheit: 'pro Seite', pauseSek: 120, typ: 'grund', hinweis: '' },
  { id: 'kurzhantel_rudern', name: 'Kurzhantel-Rudern', gruppe: 'Rücken', slot: 'horizontal', saetze: 3, wdhMin: 12, wdhMax: 12, startgewicht: 20, einheit: 'gesamt', pauseSek: 120, typ: 'grund', hinweis: '' },
  { id: 'rudern_brustauflage', name: 'Rudern mit Brustauflage', gruppe: 'Rücken', slot: 'horizontal', saetze: 3, wdhMin: 8, wdhMax: 12, startgewicht: null, einheit: 'gesamt', pauseSek: 120, typ: 'grund', hinweis: '' },
  { id: 'klimmzuege', name: 'Klimmzüge', gruppe: 'Rücken', slot: 'vertikal', saetze: 3, wdhMin: 6, wdhMax: 8, startgewicht: null, einheit: 'Körpergewicht', pauseSek: 120, typ: 'grund', hinweis: '' },
  { id: 'latziehen', name: 'Latziehen', gruppe: 'Rücken', slot: 'vertikal', saetze: 3, wdhMin: 8, wdhMax: 10, startgewicht: 35, einheit: 'gesamt', pauseSek: 120, typ: 'grund', hinweis: 'Daumen vor die Stange', maschine: true },
  { id: 'lat_maschine', name: 'Lat-Maschine', gruppe: 'Rücken', slot: 'vertikal', saetze: 3, wdhMin: 8, wdhMax: 10, startgewicht: 42.5, einheit: 'gesamt', pauseSek: 120, typ: 'grund', hinweis: '', maschine: true },
  { id: 'high_row', name: 'High Row', gruppe: 'Rücken', slot: 'vertikal', saetze: 4, wdhMin: 8, wdhMax: 10, startgewicht: 35, einheit: 'pro Seite', pauseSek: 120, typ: 'grund', hinweis: '' },

  // ---------- Brust ----------
  { id: 'bankdruecken', name: 'Bankdrücken', gruppe: 'Brust', slot: 'brust', saetze: 3, wdhMin: 8, wdhMax: 8, startgewicht: 70, einheit: 'gesamt', pauseSek: 150, typ: 'grund', hinweis: 'Pause 2:30 min. Danach 2 Negativsätze mit 15 kg, sehr langsam.', negativSaetze: 2, negativGewicht: 15 },
  { id: 'brustpresse_maschine', name: 'Brustpresse Maschine', gruppe: 'Brust', slot: 'brust', saetze: 3, wdhMin: 8, wdhMax: 12, startgewicht: 50, einheit: 'gesamt', pauseSek: 120, typ: 'grund', hinweis: 'bis 55 kg', maschine: true },
  { id: 'brustpresse_frei_schraeg', name: 'Brustpresse frei, schräger Sitz', gruppe: 'Brust', slot: 'brust', saetze: 3, wdhMin: 8, wdhMax: 12, startgewicht: 35, einheit: 'pro Seite', pauseSek: 120, typ: 'grund', hinweis: '' },
  { id: 'brustpresse_frei_gerade', name: 'Brustpresse frei, gerader Sitz', gruppe: 'Brust', slot: 'brust', saetze: 3, wdhMin: 8, wdhMax: 12, startgewicht: 25, einheit: 'pro Seite', pauseSek: 120, typ: 'grund', hinweis: '' },
  { id: 'schraegbank_kh', name: 'Schrägbankdrücken', gruppe: 'Brust', slot: 'brust-oben', saetze: 3, wdhMin: 8, wdhMax: 10, startgewicht: 15, einheit: 'pro Seite', pauseSek: 120, typ: 'grund', hinweis: '' },
  { id: 'dips_enges_bd', name: 'Dips', gruppe: 'Brust/Trizeps', slot: ['brust', 'arme'], saetze: 4, wdhMin: 10, wdhMax: 12, startgewicht: null, einheit: 'Körpergewicht', pauseSek: 120, typ: 'grund', hinweis: '' },
  { id: 'butterfly', name: 'Butterfly', gruppe: 'Brust', slot: 'ergaenzung', saetze: 3, wdhMin: 12, wdhMax: 12, startgewicht: 65, einheit: 'gesamt', pauseSek: 120, typ: 'isolation', hinweis: '', maschine: true },

  // ---------- Schulter ----------
  { id: 'seitheben_maschine', name: 'Seitheben Maschine', gruppe: 'Schulter', slot: 'seitheben', saetze: 3, wdhMin: 12, wdhMax: 12, startgewicht: 45, einheit: 'gesamt', pauseSek: 120, typ: 'isolation', hinweis: '', maschine: true },
  { id: 'seitheben_kh', name: 'Seitheben Kurzhantel', gruppe: 'Schulter', slot: 'seitheben', saetze: 3, wdhMin: 10, wdhMax: 12, startgewicht: 7, einheit: 'gesamt', pauseSek: 120, typ: 'isolation', hinweis: '' },
  { id: 'seitheben_kabel', name: 'Seitheben Seilzug', gruppe: 'Schulter', slot: 'seitheben', saetze: 3, wdhMin: 10, wdhMax: 12, startgewicht: 5, einheit: 'gesamt', pauseSek: 120, typ: 'isolation', hinweis: 'Ellenbogen raus, nicht zu hoch. Bereich 2,5–5,5 kg.', maschine: true },
  { id: 'schulterdruecken_kh', name: 'Schulterdrücken (Kurzhantel)', gruppe: 'Schulter', slot: 'ergaenzung', saetze: 3, wdhMin: 8, wdhMax: 10, startgewicht: 20, einheit: 'gesamt', pauseSek: 120, typ: 'grund', hinweis: '' },
  { id: 'schultermaschine', name: 'Schultermaschine', gruppe: 'Schulter', slot: 'ergaenzung', saetze: 3, wdhMin: 10, wdhMax: 10, startgewicht: 35, einheit: 'gesamt', pauseSek: 120, typ: 'grund', hinweis: '', maschine: true },
  { id: 'reverse_butterfly', name: 'Reverse Butterfly', gruppe: 'hintere Schulter', slot: 'ergaenzung', saetze: 3, wdhMin: 12, wdhMax: 12, startgewicht: 42.5, einheit: 'gesamt', pauseSek: 120, typ: 'isolation', hinweis: '', maschine: true },
  { id: 'face_pulls', name: 'Face Pulls', gruppe: 'hintere Schulter', slot: 'ergaenzung', saetze: 3, wdhMin: 15, wdhMax: 15, startgewicht: null, einheit: 'gesamt', pauseSek: 120, typ: 'isolation', hinweis: '', maschine: true },
  { id: 'schulterzucken_kh', name: 'Schulterzucken Kurzhantel', gruppe: 'Nacken', slot: 'ergaenzung', saetze: 3, wdhMin: 12, wdhMax: 12, startgewicht: 22, einheit: 'gesamt', pauseSek: 120, typ: 'isolation', hinweis: '' },

  // ---------- Trizeps ----------
  { id: 'trizeps_seilzug', name: 'Trizepsdrücken Seilzug', gruppe: 'Trizeps', slot: 'arme', saetze: 3, wdhMin: 12, wdhMax: 12, startgewicht: 26.25, einheit: 'gesamt', pauseSek: 120, typ: 'isolation', hinweis: '', maschine: true },
  { id: 'kh_ueberkopf_trizeps', name: 'Kurzhantel über Kopf', gruppe: 'Trizeps', slot: 'arme', saetze: 3, wdhMin: 10, wdhMax: 12, startgewicht: null, einheit: 'gesamt', pauseSek: 120, typ: 'isolation', hinweis: 'optional 4 Sätze' },
  { id: 'trizeps_ueberkopf', name: 'Trizepsdrücken überkopf (Kabel)', gruppe: 'Trizeps', slot: 'arme', saetze: 3, wdhMin: 10, wdhMax: 12, startgewicht: null, einheit: 'gesamt', pauseSek: 120, typ: 'isolation', hinweis: '', maschine: true },

  // ---------- Bizeps ----------
  { id: 'curls_21er', name: '21er-Curls Langhantel', gruppe: 'Bizeps', slot: 'arme', saetze: 3, wdhMin: 21, wdhMax: 21, startgewicht: null, einheit: 'gesamt', pauseSek: 120, typ: 'isolation', hinweis: '7 unten, 7 oben, 7 komplett', arbeitSek: 75 },
  { id: 'kh_curls_brust', name: 'Kurzhantel-Curls zur Brust', gruppe: 'Bizeps', slot: 'arme', saetze: 3, wdhMin: 24, wdhMax: 24, startgewicht: 12, einheit: 'gesamt', pauseSek: 120, typ: 'isolation', hinweis: '12 pro Arm' },
  { id: 'schraegbank_curls', name: 'Schrägbank-Curls', gruppe: 'Bizeps', slot: 'arme', saetze: 3, wdhMin: 10, wdhMax: 12, startgewicht: null, einheit: 'gesamt', pauseSek: 120, typ: 'isolation', hinweis: '' },
  { id: 'hammer_curls', name: 'Hammer Curls', gruppe: 'Bizeps', slot: 'arme', saetze: 3, wdhMin: 10, wdhMax: 12, startgewicht: null, einheit: 'gesamt', pauseSek: 120, typ: 'isolation', hinweis: '' },

  // ---------- Beine ----------
  { id: 'kniebeugen', name: 'Kniebeugen', gruppe: 'Beine', slot: 'beine', saetze: 3, wdhMin: 6, wdhMax: 8, startgewicht: null, einheit: 'gesamt', pauseSek: 120, typ: 'grund', hinweis: '' },
  { id: 'rumaenisches_kh', name: 'Rumänisches Kreuzheben', gruppe: 'Beine', slot: 'beine', saetze: 3, wdhMin: 8, wdhMax: 10, startgewicht: null, einheit: 'gesamt', pauseSek: 120, typ: 'grund', hinweis: '' },
  { id: 'beinpresse', name: 'Beinpresse', gruppe: 'Beine', slot: 'beine', saetze: 3, wdhMin: 10, wdhMax: 12, startgewicht: null, einheit: 'gesamt', pauseSek: 120, typ: 'grund', hinweis: '' },
  { id: 'beinstrecker', name: 'Beinstrecker', gruppe: 'Beine', slot: 'finisher', saetze: 3, wdhMin: 10, wdhMax: 10, startgewicht: 26, einheit: 'gesamt', pauseSek: 120, typ: 'isolation', hinweis: '', maschine: true },
  { id: 'wadenmaschine', name: 'Wadenmaschine', gruppe: 'Beine', slot: 'finisher', saetze: 3, wdhMin: 15, wdhMax: 15, startgewicht: 37.5, einheit: 'gesamt', pauseSek: 120, typ: 'isolation', hinweis: '', maschine: true },

  // ---------- Core (Pause 1:00 min) ----------
  { id: 'hanging_leg_raises', name: 'Hanging Leg Raises', gruppe: 'Core', slot: 'finisher', saetze: 3, wdhMin: 10, wdhMax: 15, startgewicht: null, einheit: 'Körpergewicht', pauseSek: 60, typ: 'isolation', hinweis: '' },
  { id: 'cable_crunches', name: 'Cable Crunches', gruppe: 'Core', slot: 'finisher', saetze: 3, wdhMin: 12, wdhMax: 15, startgewicht: null, einheit: 'gesamt', pauseSek: 60, typ: 'isolation', hinweis: '', maschine: true },
  { id: 'plank', name: 'Plank', gruppe: 'Core', slot: 'finisher', saetze: 3, wdhMin: 45, wdhMax: 60, startgewicht: null, einheit: 'Körpergewicht', pauseSek: 60, typ: 'isolation', hinweis: '', messung: 'sek' },
];

if (typeof module !== 'undefined') module.exports = { KATALOG, STANDARD_PAUSE, HINWEIS_RUECKEN };
