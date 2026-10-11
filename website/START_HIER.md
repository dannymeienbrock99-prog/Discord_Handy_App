# Crazy_Batto – Webseite V6

**Stand: 11. Oktober 2026.** Weiterarbeit auf der bestehenden Webseite mit sechs Seiten, überarbeiteten Fotozuordnungen und dem unveränderten Design aus schwarzem Marmor, Gold und Anthrazit.

## Sofort ansehen

Das ZIP vollständig entpacken und **`index.html`** oder **`00-STARTEN.html`** direkt im Hauptordner öffnen. Beide Einstiege zeigen direkt den aktualisierten Über-mich-Bereich mit der Maus. **`webseite/index.html`** öffnet die Startseite ganz oben. Beim Entpacken in einen bisherigen Webseitenordner gleichnamige Dateien ersetzen. Die Dateien und der Medienordner müssen zusammenbleiben. Eine Installation und ein Server sind für die Vorschau nicht nötig.

Die separate **`Crazy_Batto-Webseite-NEUE-BILDER.html`** enthält dieselbe Webseite samt allen Bildern in einer Datei. Sie öffnet direkt bei „Persönliche Vorstellung & Ausstattung“ mit der Mausgalerie. Die Startseite ist weiterhin über „Start“ erreichbar.

## Vor dem Bearbeiten lesen

1. `UEBERGABE_NEUER_CHAT.md`: Inhalte, Entscheidungen, Bildplatzierung und Grenzen der Softwarevorstellung.
2. `BILDZUORDNUNG_WEBSEITE.csv`: alle 38 gelieferten Bildbearbeitungen, Herkunft und Verwendung; davon 37 eingebaut.

| Ordner / Datei | Inhalt |
| --- | --- |
| Sechs HTML-Dateien im Hauptordner und `00-STARTEN.html` | Startdateien für die aktuellen Seiten unter `webseite/`, auch für den bisherigen Einstieg über `index.html` |
| `webseite/` | Sechs fertige Seiten, Medien, gemeinsame Gestaltung und JavaScript |
| `quellcode/` | Bearbeitbare Vorlagen und portable Build-/Exportskripte |
| `arbeitsmaterial/vorschau/` | Ergänzende Vorschauhilfen für Logo, Porträt, Software, Marmor und Header |
| `BILDZUORDNUNG_WEBSEITE.csv` | Bildzuordnung einschließlich des nicht eingebauten Handy-Screenshots |
| `DATEIEN_SHA256.json` | Prüfsummen der im Paket enthaltenen Dateien |

Zusätzliches hochauflösendes Header-Arbeitsmaterial kann im größeren Arbeitsarchiv vorhanden sein. Für dieses Webseitenpaket werden das bereits enthaltene Web-GIF und seine Vorschau verwendet.

## Projekt bauen

Im entpackten Projektordner:

```bash
python3 quellcode/build.py
```

Unter Windows gegebenenfalls `python` oder `py -3` verwenden. Nur Python 3 mit Standardbibliothek wird benötigt; zum Ansehen der Webseite wird Python nicht benötigt. Der Build schreibt nach `webseite/`. Fotos werden nicht erneut bearbeitet.

### Einzelne Offline-HTML

```bash
python3 quellcode/offline/generate_offline_html.py --output Crazy_Batto-Webseite-NEUE-BILDER.html --start-page home --start-anchor cb-ueber-mich
```

Optional startet `--start-page gaming` direkt beim Gaming-Setup; dabei den nur auf Home vorhandenen `--start-anchor cb-ueber-mich` weglassen. Ohne beide Optionen beginnt die Datei ganz oben auf der Startseite.

### Ergänzende Fragmentvorschau

```bash
python3 quellcode/build.py --preview-output vorschau-fragment.html
```

Die Foto-Pfade werden aus den aktuellen Vorlagen übernommen. Die unveränderten PNGs sind groß; die Vorschau ist daher nicht auf eine kleine Dateigröße optimiert.

### Serverfassung

```bash
python3 quellcode/export_server.py --server-public /pfad/zum/Discord_Handy_App/server/public/showcase
```

Nur dieser ausdrückliche Export schaltet die vorhandenen Portalaufrufe ein. Das Backend benötigt die passenden expliziten Bildrouten. Bereits ersetzte Fotos in einem alten Exportziel müssen gezielt entfernt werden; der Export löscht keine vorhandenen Dateien.

## Inhaltliche Grenzen

Batto OBS Tool ist **noch nicht freigegeben**: kein Programm-Download, kein Release-Datum, nur ausgewählte Funktionen. CNG steht aus. Die Hinweise zu RGB-Vorschau, iCUE-Lüftersteuerung und virtueller Strimer-Demo bleiben bestehen.

Discord-App und Registrierung sind enthalten. Die lokale Webseite zeigt ausdrücklich eine **Offline-Demo**: Sie meldet niemanden bei Discord an, sendet keinen Antrag und erteilt keine echte Freigabe. Echte Registrierung und geschützter APK-Download benötigen das bestehende Serverportal.

Die Webseite ist weiterhin nicht auf einer öffentlichen Domain bereitgestellt.

## Sichtbarer Einstieg – Korrektur in V6

Die V5-Einzeldatei begann oben beim bisherigen Header und Porträt. In V6 öffnet die ausgelieferte Einzeldatei unmittelbar beim aktualisierten Über-mich-Bereich. Die 37 bearbeiteten PNGs waren bereits in V5 vorhanden; sie werden nicht erneut verändert. `--start-anchor` steuert nur den ersten Einstieg ohne ausdrücklichen Hash-Link. Der Anker muss auf der gewählten Startseite existieren. Ohne diese Option bleibt der normale Einstieg erhalten.

Im V5-ZIP lagen die sechs Seiten nur unter `webseite/`. Beim Entpacken über einen älteren Ordner mit `index.html` im Hauptordner konnte diese alte Datei deshalb bestehen bleiben. V6 enthält die sechs früheren Seitennamen auch direkt im Hauptordner als Weiterleitungen zu den aktuellen Seiten. Damit wird dieser bisherige Einstieg beim Ersetzen gleichnamiger Dateien aktualisiert. Die tatsächlichen Seiten und ihre Medien liegen weiterhin vollständig unter `webseite/`.

Der lokal auf einem anderen Computer entpackte Webseitenordner wird durch einen neuen Download nicht automatisch ersetzt. Die neue Einzeldatei öffnen oder das neue ZIP entpacken und bei einem Update die gleichnamigen Dateien ersetzen.
