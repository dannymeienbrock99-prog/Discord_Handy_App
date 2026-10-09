# Modstempel 2.1 – Registrierung und Betreiberfreigabe

API-Hauptversion bleibt 2. Zeitstempel sind Millisekunden seit Unix-Epoch.
`GET /health` enthält zusätzlich `appVersion:"2.1.0"` und `accessControl:true`.
Keine Passwörter und keine E-Mail-Pflicht: Registrierung mit bestätigtem Discord-Konto.
Der einzige Betreiber wird über `OWNER_DISCORD_ID` in der privaten Serverkonfiguration gesetzt.
Fehlt eine gültige ID, ist der Dienst `unconfigured` und erteilt niemandem Zugriff.
Der Betreiber hat automatisch Zugang. Discord-Serveradministratoren sind dadurch **keine** Betreiber.

## Zugriffstatus (gemeinsam für App und Portal)

```json
{"status":"pending","isOwner":false,"canUseApp":false,"version":1,"requestedAt":1791541800000,"updatedAt":1791541800000,"reviewedAt":null,"reason":""}
```

`status`: `unregistered`, `pending`, `approved`, `rejected`, `revoked`.
`version`: 0 bei unregistered und beim automatisch zugelassenen Betreiber; sonst positiv.
`requestedAt`, `updatedAt`, `reviewedAt`: Zeitstempel oder null. `reason`: Betreiberhinweis oder leer.
`isOwner` stimmt ausschließlich für die konfigurierte Discord-ID.
`canUseApp` ist nur für `approved` wahr.

`GET /v2/session` (Bearer) antwortet `{ok:true,user,expiresAt,access}`.
Anmeldung, Claim, Sessionstatus und `POST /v2/auth/logout` sind auch vor Freigabe nutzbar.
Normale App-Routen prüfen die Freigabe bei jedem Aufruf und erneut vor externen Schreibaktionen.
Bei fehlender Freigabe: HTTP 403, `{ok:false,kind:"access",message:"…",access:{…}}`.
HTTP 401/kind auth bedeutet abgelaufene/ungültige Anmeldung, **nicht** fehlende Freigabe.
Weitergegebene APKs umgehen die serverseitige Sperre nicht.

## Browser-Portal

- `GET /` und `GET /portal` liefern die Website, öffentliche Assets liegen unter `/portal/assets/…`.
- `GET /portal/login` startet Discord OAuth. Zusätzlich zum Gerätecallback muss
  `https://DEIN-HOST/portal/callback` in derselben Discord-Anwendung freigegeben sein.
- `GET /portal/callback` verarbeitet nur den gebundenen Portal-Login und setzt
  `ms_portal=…; HttpOnly; Secure; SameSite=Lax; Path=/portal`. Redirect danach auf `/`.
  App-Tokens werden weder in URLs noch in JavaScript geschrieben.
- `GET /portal/api/session` antwortet bei nicht angemeldetem Besucher mit HTTP 200:

```json
{"ok":true,"configured":true,"authenticated":false,"user":null,"access":null,"csrfToken":null,"expiresAt":null,"download":{"available":false,"url":"/portal/download","filename":"Modstempel-2.1.0.apk","version":"2.1.0"}}
```

Angemeldet: `authenticated:true`, `user:{id,username,displayName,avatarUrl?}`,
`access` wie oben, `csrfToken` zufälliger String und `expiresAt` Zeitstempel.
`download.available` wird nur bei aktuellem Zugriff und vorhandener APK true.
`configured:false` bedeutet fehlende Server-/Betreiberkonfiguration; Details sind keine Secrets.

Mutationen müssen `Content-Type: application/json`, `X-CSRF-Token: <csrfToken>` und
browserseitig `credentials:'same-origin'` verwenden. Zusätzlich prüft der Server den
`Origin`-Header gegen PUBLIC_ORIGIN (fehlender/fremder Origin wird abgelehnt).

- `POST /portal/api/register`, Body `{ "note": "optional, maximal 500 Zeichen" }`.
  Antwort `{ok:true,access:{…}}`. Nur unregistered wird pending.
  Wiederholungen erzeugen keine zweite Anfrage und ändern rejected/revoked nicht.
  Kein Name, Passwort und keine E-Mail erforderlich; Identität stammt aus Discord.
- `POST /portal/api/logout`, Body `{}`. Antwort `{ok:true}`; Cookie wird gelöscht.
- `GET /portal/download` und `HEAD /portal/download`: Cookie-Sitzung und aktuelle
  Freigabe erforderlich. Feste private APK-Datei, kein freier Dateipfad, kein öffentlicher
  Download-Link und kein CDN-Cache. 401 ohne Sitzung, 403/kind access ohne Freigabe,
  503 wenn die APK auf dem Server noch nicht bereitliegt. Nach Sperre wird jeder neue
  Download und API-Aufruf verweigert; bereits heruntergeladene Bytes werden nicht gelöscht.

## Betreiber-PC-App (Bearer, ausschließlich Betreiber)

`GET /v2/admin/summary`:

```json
{"ok":true,"revision":3,"lastChangedAt":1791541800000,"pendingCount":1,"counts":{"pending":1,"approved":1,"rejected":0,"revoked":0},"latestPendingAt":1791541800000}
```

Poll z.B. alle 15 Sekunden; neue Anträge erhöhen `revision` und `pendingCount`.
Es wird kein externes Push-/E-Mail-System benötigt. Die PC-App muss laufen und erreichbar sein.

`GET /v2/admin/registrations?status=all&limit=100&offset=0`:

```json
{"ok":true,"revision":3,"counts":{"pending":1,"approved":1,"rejected":0,"revoked":0},"total":2,"nextOffset":null,"registrations":[{"userId":"111111111111111111","user":{"id":"111111111111111111","username":"name","displayName":"Anzeigename"},"status":"pending","version":1,"note":"Mein Stream-Team","reason":"","requestedAt":1791541800000,"updatedAt":1791541800000,"reviewedAt":null,"reviewedBy":null}]}
```

`status` ist `all` (Standard), `pending`, `approved`, `rejected` oder `revoked`.
`limit` 1–200 (Standard 100), `offset` nichtnegative Ganzzahl.
Sortierung: neue Anfragen zuerst, dann Discord-ID. `nextOffset` null bedeutet letzte Seite.

`POST /v2/admin/registrations/:userId/decision`, JSON:

```json
{"decision":"approve","expectedVersion":1,"reason":"optional, maximal 500 Zeichen"}
```

`decision`: `approve`, `reject`, `revoke`. Zulässige Übergänge:
`pending` -> approved/rejected; `approved` -> revoked;
`rejected`/`revoked` -> approved. Jede echte Entscheidung erhöht Datensatzversion und Revision.
Antwort `{ok:true,revision,registration:{…}}`. Bei inzwischen veränderter Version HTTP 409,
`kind:"conflict"`; Liste neu laden. Unbekannte Anfrage 404. Betreiberkonto darf nicht
per API geändert werden. Nichtbetreiber erhalten 403, auch nach bereits erfolgten Entscheidungen.
Alle Anträge und Entscheidungen werden mit Akteur, Zeit, alter/neuer Version und Status
atomar in der privaten Datenbank protokolliert und über Neustarts erhalten.

## Hosting

`OWNER_DISCORD_ID` ist die bestätigte Discord-ID des Betreibers, keine Rolle oder Guild-ID.
`APK_PATH` zeigt auf genau eine private reguläre Datei, standardmäßig `./releases/Modstempel-2.1.0.apk`.
Docker bindet `./releases` schreibgeschützt als `/releases` ein; die APK ist nie in `public`.
`APK_VERSION` standardmäßig `2.1.0`; der Downloadname ist `Modstempel-<Version>.apk`.
Ein Backend und eine Datenbank mit dem bestehenden exklusiven Schreiberschloss.
