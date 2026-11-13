# Trainings-Tracker (PWA)

Offline-fähiger Trainings-Tracker für das Ganzkörpertraining A → B → C fürs iPhone.
Reines HTML, CSS und JavaScript: kein Framework, kein Build-Schritt, keine externen Anfragen.
Alle Daten bleiben auf dem Gerät (IndexedDB).

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Oberfläche |
| `styles.css` | Design (Hell/Dunkel über CSS-Variablen) |
| `plan.js` | **Trainingsplan**: hier änderst du Übungen |
| `app.js` | App-Logik |
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

## Übungen ändern (`plan.js`)

`plan.js` besteht aus zwei Teilen:

**`UEBUNGEN`** listet jede Übung einmal auf:

```js
kniebeugen: { name: 'Kniebeugen', art: 'grund', messung: 'wdh', gewicht: 'pflicht' },
```

- Der Schlüssel (`kniebeugen`) ist die feste ID. Unter ihr wird der Verlauf gespeichert.
  **Ändere die ID einer Übung nicht mehr, wenn du sie schon trainiert hast.** Den `name` darfst du jederzeit ändern.
- `art`: `'grund'` (+2,5 kg, Pause 2:30) oder `'isolation'` (+1 kg, Pause 1:15)
- `messung`: `'wdh'` (Wiederholungen) oder `'sek'` (Sekunden, z. B. Plank)
- `gewicht`: `'pflicht'` (Fortschritt = höchstes Gewicht) oder `'optional'`
  (Körpergewicht, Fortschritt = Summe der Wiederholungen bzw. Sekunden)

**`TAGE`** legt fest, welche Übungen an welchem Tag dran sind:

```js
A: [
  { uebung: 'kniebeugen', saetze: 3, ziel: [6, 8] },
  ...
],
```

- `uebung`: ID aus `UEBUNGEN`
- `saetze`: geplante Anzahl Sätze
- `ziel`: Wiederholungsbereich `[von, bis]` (bei Face Pulls z. B. `[15, 15]`)

Benutzt du dieselbe ID an mehreren Tagen (wie `seitheben_kh` an Tag A und C), wird der Verlauf gemeinsam geführt.

**Beispiel: Übung austauschen.** Neue Übung in `UEBUNGEN` eintragen, z. B.
`hip_thrust: { name: 'Hip Thrust', art: 'grund', messung: 'wdh', gewicht: 'pflicht' },`,
dann in `TAGE` bei der alten Übung `uebung: 'hip_thrust'` eintragen.
Alte Einheiten bleiben im Verlauf erhalten.

### Wichtig nach jeder Änderung

In `service-worker.js` die Zahl bei `const CACHE_VERSION = 1;` um eins erhöhen (2, 3, …), committen und pushen.
Sonst zeigt das iPhone weiter die zwischengespeicherte alte Version.
Nach dem Push die App mit Internetverbindung öffnen, schließen und erneut öffnen. Dann ist die neue Version aktiv.

## Datensicherung

**Einstellungen → Daten exportieren** erzeugt eine JSON-Datei, die du über das Teilen-Menü
z. B. in „Dateien“ oder iCloud Drive sicherst. **Daten importieren** stellt ein Backup wieder her.
Dabei werden die aktuellen Daten auf dem Gerät ersetzt.

Sichere regelmäßig: Wird die App vom Home-Bildschirm gelöscht, löscht iOS auch ihre Daten.

## Hinweise zu iOS

- **Vibration** gibt es in Safari auf dem iPhone nicht. Am Ende der Pause gibt es deshalb einen Ton und eine Animation.
  Den Ton hörst du nur, wenn das iPhone nicht stummgeschaltet ist und die App im Vordergrund läuft.
- Läuft die App im Hintergrund, pausiert iOS sie. Der Timer rechnet beim Zurückkehren richtig weiter,
  kann im Hintergrund aber nicht klingeln.
