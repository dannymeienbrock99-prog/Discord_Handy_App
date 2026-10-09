# Prüfung – Modstempel 2.0.0

Stand: 9. Oktober 2026. Diese Version ersetzt den aktiven Webhook-Versand durch eine native Discord-Anmeldung mit separatem Bot-Backend. Sie enthält eine installierbare Android-APK und den vollständigen Verbindungsserver als Quellcode mit Betriebsanleitung.

## Ergebnis und Grenzen

Die App-Logik, die Android-Protokollgrenzen, die aktuellen Javaquellen, der Backend-Ablauf und die gerenderte Oberfläche wurden lokal geprüft. Ein unabhängiger Integrationsreview hat zusätzlich die Fehlerklassifizierung über die Schichten hinweg geprüft. Die daraus gefundenen Ressourcen-404- und OAuth-Refreshfehler sind korrigiert und durch gezielte Tests abgedeckt.

**Die echte Discord-Anwendung und ein öffentlich betriebener HTTPS-Server sind in diesem Paket noch nicht eingerichtet.** Alle automatisierten Discord-Interaktionen verwenden kontrollierte Testantworten. Es wurde kein echter Discord-Beitrag gesendet, kein echtes Event angelegt und keine echte OAuth-Anmeldung ausgeführt. Ein physisches Android-Gerät, eine Installation über die bisherige APK auf einem echten Gerät sowie Docker/Caddy mit öffentlichem TLS wurden in dieser Umgebung nicht getestet. Docker ist in der Prüfungsumgebung nicht verfügbar.

Die App zeigt fehlende Serverkonfiguration und fehlende Anmeldung ausdrücklich an. Es gibt keinen eingebauten Test-Account, keine vorgetäuschte Serverliste und keine simulierten Versanderfolge in der ausgelieferten App. Simulationen gehören ausschließlich zu den Tests.

## Android und Paket

- Paketname: `app.modstempel.mobile`.
- App-Name: **Modstempel**.
- Version: **2.0.0**, Android-Versionscode **8**.
- Mindestversion: Android 8 / API 26; Ziel-API 35.
- Originales Moderationslogo unverändert als Startbildschirm-Symbol.
- Signatur mit dem bisherigen Update-Schlüssel; keine neuen Signierdaten in der APK oder im Quellcodepaket.
- APK-Webassets einschließlich `core-v2.js` werden gegen die endgültigen Quelldateien auf Bytegleichheit geprüft.
- Native Testklassen und die nur zum Prüfen genutzte org.json-Implementierung gehören nicht in die APK.

Der genaue Paketstand einschließlich SHA-256, Signaturprüfung, Manifest, Logovergleich und Assetliste steht in **PRUEFUNG-PAKET.json**. Die vorherige 1.2.3-APK wird bei der Paketprüfung auf unveränderte Bytes geprüft.

## JavaScript: 96 bestandene Tests

| Teil | Anzahl | Was geprüft wurde |
| --- | ---: | --- |
| Bestehende Zeit-/Daten- und historische Regressionen | 62 | Zeitrechnung, Pausen, Mitternacht, Speichern, Bilder und bisherige Datenformate |
| Aktuelle Web-Bridge | 7 | V2-Aktionen, richtige Parameter, Bildauswahl, Timeouts, ausdrückliche Sperre aller alten Webhook-Aktionen |
| CoreV2 | 25 | Neue Anmeldung, Auswahl, Migration, Kategorien, Zeiten und dauerhafte Auftragsverarbeitung |
| Echte Core-/Server-Vertragsgrenze | 2 | Tatsächlich vom Core erzeugte Aufträge werden unverändert akzeptiert; Original-PNG und getrennte Poll-Payloads |
| **Gesamt** | **96** | |

Die historischen Tests führen alte Corefunktionen nur mit Ersatzschnittstellen aus. Sie belegen Daten- und Hilfsfunktionsregressionen; der frühere Core wird in der ausgelieferten Oberfläche nicht als aktive App initialisiert.

Besonders geprüft wurden:

- Migration eines laufenden alten Dienstes mit erhaltenen Zeiten und Bildreferenzen; alte Aufträge bleiben im Archiv und erzeugen keine Bot-Veröffentlichung.
- Ein noch nicht bestätigter Browser-Login macht die App nicht authentifiziert. Abbruch und abgelaufene Anmeldungen bleiben erkennbar.
- Alle fünf Kategorien behalten ihren festgelegten Empfängerkreis. Die Stream-Anfrage verwendet ihre drei bekannten Teilnahmeantworten.
- Das bestätigte Ziel bleibt auch nach einem Wechsel der aktuellen Kanalauswahl unverändert. Ein anderes Konto oder ein anderer Backend-Origin darf wartende alte Aufträge nicht übernehmen.
- Ein aktiver Dienst bleibt an sein ursprüngliches Ziel gebunden; Start, Pause, Fortsetzen und Ende besitzen korrekte Zeitstände.
- Fehlende oder unlesbare Speicherung verhindert den Versand und erhält die Originaldaten zur Wiederherstellung.
- Verlorene Sendebestätigungen werden zuerst über einen reinen Statusabruf geklärt. Eine unklare Zustellung erfordert eine ausdrückliche Wiederholungsbestätigung.
- `sending` nach App-Neustart wird durch einen Statusabruf geklärt, nicht blind erneut versendet.
- Nur ein passendes `GET` mit fehlendem, noch nie bestätigtem Auftrag erlaubt die Wiederaufnahme mit derselben ID. Ein Ressourcen-404 beim ursprünglichen POST führt zu einem nachvollziehbaren Fehler. Fehlt ein früher bestätigter Serverauftrag, bleiben seine Bild-/Nachrichtenbestätigungen erhalten und es erfolgt keine automatische Neuveröffentlichung.
- Bild plus Umfrage bleibt ein Auftrag mit getrennten Schritten. Nach bestätigtem Bild verwendet der Retry nur den fehlenden Poll-Schritt.
- Echte Events verwenden Server, Ort/Link und absolute Zeitpunkte; sie erzeugen keine zusätzliche Kanal-Erwähnung.

Befehl: `node --test tests/*.test.cjs`. Das Ergebnisprotokoll liegt unter `qa/app-v2-tests.log`.

## Native Android-Prüfung: 525 bestandene Assertions

| Bereich | Assertions |
| --- | ---: |
| Bilder, Referenzen, Multipart und feste Discord-Links | 146 |
| Begrenzte Fehlerausgabe und Geheimnis-Redaktion | 102 |
| Tatsächliche Send-/Zustandsgrenzen aus MainActivity | 110 |
| Backend-, Geräte-Login-, Sitzungs- und Antwortvertrag | 139 |
| Tatsächlicher HTTPS-Transport mit lokalem JVM-Ersatz | 28 |
| **Gesamt** | **525** |

Der Prüflauf kompiliert die aktuellen Produktions-Javaquellen mit Eclipse ECJ, Java-8-Quellziel und Android-35-Plattformklassen. Er verwendet keine Klassen aus einer früher gebauten APK. Die Transporttests ersetzen HTTPS-Verbindungen innerhalb der JVM und öffnen keine Sockets.

Geprüfte Grenzen sind unter anderem:

- Kanonischer HTTPS-Origin, feste erlaubte Pfade und Methoden, keine beliebigen Ziele oder Header aus JavaScript.
- Zufälliger privater Geräteverifier, SHA-256-Challenge, gültiger Gerätecode und relativer Anmeldelink.
- Sitzung wird gespeichert, bevor ein bestätigter Login an die Oberfläche geht. SessionToken und Verifier werden nicht an JavaScript gegeben.
- Eindeutiger HTTP 401 bleibt ein Authentifizierungsfehler. Eine endgültig abgelehnte Geräteanmeldung wird beendet; ein Netzfehler erhält den begonnenen Login.
- Verschlüsselte Sitzung ist an den ursprünglichen Backend-Origin gebunden; veraltete Antworten nach Abmeldung oder Verbindungswechsel können sie nicht ersetzen.
- Multipart verwendet genau `operation` und `image`, einschließlich unveränderter Bildbytes und korrekter Größenangaben.
- Version-1-Rohdaten werden vor dem ersten Version-2-Schreiben archiviert. Der gesamte Zustand einschließlich Legacy-Archiv wird beim Prüfen erhaltenswerter Bildreferenzen berücksichtigt.
- Frühere Webhook-Netzwerkmethoden sind entfernt; alte Bridge-Aktionsnamen werden vor jeder Übertragung abgewiesen.

Befehl: `bash android/test-native-contract.sh`.

## Backend-Prüfung: 39 bestandene Tests

Die Server-Tests verwenden den wirklichen HTTP-Router, Auth-Code, Auftragsspeicher, Multipart-Parser und Discord-Client. Nur die externe Discord-Antwort wird ersetzt; für die HTTP-Tests läuft ein lokaler Server auf einer zufälligen Loopback-Adresse. Der Node-Testlauf läuft unter **Node v24.19.0**.

Abgedeckt sind:

- Echte Codeflow-Struktur mit OAuth-State, Browserbindung, PKCE und privatem Geräteclaim. Ein wiederholter erfolgreicher Claim liefert für höchstens zwei Minuten dieselbe verschlüsselt gespeicherte App-Sitzung.
- Veränderte beziehungsweise falsche Claims, abgelaufene Logins, Callback-Wiederholung, fehlende Scopes und Abmeldung.
- AES-GCM, veränderte verschlüsselte Daten, falscher Schlüssel, atomare Speicherung und Sperre einer zweiten laufenden Instanz.
- Discord-Token-Refresh bei parallelen Anfragen. HTTP 503, unlesbare Antwort, unvollständiges JSON, HTML-429 und fehlerhafte Anwendungskonfiguration löschen keine zuvor gültigen OAuth-Daten und App-Sitzungen. Bestätigte Ablehnung des Benutzer-Grants kann die Anmeldung dagegen invalidieren.
- Gemeinsame Auswertung der Nutzer- und Bot-Berechtigungen, Rollen- und Mitgliedsüberschreibungen, Besitzer-/Administratorrechte, Timeout und Mitgliedschaftsprüfung.
- Moderatorrolle oder Serververwaltung für Modstempel; genau die vorgesehene Rolle beziehungsweise `@everyone` wird erwähnt. Freie zusätzliche Erwähnungen werden nicht aktiviert.
- HTTP-JSON und echte lokale Multipart-Übertragung, doppelte Felder, unvollständige Uploads, Hash, Bildformat und Abmessungen.
- Einmalige Annahme einer Auftrags-ID, unveränderliche Nutzdaten und Besitzerbindung; gleichzeitige Wiederholungen erzeugen keine zweite Nachricht.
- Persistente Bildbestätigung vor der Poll-Phase; Poll-Retry ohne erneuten Dateiupload, auch nach Neustart.
- Unklare POST-Antwort, verlorene Speicherung einer Bestätigung und Neustart während einer Übertragung führen zu einem ausdrücklichen unklaren Status.
- Globale Discord-Sendepausen, endgültige Ablehnungen und richtige Ressourcen-404-Klassifizierung.
- Externe Events mit `CREATE_EVENTS`, gültigen ISO-Zeitpunkten und genau einem Event-Aufruf.
- Rohform der Discord-Pollergebnisse, unbekannte Einzelzahlen und sichtbar veraltete vorherige Ergebnisse.

Befehl: `npm --prefix server test`. Alle 39 Backendtests sind bestanden. Das Ergebnisprotokoll liegt unter `qa/server-v2-tests.log`. Die zwei Core-/Server-Vertragsprüfungen sind bereits in den 96 JavaScript-Tests gezählt und werden hier nicht doppelt gezählt.

## Gerenderte Oberfläche: 13 bestandene Prüfgruppen

Die Prüfung lädt das tatsächliche HTML, CSS, die aktuelle Bridge und CoreV2 in Chromium. Die native Schnittstelle ist dabei eine lokale Simulation. Die sechs Screenshots wurden visuell geprüft; die Tests meldeten keine Browserfehler und keine externen Netzwerkanfragen.

Geprüfte Breiten: **320 und 390 Pixel**. Getestet wurden Anmeldung und Abbruch, fehlende Backend-Konfiguration, Bot-Installation ohne vorgetäuschten Erfolg, Server-/Kanalauswahl, Rollenrechte, alle fünf Kategorien, unveränderliches Bestätigungsziel, Bilder und Teilzustellung, bewusste Wiederholung, Events, Speicherfehler, alte laufende Dienste, Navigation und erreichbare Schaltflächen.

Die letzten gezielten Darstellungsprüfungen bestätigen:

- Alte Pollzahlen erscheinen ausdrücklich als gespeicherte, möglicherweise abweichende Ergebnisse. „Ergebnisstand“ und „Zuletzt abgefragt“ werden auseinandergehalten.
- Nach erneutem Laden der Servereinrichtung wird eine vorher geladene Eventliste wieder als noch nicht abgerufen behandelt. „Keine Events gefunden“ erscheint erst nach einer tatsächlichen leeren Antwort.

Das maschinenlesbare Ergebnis steht in `qa/ui-v2.json`.

## Vor dem ersten echten Betrieb

Die Person, die Modstempel betreibt, richtet die tatsächliche Discord-Anwendung und die HTTPS-Adresse nach `server/README.md` ein. Anschließend werden App-Anmeldung, Bot-Installation, Moderatorrolle und Zielkanal mit dem eigenen Konto geprüft. Erst danach lässt sich ein bewusst erstellter Beitrag im echten Discord-Kanal verifizieren.

Die bereitgestellte APK enthält keinen vorkonfigurierten Testversand. Das ursprüngliche Nutzer-Webhook wird in Version 2 nicht angesprochen.
