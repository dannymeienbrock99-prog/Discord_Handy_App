# Modstempel 2.1 – Registrierung, Freigabe und PC-Verwaltung

Version 2.1 ergänzt die vorhandene Discord-App um einen persönlichen Freigabeablauf. Das hochgeladene Drachenbild `BAtto(3).jpeg` dient unverändert als Hintergrund. Die App heißt weiterhin **Modstempel** und behält ihr bisheriges Android-App-Symbol und ihre Paketkennung.

## So kommen neue Nutzer in die App

1. Du gibst den Link zu deiner Modstempel-Webseite weiter.
2. Die Person wählt **Mit Discord registrieren** und bestätigt ihr eigenes Discord-Konto auf der offiziellen Discord-Seite.
3. Auf deiner Webseite sendet sie ihre Registrierung ab. Eine kurze Nachricht an dich ist optional. Ein zusätzliches Passwort oder eine E-Mail-Adresse wird nicht verlangt.
4. Die Webseite zeigt **Deine Anfrage wird geprüft**. Der APK-Download bleibt gesperrt.
5. In deiner Windows-Verwaltung erscheint die Anfrage mit Discord-Name, eindeutiger Konto-ID und Zeitstempel. Du entscheidest persönlich.
6. Nach **Freigeben** kann die Person auf derselben Webseite die Android-APK herunterladen. Sie meldet sich dort bei Bedarf erneut mit demselben Discord-Konto an.
7. In der Android-App trägt sie deine HTTPS-Serveradresse ein und meldet sich mit dem freigegebenen Konto an. Danach stehen Server- und Kanalauswahl sowie die bisherigen Funktionen bereit.

Die Registrierung öffnet zunächst nur den Zugang zu Modstempel. Welche Discord-Server, Kanäle und Aktionen die Person tatsächlich verwenden darf, wird weiter anhand ihrer eigenen Discord-Rechte geprüft.

## Deine Entscheidung am PC

Die Windows-App **Modstempel Verwaltung** verwendet dieselbe HTTPS-Adresse und die Discord-Anmeldung im Systembrowser. Nur die in der Serverkonfiguration festgelegte Discord-Konto-ID darf die Verwaltung benutzen. Eine Administratorrolle auf irgendeinem Discord-Server verleiht keine Betreiberrechte.

| Zustand | Bedeutung | Verfügbare Entscheidung |
| --- | --- | --- |
| Nicht registriert | Discord-Konto bekannt, aber noch kein Antrag gestellt | Person sendet auf der Webseite ihre Registrierung ab |
| Wartet auf Freigabe | Eine neue Registrierung ist eingegangen | Freigeben oder ablehnen |
| Freigegeben | APK-Download und Modstempel-Zugang sind erlaubt | Zugang sperren |
| Abgelehnt | Die Registrierung wurde abgelehnt | Später doch freigeben |
| Gesperrt | Ein bereits erteilter Zugang wurde widerrufen | Später wieder freigeben |

Eine erneute Anmeldung oder das wiederholte Absenden des Formulars hebt eine Ablehnung oder Sperre nicht auf. Entscheidungen werden mit Datum, Betreiber und Version gespeichert. Wurde derselbe Eintrag inzwischen in einem anderen Verwaltungsfenster verändert, muss die aktuelle Liste vor einer weiteren Entscheidung neu geladen werden.

### Benachrichtigungen

Die PC-App fragt bei aktiver Verbindung regelmäßig nach neuen Anfragen. Sie kann im Windows-Infobereich weiterlaufen und neue Registrierungen melden. Windows-Benachrichtigungen müssen auf dem PC zugelassen sein. Ein optionaler Autostart lässt sich in der Verwaltung einschalten.

Wenn dein PC aus ist, offline ist oder die Verwaltungsapp vollständig beendet wurde, zeigt Windows in dieser Zeit keine neue Meldung dieser App. Die Registrierungen bleiben auf dem Server gespeichert und sind beim nächsten Verbinden wieder sichtbar. Für diesen Ablauf wird kein zusätzlicher E-Mail- oder Push-Anbieter benötigt.

## Was die Freigabe schützt

Der Download wird vom Server bei jedem neuen Abruf anhand der Anmeldung und des aktuellen Freigabestatus geprüft. Die APK liegt außerhalb des öffentlichen Webseitenordners. Es gibt keinen allgemein freigegebenen direkten Dateilink.

Auch die Discord-Funktionen der App prüfen den aktuellen Zugang auf dem Server. Eine weitergegebene APK lässt sich technisch installieren; das bedeutet aber keine Freigabe für den Modstempel-Dienst. Wird ein Konto gesperrt, werden nachfolgende geschützte Anfragen abgelehnt, auch bei einer bereits vorhandenen Anmeldung. Bereits an Discord übertragene Meldungen oder schon heruntergeladene Dateien werden durch die Sperre nicht zurückgerufen.

Bei fehlender Verbindung wird keine neue Freigabe angenommen. Der lokale Verlauf bleibt erhalten. Das Smartphone speichert keinen Bot-Token, kein Discord-Client-Secret und keine Betreiber-Zugangsdaten. Die Windows-App schützt ihren eigenen Sitzungsschlüssel mit Windows DPAPI.

## Einmalige Einrichtung auf deinem Server

Die bisherige Docker/Caddy-Einrichtung wird weiterverwendet. Ergänzend nötig sind:

1. **Deine Discord-Konto-ID:** in der privaten Datei `server/.env` als `OWNER_DISCORD_ID` eintragen. Gemeint ist dein Benutzerkonto, keine Rolle und keine Discord-Server-ID. Nur dieses Konto kann freigeben. Ohne gültige Betreiber-ID bleibt der Dienst für Anmeldungen nicht eingerichtet.
2. **Zwei OAuth-Rücksprungadressen:** in derselben Discord-Anwendung beide URLs freigeben, jeweils mit deiner echten Domain:

   ```text
   https://modstempel.deine-domain.de/oauth/callback
   https://modstempel.deine-domain.de/portal/callback
   ```

3. **APK auf dem Server:** die neue Datei als `server/releases/Modstempel-2.1.0.apk` ablegen. Docker bindet dieses Verzeichnis schreibgeschützt ein; der Node-Dienst bedient daraus ausschließlich den geschützten Download. Die APK gehört nicht in `server/public`.
4. **Website und API starten:** im Serververzeichnis nach vollständig ausgefüllter `.env` den Docker-Verbund bauen und starten. Die Hauptadresse zeigt nun das Registrierungsportal.
5. **Verwaltung am PC verbinden:** die echte HTTPS-Adresse eingeben und dich mit dem unter `OWNER_DISCORD_ID` festgelegten Discord-Konto anmelden. Für dich als Betreiber ist der Zugang automatisch vorhanden.
6. **Mit einem zweiten Konto prüfen:** registrieren, Wartestatus und gesperrten Download kontrollieren, in der PC-App freigeben, Download und Android-Anmeldung testen. Anschließend eine Sperre prüfen.

Du brauchst weiterhin eine eigene Discord-Anwendung mit Bot, einen laufenden HTTPS-Server und die private Serverkonfiguration. Das gelieferte Paket konfiguriert oder bucht keine Hosting- oder Discord-Konten automatisch. Die Domain in den Beispielen ist ein Platzhalter und wird durch deine tatsächliche Adresse ersetzt.

## Update der Android-App

Die APK 2.1.0 wird mit derselben Android-Signatur wie die bisherige Version 2.0.0 gebaut. Sie kann deshalb als Update über die vorhandene App installiert werden. Die alte App vorher nicht deinstallieren, damit der lokale Verlauf und die Bilddateien erhalten bleiben.

Die Android-App 2.1 erwartet einen Server mit der neuen Freigabefunktion. Ein alter 2.0-Server muss zuerst aktualisiert werden. Vorhandene normale Discord-Anmeldungen erhalten durch das Serverupdate keine automatische Nutzerfreigabe; sie benötigen ebenfalls eine Registrierung und deine Entscheidung. Das Betreiberkonto wird allein durch die Serverkonfiguration festgelegt.

Die APK ist eine Android-Anwendung. Die Registrierungswebseite lässt sich auch auf anderen Geräten öffnen; daraus entsteht keine iPhone-App.

## Betrieb und Sicherungen

Der Server speichert Registrierungen, Status und Entscheidungen dauerhaft zusammen mit den bisherigen App-Daten. Für eine vollständige Sicherung gehören das Datenvolume, die private `.env` mit dem unveränderten Verschlüsselungsschlüssel und die gewünschte APK-Version zusammen. Der Android-Signierschlüssel bleibt separat privat und wird nicht auf dem öffentlichen Server und nicht im Quellcodepaket verteilt.

Für den kleinen VPS bleibt eine einzelne schreibende Serverinstanz vorgesehen. Die Anzahl aktiver Nutzer, Anfragen und Bilder bestimmt den Ressourcenbedarf. Dieses Paket enthält keinen gemessenen Kapazitätsnachweis für eine bestimmte Zahl von Discord-Servern.

## Prüfstand

Der konkrete ausgeführte Prüfumfang und die verbleibenden Betriebsprüfungen stehen in `PRUEFUNG-2.1.md`. Tests mit simulierten Discord-Antworten bestätigen keine bereits erfolgte Einrichtung deines echten Servers oder Bots.

Technischer API-Vertrag: `contracts/access-v2.1.md`. Die grundlegende Discord-/Docker-Konfiguration steht in `server/README.md`; die PC-Anleitung in `desktop/README.md`.
