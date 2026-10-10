# Crazy_Batto – komplette Webseitenübergabe

Stand: 10. Oktober 2026, nach der Erweiterung um „Software – Batto OBS Tool“.

## Im neuen Chat weitermachen

1. Dieses vollständige ZIP im neuen Chat hochladen.
2. Den Text aus `STARTTEXT_NEUER_CHAT.txt` als Nachricht einfügen.
3. Anschließend den nächsten Änderungswunsch nennen.

Die Übergabe ist in `UEBERGABE_NEUER_CHAT.md` ausführlich beschrieben. Dort stehen der aktuelle Stand, die gewünschten Inhalte, die Designentscheidungen und die noch offenen Bereiche.

## Webseite ansehen

Das ZIP vollständig entpacken und `webseite/index.html` im Browser öffnen. Die übrigen HTML-Dateien und der Ordner `assets` müssen zusammenbleiben. Ein Server oder eine Installation ist dafür nicht nötig.

| Ordner oder Datei | Inhalt |
| --- | --- |
| `webseite/` | Die fertige, lokal nutzbare Webseite mit sechs Seiten und allen eingebundenen Medien |
| `quellcode/` | Bearbeitbare Vorlagen, gemeinsame Gestaltung, JavaScript und portables Build-Skript |
| `arbeitsmaterial/vorschau/` | Komprimierte Dateien für eine interaktive Chat-Vorschau |
| `arbeitsmaterial/originale/` | Ursprüngliches Header-Video und hochauflösende Marmor-Textur |
| `arbeitsmaterial/extra/` | Zusätzlicher Header-Export als großes GIF in hoher Qualität |
| `arbeitsmaterial/referenzen/` | Mitgelieferter Handy-Screenshot der bisherigen Webseite |
| `UEBERGABE_NEUER_CHAT.md` | Vollständige inhaltliche und technische Übergabe |
| `DATEIEN_SHA256.json` | Dateiverzeichnis mit Größen und Prüfsummen |

Die Originalfotos, das Logo, das Porträt und die acht Programmscreenshots liegen bereits in `webseite/assets/`. Das verwendete Web-GIF liegt dort als `header.gif`; es ist nicht nochmals unter einem zweiten Namen enthalten.

## Projekt bearbeiten und bauen

Im entpackten Projektordner ausführen:

```bash
python3 quellcode/build.py
```

Unter Windows kann der Aufruf je nach Installation `python quellcode/build.py` oder `py -3 quellcode/build.py` lauten. Das Skript benötigt nur Python 3 und seine Standardbibliothek. Die Webseite selbst benötigt Python nicht.

Der Build schreibt die sechs Seiten sowie CSS, JavaScript und die Lesehinweise nach `webseite/`. Bilder bleiben im vorhandenen Medienordner. Änderungen möglichst in `quellcode/` vornehmen und danach neu bauen, damit die nächste Änderung den gleichen Stand verwendet.

Optional kann zusätzlich eine eigenständige HTML-Fragmentdatei für eine Chat-Vorschau erzeugt werden:

```bash
python3 quellcode/build.py --preview-output vorschau-fragment.html
```

Die Fragmentdatei ist für ein geeignetes Vorschau-System gedacht. Zum normalen Ansehen im Browser dient `webseite/index.html`. Für eine neue Chat-Vorschau verwendet der nächste Chat den dort verfügbaren Vorschau-Ablauf und einen neuen Dateipfad.

## Was dieses Paket enthält

Dieses Paket enthält das vollständige aktuelle Webseitenprojekt einschließlich seiner Medien und editierbaren Quellen. Das Batto OBS Tool wird auf einer Seite vorgestellt. Sein Programmcode, ein Installer oder eine Freigabe des Programms gehören nicht zu diesem Webseitenpaket.

Die Webseite wurde noch nicht auf einer öffentlichen Domain bereitgestellt.

## Ergänzung: Discord-App und Registrierung

Die Webseite enthält jetzt auch `discord-app.html` und `registrierung.html`.
Die Registrierung zeigt im normalen lokalen Paket ausschließlich ausdrücklich
bezeichnete Beispielansichten. Echte Discord-Anmeldungen, Zugangsanfragen und
APK-Downloads laufen über das bestehende Serverportal mit persönlicher Freigabe.

Nach dem normalen Build kann die einzelne Offline-Datei erzeugt werden:

```bash
python3 quellcode/offline/generate_offline_html.py --output Crazy_Batto-Offline.html
```

Optional lässt sich die Offline-Datei direkt auf „Mein Gaming-Setup“ öffnen:

```bash
python3 quellcode/offline/generate_offline_html.py --output Crazy_Batto-Gaming-Offline.html --start-page gaming
```

Ohne `--start-page` beginnt die Datei weiterhin auf der Startseite. Die übrigen
Seiten bleiben in beiden Varianten über die Navigation erreichbar.

Die Serverfassung mit echten Portalaufrufen wird ausdrücklich exportiert:

```bash
python3 quellcode/export_server.py --server-public /pfad/zum/Discord_Handy_App/server/public/showcase
```

Der Server benötigt die zugehörigen neuen, expliziten Showcase-Routen. Einfaches
Hochladen der Offline-HTML-Datei aktiviert keine echte Registrierung.
