# Crazy_Batto – Webseite

Aktueller Stand: 11. Oktober 2026 · Version 7. Schwarzer Marmor mit Goldadern,
anthrazitfarbene Flächen und helle Schrift.

## Enthaltene Seiten

- Startseite und Über mich; gewünschte Einleitung „Am 2022 habe ich wieder angefangen“.
- Mein altes Setup – So habe ich angefangen.
- Mein Gaming-Setup.
- Software – Batto OBS Tool: ausgewählte Einblicke, noch nicht freigegeben.
- Crazy_Batto Discord App: vorhandene Funktionen und Originalabbildung.
- Registrierung: Discord-Anmeldung, Zugangsanfrage, persönliche Freigabe und Downloadstatus.

## Bauen und offline ansehen

Aus dem Repository-Hauptordner:

```bash
python3 website/quellcode/build.py
```

Anschließend `website/index.html` oder `website/webseite/index.html` im Browser öffnen. Alle Dateien
und der Medienordner bleiben zusammen. Die Anmeldung zeigt offline ausdrücklich
bezeichnete Beispielansichten und sendet keine Anfragen.

Eine einzelne vollständige Offline-Datei mit allen Originalmedien erzeugen:

```bash
python3 website/quellcode/offline/generate_offline_html.py --output Crazy_Batto-Webseite-NEUE-BILDER.html
```

Das Header-GIF wird beim normalen Build bei Bedarf aus den SHA-256-geprüften
Teilen unter `server/media-parts` wiederhergestellt. Die Bilddaten werden dabei
weder neu komprimiert noch verändert. Alle anderen Laufzeitmedien sind direkt
unter `website/webseite/assets` enthalten. Die kleinen Dateien für die optionale
Chat-Vorschau liegen unter `arbeitsmaterial/vorschau`; der zusätzliche große
HQ-GIF-Export und die ursprünglichen Arbeitsmaterialien bleiben im separaten
ursprünglichen Übergabe-ZIP und werden für den Build nicht benötigt.

## Serverfassung

```bash
python3 website/quellcode/export_server.py
```

Das schreibt die produktive Fassung nach `server/public/showcase`. Die vorhandenen
Serverrouten liefern `/`, die sechs Seiten und `/portal` aus. Nur dieser Export
aktiviert die echten Portalaufrufe. Den Server entsprechend `server/README.md`
mit eigener Discord-Konfiguration und HTTPS betreiben. Die private APK gehört
weiterhin ausschließlich in `server/releases` und bleibt an eine aktuelle
persönliche Freigabe gebunden.

Die bisherige CMS-Ansicht bleibt unter `/site` erreichbar. Das bestehende Schema
der PC-Verwaltung wurde noch nicht auf sämtliche Inhalte dieser neuen Website
erweitert. Neue sechsseitige Inhalte deshalb in `quellcode` bearbeiten und bauen.

## Gezielte Prüfung

```bash
node website/tests/registration-smoke.mjs
cd server
npm test
```

Die Funktionsprüfungen für Registrierung verwenden DOM-Stubs. Das ist kein
behaupteter Browser- oder Android-Test. Die zusätzlichen HTTP-Tests prüfen
Seiten, Medien, bestehende Zugangssperren und die Medienwiederherstellung.

## Korrigierter Bildaustausch

Die ursprüngliche Seitenstruktur ist wiederhergestellt. Sieben vorhandene Fotos
sind direkt durch die zugeordneten bearbeiteten PNGs ersetzt. Ein einzelnes
Mausfoto ergänzt die ausdrücklich benannte Stelle bei Über mich. Der doppelte
PC-Aufbau ist entfernt; die übrige Reihenfolge der vorhandenen Galerie bleibt.
Die zusätzlichen Bereiche und Galerieumbauten aus V5 sowie der automatische
Maus-Einstieg aus V6 sind zurückgenommen. Die Materialzuordnung steht in
`BILDZUORDNUNG_WEBSEITE.csv`.
