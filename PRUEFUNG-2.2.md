# Crazy_Batto Discord App 2.2.0 – Prüfstand

Stand: 9. Oktober 2026. Dieser Bericht beschreibt die hier tatsächlich durchgeführten lokalen Prüfungen. Das Paket ist noch nicht auf dem VPS eingerichtet oder mit einem echten Discord-Konto durchlaufen worden.

## Ergebnis und Auftragsgrenzen

Die sichtbare Anwendung heißt **Crazy_Batto Discord App**. Android-Paketkennung, ursprünglicher Update-Signierschlüssel und bestehende Datenformate bleiben erhalten. **Modstempel** bleibt die Bezeichnung der Stempelfunktion und der zugehörigen Beitragskategorie.

Die öffentliche Website und der Windows-Editor sind umgesetzt. Bilder lassen sich hochladen, Bereichen zuordnen, als Entwurf speichern und anschließend veröffentlichen. Persönliche Texte, Setup-Komponenten und eigene Projektbeschreibungen sind entsprechend der Nutzeranweisung zunächst leer. Die Anfangsinhalte enthalten keine erfundene Biografie oder fremde persönliche Bilder. Das bereits bereitgestellte Drachenmotiv wird unverändert verwendet.

## Ausgeführte Prüfungen

| Bereich | Tatsächlich ausgeführte Prüfung | Ergebnis |
| --- | --- | --- |
| JavaScript-App | Bestehende Logik-, Bild-, Protokoll-, Auftrags- und Freigabeprüfungen | 106 Tests bestanden |
| Server | Authentifizierung, Rechte, Registrierung/Freigabe, Versandzustände, Datenhaltung und neue Website-/Bildrouten | 71 Tests bestanden |
| Native Android-Protokolle | Bild-/Linkvertrag, Discord-Fehler, Sendezustände, Authentifizierung, HTTP-Transport und Freigabe | 563 Assertions bestanden |
| Android-/Portalansichten | Freigabeflüsse und umbenannte Oberfläche mit Ersatzschnittstellen | 13 Browsergruppen bestanden |
| Website im tatsächlichen HTTP-Service | Hochladen, privater Entwurf, Veröffentlichen, echte Browserdekodierung und Entfernen | 16 Integrationsgruppen bestanden |
| Windows-Verwaltung | Produktionsnahe Core-/HTTP-/Website-/Bilddekoderprüfungen | 168 Assertions bestanden, davon 75 für Website und Bilder |
| Android-Paket | Kompilierung, Manifest, Signatur, Ausrichtung, Assetvergleich und Inhaltsprüfung | Bestanden |

Die Protokolle liegen unter `qa/`, der Windows-Nachweis unter `desktop/qa/`. Verwendete Node-Version: **v24.19.0**. Die Tests verwenden lokale Ersatzidentitäten; sie sind kein Nachweis für eine bereits eingerichtete Discord-Anwendung.

### Website und selbst hochgeladene Bilder

Der Integrationstest verwendet einen echten lokalen HTTP-Server, dieselben Serverrouten wie die Anwendung und eine isolierte temporäre Datenbank. PNG, JPEG und WebP wurden über die Betreiber-Routen hochgeladen und anschließend über die öffentliche Website betrachtet.

- Ein gespeicherter Bildentwurf verändert die öffentliche Website nicht. Die zugehörigen öffentlichen Bildadressen liefern vor der Veröffentlichung 404.
- Eine Veröffentlichung nur mit Bildern funktioniert bereits ohne persönliche Beschreibungstexte. Passende Abschnitte erscheinen; weiterhin leere Abschnitte bleiben verborgen.
- Der Browser dekodiert alle drei Formate erfolgreich. Die natürlichen Bildabmessungen stimmen, und die ausgelieferten Dateien sind bytegleich mit den Uploads.
- Später ergänzte Texte und Zuordnungen bleiben bis zur Veröffentlichung privat.
- Nach dem Entfernen aus der veröffentlichten Fassung verschwinden leere Abschnitte wieder. Nicht mehr öffentlich verwendete Uploads können über ihre öffentliche Bildadresse nicht mehr abgerufen werden.
- Besitzerrechte werden vor dem Zugriff und nochmals bei der endgültigen Änderung geprüft. Abgelaufene Sitzungen, Betreiberwechsel, gleichzeitige Änderungen und Abmeldung während eines Uploads sind abgedeckt.
- Größen-, Pixel-, Mengen- und Speichergrenzen sowie Löschschutz für verwendete Bilder sind geprüft. Gespeicherte Originaldateien werden nicht neu komprimiert.

Nach der einmaligen synthetischen Betreiberanmeldung hätte jeder weitere Discord-Aufruf den Website-Integrationstest abgebrochen. Tatsächlich gab es **keine solchen Aufrufe, keine externen Browseranfragen und keine Browserfehler**. Die Testdatenbank wurde anschließend entfernt; ihre Beispielinhalte werden nicht ausgeliefert.

Die Serverprüfung der Bilddateien validiert Format, Containerstruktur und Abmessungen. Sie ist kein vollständiger Bilddekoder. Für die gültigen Testdateien wurde die tatsächliche Dekodierung im Browser und im gemeinsamen Bilddekoder der Windows-Verwaltung gesondert geprüft.

### Sichtprüfung

Der endgültige Website-Entwurf und die tatsächlichen Browseraufnahmen wurden gemeinsam angesehen. Geprüft wurden der vollständige neue Name, die erlaubten sichtbaren Texte, die Zweizeilen-Typografie, die schwarze/silberne/rote Farbgebung, das ursprüngliche Drachenmotiv, Abstände und Bedienflächen. Ein zunächst zu enger Bildbeschnitt wurde korrigiert.

Die öffentliche Website wurde bei **320, 390, 620, 860, 1024 und 1536 Pixeln** Breite geprüft. Befüllte Inhaltsansichten wurden zusätzlich mit langen freien Texten geprüft. Für die Android-Webansicht wurden **320, 390 und 560 Pixel**, für das Portal **320, 390, 720, 1024 und 1536 Pixel** geprüft. Dabei trat kein horizontaler Überlauf auf.

Browser/IAB hat keine Verbindung zu diesem Entwicklungscontainer. Deshalb wurden diese lokalen Ansichten mit Playwright Chromium geprüft. Die Browseraufnahmen sind tatsächliche Oberflächen; die Appansicht enthält ausdrücklich ein Testkonto. Befüllte Setup-/Appbilder unter `qa/site-screens/` sind ausschließlich beschriftete Layouttests und keine bereits veröffentlichten Nutzerinhalte. Der Designvergleich steht in `qa/site-design.md`.

## APK und Updatefähigkeit

| Merkmal | Ergebnis |
| --- | --- |
| Datei | `Crazy_Batto-Discord-App-2.2.0.apk` |
| Android-Paket | `app.modstempel.mobile` |
| Sichtbarer Name | `Crazy_Batto Discord App` |
| Version | 2.2.0, Versionscode 10 |
| Mindestversion / Ziel-SDK | Android API 26 / API 35 |
| Signatur | APK v2 und v3 erfolgreich verifiziert; ein Signierer |
| Updatevergleich | Identischer Zertifikatsfingerabdruck wie bei der vorherigen APK 2.1.0 |
| Ausrichtung | `zipalign -c -P 16 4` erfolgreich |
| Webassets | Alle acht Dateien stimmen bytegenau mit dem gebauten Quellstand überein |
| Bilder | Ursprüngliches Hintergrundbild und Launcherlogo unverändert |
| Geschützter Serverdownload | Enthält exakt dieselbe neue signierte APK; keine APK im öffentlichen Assetordner |

Der Zertifikatsfingerabdruck lautet:

`c6ba05258739e61cd809479071abd85bd52e6a8a5f667fc1d2642b752bb35da3`

Die genaue APK-Prüfsumme, Größen, einzelnen Assetprüfsummen und Windows-Paketdaten stehen in `PRUEFUNG-PAKET.json`. Private Signierschlüssel, Passwörter, echte Serverkonfiguration und Laufzeitdaten sind nicht Teil des Quellcodepakets. Die APK enthält keine Testdateien, privaten Schlüsselblöcke oder eingebetteten Discord-Webhook-URLs.

## Windows-Paket

Die Verwaltungsanwendung wurde für **.NET Framework 4.8** ohne Compilerwarnungen gebaut. Ihr neuer Bereich **Webseite** enthält die Bildverwaltung, Zuordnung und Inhaltsfelder. Das ZIP enthält 30 Dateien einschließlich der benötigten verwalteten Bibliotheken, der nativen Bildbibliotheken für x64, x86 und ARM64, der Anleitung sowie offizieller Lizenztexte. EXE-Version 2.2.0.0, Windows-GUI-Ziel, AnyCPU und unverändertes eingebettetes Hintergrundbild wurden geprüft. Die EXE hat keine Authenticode-Signatur.

Die abschließenden Nachweise stehen in `desktop/qa/binary-2.2.json`, `desktop/qa/release-2.2.json`, `desktop/qa/package-2.2.json`, `desktop/qa/build-2.2.log` und `desktop/qa/desktop-tests-2.2.log`. Das Windows-ZIP enthält außerdem sein eigenes Dateimanifest und den Prüfbericht.

Die gemeinsamen Core-/HTTP-Tests und der echte Bilddekoder wurden lokal ausgeführt. Dies prüft keine Windows-Fenster, keine Windows-Schrift-/DPI-Darstellung und keine echte DPAPI-Sitzung. Das komplette Windows-ZIP muss mit seinen Bibliotheken und Unterordnern entpackt werden; die EXE allein reicht nicht mehr aus.

## Noch nicht durchgeführt

- Installation und Bedienung auf einem physischen Android-Gerät, einschließlich tatsächlicher OAuth-Rückkehr aus dem Browser.
- Start der Windows-Oberfläche auf einem Windows-PC, DPAPI, Tray-Benachrichtigungen, Autostart und Skalierung im tatsächlichen Desktop.
- Anmeldung mit dem später eingerichteten Discord-Konto, echte Betreiberfreigabe und Versand an einen echten Discord-Server.
- Öffentlicher Betrieb auf dem VPS mit Domain, HTTPS und produktiver Konfiguration.
- Bau und Start des vollständigen Docker-Images sowie Lasttests.

Der nächste Einrichtungsschritt verbindet die fertigen Dateien mit dem VPS, der Domain und der eigenen Discord-Anwendung. Erst dann können echte Nutzer die öffentliche Registrierung verwenden und der Betreiber seine Websitebilder über die verbundene Windows-Verwaltung veröffentlichen.
