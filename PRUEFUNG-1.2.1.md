# Modstempel 1.2.1 – Diagnose und Prüfstand

Datum: 9. Oktober 2026.

## Gemeldeter Fehler und gesicherter Befund

Der Nutzer meldete eine auf dem Handy abgelehnte Streamer-Anfrage mit einem PNG-Bild, 1.254 × 1.254 Pixeln und angezeigten 2,2 MB. Die App zeigte „Discord hat den Inhalt der Meldung abgelehnt. Bitte Angaben und gegebenenfalls das Bild prüfen.“ Dieser exakte Text stammt ausschließlich aus dem HTTP-400-Zweig der ausgelieferten Version 1.2.0.

Der bisherige Code las die Discord-Fehlerantwort, verwarf beim Erstellen der Meldung aber ihren JSON-Fehlercode und die konkreten Feldfehler. Damit lässt sich aus dem alten gespeicherten Text nicht feststellen, ob Discord einen Inhalt, ein Feld, eine Datei oder eine kanalspezifische Einschränkung beanstandet hat. Die Größe allein belegt keine Ursache. Auch die in der Notiz erwähnte frühere TikTok-Ablehnung belegt keinen Zusammenhang mit Discord.

Der tatsächliche Java-Multipart-Erzeuger wurde lokal mit den gemeldeten Textangaben und dem bereits vorliegenden Moderationsschild als Testbild aufgerufen. Die konkret auf dem Handy abgelehnte Bilddatei lag nicht vor. Zwei voneinander unabhängige Parser, Python `email.BytesParser` und `cgi.FieldStorage`, lesen exakt zwei Teile: `payload_json` und `files[0]`. UTF-8-JSON, alle 2.438.537 Bytes der PNG, Dateiname, Attachment-ID und `attachment://`-Verweis bleiben bytegleich beziehungsweise konsistent. Das Test-PNG lässt sich vollständig prüfen; die gesamte erzeugte Multipart-Nutzlast umfasst 2.439.853 Bytes. Es fand kein Netzwerkversand statt.

Die offiziellen Discord-Unterlagen erlauben Umfragen, Einbettungen und Bildanhänge in derselben Webhook-Anfrage. Der geprüfte Aufbau weicht nicht erkennbar von diesem Vertrag ab. **Die genaue Ursache des tatsächlich gemeldeten Discord-Fehlers bleibt unbekannt. Version 1.2.1 behebt die Diagnose-Lücke; sie wird nicht als bestätigte Behebung einer bereits identifizierten Upload-Ursache ausgegeben.**

## Änderungen

Die neue Klasse `DiscordError` bereitet explizite HTTP-Ablehnungen auf. Die bestehende Native-Bridge liefert den bereinigten Text weiterhin im vertrauten `message`-Feld. Der HTTP-Status und ein gültiger numerischer Discord-Code bleiben erhalten. Bekannte Fälle erhalten eine deutsche Erklärung; unbekannte Fälle und ungültige Formularfelder können zusätzlich einen kurzen bereinigten Ausschnitt der Servermeldung enthalten.

Verschachtelte `errors` werden nach maximal fünf Feldpfaden und begrenzten Fehlercodes ausgewertet. Tiefe, Anzahl verarbeiteter Knoten, Pfadlänge und Endtext sind begrenzt. Der native Endtext hat höchstens 840 Zeichen. URLs, Webhookpfade, Zugangsdaten, Tokenmuster, HTML und Steuerzeichen werden aus dem frei formulierten Ausschnitt entfernt oder maskiert. Vollständige Serverantworten und Antwortheader werden nicht gespeichert.

Die UI zeigt bis zu 1.200 Zeichen statt bisher 500 und bricht lange Pfade auf schmalen Displays um. Alle Texte werden weiterhin als Textknoten eingesetzt. Die Versionsanzeige und der Android-Build stehen auf 1.2.1, Versionscode 5. Das vorhandene Bildformat, die Multipart-Daten, Umfrageantworten, dauerhafte Bildzuordnung, ursprüngliche Verbindung und die Behandlung unklarer Zustellung werden nicht verändert.

## Gezielte Prüfungen

### JavaScript und zeitliche Regeln

Die gesamte Suite umfasst 50 erfolgreiche Tests. Drei neue Regressionen prüfen die gemeldete Fehlerklasse am echten Core. Eine 810 Zeichen lange Diagnose einschließlich eines Feldpfads am Ende bleibt im Snapshot, gespeichertem Zustand, nach Neustart und im JSON-Export erhalten. Eine fehlgeschlagene Anfrage wird nicht automatisch wiederholt. Ein bewusster Retry vor Ablauf verwendet dasselbe Bild, denselben Payload und dieselbe ursprüngliche Verbindung, auch nach einer Profiländerung.

Der in der Meldung genannte Start um 14:25 Uhr wurde als konkreter Grenzfall geprüft: Ab exakt 14:25 lehnt die App einen Retry ab. Auch ein kurz vorher eingereihter Versuch wird nicht mehr versendet, wenn seine Verarbeitung erst um 14:25 beginnt. Ein Retry erzeugt keine neue Abfrage und startet keinen Dienst.

### Native Prüfung

Die erneute Kompilierung gegen Android API 35 war erfolgreich. Alle 174 bisherigen nativen Vertragsprüfungen und 97 neue Assertions zur Fehleraufbereitung sind bestanden. Die neuen Tests verwenden die echte offizielle Implementierung `org.json:json:20240303`; Androids Plattform-JAR enthält für reine JVM-Läufe nur Methodenstubs. Geprüft sind bekannte Fehlercodes, unbekannte und ungültige Codes, verschachtelte Felder, leere sowie HTML-Antworten, Maskierung von URLs und Tokenmustern, Verarbeitungslimits und die maximale Nachrichtenlänge.

Der Testrunner lädt die JAR bei Bedarf vom offiziellen Maven-Repository und prüft ihre fest hinterlegte SHA-256-Prüfsumme. Die Herkunft steht in `android/toolchain-provenance.json`. Die Test-JAR und ihre Klassen sind nicht in der APK enthalten. Der tatsächlich aufgerufene HTTP-400-/4xx-Zweig verwendet die neue Fehleraufbereitung. Discord-Sendepausen, 5xx-Antworten und unklare Zustellung folgen weiterhin ihrer bisherigen getrennten Behandlung.

### Gerenderte Oberfläche

Vier gezielte Prüfgruppen mit Playwright und lokalem Chromium sind bestanden. Ein Browser-Plugin mit entsprechendem Skill war nicht verfügbar. Sämtliche Ressourcen und simulierten nativen Antworten stammen aus dem lokalen Test; es gab keine externen Anfragen, keine JavaScript-, Konsolen- oder CSP-Fehler.

Bei 320 und 390 Pixel Breite bleibt eine 850 Zeichen lange simulierte Diagnose mit Fehlercode und abschließendem Emoji-Feldpfad vollständig lesbar. Es gibt keinen horizontalen Überlauf; „Erneut senden“ und „Lokal erledigen“ sind erreichbar. Ein Klick auf „Erneut senden“ erzeugt genau einen zusätzlichen simulierten Versuch. Ein zusätzlich eingesetzter Test-Webhook mit langem Dummy-Token wird vollständig maskiert. Auch der Verlauf zeigt den bereinigten Text vollständig. Beide Screenshots wurden visuell geprüft.

Die Screenshots enthalten ausdrücklich synthetische Diagnosedaten. Sie belegen die Darstellung und keine tatsächlich von Discord erhaltene Fehlerursache.

## Nächster Versuch auf dem Handy

Die neue APK als Update über die bisherige App installieren, ohne sie vorher zu deinstallieren. Ein vor dem Update gespeicherter allgemeiner Fehlertext kann nicht nachträglich ergänzt werden. Für die genaue Diagnose ist ein neuer ausdrücklich bestätigter Versand erforderlich.

Der gemeldete Testtermin um 14:25 Uhr ist inzwischen abgelaufen. Die fehlgeschlagene alte Anfrage kann unter „Deine Abfragen“ mit „Lokal erledigen“ abgeschlossen werden. Danach eine neue Anfrage mit demselben Bild und offenem beziehungsweise zukünftigem Beginn erstellen. Sollte Discord sie erneut ablehnen, zeigt diese Version erstmals den konkreten Code und die von Discord bereitgestellten Fehlerfelder an.

## Grenzen

Es wurde keine echte Discord-Nachricht gesendet. Die konkret abgelehnte Datei und die ursprünglich verworfene Discord-JSON-Antwort standen nicht zur Verfügung. Die neue APK wurde nicht auf einem physischen Android-Gerät installiert. Android-Dateiauswahl, tatsächliches Gerätedecoding, Keystore und reale Discord-Zustellung sind dadurch nicht als live geprüft zu betrachten.

Die früheren Prüfberichte sind unter `PRUEFUNG-1.1.0.md`, `PRUEFUNG-1.1.1.md` und `PRUEFUNG-1.2.0.md` erhalten. Frühere Bildauswahl-Prüfungen werden nicht als in diesem Diagnose-Update erneut ausgeführte Prüfungen gezählt.

## Fertiges Paket

- Datei: `Modstempel-1.2.1.apk`
- Android-Paket: `app.modstempel.mobile`
- Version: `1.2.1`, Versionscode `5`
- Android: minSdk `26`, targetSdk `35`
- Größe: `2.520.229` Bytes
- APK-SHA-256: `ede0f8188b4c675f798c40fc718cb7234b69edc971cdbcdb137c87363876fbcb`
- Signierzertifikat SHA-256: `c6ba05258739e61cd809479071abd85bd52e6a8a5f667fc1d2642b752bb35da3`
- Signatur v2 und v3 gültig; derselbe Signierer wie zuvor
- APK-Ausrichtung: 16-KiB-Seiten und 4-Byte-Ausrichtung bestanden
- Alle sechs Webdateien im APK bytegleich mit dem freigegebenen Quellcode
- Original-Logo SHA-256 unverändert: `69c328f3c5ccca308fc29e77837445f7b797d72d6eae4a514dcca351e1c25953`
- Vorherige 1.2.0-APK unverändert: `5a10d8e225937fc71d7c14b00fb3d5fcbcbaf6a3a679660fbfac5d587cbb8ea8`
- Keine zusätzlichen Berechtigungen und keine Test-JAR im APK

Die vollständigen Metadaten stehen in `PRUEFUNG-PAKET.json`. Reproduzierbare Build- und Prüfkommandos stehen in der README.

## Offizielle Grundlagen

- [Discord: Struktur der Fehlerantworten](https://docs.discord.com/developers/reference#error-messages)
- [Discord: HTTP-Status und JSON-Fehlercodes](https://docs.discord.com/developers/topics/opcodes-and-status-codes)
- [Discord: Dateiupload und Bildverweise in Einbettungen](https://docs.discord.com/developers/reference#uploading-files)
- [Discord: Execute Webhook](https://docs.discord.com/developers/resources/webhook#execute-webhook)
