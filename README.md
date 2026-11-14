# Trainings-Tracker (PWA)

Offline-fähiger Trainings-Tracker für das Ganzkörpertraining A → B → C fürs iPhone.
Der Wochenplan wird aus einem Übungskatalog nach festen Regeln zusammengemischt.
Reines HTML, CSS und JavaScript: kein Framework, kein Build-Schritt, keine externen Anfragen.
Alle Daten bleiben auf dem Gerät (IndexedDB).

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Oberfläche |
| `styles.css` | Design (Hell/Dunkel über CSS-Variablen) |
| `catalog.js` | **Übungskatalog** (Standardwerte aller Übungen) |
| `generator.js` | Plan-Generator mit den Regeln für den Wochenplan |
| `app.js` | App-Logik |
| `tests/generator.test.js` | Unit-Tests für die Regeln (`node --test tests/generator.test.js`) |
| `service-worker.js` | Offline-Cache |
| `manifest.webmanifest` | App-Name, Icons, Vollbild-Modus |
| `icons/` | App-Icons (180, 192, 512 px) |
| `fonts/` | Barlow Condensed (lokal, SIL Open Font License) |

## Lokal testen

```bash
python3 -m http.server 8000
```

Dann <http://localhost:8000> öffnen.

## Auf GitHub Pages veröffentlichen (kostenlos)

1. Auf GitHub das Repository öffnen und sicherstellen, dass alle Dateien auf dem Branch `main` liegen.
   Falls sie auf einem anderen Branch liegen: Pull Request öffnen und in `main` mergen.
2. Im Repository auf **Settings → Pages** gehen.
3. Unter **Build and deployment** bei **Source** „Deploy from a branch“ wählen.
4. Bei **Branch** `main` und den Ordner `/ (root)` auswählen und **Save** klicken.
5. Ein bis zwei Minuten warten. Oben auf der Seite erscheint die Adresse, z. B.
   `https://DEIN-NAME.github.io/Fitness-App/`.
   GitHub Pages ist bei privaten Repositories nur mit einem bezahlten Plan verfügbar.
   Mit dem kostenlosen Plan muss das Repository daher **öffentlich** sein.
   Deine Trainingsdaten landen trotzdem nie auf GitHub, sie bleiben auf dem iPhone.

## Auf dem iPhone installieren

1. Die Adresse aus Schritt 5 in **Safari** öffnen (nicht in Chrome oder einem anderen Browser).
2. Unten auf das **Teilen-Symbol** tippen (Quadrat mit Pfeil nach oben).
3. Nach unten scrollen und **„Zum Home-Bildschirm“** wählen.
4. Den Namen ggf. anpassen und **„Hinzufügen“** tippen.
5. Die App einmal **mit Internetverbindung** vom Home-Bildschirm öffnen. Dabei werden alle Dateien
   für die Offline-Nutzung gespeichert. Danach funktioniert sie auch ohne Netz im Fitnessstudio.

## Wochenplan und Übungskatalog

**Plan neu mischen** (Training → Tagesübersicht) verteilt die Übungen aus dem Katalog neu auf die Tage A, B und C.
Du siehst erst eine Vorschau („Übernehmen“ / „Nochmal mischen“), danach lässt sich das letzte Mischen mit **Rückgängig** zurücknehmen.
Der Plan bleibt gespeichert, bis du wieder mischst.

- **Tauschen:** Übung in der Tagesübersicht antippen → Alternative aus demselben Slot wählen.
  Es werden nur Übungen angeboten, die keine Pflichtregel verletzen.
- **Anpinnen:** Stecknadel antippen → die Übung bleibt beim nächsten Mischen an ihrem Tag.

Aufbau jedes Tages: Beine → Brust → Rücken vertikal → Rücken horizontal → Seitheben → Arme/Ergänzung → Finisher
(Grundübungen vor Isolationsübungen, Core immer am Ende).
Pflichtregeln: Kniebeugen, Rumänisches Kreuzheben und Beinpresse je genau 1× pro Woche, jeden Tag eine Seitheben-Variante,
Schrägbankdrücken mindestens 1×, mindestens 1× Bizeps und 1× Trizeps (Dips zählen), keine Übung doppelt, jeder Tag 50–70 Minuten.
Wunschregeln: hintere Schulter, Schulterdrücken/Schultermaschine, 2× Core, Abwechslung zum vorherigen Plan.

Geschätzte Dauer je Übung = Sätze × (Arbeitszeit + Pause) + 1:30 min Wechsel.
Die Arbeitszeit beträgt 45 Sek. pro Satz, bei 21ern 75 Sek. und bei Plank die Haltezeit.

### Übungen ändern

Am einfachsten direkt in der App: **Einstellungen → Übungskatalog**. Dort kannst du Übungen bearbeiten, hinzufügen und deaktivieren.
Diese Änderungen bleiben auf dem iPhone gespeichert und sind im Export enthalten. Sie wirken beim nächsten Mischen.

Die Standardwerte stehen in `catalog.js`. Die Felder sind oben in der Datei erklärt.
**Ändere die `id` einer Übung nicht**, sonst ist ihr bisheriger Verlauf nicht mehr mit ihr verknüpft.

### Wichtig nach jeder Änderung an einer Datei

In `service-worker.js` die Zahl bei `const CACHE_VERSION = …;` um eins erhöhen, committen und pushen.
Sonst zeigt das iPhone weiter die zwischengespeicherte alte Version.
Beim nächsten Öffnen mit Internet lädt die App die neue Version und startet einmal neu.

## Datensicherung

**Einstellungen → Daten exportieren** erzeugt eine JSON-Datei, die du über das Teilen-Menü
z. B. in „Dateien“ oder iCloud Drive sicherst. **Daten importieren** stellt ein Backup wieder her.
Dabei werden die aktuellen Daten auf dem Gerät ersetzt.

Sichere regelmäßig: Wird die App vom Home-Bildschirm gelöscht, löscht iOS auch ihre Daten.

Beim Update auf Version 2 hat die App deine Daten automatisch migriert und vorher ein Backup angelegt.
Du findest es unter **Einstellungen → Automatisches Backup … (vor dem Update) sichern**.

## Hinweise zu iOS

- **Vibration** gibt es in Safari auf dem iPhone nicht. Am Ende der Pause gibt es deshalb einen Ton und eine Animation.
  Den Ton hörst du nur, wenn das iPhone nicht stummgeschaltet ist und die App im Vordergrund läuft.
- Läuft die App im Hintergrund, pausiert iOS sie. Der Timer rechnet beim Zurückkehren richtig weiter,
  kann im Hintergrund aber nicht klingeln.
