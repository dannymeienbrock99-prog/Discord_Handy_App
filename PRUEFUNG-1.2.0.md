# Modstempel 1.2.0 – Prüfstand

Datum: 9. Oktober 2026.

## Änderung und erwarteter Ablauf

Im Streamer-Formular kann eine optionale JPG-, PNG- oder WebP-Datei ausgewählt werden. Die Bildvorschau zeigt das vollständige Seitenverhältnis und die Metadaten; Ersetzen und Entfernen sind vor dem Senden möglich. Die Bestätigung zeigt ebenfalls das Bild und hält ihre Aktionszeile beim Scrollen sichtbar. Nach dem bestätigten Speichern gehören Bild und Anfrage dauerhaft zusammen. Discord erhält die Datei in derselben Anfrage wie Einbettung und Umfrage; das Embed verweist über `attachment://Modstempel-Bild.<ext>` auf den Anhang.

Die Datei ist auf 8 MiB, 8.192 Pixel pro Seite und 32.000.000 Pixel insgesamt begrenzt. Sie wird unverändert in den privaten App-Speicher kopiert. Die SHA-256-Referenz wird bei jedem Versand erneut gegen die Dateidaten geprüft. Bereits gespeicherte Anfragen behalten ihr ursprüngliches Bild und ihre ursprüngliche Verbindung. Eine fehlende Datei führt zu einem Fehler vor Netzwerkbeginn. Der JSON-Export enthält ausschließlich die Referenz und Metadaten, nicht die Bilddatei. Die Bildwahl startet keinen Dienst und verändert keine Dienstzeit.

Prüfablauf der Oberfläche: **Streamer → Bild auswählen → Vorschau → Ersetzen/Entfernen beziehungsweise Bestätigung → bewusstes Senden → gespeicherte Anfrage mit Bildhinweis**.

## Erneut für Version 1.2.0 geprüft

| Bereich | Ergebnis und Aussagekraft |
| --- | --- |
| JavaScript-Logik und Bridge | 47 von 47 Tests bestanden, keine übersprungenen Fälle |
| Native Vertragsprüfungen | 174 von 174 Assertions bestanden |
| Native Kompilierung | Gegen Android API 35 erfolgreich |
| Gerenderte Bedienprüfung | Sechs gezielte Prüfgruppen bestanden |
| Seitenidentität und Inhalt | Titel Modstempel, gefüllte Oberfläche, kein Fehleroverlay |
| Private Bildvorschau | Bild wird ausschließlich von der lokalen `appassets`-Route geladen |
| Bildwechsel | Abbruch und Importfehler behalten die vorherige Auswahl |
| Entfernen | Wartet auf native Bestätigung; bei Fehler bleibt das Bild im Formular |
| Bestätigung | Vorschau sichtbar; Versand genau einmal nach ausdrücklichem Bestätigen |
| Speicherfehler | Keine Anfrage und kein Versand; Bild und Texte bleiben erhalten |
| Dauerhafte Zuordnung | Nach Erfolg Formular leer, gespeicherte Bildreferenz weiterhin vorhanden |
| Darstellung | 320, 390 und 1.280 Pixel geprüft; kein horizontaler Überlauf |
| Dialog und Tastenzugriff | Aktionen bleiben sichtbar; alle drei Antworten durch Scrollen erreichbar |
| Browserkonsole und CSP | Keine relevanten Fehler, keine externen Anfragen |
| Finale APK | Gebaut, signiert, ausgerichtet und inhaltlich mit dem Quellcode verglichen |

### Logik und Speicherung

Die 28 bestehenden Stempel- und Umfragetests wurden unverändert erneut ausgeführt. Die 19 neuen JavaScript-Tests prüfen die strikte Bildmetadatenstruktur, erlaubte Dateitypen und Grenzen, Entfernen unbekannter Felder beim Laden, Abwärtskompatibilität ohne Bild, das tatsächliche Payload-Format und den separaten Bildverweis an die native Bridge. Sie prüfen außerdem Abbruch- und Fehlerfälle der Auswahl, die getrennte Beschäftigungsanzeige ohne Blockieren normaler Stempelmeldungen, unveränderliche Bilder bei Neustart und Profilwechsel, ursprüngliche Verbindungen, Sendepausen, unklare Zustellung und die vorhandene einzelne Versandwarteschlange.

Eine nicht erfolgreich gespeicherte Anfrage erzeugt weder einen dauerhaften Eintrag noch einen Versand. Bilder gespeicherter Anfragen werden beim Entfernen einer Formularauswahl geschützt. Exporte enthalten keine Bilddaten, fremden Datei-URIs oder Webhook-Zugangsdaten. Die Bridge-Prüfung führt den tatsächlichen JavaScript-Code aus und kontrolliert Aktionen, Callback-Zuordnung sowie die unterschiedlichen Fristen: keine künstliche Frist während der Systemauswahl, 200 Sekunden für Bildversand und 45 Sekunden für normale Netzwerkanfragen.

### Native Bildverarbeitung und Upload

Die 174 nativen Assertions umfassen die bisherigen 85 Fälle und 89 neue Bildfälle. Geprüft wurden unter anderem Referenzen und Pfadgrenzen, Dateisignaturen, Byte- und Auflösungsgrenzen sowie die unveränderten binären Bildbytes im Multipart-Inhalt. UTF-8-Payload, Teilnamen, Dateiname, MIME-Typ und gesamte Inhaltslänge wurden kontrolliert.

Die Android-Implementierung prüft nach der Signatur die tatsächlichen Decoder-Abmessungen sowie eine speicherbegrenzte Probe-Dekodierung. Das Bild wird atomar gespeichert. `AtomicFile.openRead()` wird vor der Prüfung der wiederhergestellten Basisdatei verwendet; identische bereits gültige Bildkopien werden nicht erneut geschrieben. Ein 180-Sekunden-Watchdog beendet einen hängenden Upload. Eine unklare Zustellung wird wie bisher nicht automatisch als sicher ungesendet behandelt. Der Watchdog bleibt auch beim Schließen der Activity für einen laufenden Upload geplant.

Die Offline-Tests prüfen Verträge und Multipart-Bytes. Sie führen den echten Android-Systempicker und den tatsächlichen Android-Bitmapdecoder nicht aus.

### Gerenderte Prüfung und visuelle Belege

Die Oberfläche wurde mit regulärem Playwright und lokalem Chromium geprüft, da kein Browser-Plugin mit entsprechendem Skill verfügbar war. Der Test nutzte den tatsächlichen Core und die Bridge mit einem simulierten nativen Gegenstück. Die Adresse `https://appassets.androidplatform.net/assets/index.html` sowie alle Bilder wurden vollständig aus lokalen Testdateien bedient. Die Antworten und Versanddaten waren Simulationen. Es gab keine Verbindung zum Discord-Webhook.

Die Screenshots wurden visuell kontrolliert. Das Moderationsschild erscheint vollständig und unverzerrt. Die Angaben zur Datei und die beiden Bildaktionen sind gut getrennt. Die neue Bildsektion übernimmt Farben, Schriftgrößen, Abstände und Rundungen der vorhandenen Oberfläche. Der Bilddialog öffnet sich am Anfang und seine Aktionszeile bleibt sichtbar; sämtliche drei Umfrageantworten sind erreichbar. Die bestehende vierteilige Navigation und die Desktop-Höchstbreite von 560 Pixeln bleiben erhalten.

Die bereitgestellte Datei `Modstempel-Bildfunktion-1.2.0.png` ist ein Ausschnitt der lokal gerenderten App-Vorschau mit ausdrücklich bezeichneten QA-Daten. Sie ist kein Screenshot eines Android-Geräts oder Discord-Clients.

## Grenzen der Prüfung

Ein echter Android-Installationslauf, der Android-Dateidialog, reale Bitmap-Dekodierung auf einem Gerät, Keystore-Verhalten auf dem Zielgerät, die Android-WebView und ein Live-Upload zu Discord wurden in dieser Umgebung nicht ausgeführt. Die erfolgreiche Kompilierung, Paketprüfung und simulierten Abläufe ersetzen diese Tests nicht. Es wurde keine echte Nachricht veröffentlicht.

Die bestehenden historischen Prüfergebnisse stehen unverändert in `PRUEFUNG-1.1.0.md` und `PRUEFUNG-1.1.1.md`. Frühere DOM- oder Browserläufe werden hier nicht als erneut ausgeführte Prüfungen gezählt.

## Installation

`Modstempel-1.2.0.apk` über die bisherige Version installieren. Paketname und Signierschlüssel sind identisch, der Versionscode ist erhöht. Die bisherige App vorher nicht deinstallieren. Danach im Bereich **Streamer** eine neue Anfrage mit **Bild auswählen** erstellen. Die neue Bildfunktion gilt für neue Anfragen; vorhandene Discord-Nachrichten werden durch das Update nicht geändert.

## Fertiges Paket

- Datei: `Modstempel-1.2.0.apk`
- Paket: `app.modstempel.mobile`
- Version: `1.2.0`, Versionscode `4`
- Android: minSdk `26`, targetSdk `35`
- Größe: `2.516.133` Bytes
- APK-SHA-256: `5a10d8e225937fc71d7c14b00fb3d5fcbcbaf6a3a679660fbfac5d587cbb8ea8`
- Signierzertifikat SHA-256: `c6ba05258739e61cd809479071abd85bd52e6a8a5f667fc1d2642b752bb35da3`
- Signaturverfahren: v2 und v3 gültig, ein Signierer
- Ausrichtung: 16-KiB-Seiten und 4-Byte-Ausrichtung geprüft
- Weboberfläche: alle sechs APK-Assets bytegleich mit dem freigegebenen Quellcode
- Original-Logo SHA-256: `69c328f3c5ccca308fc29e77837445f7b797d72d6eae4a514dcca351e1c25953`
- Vorherige 1.1.1-APK unverändert: `925f8de246146aa66db4514c9d332db57d05d65aae25e58891b0c3a1eaefbb33`
- Berechtigungen: ausschließlich `INTERNET` und `ACCESS_NETWORK_STATE`; keine allgemeine Galerieberechtigung

Die vollständigen Paketmetadaten stehen in `PRUEFUNG-PAKET.json`.

## Reproduzierbare Prüfkommandos

Im Projektordner:

```bash
node --test tests/*.test.cjs
bash android/test-native-contract.sh
bash build-apk.sh
```

Der temporäre gerenderte UI-Prüflauf verwendete Playwright mit lokalem Chromium und simuliertem `NativeBridge` unter der App-Adresse. Er ist eine dokumentierte Prüfung dieser Auslieferung und keine zusätzliche Build-Abhängigkeit.

## Offizielle technische Grundlagen

- [Discord: Dateiupload mit Multipart, Anhängen und Embed-Bildreferenzen](https://docs.discord.com/developers/reference#uploading-files)
- [Android: Einzelne Dokumente und Bilder über die Systemauswahl öffnen](https://developer.android.com/training/data-storage/shared/documents-files)
