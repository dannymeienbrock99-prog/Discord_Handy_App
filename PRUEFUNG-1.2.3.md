# Modstempel 1.2.3 – Getrennter Bild- und Umfrageversand

Datum: 9. Oktober 2026.

## Konkreter Fehler und korrigierte Annahme

Der Nutzer lieferte nach dem Update die vollständige tatsächliche Ablehnung: **HTTP 400 · Discord 50035 · Invalid Form Body · poll [INVALID_POLL_ATTACHMENTS]**. Damit ist die bislang unbekannte Fehlerklasse konkret: Die App übergab in derselben Nachricht sowohl eine Umfrage als auch den hochgeladenen Bildanhang.

Die Versionen 1.2.0 bis 1.2.2 bauten genau diese Kombination. Die frühere Prüfung mit zwei unabhängigen Multipart-Parsern bestätigte zwar den technisch korrekten Aufbau der Dateiteile, konnte aber nicht belegen, dass der Discord-Server diese Kombination erlaubt. Die damalige Schlussfolgerung zur Kombinierbarkeit war falsch und wird mit dieser Version korrigiert.

Dazu existiert ein ausdrücklicher Kommentar des Poll-Implementierers im offiziellen Discord-Repository: Am 18. April 2024 erklärte tpcstld, dass Attachments nicht mit einer Umfrage kombiniert werden können. Der direkte Bezug auf einen Bericht zu Fehler 50035 passt zum jetzt tatsächlich gemeldeten Fall. Im selben Gespräch werden Text-Embeds und Inhalt neben einer Umfrage als funktionierend beschrieben. Die historischen Kommentare ersetzen keine aktuelle allgemeine Kompatibilitätsmatrix; der heutige Fehler des Nutzers belegt die Ablehnung in diesem konkreten Einsatz.

Quelle: [Discord, Document polls #6746, Kommentar 2064810908](https://github.com/discord/discord-api-docs/pull/6746#issuecomment-2064810908). Der Kommentar wurde authentifizierungsfrei über die öffentliche GitHub-API gelesen. Es wurde dabei kein Discord-Webhook aufgerufen.

## Neuer Versandablauf

| Anfrage | Erster Schritt | Zweiter Schritt |
| --- | --- | --- |
| Ohne Bild | Bisherige Text-Einbettung mit Umfrage | Entfällt |
| Mit Bild | Gestaltete Einbettung mit Originalbild und Details, ohne Umfrage | Eigene Umfrage mit Text, ohne Upload, Attachments oder Embeds |

Die Bildnachricht behält Titel, Streamer, Team, Streambeginn, optionale Notiz und großes Bild. Ihre Fußzeile erklärt, dass die Abstimmung als eigene Nachricht folgt. Die zweite Nachricht nennt denselben Stream und Absender. Sind Server-, Kanal- und Bildnachrichten-ID bekannt, enthält sie einen Nachrichtenlink zum Bild; sonst verweist sie auf die vorherige Modstempel-Bildnachricht zum Stream. Die drei Antworten, Antwortdauer und die Regel, dass eine Zusage keinen Dienst startet, bleiben erhalten.

Beide Nachrichten verwenden die vorhandene Native-Bridge und `wait=true`. Discord dokumentiert dafür die Serverbestätigung und den erstellten Nachrichtenkörper. Die App erwartet für die Bildbestätigung eine gültige Discord-Nachrichten-ID. Sie speichert diese Bestätigung atomar, bevor der zweite Versand beginnt. Es gibt keine behauptete gemeinsame atomare Zustellung beider Discord-Nachrichten.

Quelle: [Discord Execute Webhook](https://docs.discord.com/developers/resources/webhook#execute-webhook). Datei-Uploads verwenden weiterhin den dokumentierten Multipart-Vertrag mit `payload_json`, `files[0]` und passendem `attachment://`-Bildverweis: [Discord Uploading Files](https://docs.discord.com/developers/reference#uploading-files).

## Speicherung und Behandlung von Teilerfolgen

Ein Request enthält für neue Versuche `requestStage` mit `image` oder `poll`. Nach bestätigtem Bildversand werden `imageMessageId`, `imageChannelId`, `imageSentAt` und gegebenenfalls `imageGuildId` gemeinsam gespeichert und die Stage wird auf `poll` gesetzt. Erst eine bestätigte Umfrage setzt die bestehende Haupt-Nachrichten-ID, den Gesamtstatus `sent` und die Umfragedaten.

- Scheitert die Umfrage eindeutig, bleibt die Bildbestätigung erhalten. Ein bewusster Retry sendet nur den Poll und lädt das Bild nicht erneut hoch.
- Nach Neustart wird am gespeicherten Schritt fortgesetzt. Eine bereits bestätigte Bildnachricht wird dabei nicht noch einmal erstellt.
- Bei fehlender eindeutiger Bestätigung wird nicht automatisch wiederholt. Die unklare Zustellung hält folgende Einträge derselben Verbindung weiterhin zurück und ist über die vorhandene Blocker-Navigation erreichbar.
- Scheitert das Speichern der Bildbestätigung, beginnt kein Poll-Versand. Nach Neustart ist der zuletzt gespeicherte laufende Versuch unklar; die App erfindet keine erfolgreiche Bestätigung.
- Läuft die Versandfrist nach dem Bildversand ab, wird die Umfrage nicht mehr neu veröffentlicht. Das bereits bestätigte Bild bleibt in Discord und wird in der App als Teilerfolg angezeigt.
- Discord-Sendepausen mit HTTP 429 sowie eine ausgeschöpfte Sendekapazität nach einer erfolgreichen Bildnachricht werden vor dem Poll berücksichtigt.
- Originalbild und ursprüngliche Verbindungsreferenz bleiben an der Anfrage. Eine spätere Änderung der aktiven Verbindung verschiebt den offenen Poll nicht in einen anderen Kanal.
- JSON exportiert die gespeicherten Teilergebnisse. Bilddateien selbst bleiben weiterhin außerhalb des JSON-Exports.

Das Datenformat bleibt auf Version 1. Alte Einträge ohne Stage bleiben lesbar. Eine alte fehlgeschlagene oder noch wartende Bildanfrage übernimmt den neuen Ablauf, wenn tatsächlich ein neuer Versandversuch beginnt. Bereits bestätigte historische Anfragen werden nicht neu veröffentlicht oder nachträglich als zwei separate Nachrichten dargestellt.

## Oberfläche

Die Bildauswahl und die abschließende Bestätigung erklären den Versand als zwei zusammengehörige Discord-Nachrichten. Anfragekarte und Verlauf zeigen den Status von Bild/Details und Umfrage getrennt. Ein bereits bestätigtes Bild lässt sich auch dann in Discord öffnen, wenn der Poll noch nicht bestätigt ist.

Die Wiederholung nach erfolgreichem Bildversand heißt **Umfrage erneut senden**. Bei unklarer Poll-Zustellung erklärt die Bestätigung, dass nur die Umfrage erneut gesendet wird und eine doppelte Umfrage entstehen kann. Bei Ablauf oder lokaler Erledigung wird nicht mehr fälschlich behauptet, es sei gar nichts veröffentlicht worden. Ein bestätigtes Bild wird ausdrücklich weiter angezeigt.

Die bestehende Bildvorschau, ursprüngliche Bildkopie, Anordnung der übrigen Formularfelder, Stempelfunktionen und Warteschlangenkorrektur aus 1.2.2 bleiben erhalten.

## Native Absicherung

`MainActivity.sendWebhook()` ruft vor dem Lesen der Bilddatei und vor dem HTTP-Versand einen reinen `validateSendPayload`-Prüfer auf. Dieser lehnt einen Poll mit Bildreferenz, nichtleeren oder falsch geformten Attachments beziehungsweise einem `attachment://`-Embed-Bild ausdrücklich ab. Er entfernt nichts stillschweigend. Ein Text-Embed mit Poll bleibt erlaubt.

Der Fehlerparser erklärt `INVALID_POLL_ATTACHMENTS` auf Deutsch und behält den HTTP-Status, den numerischen Discord-Code und den konkreten Feldbeleg. Die vorhandene Maskierung, Begrenzung und Behandlung anderer Fehler bleiben bestehen.

Native Bildauswahl, Validierung, private Bildspeicherung, Multipart-Erzeugung, Timeouts, verschlüsselte Webhook-Ablage, Original-Logo und Android-Berechtigungen wurden dafür nicht geändert. APK-Version und User-Agent stehen auf 1.2.3, Versionscode 7.

## Abgeschlossene gezielte Prüfungen

### JavaScript: 66 von 66 Tests bestanden

Die bisherige Suite mit 57 Tests wurde an den neuen Bildversand angepasst. In `image-request.test.cjs`, `discord-error.test.cjs` und `queue-progress.test.cjs` wurden die betroffenen Erwartungen an die zwei getrennten Aufrufe geändert. Insbesondere prüft die Bildvorschau jetzt ausdrücklich eine Bildnachricht ohne Poll und einen folgenden Poll ohne Attachments; die frühere falsche Erwartung einer kombinierten Nachricht wurde entfernt. Anfragen ohne Bild bleiben ein einzelner Aufruf.

Neun zusätzliche Tests in `two-phase-request.test.cjs` prüfen den gespeicherten Zustand unmittelbar vor dem zweiten nativen Aufruf, die getrennten Payloads, die Gesamtbestätigung erst nach Poll-ACK, Neustart und Sendepause nach Bild-ACK, HTTP 429 beim Poll, ungültige Bildbestätigungen, unklare Zustellung beider Schritte, bewusste Wiederholung nur des Polls, Speicherfehler am Checkpoint, Fristablauf zwischen den Schritten, das Öffnen des Bildes über die ursprüngliche Verbindung und einen tatsächlichen Thread sowie alte fehlgeschlagene Anfragen ohne Stage. Ungültige gespeicherte Stages werden nicht ausgeführt; die Originaldaten bleiben erhalten.

Die kritischen neuen Fälle verwenden aktivierten automatischen Versand und echte Node-Timer. Alle 66 Tests bestanden ohne Fehler. Die Bildreferenz und der Originalinhalt bleiben auch nach der Anpassung Gegenstand der Assertions.

### Native Prüfung: 328 Assertions bestanden

Die native Implementierung wurde gegen Android API 35 kompiliert. Erfolgreich sind 174 bestehende Vertragsprüfungen, 102 Prüfungen des Fehlerparsers und 52 neue Prüfungen der tatsächlichen Sendeschnittstelle. Die neuen Tests rufen den Produktions-Guard mit echten `org.json`-Objekten per Reflection auf. Geprüft sind die reguläre Bildnachricht ohne Poll, die separate Umfrage, der weiterhin erlaubte Poll mit Text-Embed und die konkret abgelehnte Poll-/Attachment-Kombination. Die Eingabe wird nicht verändert.

### Gerenderte Bedienung: sechs Prüfgruppen bestanden

Die tatsächliche Oberfläche und JavaScript-Bridge wurden mit dem tatsächlichen Core und simulierten nativen Antworten in lokalem Chromium ausgeführt. Der letzte Lauf endete mit Exitcode 0.

1. Die Bestätigung nennt zwei Nachrichten; der erste native Aufruf enthält Bild und Details ohne Poll. Die Bildbestätigung ist vor dem zweiten Aufruf dauerhaft gespeichert.
2. Ein Pollfehler zeigt das bestätigte Bild und den fehlgeschlagenen Poll getrennt. Das Bild öffnet mit seiner ursprünglichen ID und seinem Kanal; ein Retry sendet nur den Poll. Nach Erfolg ist die endgültige Poll-ID das Ziel der Umfrage-Schaltfläche.
3. Ein Neustart aus gespeichertem Teilerfolg stellt die Bildbestätigung wieder her. Der bewusste Retry erzeugt nur einen Poll-Aufruf.
4. Unklare Pollzustellung hat eine passende Bestätigung. Abbrechen sendet nichts; bestätigte lokale Erledigung behält die Bildbestätigung und beschreibt ausschließlich den Poll als lokal erledigt.
5. Eine unklare Bildzustellung wird nicht als bestätigt angezeigt und startet keinen Poll. Vor einem bewussten Retry wird auf das mögliche doppelte Bild hingewiesen.
6. Eine Anfrage ohne Bild bleibt eine Nachricht. Historische gesendete Bildanfragen ohne Stage behalten ihre bisherige Anzeige und werden nicht wiederholt.

Bei 320 und 390 Pixel Breite gab es keinen horizontalen Überlauf. Die Bestätigung und beide Teilerfolg-Screenshots wurden visuell kontrolliert; Texte und Aktionen sind erreichbar. JavaScript-, Konsolen-, CSP-Fehler und externe Anfragen wurden nicht beobachtet. Alle Sendebestätigungen in den Screenshots sind ausdrücklich simulierte lokale Prüfdaten.

## Grenzen

Es wurden keine echten Discord-Nachrichten gesendet. Die Sendetests verwenden ausschließlich simulierte native Antworten; die konkret gemeldete Serverablehnung stammt vom Nutzer. Die APK wurde nicht auf einem physischen Android-Gerät installiert. Tatsächliche Android-Systemauswahl, Gerätedecoding, Keystore, Android-WebView und Live-Zustellung werden dadurch nicht als geprüft ausgegeben.

Die Korrektur beseitigt die konkret identifizierte ungültige Kombination und prüft die erforderlichen Teilergebnisse. Andere kanal- oder dateispezifische Discord-Ablehnungen können ohne einen tatsächlichen Versuch auf dem Handy nicht ausgeschlossen werden. Eine echte Bestätigung in der installierten App ist weiterhin an eine von Discord zurückgegebene Nachrichten-ID gebunden.

Die historischen Berichte bis einschließlich `PRUEFUNG-1.2.2.md` bleiben erhalten. Ihre früheren Annahmen zur Kombinierbarkeit von Poll und Bild sind durch diesen aktuellen Befund korrigiert.

## Fertiges Paket

- Datei: `Modstempel-1.2.3.apk`
- Paket: `app.modstempel.mobile`
- Version: `1.2.3`, Versionscode `7`
- Android: minSdk `26`, targetSdk `35`
- Größe: `2.524.325` Bytes
- APK-SHA-256: `93484db8bace9ba54e4ad7e3f8e3aa0162d5857d2fe365ad4e8430825ae8ae58`
- Signierzertifikat SHA-256: `c6ba05258739e61cd809479071abd85bd52e6a8a5f667fc1d2642b752bb35da3`
- Signatur v2 und v3 gültig; derselbe Updateschlüssel wie zuvor
- APK-Ausrichtung mit 16-KiB-Seiten und 4-Byte-Ausrichtung bestanden
- Alle sechs Webdateien im APK bytegleich mit dem freigegebenen Quellcode
- Original-Logo unverändert: `69c328f3c5ccca308fc29e77837445f7b797d72d6eae4a514dcca351e1c25953`
- Vorherige 1.2.2-APK unverändert: `43a8725012a8bf3e3686e50c927a16939856d0fbb7236046f16c99e0e8d015c5`
- Neuer nativer Schutzprüfer im DEX vorhanden; Test-JAR und Testklassen nicht enthalten
- Keine zusätzlichen Android-Berechtigungen

Die APK über die vorhandene Version installieren, ohne vorher zu deinstallieren. Eine noch gültige fehlgeschlagene Anfrage kann danach bewusst erneut gesendet werden. Bei abgelaufenem Termin ist eine neue Anfrage mit zukünftigem oder offenem Beginn erforderlich. Bereits bestätigte Bildnachrichten werden bei einem Poll-Retry nicht neu hochgeladen.

Die vollständigen Metadaten stehen in `PRUEFUNG-PAKET.json`. Build- und Prüfkommandos stehen in der README.
