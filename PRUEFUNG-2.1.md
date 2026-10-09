# Prüfbericht – Modstempel 2.1.0

Stand: 9. Oktober 2026. Dieser Bericht unterscheidet die tatsächlich ausgeführten lokalen Prüfungen vom noch ausstehenden Betrieb auf dem eingerichteten Server und den Endgeräten.

## Gegenstand

Die Änderung ergänzt die bestehende Modstempel-App um Discord-Registrierung, persönliche Betreiberfreigabe, einen geschützten APK-Download und eine Windows-Verwaltung. Das bereitgestellte Drachenbild dient als Hintergrund. Die Android-Paketkennung, das bisherige App-Symbol und der ursprüngliche Signierschlüssel bleiben erhalten.

Der Freigabestatus ist eine Entscheidung des Servers. Eine gültige Anmeldung allein, eine weitergegebene APK oder eine Administratorrolle auf einem Discord-Server ersetzt diese Entscheidung nicht. Nur die private Konfiguration `OWNER_DISCORD_ID` bestimmt den Betreiber.

## Ausgeführte Tests

| Teil | Ergebnis | Tatsächlicher Umfang |
| --- | --- | --- |
| JavaScript-App | 106 Tests bestanden | Bestehende Abläufe plus zehn neue Tests für Freigabe, Sperre, unbekannten/offline Zustand, Warteschlange, Wiederverbindung und lokale Daten |
| Server | 55 Tests bestanden | 39 bestehende und 16 neue Tests; echte lokale HTTP-Routen mit simulierter Discord-API |
| Native Android-Logik | 563 Assertions bestanden | 146 Bild/Link, 102 Fehlerparser, 110 Sendezustand, 139 Backend/Anmeldung, 28 HTTP-Transport, 38 Freigabe/Tokenfilter/JPEG-MIME |
| Windows-Verwaltung | 93 Assertions bestanden | Produktive Core-, DTO- und HTTP-Client-Dateien mit Ersatztransport unter .NET 10 |
| Gerenderte Oberflächen | 13 Testgruppen bestanden | Lokaler Playwright-Chromium-Browser, simulierte Portal-API und native Android-Brücke |

Die Zahlen beschreiben unterschiedliche Testarten und sind nicht als Anzahl realer Geräte- oder Benutzerprüfungen zu verstehen. Es wurden keine echten Discord-Beiträge oder Events veröffentlicht.

### Registrierung und Betreiberentscheidungen

Die Servertests prüfen die getrennte Portal-/Geräteanmeldung, OAuth-State und PKCE, Browser-Cookie-Bindung, Wiederverwendung eines Codes sowie Origin- und CSRF-Prüfungen. Der Antrag erhält seine Identität aus der bestätigten Anmeldung; Angaben im Formular verleihen keine Betreiberrechte.

Abgedeckt sind doppelte Anträge, Freigabe, Ablehnung, Sperre, erneute Freigabe und überholte Datensatzversionen. Registrierungen, Entscheidungen und Sitzungen werden nach einem Neustart wiederhergestellt. Vorhandene normale Konten aus Version 2.0 werden durch die Migration nicht automatisch freigegeben.

Der Betreiberstatus wird auch innerhalb der endgültigen Speicherung erneut kontrolliert. Eine Abmeldung während eines noch eintreffenden Entscheidungs-Bodys verhindert die Änderung. Die Windows-Verwaltung prüft außerdem Identität, Ergebnisstatus und Version der bestätigten Entscheidung und wiederholt eine unklar beantwortete Entscheidung nicht automatisch.

### Download und App-Zugang

Geprüft wurden Anmeldung und aktuelle Freigabe für `GET` sowie `HEAD /portal/download`, die exakten zurückgegebenen Dateibytes, eine fehlende APK und die Ablehnung eines symbolischen Dateiverweises. Die APK liegt außerhalb des öffentlichen Asset-Verzeichnisses.

Eine Sperre gilt auch für ältere gültige Sitzungen. Ein Test sperrt das Konto während der asynchronen Discord-Rechteabfrage: Es entsteht keine erste Discord-Nachricht. Ein weiterer Test sperrt nach bestätigtem Bildversand und vor der Umfrage: Die vorhandene Bildbestätigung bleibt erhalten; die zweite Nachricht wird nicht gesendet.

Bereits abgeschlossene Discord-Aktionen und bereits übertragene Downloadbytes werden dadurch nicht rückgängig gemacht. Die Freigabeprüfung ist keine Fernlöschung installierter APK-Dateien.

### Android-Grenze und Wiederverbindung

Die native App ruft den aktuellen Freigabestatus über `/v2/session` ab. Die gespeicherte Sitzung enthält keine nutzbare Offline-Freigabe. Unbekannte oder widersprüchliche Freigabefelder werden nicht als Erlaubnis interpretiert.

Der fertig aufgebaute Status wird einschließlich des neuen Betreiberhinweises durch den vorhandenen Tokenfilter geführt. Die Tests prüfen ausdrücklich, dass zurückgespiegelte Sitzungstoken und Geräte-Verifier in diesem Hinweis nicht ins WebView gelangen. Für das neue JPEG-Hintergrundbild wird ein expliziter `image/jpeg`-Inhaltstyp geliefert.

Die Registrierungsaktion öffnet ausschließlich die gespeicherte kanonische Serveradresse mit `/portal` im Systembrowser. Die Weboberfläche kann dafür kein fremdes Ziel vorgeben.

Die Warteschlange startet ohne bestätigte Freigabe keine weiteren Aufträge. Nach einem Verbindungsfehler wird der Zugang in begrenzten Abständen erneut geprüft. Ein Wartestatus wird ebenfalls regelmäßig aktualisiert. Bereits laufende lokale Dienste bleiben pausierbar und beendbar; Verlauf und Export bleiben erhalten.

### Windows-Verwaltung

Die EXE wurde für .NET Framework 4.8 als Windows-Forms-Anwendung gebaut; der Build endete ohne Warnungen und Fehler. Das Original-Hintergrundbild ist bytegleich eingebettet. Testcode ist nicht Bestandteil der EXE.

Die 93 Prüfungen umfassen zulässige HTTPS-Adressen, Gerätebindung, Betreiberstatus, vollständige Pagination, Revisionen, Versionskonflikte, HTTP 401/403/409/429, Weiterleitungen sowie verlorene Entscheidungsantworten. Ein verzögert gelieferter Antwortinhalt wird von derselben Gesamtfrist wie der Header begrenzt.

Die Oberfläche speichert ihre Sitzung über Windows DPAPI für das aktuelle Benutzerkonto. Das ist anhand des Codes geprüft, aber nicht in dieser Linux-Umgebung ausgeführt. Gleiches gilt für Infobereich, Windows-Benachrichtigungen, Autostart, Fensterdarstellung und DPI-Skalierung.

### Oberfläche und Bild

Das Originalbild ist in Android-Assets, Portal und Windows-EXE unverändert. SHA-256:

`99ee1da73144c9729d4be2c7f7f6016db45afe04e53df5647ed65e8e6e77a022`

Die Browserprüfung deckt Registrierung mit optionaler Nachricht, Wartestatus, Ablehnung/Sperre, sichere Darstellung des Betreiberhinweises, Downloadfreigabe, einen fehlgeschlagenen aktuellen Statusabruf und Abmeldung ab. In der App wurden blockierte Aktionen, Portalöffnung, Export, Freigabe mit Server-/Kanalauswahl und die lokale Beendigung eines laufenden Dienstes nach Sperre geprüft.

Kein horizontaler Überlauf wurde bei Portalbreiten 320, 390, 720, 1024 und 1536 Pixel festgestellt. Die fünf App-Ansichten wurden bei 320, 390 und 560 Pixel Breite geprüft. Die Screenshots unter `qa/screenshots` zeigen tatsächlich gerenderte Weboberflächen mit Testkonten; sie sind keine Aufnahmen eines physischen Android-Geräts. Die Bildkonzepte wurden separat mit dem fertigen Layout verglichen.

## Binärpakete

Die Android-APK trägt Version 2.1.0, Versionscode 9 und Paketkennung `app.modstempel.mobile`; Mindestversion ist Android 8/API 26, Ziel-API 35. Der erwartete ursprüngliche Signaturfingerabdruck lautet:

`c6ba05258739e61cd809479071abd85bd52e6a8a5f667fc1d2642b752bb35da3`

Der Paketbericht `PRUEFUNG-PAKET.json` enthält die tatsächlichen SHA-256-Werte, Signaturprüfung, ZIP-Ausrichtung sowie den bytegenauen Vergleich der gebündelten Web-Assets. Der Windows-Bericht steht zusätzlich unter `desktop/qa/binary.json`.

## Noch nicht ausgeführter Betrieb

- Installation/Update und vollständiger Ablauf auf einem physischen Android-Gerät.
- Start der EXE auf dem Betreiber-PC einschließlich echter Windows-Benachrichtigung, DPAPI, Autostart und DPI-Darstellung.
- Einrichtung der echten Domain, HTTPS, privaten Servervariablen und Discord-Anwendung.
- Live-Anmeldung mit beiden Discord-Callbacks, Bot-Installation und tatsächlicher Beitrag-/Bild-/Umfrage-/Eventversand.
- Docker-Image-Bau und produktiver Start auf dem gebuchten VPS.
- Lasttest oder belastbare Kapazitätszusage für eine bestimmte Zahl von Discord-Servern.

Die Anleitung `NEU-IN-2.1.md` und `server/README.md` beschreiben die Einrichtung. Vor der Verteilung an weitere Nutzer folgt ein Test mit einem zweiten Discord-Konto: registrieren, gesperrten Download prüfen, am PC freigeben, herunterladen und anmelden, anschließend sperren und den verweigerten weiteren Serverzugang kontrollieren.

## Reproduzierbare lokale Aufrufe

```sh
node --test tests/*.test.cjs
```

```sh
cd server
npm test
```

```sh
bash android/test-native-contract.sh
bash build-apk.sh
```

```sh
dotnet run --project desktop/tests/Desktop.Tests.csproj -c Release
```

Die Browserprüfung steht in `qa/ui-access.cjs`; sie benötigt Playwright und einen verfügbaren Chromium-Browser. Die endgültigen lokalen App-, nativen und Windows-Logs liegen bei. Der 55/55-Serverlauf wurde im Ausführungsprotokoll geprüft, aber nicht als zusätzliche Logdatei gespeichert. Ältere Prüfberichte bleiben als Versionshistorie im Quellcode erhalten.
