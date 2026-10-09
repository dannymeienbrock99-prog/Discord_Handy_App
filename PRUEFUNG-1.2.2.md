# Modstempel 1.2.2 – Versandwarteschlange und Prüfstand

Datum: 9. Oktober 2026.

## Gemeldetes Verhalten und reproduzierter Fehler

Nach dem Diagnose-Update 1.2.1 meldete der Nutzer: „Jetzt steht da zwar kein Fehler mehr aber wird auch nichts mehr an discord geschickt“. Der aktuelle gespeicherte Zustand des Handys und eine neue Discord-Fehlerantwort lagen nicht vor.

Im ausgelieferten Core wurde ein Fehler gefunden, der dieses Verhalten reproduzierbar auslöst: Die Funktionen zur Auswahl und Zeitplanung des nächsten Versands behandelten einen alten Eintrag mit Status `failed` weiterhin als aktiven Kopf seiner Verbindung. Sie übersprangen lediglich `sent` und `skipped`. Dadurch konnte für spätere `pending`-Einträge derselben Verbindung kein Versandversuch beginnen. Eine bereits abgelaufene fehlgeschlagene Anfrage blieb ebenfalls davor stehen, weil der bestehende Ablauf nur noch wartende Anfragen automatisch ablaufen lässt. Die neue Anfrage hatte keinen eigenen Fehlertext und blieb bei null Versuchen.

Ein unabhängiger Versuch verwendete tatsächlich aktives `autoSync`, gespeicherte Zustände und echte Node-Timer. Mit einem alten fehlgeschlagenen Request beziehungsweise Stempel blieb eine neue Anfrage vor der Änderung auf `pending`, ohne einen Aufruf der simulierten Native-Bridge. Nach der Änderung startete in beiden Fällen automatisch genau ein simulierter Versand; die neue Anfrage wurde erst durch die simulierte Nachrichten-ID als bestätigt angezeigt.

| Vorheriger Eintrag derselben Verbindung | Version 1.2.1 | Version 1.2.2 |
| --- | --- | --- |
| Fehlgeschlagene, abgelaufene Anfrage | Neue Anfrage bleibt ohne Versuch stehen | Neue gültige Anfrage erhält automatisch einen Versuch |
| Fehlgeschlagener Stempel | Neue Anfrage bleibt ohne Versuch stehen | Neue gültige Anfrage erhält automatisch einen Versuch |
| Unklare Zustellung | Neue Anfrage wartet ohne gezielten Hinweis | Neue Anfrage wartet mit Grund und Sprung zum blockierenden Eintrag |
| Bereits lokal erledigter Eintrag | Neue Anfrage wird verarbeitet | Weiterhin unverändert verarbeitet |

Der Codefehler ist damit belegt und behoben. Ohne den aktuellen Handyzustand ist nicht bewiesen, dass keine weitere Ursache vorliegt. Die Ursache der zuvor tatsächlich von Discord erhaltenen HTTP-400-Ablehnung bleibt weiterhin unbekannt; die in 1.2.1 ergänzte detaillierte Fehleranzeige bleibt enthalten.

## Änderungen am Versand

Einträge mit `sent`, `skipped` oder `failed` sind für die aktive Warteschlange abgeschlossen. Nach einer eindeutigen Ablehnung werden spätere bereits bestätigte Meldungen weiterverarbeitet. Der alte fehlgeschlagene Eintrag behält seinen Status, Fehlertext, ursprünglichen Inhalt, Zeitpunkt, Bild und Verbindungsreferenz. Er wird weder gelöscht noch automatisch wiederholt oder als erfolgreich ausgegeben.

Die bestehenden Verbindungssperren für einen gelöschten oder nicht zugänglichen Webhook bleiben wirksam. Eine erfolgreiche Verbindungsprüfung kann die betreffende Sperre aufheben. Meldungen einer anderen eingerichteten Verbindung werden unabhängig davon verarbeitet. HTTP-429-Sendepausen und die Reihenfolge der noch aktiven Meldungen bleiben erhalten.

Unklare Zustellung bleibt ein aktiver Blocker, weil die frühere Nachricht bereits angekommen sein könnte. Der für die Oberfläche berechnete Snapshot enthält für folgende wartende Meldungen jetzt `waitingFor` mit Ereignis-ID, Status, Typ und verständlichem Grund. Anfragen erhalten außerdem `retryExpired`, wenn ihre Versandfrist abgelaufen und eine Wiederholung nicht mehr erlaubt ist. Beide Angaben werden nur aus dem vorhandenen Zustand berechnet; sie werden nicht in den gespeicherten Verlauf oder JSON-Export geschrieben. Das Datenformat bleibt auf Version 1.

## Änderungen an der Oberfläche

Eine Anfrage hinter unklarer Zustellung zeigt **Wartet auf Klärung**. **Blockierende Meldung ansehen** führt bei einem Request zur passenden Karte und bei einem Stempel zu dessen Dienst und genau dem betroffenen Ereignis. Die Navigation selbst sendet nichts und erledigt keinen Eintrag.

Am blockierenden Eintrag öffnen die vorhandenen Aktionen weiterhin ihre bisherigen Bestätigungen. Eine unklare Meldung kann nach Prüfung in Discord bewusst erneut versendet oder lokal erledigt werden. Der Übergang von einem Dienst-Detailfenster zur Bestätigung funktioniert ebenfalls. Die laufende Dienstzeit wird dabei nicht verändert.

Nach Ablauf einer Anfrage bleibt **Erneut senden** auch über die regelmäßigen Aktualisierungen der Oberfläche deaktiviert. Ein Hinweis nennt das abgelaufene Versandfenster; **Lokal erledigen** bleibt nach Prüfung in Discord möglich. Karten und Verlauf berücksichtigen Änderungen des Blockers und der Frist, sodass keine veralteten Hinweise stehen bleiben.

Die Version ist 1.2.2, Versionscode 6. Native HTTP-Verarbeitung, Bildauswahl, Bilddaten, Multipart-Erzeugung, Fehlerparser, Bridge und Android-Berechtigungen entsprechen 1.2.1; lediglich die Versionsangabe im nativen User-Agent wurde angepasst. Original-Logo, App-Paket und Signierschlüssel werden für das Update beibehalten.

## Automatisierte Prüfungen

### JavaScript: 57 Tests bestanden

Die bisherigen 50 Tests wurden unverändert ausgeführt. Sie enthalten Stempelzeiten, Umfragen, Bildzuordnung, Speicherung, Neustart, Export, die vollständigen bereinigten Discord-Fehler und die Terminfrist.

Sieben neue Tests in `tests/queue-progress.test.cjs` verwenden aktivierten automatischen Versand und echte Timer. Sie decken die folgenden Fälle ab:

1. Eine gespeicherte, abgelaufene fehlgeschlagene Anfrage blockiert eine neue Bildanfrage nicht. Alte Daten und Fehler bleiben erhalten.
2. Ein fehlgeschlagener Stempel blockiert eine neue Anfrage nicht. Dienst und Stempelverlauf bleiben erhalten.
3. Eine definitive HTTP-400-Ablehnung während des automatischen Versands gibt die folgende Anfrage frei. Der abgelehnte Eintrag wird nicht automatisch erneut versendet.
4. Eine unklare Anfrage blockiert weiterhin, auch nach Neustart. Der berechnete Hinweis nennt genau diesen Eintrag. Erst ausdrückliches lokales Erledigen gibt die folgende Anfrage frei.
5. Eine bewusste Wiederholung vor Ablauf verwendet das ursprüngliche Bild, den ursprünglichen Inhalt und die ursprüngliche Verbindung. Danach folgt die wartende Anfrage in der richtigen Reihenfolge.
6. Eine gespeicherte HTTP-403-Sperre bleibt wirksam; eine andere Verbindung kann trotzdem senden.
7. Eine HTTP-429-Sendepause hält folgende Stempel bis zum festgelegten Zeitpunkt zurück. Danach werden Anfrage und Stempel mit unveränderten Daten verarbeitet.

Zusätzliche Assertions prüfen die Fristberechnung sowie den Ausschluss der berechneten UI-Hinweise aus der Speicherung. Alle 57 Tests sind erfolgreich.

### Native Verträge

Der finale Build und die vorhandenen nativen Tests prüfen die Kompilierung gegen Android API 35, 174 Assertions zu Verbindungen, Bildern und Multipart-Daten sowie 97 Assertions zur Fehleraufbereitung. Die Tests arbeiten lokal. Die testweise verwendete offizielle `org.json`-JAR gehört weder zur APK noch zum ausgelieferten Quellcodearchiv; der Testrunner prüft ihre feste SHA-256-Prüfsumme.

### Gerenderte Bedienung: fünf Prüfgruppen bestanden

Die tatsächliche Oberfläche, der Core und die JavaScript-Bridge wurden in lokalem Chromium mit simulierten nativen Antworten und echten Timern ausgeführt. Geprüft wurden gespeicherte fehlgeschlagene Anfragen und Stempel, unklare Anfragen, abgelaufene unklare Anfragen und unklare Stempel.

Eine neue Bildanfrage startet nach einem alten Fehler automatisch genau einen simulierten Versuch. Der Sprung zum Blocker trifft die richtige Anfrage beziehungsweise den richtigen Stempel. Navigation und ein abgebrochener Retry verändern den Zustand nicht und lösen keinen Versand aus. Erst bestätigtes lokales Erledigen gibt die wartende Anfrage frei. Alte Bildzuordnungen und ein laufender Dienst bleiben erhalten. Karten und Verlauf entfernen erledigte Blockerhinweise.

Bei einer abgelaufenen Anfrage bleibt die Wiederholung auch nach echten Ticker-Aktualisierungen in Karte und Verlauf deaktiviert. Der Grund ist lesbar und die bestätigte lokale Erledigung bleibt erreichbar. Die Oberfläche wurde bei 320 und 390 Pixel Breite geprüft; drei Screenshots wurden visuell kontrolliert. Es gab keinen horizontalen Überlauf, keine JavaScript-, Konsolen- oder CSP-Fehler und keine externen Anfragen. Der abschließende Prüflauf beendet sich erfolgreich mit Exitcode 0.

Die Testbilder und Beispieltexte in den Screenshots sind lokale Prüfdaten. Sie sind keine Live-Bestätigung durch Discord.

## Installation und nächster Schritt auf dem Handy

1. `Modstempel-1.2.2.apk` als Update über die vorhandene App installieren. Vorher nicht deinstallieren, damit Einstellungen, Verlauf und private Bildkopien erhalten bleiben.
2. Die App öffnen und unter **Streamer → Deine Abfragen** den Status prüfen. Bereits bestätigte, noch gültige wartende Anfragen können jetzt automatisch weitergesendet werden; dafür keine zusätzliche Kopie anlegen.
3. Bei **Wartet auf Klärung** über **Blockierende Meldung ansehen** zum alten Eintrag gehen. Den Discord-Kanal prüfen und bewusst erneut senden oder lokal erledigen.
4. Ist eine frühere Anfrage abgelaufen und wartet keine gültige Anfrage mehr, bei Bedarf eine neue Anfrage mit zukünftigem oder offenem Beginn erstellen. Ein alter endgültiger Fehler muss nicht erst lokal erledigt werden, damit spätere gültige Anfragen senden können.
5. Bei erneuter Ablehnung den neuen vollständigen Fehlertext beachten. Erst **In Discord bestätigt** bedeutet, dass die App eine Nachrichten-ID als Bestätigung erhalten hat.

## Grenzen des Prüfstands

Es wurde keine echte Discord-Nachricht gesendet und kein echter Webhook für einen Tool-Aufruf verwendet. Alle Versandantworten in den Tests sind simuliert. Die APK wurde nicht auf einem physischen Android-Gerät installiert. Android-WebView, System-Bildauswahl, Gerätedecoding, Keystore und tatsächliche Discord-Zustellung sind daher nicht als live geprüft zu betrachten.

Die vorherigen Prüfstände bleiben in `PRUEFUNG-1.1.0.md`, `PRUEFUNG-1.1.1.md`, `PRUEFUNG-1.2.0.md` und `PRUEFUNG-1.2.1.md` erhalten. Die zwei unabhängigen Multipart-Parser und die damaligen Diagnose-UI-Tests gehören zum Bericht 1.2.1 und werden nicht als in diesem Update erneut ausgeführt gezählt.

## Fertiges Paket

- Datei: `Modstempel-1.2.2.apk`
- Android-Paket: `app.modstempel.mobile`
- Version: `1.2.2`, Versionscode `6`
- Android: minSdk `26`, targetSdk `35`
- Größe: `2.520.229` Bytes
- APK-SHA-256: `43a8725012a8bf3e3686e50c927a16939856d0fbb7236046f16c99e0e8d015c5`
- Signierzertifikat SHA-256: `c6ba05258739e61cd809479071abd85bd52e6a8a5f667fc1d2642b752bb35da3`
- Signatur v2 und v3 gültig; derselbe Signierer wie zuvor
- APK-Ausrichtung: 16-KiB-Seiten und 4-Byte-Ausrichtung bestanden
- Alle sechs Webdateien im APK bytegleich mit dem freigegebenen Quellcode
- Original-Logo SHA-256 unverändert: `69c328f3c5ccca308fc29e77837445f7b797d72d6eae4a514dcca351e1c25953`
- Vorherige 1.2.1-APK unverändert: `ede0f8188b4c675f798c40fc718cb7234b69edc971cdbcdb137c87363876fbcb`
- Keine zusätzlichen Berechtigungen und keine Test-JAR im APK
- Finale native Kompilierung und alle 174 + 97 nativen Assertions bestanden

Die vollständigen Paketmetadaten stehen in `PRUEFUNG-PAKET.json`. Reproduzierbare Build- und Prüfkommandos stehen in der README.
