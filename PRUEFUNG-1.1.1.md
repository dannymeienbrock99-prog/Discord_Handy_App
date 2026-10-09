# Modstempel 1.1.1 – Prüfstand

Datum: 9. Oktober 2026.

## Änderung dieser Version

Die Anfrage-Einbettung in Discord wurde anhand des vom Nutzer gelieferten Screenshots übersichtlicher gestaltet. Die kleine Autorenzeile kennzeichnet **Modstempel · Stream-Anfrage**, während der tatsächlich eingegebene Streamtitel als Hauptüberschrift erscheint. Streamer und Team folgen als kompakter Block mit hervorgehobenen Beschriftungen. Der Beginn erhält einen eigenen Abschnitt mit dem kürzeren Discord-Datumsformat `:f`; eine fehlende Zeit wird als **Noch offen** angezeigt. Die optionale Nachricht ist ein weiterer klar beschrifteter Abschnitt.

Die lange Einleitung und die volle UUID im sichtbaren Anfrage-Footer entfallen. Der kurze Hinweis **Zusage startet noch keinen Dienst** bleibt erhalten. Vollständige Ereignis-IDs bleiben im lokalen Verlauf und JSON-Export. Die Poll-Antworten, Dauer, Farbe, Erstellungszeit, Warteschlange, Ablaufregeln und Dienstzeitberechnung wurden nicht geändert. Stempelmeldungen behalten ihr bisheriges Format. Neue Abfragen verwenden das neue Layout; bereits veröffentlichte Nachrichten werden nicht nachträglich geändert.

## Erneut für 1.1.1 geprüft

| Prüfung | Ergebnis |
| --- | --- |
| Bestehende Stempel- und Umfragetests | 28 von 28 bestanden; keine Tests geändert oder übersprungen |
| Maximale Eingaben nach Markdown-Escaping | Titel 240/256, Beschreibung 305/4096, Notiz 560/1024, gesamtes Embed 1.220/6.000 Zeichen |
| Maximaler geprüfter Anfrage-Payload | 2.478 Bytes |
| Geplanter und offener Beginn | Korrektes Datum beziehungsweise **Noch offen** |
| Poll und Sendekonfiguration | Antworten, Dauer, `allowed_mentions`, Originalzeitstempel und Farbe unverändert |
| Android-Build | Finale APK erfolgreich kompiliert und signiert |
| APK-Signatur | v2 und v3 gültig; ein Signierer |
| Update-Signatur | Identisch mit Version 1.1.0 und dem ursprünglichen Signierschlüssel |
| APK-Ausrichtung | `zipalign` einschließlich 16-KiB-Ausrichtung erfolgreich |
| Eingebettete Oberfläche | Alle sechs Webdateien bytegleich mit dem freigegebenen Quellcode |
| Launcher-Bild | PNG im fertigen APK bytegleich mit dem Original-Upload |
| Vorherige APK, Schlüssel und Manifest | Unverändert |

Die 28 Tests wurden mit `node --test tests/*.test.cjs` ausgeführt. Sie decken neben den normalen Stempelabläufen weiterhin Speicherung, Neustart, Datenformat-Kompatibilität, unklare Zustellung, Wartefristen, abgelaufene Anfragen, Poll-Ergebnisse und sichere Exporte ab. Der zusätzliche einmalige Grenzwertcheck prüfte die tatsächlichen Längen des erzeugten JSON nach dem Escaping; dafür wurden keine neuen Tests geschrieben, die lediglich die kosmetische Implementierung wiederholen.

Die verwendeten Discord-Embed-Grenzen stehen in der offiziellen Dokumentation: [Discord Embed Object und Embed Limits](https://docs.discord.com/developers/resources/message#embed-object).

## Gestaltungsvorschau

`Modstempel-Einbettung-1.1.1.png` zeigt die neue Einbettung mit den Angaben des gelieferten Nutzerbilds. Der Inhalt stammt aus dem tatsächlichen `buildRequestPayload`. Er wurde lokal als HTML gerendert und ausdrücklich als **Gestaltungsvorschau** mit einem Hinweis auf die geräteabhängige Discord-Darstellung gekennzeichnet. Das Bild ist keine Aufnahme eines Discord-Clients. Die beiden Emoji-Symbole wurden für die lokale Vorschau vereinfacht dargestellt.

Ein Browserlauf mit lokalem Chromium war ausreichend: keine externen Anfragen, keine Seitenfehler und kein horizontaler Überlauf. Die PNG wurde vom Ersteller und im Abschlussreview visuell angesehen. Geprüft wurden die erkennbare Titelhierarchie, der kompakte Streamer-/Teamblock, die getrennten Abschnitte für Termin und Nachricht, die kurze Fußzeile, lesbare Umbrüche und die außerhalb der Karte stehende Vorschaukennzeichnung. Es wurden keine Umfrage oder Stimmen nachgebaut.

Der Nutzer-Screenshot zeigt die tatsächlich bei ihm angekommene Ausgabe der vorherigen Gestaltung. Für die neue Version wurde durch uns keine Nachricht an Discord gesendet. Die genaue Schrift, Emoji-Darstellung und endgültige Anordnung der nativen Umfrage wurden nicht live im Discord-Client geprüft.

## Weiterhin gültiger Prüfstand aus Version 1.1.0

Die Details der vorherigen Prüfung sind unverändert in `PRUEFUNG-1.1.0.md` erhalten. Dazu gehören 85 native Vertragsprüfungen, zwölf DOM-Prüfgruppen und neun gerenderte Browser-Prüfgruppen. Die darin geprüften nativen Funktionen und Bedienabläufe wurden durch 1.1.1 nicht verändert. An der App-Oberfläche wurde für 1.1.1 nur die angezeigte Versionsnummer angepasst. Diese früheren Prüfungen werden nicht als erneut ausgeführte Prüfungen der Version 1.1.1 ausgegeben.

## Installation und praktische Prüfung

Die neue APK kann mit ihrem identischen Paket und Signierschlüssel über Version 1.0.0 oder 1.1.0 installiert werden. Die bisherige App vorher nicht deinstallieren. Der lokale Zustand und die verschlüsselte Verbindung verwenden weiterhin dieselben Dateien und Schlüssel.

Nach dem Update eine neue Abfrage erstellen, um die neue Einbettung in Discord zu sehen. Ein echter Android-Installationslauf und ein tatsächlicher Discord-Versand der Version 1.1.1 wurden in dieser Umgebung nicht durchgeführt.

## Fertiges Paket

- Datei: `Modstempel-1.1.1.apk`
- Paket: `app.modstempel.mobile`
- Version: `1.1.1`, Versionscode `3`
- Android: minSdk `26`, targetSdk `35`
- Größe: `2.507.941` Bytes
- APK-SHA-256: `925f8de246146aa66db4514c9d332db57d05d65aae25e58891b0c3a1eaefbb33`
- Signierzertifikat SHA-256: `c6ba05258739e61cd809479071abd85bd52e6a8a5f667fc1d2642b752bb35da3`
- Original-Logo SHA-256: `69c328f3c5ccca308fc29e77837445f7b797d72d6eae4a514dcca351e1c25953`
- Unveränderte 1.1.0-APK SHA-256: `0e24deac41773966da15db4716e595d21b546bac381163b36a6d51f16ced4fab`

Die vollständigen Paketmetadaten stehen in `PRUEFUNG-PAKET.json`.
