# Crazy_Batto – bestehende Webseite mit ausgetauschten Bildern

Stand: 11. Oktober 2026 · Version 7.

## Ansehen

Das ZIP vollständig entpacken und `index.html` oder `00-STARTEN.html` im Hauptordner öffnen. Beide führen zur normalen Startseite in `webseite/`. Beim Aktualisieren eines bisherigen Ordners gleichnamige Dateien ersetzen. Alle Seiten und Medien zusammenlassen.

Die separate `Crazy_Batto-Webseite-NEUE-BILDER.html` enthält dieselben sechs Seiten und alle eingebundenen Medien in einer Datei. Sie beginnt regulär oben auf der Startseite.

## Maßgeblicher Auftrag

Die bestehende Webseite bleibt die Grundlage. Sieben vorhandene Fotos wurden an ihren bisherigen Bildplätzen durch die passenden fertigen Bearbeitungen ersetzt. Der doppelte PC-Aufbau ist einmal enthalten. Die ausdrücklich gewünschte Maus steht als einzelnes Bild im vorhandenen Abschnitt „Persönliche Vorstellung & Ausstattung“ vor dem Text.

Die in V5 zusätzlich angelegten Maus-, Sammlungs- und alten Setupgalerien sowie deren neue Überschriften und Beschreibungen sind zurückgenommen. Gaming- und Softwaregalerie bleiben in ihrer bisherigen Anordnung; die Gaming-Galerie hat nach der Dublettenbereinigung zehn Bilder. Der automatische Sprung zum Mausbereich aus V6 ist entfernt.

`BILDZUORDNUNG_WEBSEITE.csv` dokumentiert, welche fertigen Fotos verwendet wurden. Weitere gelieferte Fotos bleiben Material in ihren ursprünglichen Fotopaketen; daraus wurden keine neuen öffentlichen Bereiche angelegt.

## Weiterarbeiten

Zuerst `UEBERGABE_NEUER_CHAT.md` und die Bildzuordnung lesen. Die Vorlagen liegen in `quellcode/`, die fertige Webseite in `webseite/`, die Vorschauhilfen in `arbeitsmaterial/vorschau/`.

```bash
python3 quellcode/build.py
python3 quellcode/offline/generate_offline_html.py --output Crazy_Batto-Webseite-NEUE-BILDER.html
```

Der Build benötigt Python 3 mit Standardbibliothek. Zum Ansehen wird keine Installation benötigt. Bilddateien werden beim Export nicht erneut bearbeitet.

Die ausdrückliche Serverfassung erzeugen:

```bash
python3 quellcode/export_server.py --server-public /pfad/zum/Discord_Handy_App/server/public/showcase
```

Für den Server gelten die vorhandenen Portal-APIs und die persönlichen Freigabeprüfungen. Das Offline-Paket zeigt die Registrierung als Beispielansicht.

Batto OBS Tool ist noch nicht freigegeben. Es bleibt bei den vereinbarten ausgewählten Einblicken ohne Programm-Download, Release-Datum oder vollständige Funktionsliste. Die Hinweise zu CNG, RGB, iCUE und virtueller Strimer-Demo gelten unverändert.
