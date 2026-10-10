# Crazy_Batto Discord App – Server 2.2.0

Dieser Server verbindet die **Crazy_Batto Discord App** über Discord-Anmeldung und einen Discord-Bot mit den ausgewählten Servern. Version 2.2 ergänzt eine öffentliche Webseite mit selbst hochladbaren Bildern und bearbeitbaren Inhalten. Registrierung, APK-Download nach persönlicher Freigabe und Windows-Verwaltung gehören zum selben Server. Die App kann nach der Freigabe Kanäle und eine Moderatorrolle auswählen, Stempelmeldungen und Beiträge senden, Umfragen anlegen und echte Discord-Events erstellen. Er verwendet keine Discord-Webhooks.

Das Paket enthält den funktionsfähigen Servercode, Tests und die vorbereitete Docker/Caddy-Konfiguration. **Eine eigene Discord-Anwendung, ihre Zugangsdaten und eine erreichbare HTTPS-Adresse müssen vom Betreiber eingerichtet werden.** Die APK enthält weder Bot-Token noch Client-Secret und simuliert bei fehlender Einrichtung keine Anmeldung oder Zustellung.

## 1. Betrieb vorbereiten

Vorgesehener Betrieb: ein Linux-Container mit Node.js 24 und eine einzelne Serverinstanz je Datenverzeichnis. Unter Windows startet `start-server.cmd` denselben Linux-Docker-Verbund. Dafür muss Docker mit Compose bereits eingerichtet sein. Direkter Windows-Node-Betrieb ist nicht freigegeben; die dauerhaft gespeicherten Bestätigungen verwenden Linux-Dateisystemoperationen einschließlich Verzeichnis-`fsync`.

Benötigt werden ein eigener Host, eine darauf zeigende Domain beziehungsweise Subdomain und für Caddy erreichbare Ports 80/443. Caddy übernimmt das HTTPS-Zertifikat. Die mitgelieferte Adresse `modstempel.example.com` ist ein Platzhalter.

Im Verzeichnis `server` die Datei `.env.example` als `.env` kopieren. Folgende Werte eintragen:

| Variable | Inhalt |
|---|---|
| `PUBLIC_HOST` | Eigener DNS-Hostname, beispielsweise `modstempel.deine-domain.de` |
| `PUBLIC_ORIGIN` | Dieselbe Adresse mit `https://`, ohne Unterpfad, Query oder Fragment |
| `ACME_EMAIL` | Eigene Kontaktadresse für die Zertifikatsverwaltung |
| `DISCORD_CLIENT_ID` | Application ID der eigenen Discord-Anwendung |
| `DISCORD_CLIENT_SECRET` | Client Secret derselben Anwendung |
| `DISCORD_BOT_TOKEN` | Bot-Token derselben Anwendung |
| `OWNER_DISCORD_ID` | Deine eigene Discord-Benutzer-ID; ausschließlich dieses Konto verwaltet die Freigaben |
| `TOKEN_ENCRYPTION_KEY` | Einmalig erzeugter geheimer Schlüssel aus 64 Hex-Zeichen |
| `APK_VERSION` | Bereitgestellte Version, hier `2.2.0` |

Die APK `Crazy_Batto-Discord-App-2.2.0.apk` gehört in den privaten Ordner `server/releases`. In Docker wird dieser Ordner schreibgeschützt unter `/releases` eingebunden. Die Datei wird ausschließlich durch `/portal/download` mit gültiger Browser-Anmeldung und aktueller Freigabe ausgeliefert. Im direkten Node-Betrieb kann `APK_PATH` auf eine andere feste private Datei zeigen. Ohne vorhandene APK bleibt die Website bedienbar; ein freigegebener Nutzer sieht dann, dass der Download noch vorbereitet wird.

Einen Verschlüsselungsschlüssel mit Node erzeugen:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Den ausgegebenen Wert in `.env` eintragen und privat sichern. Er muss bei Updates unverändert bleiben, damit vorhandene Discord-Anmeldungen lesbar bleiben. `.env` gehört weder in die APK noch ins Quellcodearchiv oder ein Git-Repository. Docker übernimmt die Laufzeitwerte über `env_file`; die Datei wird nicht in das Image kopiert.

## 2. Eigene Discord-Anwendung einrichten

Im [Discord Developer Portal](https://discord.com/developers/applications) eine eigene Anwendung mit Bot erstellen beziehungsweise eine bewusst dafür ausgewählte eigene Anwendung verwenden. Application ID, Client Secret und Bot Token müssen zusammengehören.

Unter OAuth2 **exakt beide** Redirect-Adressen eintragen, angepasst an den eigenen Host:

```text
https://modstempel.deine-domain.de/oauth/callback
https://modstempel.deine-domain.de/portal/callback
```

Die Anmeldung fordert `identify`, `guilds` und `guilds.members.read` an. Sie öffnet Discord im externen Browser. Der Authorization Code wird am HTTPS-Callback auf diesem Server getauscht. OAuth-State, Browser-Cookie und PKCE binden den Vorgang; das Handy erhält anschließend eine eigene App-Sitzung über seinen privaten Geräte-Verifier. Es handelt sich um einen eigenen Anmeldeablauf mit Geräteabholung, nicht um einen angenommenen Discord Device Grant.

Bei der Anwendung die Installation im Serverkontext ermöglichen. Der in der App angebotene Installationslink verwendet `bot applications.commands` und `integration_type=0`. Ein Serververwalter muss den Bot einmal zum gewünschten Server hinzufügen. Anmeldung allein installiert ihn noch nicht. Für diese REST-Funktionen ist keine Verbindung zum Gateway und keine vollständige Mitgliederliste erforderlich.

Angeforderte Bot-Rechte:

- Kanäle ansehen und Nachrichten senden;
- Links einbetten und Dateien anhängen;
- Nachrichtenverlauf lesen und Umfragen senden;
- `@everyone`, `@here` und Rollen erwähnen;
- Events erstellen.

Die Installationsmaske lautet `580542139714560`. Administrator, Rollenverwaltung und Webhook-Verwaltung werden nicht angefordert. Kanalüberschreibungen können einzelne Rechte trotz Installation verhindern.

## 3. Server starten

Mit fertig ausgefüllter `.env` im Serververzeichnis:

```sh
docker compose up --build -d
docker compose ps
```

Unter Windows kann dafür `start-server.cmd` geöffnet werden. Caddy veröffentlicht den Node-Dienst über HTTPS; der interne Port 8080 wird nicht auf dem Host veröffentlicht. Das Image installiert nur die kleine Linux-Laufzeitkomponente `util-linux` für die Dateisperre, keine npm-Pakete.

Im Browser die eigene Adresse mit `/health` öffnen. Eine eingerichtete Konfiguration ergibt:

```json
{"ok":true,"app":"Modstempel","displayName":"Crazy_Batto Discord App","apiVersion":2,"appVersion":"2.2.0","accessControl":true,"siteContent":true,"configured":true}
```

`configured:true` bedeutet, dass die erforderlichen lokalen Einstellungen vorhanden und syntaktisch gültig sind. Die echten Discord-Zugangsdaten und Rechte werden bei Anmeldung, Serverauswahl und Aktionen geprüft. Ohne Konfiguration bleibt der HTTP-Dienst erreichbar und meldet `configured:false`; Authentifizierungsaktionen liefern `unconfigured`.

Die Hauptadresse zeigt die öffentliche Vorstellung; `/portal` zeigt die Registrierungswebseite. Neue Nutzer wechseln von dort zur Discord-Anmeldung und senden ihre Zugangsanfrage. In der Windows-App meldest du dich mit der unter `OWNER_DISCORD_ID` festgelegten Identität an und gibst die Anfrage frei. Die Person kann anschließend die APK im Portal herunterladen. Nach der Portal-Anmeldung führt die Rückleitung wieder nach `/portal`.

In der Crazy_Batto Discord App unter **Einstellungen → App-Verbindung** die eigene `https://…`-Adresse ohne Unterpfad eintragen. Dann mit dem freigegebenen Discord-Konto anmelden, den angezeigten Gerätecode zuordnen und zur App zurückwechseln. Danach Server und Kanal auswählen. Die Moderatorrolle legt ein Serververwalter fest.

Für lokalen Linux-Entwicklungsbetrieb ohne Docker:

```sh
npm start
```

Dieser Befehl lädt eine vorhandene `.env`. Ohne `.env` läuft nur der Zustand „nicht eingerichtet“. Ein direkter Linux-Dienst braucht für den Handy-Zugriff ebenfalls einen korrekt eingerichteten HTTPS-Proxy. `TRUST_PROXY=1` nur hinter dem eigenen Proxy setzen; Compose erledigt das im privaten Docker-Netz.

## 4. Berechtigungen und Zielgruppen

Vor den Discord-Berechtigungen wird der persönliche App-Zugang geprüft. Nur `approved` erlaubt normale App-Routen; der konfigurierte Betreiber ist automatisch zugelassen. Der Status kann auch vor Freigabe über `/v2/session` und im Portal gelesen werden. Nicht freigegebene Nutzer erhalten HTTP403 mit `kind:"access"`. Eine bestehende Anmeldung und eine weitergegebene APK umgehen diese Prüfung nicht. Eine Sperre wird erneut vor jeder einzelnen Discord-Schreibphase geprüft.

Nur der Betreiber darf Registrierungen verwalten. Die Endpunkte unter `/v2/admin/` verlangen seine gültige App-Sitzung und bei Entscheidungen die aktuelle Datensatzversion. Portalmutationen verwenden ein HttpOnly-/Secure-Cookie, einen CSRF-Token und eine Prüfung des Browser-Ursprungs. Das Portal stellt weder App-Sitzungsschlüssel noch Bot-Zugangsdaten für JavaScript bereit. Der [Vertrag zur Registrierung und Freigabe](../contracts/access-v2.1.md) dokumentiert alle Routen.

Der Server prüft bei jeder Aktion **die aktuellen Rechte des angemeldeten Nutzers und des Bots**. Er berechnet Guild-Rollen, `@everyone`- und Mitgliedsüberschreibungen des gewählten Kanals sowie Timeout- und Beitrittsstatus. Eine App-Anmeldung erweitert die Rechte des Discord-Kontos nicht.

| Bereich | Empfänger / Voraussetzung |
|---|---|
| Modstempel einschließlich Stempeln | Ausschließlich die bestätigte Moderatorrolle wird erwähnt; Stempeln zusätzlich nur für Rollenmitglieder oder Serververwalter |
| Stream | `@everyone`, feste drei Teilnahmeantworten |
| BIG Match | `@everyone` |
| Allgemein | `@everyone` |
| Umfrage | `@everyone`, 2–10 eigene Antworten |
| Events | Echtes externes Discord-Event; kein zusätzlicher Kanalpost oder Ping |

Erwähnungsrechte bleiben zusätzlich erforderlich. Eine Rolle muss erwähnbar sein oder Nutzer und Bot benötigen das entsprechende Erwähnungsrecht. Ein Rollen-Ping beschränkt nicht die Sichtbarkeit der Nachricht; die Sichtbarkeit bestimmt der ausgewählte Discord-Kanal.

Die Kanalauswahl unterstützt Text- und Ankündigungskanäle. Unsichtbare Kanäle werden Nutzern nicht offengelegt. Server ohne Bot werden mit fehlender Einrichtung angezeigt. Moderatorrollen werden anhand ihrer bestätigten ID gespeichert, nicht anhand ihres Namens. Wiederholungen bleiben an das ursprüngliche Konto, den Server, Kanal und die ursprüngliche Rollen-ID gebunden.

## 5. Öffentliche Webseite und eigene Bilder

Unter `/` und `/index.html` erscheint die neue Marmor-Gold-Webseite aus `public/showcase`: Startseite, altes Setup, Gaming-Setup, Batto OBS Tool, Discord-App und Registrierung. Die sechs HTML-Seiten und ihre fest zugelassenen Dateien unter `/assets/` werden ausdrücklich geroutet; Arbeitsmaterial und APK-Dateien gehören nicht in diesen öffentlichen Ordner. `/portal`, `/portal/` und `/registrierung.html` zeigen dieselbe neue Registrierungsansicht. Discord-Anmeldung, persönliche Freigabe und privater Download verwenden weiterhin die bestehenden `/portal/`-APIs; die OAuth-Rückleitung führt nach `/portal`.

Die vorhandene, mit der PC-Verwaltung bearbeitbare CMS-Ansicht bleibt unter `/site` und `/site/` erreichbar. Sie ist von der neuen sechsseitigen Vorstellung getrennt: Änderungen über die bisherigen `/v2/admin/site`-Routen verändern die CMS-Ansicht, nicht die statischen Showcase-Vorlagen. `GET /site/api/content` liefert weiterhin ausschließlich die zuletzt veröffentlichte CMS-Fassung. Die CMS-Vorlage vom **09.10.2026** enthält unter **Über mich** das Originalporträt `ich.jpeg` und die vier gelieferten Zeilen zu Crazy_Batto, Team TABH, Alter und Content-Themen. Setup, andere Apps und Social Links bleiben dort frei.

Beim erstmaligen Anlegen der Website übernimmt der Server `site-default.json` und das referenzierte Bild aus `site-default-images`. Das Porträt wird als normales verwaltetes Bild gespeichert und zählt zum Bildspeicher. Die Quelldateien haben keine öffentliche Webadresse. Vorhandene Website-Daten und Entwürfe werden bei einem Update nicht ersetzt; dort setzt der Betreiber die neuen Inhalte über die PC-Verwaltung und veröffentlicht sie selbst. Das Website-Inhaltsupdate ändert keine Versionsnummer: App, Server und Windows-Verwaltung bleiben bei **2.2.0**; eine neue APK ist nicht nötig.

Die Windows-Verwaltung verwendet die Betreiber-Routen unter `/v2/admin/site`. Sie kann Entwürfe lesen und speichern, den gespeicherten Entwurf veröffentlichen sowie Bilder hochladen, anzeigen und entfernen. Die Inhalte bestehen aus Klartext, Komponentenlisten, Bildzuordnungen und geprüften HTTPS-Links. Fremde HTML-/SVG-Dateien und beliebige Bildquellen werden nicht eingebettet.

Websitebilder sind JPG, PNG oder WebP bis 4 MiB und 32 Millionen Pixel; der gesamte Speicher ist auf 100 MiB und 100 eigene Uploads begrenzt. Der Server prüft Größe, Format, Container und Abmessungen. Er speichert die Originalbytes privat unter `DATA_DIR/site-images`. Der ursprüngliche Dateiname wird nicht zum Dateipfad und bleibt ein Verwaltungsmetadatum.

Nur Bilder der veröffentlichten Fassung sind über `/site/media/:id` verfügbar. Bei einer neuen Website gehört das Porträt zur übernommenen Anfangsfassung. Entwurfsbilder bleiben öffentlich nicht abrufbar. Ein Bild kann nur gelöscht werden, wenn es weder im gespeicherten Entwurf noch in der veröffentlichten Fassung benutzt wird. Ein später entferntes Porträt wird beim Neustart nicht erneut importiert. Speichern und Veröffentlichen verlangen eine passende Inhaltsversion und werden vor dem Commit erneut auf Betreiberrechte geprüft. Die Websitebearbeitung erzeugt keine Discord-Nachrichten und ändert keine Nutzerfreigaben.

Der [Websitevertrag](../contracts/site-v2.2.md) beschreibt alle Felder und Grenzen. Die [Anleitung zur Bilderverwaltung](../NEU-IN-2.2.md) erklärt den Ablauf am PC; [WEBSITE-PORTRAET.md](../WEBSITE-PORTRAET.md) beschreibt das aktuelle Inhaltsupdate und seinen Prüfstand. Das Docker-Image enthält die statischen Website-Dateien, `site-default.json` und `site-default-images`; die veränderlichen Inhalte und Bilder liegen im bestehenden Datenvolume.

## 6. Bilder, Umfragen und Events

Bilder: JPEG, PNG oder WebP bis 8 MiB, höchstens 8192 Pixel je Seite und 32 Millionen Pixel insgesamt. Dateihash, Format, Größe und Abmessungen werden mit den übergebenen Metadaten abgeglichen. Gespeicherte Dateien werden vor erneutem Upload nochmals geprüft.

Bei **Bild und Umfrage** entstehen zwei Discord-Nachrichten: zuerst Bild und Details, anschließend die Umfrage. Nur die erste Nachricht erwähnt die Zielgruppe. Ein bestätigtes Bild wird vor dem Umfrageversand dauerhaft gespeichert; ein Umfrage-Retry wiederholt den Bild-Upload nicht.

Die App-Umfragen erlauben 1–168 Stunden, Fragen bis 300 Zeichen und Antworten bis 55 Zeichen. Ergebnisse werden in einer bereinigten Discord-Struktur zurückgegeben. Fehlende Stimmenzahlen bleiben unbekannt; zuvor bekannte Werte können als veraltet erhalten bleiben.

Server-Events verwenden `EXTERNAL`, einen Ort, Beginn und Ende sowie `privacy_level:2`. Der Beginn muss in der Zukunft und das Ende danach liegen. Die App sendet Zeiten als Epoch-Millisekunden; der Server wandelt sie für Discord in ISO8601 um. Nutzer und Bot benötigen `CREATE_EVENTS`. Ein Event wird nicht automatisch durch eine zusätzliche Nachricht angekündigt.

## 7. Zustellung, Wiederholung und Daten

Aufträge werden mit unveränderlicher ID und geprüfter Kontoidentität angenommen. Bereits bestätigte Aufträge mit derselben ID geben die gespeicherte Bestätigung zurück. Andere Inhalte unter derselben ID werden abgelehnt. Statusabfragen versenden nichts.

Jede externe Schreibphase wird vor dem Discord-POST atomar als `sending` gespeichert. Nach einem Prozessabbruch wird eine unbestätigte Phase `uncertain`. Solche Aufträge werden nur nach bewusster Bestätigung wiederholt. Discord-Nonce und `enforce_nonce` ergänzen die dauerhaft gespeicherte Idempotenz; die kurze Discord-Deduplizierung ersetzt sie nicht.

Bekannte 429-Antworten und eindeutig vor dem Verbindungsaufbau gescheiterte Übertragungen bleiben mit Wartezeit erneut versuchbar. Globale Discord-Limits sperren auch andere Bot-Routen bis zum angegebenen Zeitpunkt. Ein definitiver Fehler bleibt fehlgeschlagen und benötigt einen ausdrücklichen Retry. Eine alte Fehlermeldung blockiert keinen unabhängigen neuen Auftrag.

Die private Datei `modstempel.json` enthält Konten, verschlüsselte OAuth-Anmeldungen, Sitzungsverweise, Registrierungen, Freigabeentscheidungen mit Prüfprotokoll, Rolleneinrichtung, Auftragsbestätigungen und die Websitefassungen. Discord-Beitragsbilder liegen daneben im Ordner `images`, selbst hochgeladene Websitebilder im Ordner `site-images`. Beide Bildordner gehören zur vollständigen Datensicherung. Dateirechte: Datenverzeichnis `0700`, private Nutzdaten `0600`. Schreiben erfolgt über temporäre Datei, Datei-`fsync`, atomaren Rename und Verzeichnis-`fsync`.

Vorhandene Daten aus Server2.0 werden beim Start ergänzt, ohne Konten automatisch freizugeben. Bereits bekannte normale Nutzer sind zunächst `unregistered`. Eine Registrierung ist pro Discord-Konto eindeutig. Wiederholtes Absenden ändert abgelehnte oder gesperrte Einträge nicht; nur der Betreiber kann diese später freigeben. Anträge und Entscheidungen bleiben gespeichert. Es gibt derzeit keine automatische Löschung des Prüfprotokolls oder alter Bilddateien.

Compose speichert diese Daten im Volume `modstempel_data`. Die Docker-Startsequenz hält eine exklusive OS-Dateisperre mit `flock`, zusätzlich prüft der Dienst seine Prozesssperre. **Eine Instanz pro Datenverzeichnis betreiben; keine verteilten Netzlaufwerke oder mehrere Schreibdienste einsetzen.**

Für ein konsistentes Backup den Dienst stoppen und das gesamte Datenvolume sowie die dazugehörige private `.env` beziehungsweise den Verschlüsselungsschlüssel sichern. Bei Updates diese Daten beibehalten. `docker compose down -v` löscht Volumes und ist kein Updatebefehl. Abmelden in der App widerruft die betreffende App-Sitzung; es entfernt den Bot nicht vom Discord-Server.

Vorübergehende Fehler beim OAuth-Refresh, einschließlich HTTP503, beschädigter Antworten oder 429, erhalten bestehende Tokens und App-Sitzungen. Erst eine bestätigte Ablehnung der Anmeldung macht eine neue Anmeldung erforderlich.

## 8. Tests und Prüfgrenzen

```sh
npm test
```

Die Tests verwenden die echten Validatoren, Permission-Berechnung, OAuth-Gerätebindung, HTTP-Routen, Multipart-Verarbeitung und Dateipersistenz. Ausschließlich der Aufruf von Discord wird durch einen lokalen Fetch-Ersatz beantwortet. Es werden keine echten Discord-Zugangsdaten benötigt oder Nachrichten gesendet.

Geprüft werden unter anderem State-/Cookie-/Verifier-Verwechslung, einmalige Sessionerzeugung mit begrenztem Claim-Replay, verschlüsselte Tokens, fremde Konten und Kanäle, Timeouts, doppelte Aufträge, Teilbestätigungen nach Neustart, unbekannte Zustellung, verlorene Speicherbestätigung, 429-Wartezeiten, Bildbyte-Erhalt, rohe Umfrageergebnisse und externe Events. Zusätzliche Projektprüfungen verbinden den echten App-Core mit diesen Servervalidatoren.

Der Node-Kern und lokale HTTP-Integration wurden hier ausgeführt. Die Compose-Datei wurde strukturell gelesen; **ein Docker-Image-Build, öffentliches HTTPS, eine echte Discord-Anmeldung und ein realer Bot-Versand wurden in dieser Umgebung nicht ausgeführt**. Diese letzte Prüfung benötigt die Einrichtung des Betreibers.

## Primäre technische Referenzen

- [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2)
- [Discord Mobile-Account-Linking / PKCE](https://docs.discord.com/developers/discord-social-sdk/development-guides/account-linking-on-mobile)
- [Discord Berechtigungen](https://docs.discord.com/developers/topics/permissions)
- [Discord Nachrichten und Erwähnungen](https://docs.discord.com/developers/resources/message)
- [Discord Server-Events](https://docs.discord.com/developers/resources/guild-scheduled-event)
- [Discord Umfragen](https://docs.discord.com/developers/resources/poll)
- [Discord Rate Limits](https://docs.discord.com/developers/topics/rate-limits)
- [Docker Compose](https://docs.docker.com/compose/gettingstarted/)
- [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https)

Dokumentationsstand: 9. Oktober 2026.

### Originale Header-Animation im Git-Backup

Das unveränderte Header-GIF liegt im Repository in zwei geprüften Binärteilen
unter `server/media-parts`. Das Medienmanifest enthält Größen und SHA-256-Werte.
`npm start` und `npm test` setzen es bei Bedarf automatisch wieder zusammen;
der Docker-Build führt denselben Schritt vor dem schreibgeschützten Betrieb aus.
Bei einem direkten Start mit `node src/index.mjs` vorher einmal
`npm run prepare:website` ausführen. Es werden keine Medien aus dem Internet geladen.
Der Website-Build `python3 website/quellcode/build.py` stellt auch die lokale
Webseitenkopie wieder her, falls das GIF nach einem Checkout noch fehlt.
