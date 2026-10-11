# Crazy_Batto – Webseite V5

**Stand: 11. Oktober 2026.** Weiterarbeit auf der bestehenden Webseite mit sechs Seiten, überarbeiteten Fotozuordnungen und dem unveränderten Design aus schwarzem Marmor, Gold und Anthrazit.

## Sofort ansehen

Das ZIP vollständig entpacken und **`00-STARTEN.html`** öffnen. Dieser Einstieg zeigt direkt den aktualisierten Über-mich-Bereich mit der Maus. **`webseite/index.html`** öffnet die Startseite ganz oben. Die Dateien und der Medienordner müssen zusammenbleiben. Eine Installation und ein Server sind für die Vorschau nicht nötig.

Die separate **`Crazy_Batto-Webseite-V5.html`** enthält dieselbe Webseite samt allen Bildern in einer Datei. Sie startet auf der Startseite.

## Vor dem Bearbeiten lesen

1. `UEBERGABE_NEUER_CHAT.md`: Inhalte, Entscheidungen, Bildplatzierung und Grenzen der Softwarevorstellung.
2. `BILDZUORDNUNG_WEBSEITE.csv`: alle 38 gelieferten Bildbearbeitungen, Herkunft und Verwendung; davon 37 eingebaut.

| Ordner / Datei | Inhalt |
| --- | --- |
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
python3 quellcode/offline/generate_offline_html.py --output Crazy_Batto-Webseite-V5.html
```

Optional startet `--start-page gaming` direkt beim Gaming-Setup. Ohne die Option beginnt die Datei auf der Startseite.

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
