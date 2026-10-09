# UI-Prüfung Modstempel 2.1

## Gestaltungsgrundlage

- Portal-Konzept: `/workspace/scratch/1d6606c2c98f/generated_images/exec-d29fef9b-6d3e-4c8b-ac62-d6322fe03e7f.png`, 1536 × 1024.
- App-Konzept: `/workspace/scratch/1d6606c2c98f/generated_images/exec-88dfe720-2d73-4e6a-b224-a4f051ad5904.png`, mobile Freigabeansicht.
- Beide Konzepte und die finalen Browserbilder wurden im selben Prüfdurchgang mit `view_image` angesehen und verglichen.
- Dunkle Grundfläche `#0e0f12`, rote Aktion `#c92a38`, weißer Text, silbergraue Begleittexte. Systemschrift ohne externe Font-Anfragen. Buttons mindestens 48 px hoch, Portal-Aktion am Desktop 70 px.
- Das Nutzerbild liegt unverändert in `web/assets/background-batto.jpeg` und `server/public/background-batto.jpeg`. Seine ursprüngliche Bildschrift bleibt im Bild. Der App-Name und der bisherige Launcher bleiben Modstempel.

## Vergleich und Korrekturen

| Vergleichspunkt | Konzept | Finale Umsetzung / Entscheidung |
|---|---|---|
| Desktop-Komposition | Linkes Originalmotiv, rechts offene Anmeldung, kein Kartenraster | Gleiche Zweispaltenanordnung; Textbeginn und rechter Rand auf die Referenz abgestimmt. |
| Überschrift und Anmeldung | „Dein Zugang zu Modstempel“, „Mit Discord registrieren“ | Gleiche Texte und Hierarchie, kein zusätzlicher Marketingtext und keine erfundenen Zahlen. |
| Portal-Typografie | Große weiße Überschrift, gut lesbare graue Erklärung und kräftige rote Aktion | Desktop-Aktion nach erstem Vergleich auf 23 px / 70 px angepasst. Oberer Inhalt und Footerabstand angeglichen. |
| Hintergrund | Drache und roter Mond, keine künstliche Farbtönung | Original-JPEG verwendet. Nur Randmaskierung am Desktop; kein neu generiertes Motiv in den App-Assets. Bildausschnitt kann deshalb vom KI-Konzept abweichen. |
| Mobile Freigabe | Dunkles Statusfeld über dem Motiv, Statusprüfung und Browseraktion | Beide Aktionen vorhanden. Titelgröße, Innenabstände und oberer Bildabstand verdichtet, sodass Statusfeld und deaktivierter Timer bei 390 × 844 sichtbar bleiben. |
| Navigation | Vier bestehende App-Bereiche | Stempeln, Beiträge, Events, Verlauf unverändert bedienbar. Vorhandene SVG-Symbole behalten; kein Austausch durch die leicht abweichenden Konzept-Symbole. |
| Dynamische Daten | Konzept verwendet neutrale Kontobezeichnung | Umsetzung zeigt die tatsächlich bestätigte Kontoidentität und den aktuellen Freigabestatus. QA-Bilder verwenden ausschließlich ein klar benanntes Testkonto. |
| Bestehende Daten | Ergänzung der App um Hintergrund und Zugang | Verlauf, lokale Exporte und laufende Dienstzeiten bleiben erreichbar; gespeicherte Nutzerfarben und der gewählte Modus werden erhalten. |
| Anmeldung und Zustände | Abgemeldet, Anfrage, Freigabe | Zusätzliche notwendige Formular-, Ablehnungs-, Sperr- und Verbindungszustände im selben Stil implementiert. Keine frei erreichbare Download-URL in der UI vor bestätigter Freigabe. |
| Serveradresse | Vom endgültigen Host abhängig | Auf der freigegebenen Downloadseite echte aktuelle Serveradresse mit Kopieraktion ergänzt, damit sie in der APK eingerichtet werden kann. |

Keine fixierbaren Überläufe, abgeschnittenen primären Aktionen oder fehlenden Bild-Assets im letzten Prüfdurchgang. Die vorhandenen Profil-, Formular- und Verlaufsfunktionen erklären absichtliche Abweichungen vom reinen Freigabekonzept; sie wurden nicht durch einen neuen Demonstrationsbildschirm ersetzt. Die Umsetzung wurde anhand der Konzepte auf Layout, Schriftgrößen, Farben, Bildbehandlung, Abstände, Icons und Zustände geprüft.

## Rendering und Interaktion

Browser/IAB hat keine Verbindung zu diesem lokalen Entwicklungscontainer. Daher wurde lokal Playwright mit Chromium verwendet. Portal-API und NativeBridge wurden in dieser UI-Prüfung durch Testantworten ersetzt; Layout, DOM, Assets, App-Core und Benutzeraktionen sind die echten Projektdateien. Es wurden keine Discord-Konten angemeldet und keine echten Beiträge versendet.

- Desktop-Portal im nativen Referenzformat 1536 × 1024 geprüft.
- Android-Vorschau bei 390 × 844 aufgenommen; feste Navigation am unteren Viewportrand. Vor der freigegebenen Aufnahme wurde das temporäre Toast ausgeblendet.
- Portal auf 320, 390, 720, 1024 und 1536 px ohne horizontalen Überlauf geprüft.
- Alle fünf Android-Ansichten auf 320, 390 und 560 px ohne horizontalen Überlauf geprüft.
- 13 Browser-Prüfgruppen erfolgreich, keine unbehandelten JavaScript-Fehler. Details in `ui-access.json`.
- 10 neue Core-Tests prüfen Zugangssperre, Freigabe, Netzfehler, automatische Statuswiederholung, Queues und lokale Daten. Details im Test `tests/access-v2.test.cjs`.

Ausführen:

```sh
node --test tests/access-v2.test.cjs
MODSTEMPEL_CHROMIUM=/pfad/zum/chromium node qa/ui-access.cjs
```

Die UI-Prüfung benötigt Playwright. Im verwendeten Entwicklungscontainer wird das Paket aus `CODEX_PRIMARY_RUNTIME_NODE_MODULES` geladen. Browserdateien und Abhängigkeiten werden nicht in die APK übernommen.
