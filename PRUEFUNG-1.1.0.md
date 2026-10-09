# Modstempel 1.1.0 – Prüfstand

Datum: 9. Oktober 2026. Diese Datei dokumentiert die lokal nachgewiesenen Ergebnisse und die noch nicht auf einem Android-Gerät ausgeführten Abläufe. Alle Discord-Antworten in den automatisierten Prüfungen sind simuliert. Es wurde keine Nachricht an einen echten Discord-Kanal gesendet.

## Automatisierte Logik- und Vertragsprüfungen

| Bereich | Ergebnis | Grundlage |
| --- | --- | --- |
| Stempellogik, Datenerhalt und Versand | 28 Tests bestanden | `node --test tests/*.test.cjs`, Node.js 24.19.0 |
| Native URL- und Datenverträge | 85 Prüfungen bestanden | `bash android/test-native-contract.sh`, OpenJDK 17 |
| Bedienabläufe im DOM | 12 Prüfgruppen bestanden, keine gemeldeten Skriptfehler | JSDOM mit simulierter Android-Bridge |
| Bedienabläufe im Browser | 9 Prüfgruppen bestanden, keine JavaScript-/CSP-Fehler und keine externen Anfragen | Lokales Chromium mit Playwright und simulierter Android-Bridge |
| Android-Build | Finale APK erzeugt | Android Build Tools 35.0.0, Eclipse Java Compiler 4.31, API 35 |
| Signatur und ZIP-Ausrichtung | v2/v3 und zipalign erfolgreich | Android-Werkzeuge am fertigen APK |
| Update-Signatur | Identisch mit Version 1.0.0 | Vergleich beider Signierzertifikate |
| Eingebettete Oberfläche | Alle sechs Webdateien identisch mit dem eingefrorenen Quellcode | Bytevergleich der APK-Assets |
| Launcher-Bild | Identisch mit dem hochgeladenen Original | Bytevergleich des PNG im fertigen APK |

Die 15 bisherigen Logiktests prüfen unter anderem 50 Minuten Nettozeit mit 10 Minuten Pause, Dienstende während einer Pause, Neustart, versehentliche Mehrfachaktionen, Speicherfehler ohne Versand, verzögerten Versand mit 1.750 Millisekunden Wartezeit, unklare Zustellung ohne automatische Wiederholung, dauerhafte Webhook-Fehler, unveränderte Zuordnung zu Profil und Kanal, Mitternachtsgrenzen und sichere Exporte.

Die 13 zusätzlichen Umfragetests prüfen:

- Laden eines tatsächlich dem alten Datenformat entsprechenden Zustands mit laufender Pause; vorhandene Dienste, Pausen und Profilwerte bleiben unverändert.
- Vorschau ohne Speichern oder Senden sowie Erstellung einer Anfrage ohne Beginn oder Änderung eines Dienstes.
- Eingabegrenzen, genaue Antworttexte, Dauer und ausgeschaltete automatisierte Erwähnungen.
- Schutz gegen identische Anfragen innerhalb von 60 Sekunden, auch nach Neustart.
- Gemeinsame, einzeln arbeitende Versandwarteschlange für Anfragen und Stempel, einschließlich exakter Discord-Wartefristen.
- Gegenseitige Sperre von Versand und Ergebnisabfragen, sodass keine parallelen Discord-Anfragen erzeugt werden.
- Ablauf noch nicht versendeter Anfragen zum geplanten Streambeginn beziehungsweise nach einer Stunde ohne Termin; spätere Stempel werden dadurch nicht dauerhaft aufgehalten.
- Unklare Zustellung nach Neustart und Wiederholung nur nach ausdrücklicher Aktion.
- Ursprünglicher Absender, Team und Webhook sowie Öffnen des tatsächlichen Nachrichtenkanals, auch bei Discord-Threads.
- Stimmenzuordnung über die gelieferten Antwort-IDs, unbekannte Ergebnisse, ausdrücklich veraltete gespeicherte Zahlen und finalisierte Ergebnisse.
- Kein Versand bei fehlgeschlagener Speicherung und kein Webhook-Geheimnis in Exporten.

Die nativen Prüfungen umfassen zusätzlich zu den bisherigen Webhook-Verträgen die neuen Aktionen `read_poll` und `open_discord`: strenge numerische IDs, korrekt gebaute Nachrichten- und Thread-URLs, keine frei vorgegebenen externen Links und korrekt übernommene dezimale Retry-Werte. Lesefehler einer einzelnen Umfrage sperren nicht die Verbindung für weitere Stempel.

Beschädigter, aber lesbarer JSON-Inhalt bleibt beim Rettungsexport als UTF-8-Text unverändert. Bei einem echten Lesefehler beziehungsweise einer geworfenen Ladeexception wird kein leerer oder irreführender Export erzeugt und der Speicher nicht überschrieben.

## Bedienabläufe

Die zwölf DOM-Prüfgruppen umfassen die bisherigen Abläufe für Einrichtung, Eingabeerhalt während Zeitaktualisierungen, Start/Pause/Neuladen, gesperrte Profiländerungen im Dienst, erlaubte Designänderungen, Fortsetzen/Beenden, Endnotizen mit HTML-Sonderzeichen, Export, unklare Zustellung und nicht lesbaren Speicher.

Hinzu kommen die Streamer-Einrichtung, Anfragebestätigung, Schutz gegen Doppelklicks, JSON-Export bei ausschließlich vorhandenen Anfragen, unbekannte und bekannte Stimmenzahlen, nicht fortlaufende Antwort-IDs, Erhalt alter Ergebnisstände, Öffnen der Nachricht, Anfragefehler und abgelaufene vorgemerkte Anfragen.

## Browser- und Layoutprüfung

Der lokale Browser wurde mit einer vollständig entpackten Chromium-Laufzeit und gültiger Fontkonfiguration gestartet. Der bisherige Screenshot-Blocker der Version 1.0.0 war in dieser Prüfung überwindbar. Die früher verwendete Chromium-Datei war unvollständig; die alten Fehlversuche belegen keinen Fehler der ausgelieferten Oberfläche.

Die geprüfte Oberfläche enthält vier Navigationspunkte: **Stempeln**, **Streamer**, **Verlauf** und **Einstellungen**. Die Browser-Vorschau enthält einen eigenen Hinweis auf den ausschließlich in Android verfügbaren Discord-Versand. Die installierte App öffnet bei der ersten Einrichtung direkt die Einstellungen; danach ist die Stempelansicht der normale Einstieg.

Die Stempelansicht, das Streamerformular, die Sendebestätigung und eine Anfragekarte mit simulierten Ergebnissen wurden bei 390 Pixel Breite als Screenshots aufgenommen und sowohl vom UI-Bearbeiter als auch im Abschlussreview angesehen. Das Browser-Testsystem stellte die Schrift Open Sans ausschließlich auf seinem lokalen QA-Server bereit; die ausgelieferte App verwendet weiterhin die im Quellcode festgelegte Systemschrift und lädt keine Schrift aus dem Netz. Die Umfrage-Screenshots tragen ausdrücklich QA-Kennzeichnungen und enthalten keine echten Discord-Antworten.

Der Vergleich mit dem ursprünglichen Gestaltungskonzept bestätigte folgende Punkte:

1. Dunkler Seitenhintergrund, etwas hellere Karten, dezente Trennlinien und goldene Hauptaktionen bleiben konsistent.
2. Markenname, Schild/Uhr-Zeichen, Profilzeile und Einstellungsschaltfläche behalten ihre Anordnung und optische Hierarchie. Das hochgeladene violette Bild dient gesondert als Android-Launcher-Symbol.
3. Der große mittige Zeitzähler, der volle Startknopf und die getrennten Tageswerte bleiben die Schwerpunkte der Stempelansicht.
4. Profil, Dienstkarte, Tageswerte, Ereignisse und Discord-Verbindung folgen derselben Reihenfolge wie im Konzept. Die mobilen Abstände wurden so korrigiert, dass die Verbindungszeile im geprüften leeren 390-Pixel-Zustand vor der festen Navigation endet.
5. Die Navigation ist bewusst von drei auf vier Einträge erweitert. Der aktive Eintrag ist erkennbar, und **Streamer** fügt sich neben den bestehenden Zielen ein.
6. Das Streamerformular übernimmt Farben, Eingabefelder, Abstände und Fokusdarstellung der bestehenden Einstellungen. Pflichtfeld, optionale Angaben und Antwortfenster sind unterscheidbar.
7. Die Sendebestätigung zeigt Titel, Zeitpunkt, Antwortfenster und alle drei Antworten. Text und Schaltflächen passen in den geprüften mobilen Dialog.
8. Die Anfragekarte trennt Sendestatus, Termin, Stimmenzahlen und Aktionen. Die Antwortzahlen sind an den jeweiligen Antwortzeilen ausgerichtet; der Link zu den einzelnen Namen in Discord ist beschrieben.

Im geprüften leeren Stempelzustand bei 390 × 844 Pixeln endet die Verbindungszeile bei y=770,97 vor dem Navigationsbeginn bei y=772. Bei 320 und 560 Pixel Breite wurde kein horizontaler Überlauf festgestellt; auf großen Ansichten bleibt der Inhalt auf 560 Pixel begrenzt.

Der gerenderte Streamerablauf erzeugte vor Bestätigung null und nach Bestätigung genau einen simulierten Versandaufruf. Anschließend waren das Formular leer und weiterhin kein Dienst aktiv. Die Aktualisierung zeigte die ausdrücklich simulierten Werte 2 / 0 / 1; das Öffnen der gespeicherten Discord-Nachricht erzeugte keinen weiteren Versand. Der Browserlauf prüfte außerdem den Stempelablauf mit Neuladen, Themewechsel, inertem Notiztext und tatsächlichem lokalem JSON-Download.

Diese Browserprüfung bestätigt das lokale Layout, ersetzt aber keinen Android-Geräte- oder Launcher-Test und behauptet keine pixelgenaue Übereinstimmung mit der Geräteschrift.

## Android-Paket und Update

Das App-Paket bleibt `app.modstempel.mobile`; Version 1.1.0 erhöht den Versionscode auf 2. Der vorhandene Signierschlüssel wird wiederverwendet. Das ermöglicht ein Update der ausgelieferten Version 1.0.0, ohne die App zuvor zu deinstallieren. Der alte Dateiname für die lokalen Zustandsdaten und der Keystore-Zugriff bleiben erhalten. Ein echter Installations-/Update-Lauf auf einem Gerät wurde nicht durchgeführt.

Das vom Nutzer gelieferte Moderationsschild wird unverändert als PNG in den Android-Ressourcen eingebettet. Der Build schaltet die PNG-Neukomprimierung mit `--no-crunch` aus. Das adaptive Symbol verwendet einen dunklen Hintergrund und 22 Prozent Rand, damit der Schild in den verschiedenen Launcher-Masken Platz hat. Die Darstellung in einem konkreten Android-Launcher bleibt ein Gerätetest.

## Noch auf dem Zielgerät zu prüfen

1. Die neue APK über Version 1.0.0 installieren; vorher nicht deinstallieren. Vorhandene Einstellungen, Dienste und gegebenenfalls laufende Pause kontrollieren. App-Symbol auf dem Startbildschirm ansehen.
2. Die vier Ansichten bei normaler und vergrößerter Systemschrift ansehen. **Verbindung prüfen** liest nur Metadaten und sendet keine Kanalnachricht.
3. Unter **Streamer** eine bewusst gewählte Anfrage senden. In Discord mit einem berechtigten Konto abstimmen und anschließend **Ergebnis aktualisieren** und **In Discord öffnen** verwenden. Das erzeugt eine echte Kanalnachricht und echte Stimmen.
4. Kontrollieren, dass die Anfrage und das Abstimmen keinen Dienst beginnen. Anschließend einen Dienst starten, pausieren, fortsetzen und beenden; Zeiten und Sendestatus in App und Kanal vergleichen.
5. Die App während eines Dienstes schließen und wieder öffnen. Mit ausgeschaltetem Internet stempeln und bei geöffneter App die Übertragung nach Wiederherstellung der Verbindung beobachten.
6. CSV und JSON über die Android-Dateiauswahl exportieren und die Dateien öffnen. JSON enthält auch die lokalen Anfragen; CSV enthält die Dienste.

Android-WebView, Keystore, Systemzwischenablage, Dateiauswahl, Launcher, Hintergrundwechsel und tatsächliche Discord-Zustellung wurden nicht auf einem Gerät oder Emulator ausgeführt. Die lokalen Browserprüfungen verwenden eine simulierte Bridge; sie bestätigen nicht das Verhalten der Discord-Server oder der auf dem Handy installierten Discord-App.

## Ausgelieferte APK

- Datei: `Modstempel-1.1.0.apk`
- Paket: `app.modstempel.mobile`
- Version: `1.1.0`, Versionscode `2`, minSdk `26`, targetSdk `35`
- Größe: `2.507.941` Bytes
- APK-SHA-256: `0e24deac41773966da15db4716e595d21b546bac381163b36a6d51f16ced4fab`
- SHA-256 des geprüften und unveränderten Signierzertifikats: `c6ba05258739e61cd809479071abd85bd52e6a8a5f667fc1d2642b752bb35da3`

`icon` und `roundIcon` verweisen auf dasselbe adaptive Launcher-Symbol. Der Anzeigename lautet **Modstempel**; die frühere unerwünschte Branding-Zeichenfolge wurde in DEX, Assets und Manifest nicht gefunden. Die bereits ausgelieferte 1.0.0-APK wurde nicht verändert; ihr SHA-256 bleibt `a4b1676b83ebfca2c72c5a51df30668398f1d11e8f50961b954c744711991085`.
