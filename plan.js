/*
 * Trainingsplan
 * =============
 * Hier kannst du Übungen und Trainingstage ändern. Nach einer Änderung:
 * in service-worker.js die Zahl bei CACHE_VERSION um 1 erhöhen, damit das
 * iPhone die neue Version lädt (siehe README).
 *
 * 1) UEBUNGEN – alle Übungen mit ihren Eigenschaften.
 *    Der Schlüssel (z. B. "kniebeugen") ist die feste ID der Übung. Unter dieser
 *    ID wird der Verlauf gespeichert. Wird eine Übung an mehreren Tagen
 *    verwendet (z. B. Seitheben mit Kurzhanteln an Tag A und C), wird ihr
 *    Verlauf automatisch gemeinsam geführt.
 *    Die ID einer bereits trainierten Übung bitte nicht mehr ändern, sonst ist
 *    der bisherige Verlauf nicht mehr mit ihr verknüpft. Den Namen darfst du
 *    jederzeit ändern.
 *
 *    name:    Anzeigename
 *    art:     "grund"     = Grundübung     (+2,5 kg, Standardpause 2:30 min)
 *             "isolation" = Isolationsübung (+1 kg,   Standardpause 1:15 min)
 *    messung: "wdh" = Wiederholungen, "sek" = Sekunden (z. B. Plank)
 *    gewicht: "pflicht"  = Übung mit Gewicht, Fortschritt = höchstes Gewicht
 *             "optional" = Körpergewicht, kg optional,
 *                          Fortschritt = Summe der Wiederholungen bzw. Sekunden
 *
 * 2) TAGE – die Trainingstage in der Reihenfolge der Rotation (A → B → C → A).
 *    uebung: ID aus UEBUNGEN
 *    saetze: geplante Anzahl Sätze
 *    ziel:   [von, bis] Wiederholungen bzw. Sekunden
 */

const UEBUNGEN = {
  kniebeugen:            { name: 'Kniebeugen',                          art: 'grund',     messung: 'wdh', gewicht: 'pflicht' },
  schraegbank_kh:        { name: 'Schrägbankdrücken (Kurzhantel)',      art: 'grund',     messung: 'wdh', gewicht: 'pflicht' },
  latziehen:             { name: 'Latziehen',                           art: 'grund',     messung: 'wdh', gewicht: 'pflicht' },
  seitheben_kh:          { name: 'Seitheben (Kurzhantel)',              art: 'isolation', messung: 'wdh', gewicht: 'pflicht' },
  trizeps_ueberkopf:     { name: 'Trizepsdrücken überkopf (Kabel)',     art: 'isolation', messung: 'wdh', gewicht: 'pflicht' },
  hanging_leg_raises:    { name: 'Hanging Leg Raises',                  art: 'isolation', messung: 'wdh', gewicht: 'optional' },

  rumaenisches_kh:       { name: 'Rumänisches Kreuzheben',              art: 'grund',     messung: 'wdh', gewicht: 'pflicht' },
  klimmzuege:            { name: 'Klimmzüge (ggf. assistiert)',         art: 'grund',     messung: 'wdh', gewicht: 'optional' },
  bankdruecken:          { name: 'Bankdrücken',                         art: 'grund',     messung: 'wdh', gewicht: 'pflicht' },
  seitheben_kabel:       { name: 'Seitheben (Kabel)',                   art: 'isolation', messung: 'wdh', gewicht: 'pflicht' },
  face_pulls:            { name: 'Face Pulls',                          art: 'isolation', messung: 'wdh', gewicht: 'pflicht' },
  schraegbank_curls:     { name: 'Schrägbank-Curls',                    art: 'isolation', messung: 'wdh', gewicht: 'pflicht' },
  cable_crunches:        { name: 'Cable Crunches',                      art: 'isolation', messung: 'wdh', gewicht: 'pflicht' },

  beinpresse:            { name: 'Beinpresse',                          art: 'grund',     messung: 'wdh', gewicht: 'pflicht' },
  rudern_brustauflage:   { name: 'Rudern mit Brustauflage',             art: 'grund',     messung: 'wdh', gewicht: 'pflicht' },
  schulterdruecken_kh:   { name: 'Schulterdrücken sitzend (Kurzhantel)', art: 'grund',    messung: 'wdh', gewicht: 'pflicht' },
  dips_enges_bd:         { name: 'Dips oder enges Bankdrücken',         art: 'grund',     messung: 'wdh', gewicht: 'pflicht' },
  hammer_curls:          { name: 'Hammer Curls',                        art: 'isolation', messung: 'wdh', gewicht: 'pflicht' },
  plank:                 { name: 'Plank',                               art: 'isolation', messung: 'sek', gewicht: 'optional' },
};

const TAGE = {
  A: [
    { uebung: 'kniebeugen',         saetze: 3, ziel: [6, 8] },
    { uebung: 'schraegbank_kh',     saetze: 3, ziel: [8, 10] },
    { uebung: 'latziehen',          saetze: 3, ziel: [8, 12] },
    { uebung: 'seitheben_kh',       saetze: 3, ziel: [12, 15] },
    { uebung: 'trizeps_ueberkopf',  saetze: 3, ziel: [10, 12] },
    { uebung: 'hanging_leg_raises', saetze: 3, ziel: [10, 15] },
  ],
  B: [
    { uebung: 'rumaenisches_kh',    saetze: 3, ziel: [8, 10] },
    { uebung: 'klimmzuege',         saetze: 3, ziel: [6, 10] },
    { uebung: 'bankdruecken',       saetze: 3, ziel: [6, 8] },
    { uebung: 'seitheben_kabel',    saetze: 3, ziel: [12, 15] },
    { uebung: 'face_pulls',         saetze: 3, ziel: [15, 15] },
    { uebung: 'schraegbank_curls',  saetze: 3, ziel: [10, 12] },
    { uebung: 'cable_crunches',     saetze: 3, ziel: [12, 15] },
  ],
  C: [
    { uebung: 'beinpresse',          saetze: 3, ziel: [10, 12] },
    { uebung: 'rudern_brustauflage', saetze: 3, ziel: [8, 12] },
    { uebung: 'schulterdruecken_kh', saetze: 3, ziel: [8, 10] },
    { uebung: 'seitheben_kh',        saetze: 3, ziel: [12, 15] },
    { uebung: 'dips_enges_bd',       saetze: 3, ziel: [8, 10] },
    { uebung: 'hammer_curls',        saetze: 3, ziel: [10, 12] },
    { uebung: 'plank',               saetze: 3, ziel: [45, 60] },
  ],
};
