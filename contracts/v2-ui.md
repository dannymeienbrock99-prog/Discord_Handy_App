# Verbindlicher UI/Core-Vertrag V2

Native Bridge CamelCase laut v2.md, umgesetzt durch Native-Agent. Root implementiert `web/core-v2.js`. index.html lädt `bridge.js`, bisherige `core.js` (nur reine Hilfsfunktionen), dann `core-v2.js`, dann neue `ui.js`. `window.Modstempel` ist die neue App. Der alte Core wird NICHT initialisiert; er ist kein Versandweg.

## Snapshot

`{ready,now,storageError,profile,auth,selection,guilds,guildSetup,scheduledEvents,activeSession,sessions,events,posts,eventOperations,legacyEvents,totals,networkBusy,imageBusy,platform:{native},jsonExportAvailable}`

- profile: `{name,team,accent,theme}`. Discord-Identität zeigt auth.user; profile.name nur alter/lokaler Name, kein verifizierter Discord-Name. Optional Team/Design einstellbar; neue Dienste verwenden auth.user.displayName und gewählten Server als Team.
- auth: `{configured,origin,serverReady,authenticated,user?,expiresAt?,pendingLogin?,message?}`. configured ist gültige lokal gespeicherte Backend-Adresse. serverReady false bedeutet fehlende Discord-Konfiguration auf dem Server, null unbekannt/offline. pendingLogin `{expiresAt,displayCode,intervalMs}`. Keine Secrets.
- selection: `{guildId,guildName,channelId,channelName,moderatorRoleId,moderatorRoleName}` oder leere Strings. Nicht mit dem eingefrorenen Ziel eines laufenden Diensts verwechseln.
- guilds: Serverobjekte aus v2.md, guildSetup: Setup aus Backend oder null. `canConfigure`, `botReady`, `canCreateEvents`, `roles`, `channels` und `moderatorRoleId` hier beachten.
- sessions: neueste zuerst, bestehende Zeitfelder plus `{name,team,activeMs,pauseMs,totalMs,target?,legacy}`. target enthält `{origin,actorId,guildId,guildName,channelId,channelName,moderatorRoleId,moderatorRoleName}`. Bei altem laufendem Dienst `legacy:true`: lokal pausieren/fortsetzen/beenden, kein Discord-Versand. Neues Stempeln verlangt Konto + Ziel + Modstempel-Berechtigung.
- events: neue Aufträge, neueste zuerst. `{id,type,category,title,createdAt,status,stage,error,target,operation,submitted,result?,nextAttemptAt,imageMessageId?,imageChannelId?,messageId?,channelId?,eventId?,url?,imageUrl?,poll?,legacyLocal?}`. Typ `post`, `stamp` oder `scheduled_event`; stamp-Aktion in `operation.data.action`, Titel bereits passend. Legacy-lokaler Zeitabschluss kann operation:null haben. Status gemäß v2.md. Keine Webhook-Referenzen an neue APIs übergeben.
- posts: events mit type post; eventOperations: events mit type scheduled_event.
- scheduledEvents: tatsächlich vom Server geladene Termine, getrennt vom Auftragsverlauf.
- legacyEvents: frühere v1-Stempel/Anfragen mit `legacy:true` und erklärendem legacyNotice, unveränderten Originalfeldern. Als Archiv nur lesen; keine Retry-/Sende-Aktion dafür anbieten.
- totals: `{todayMs,todayPauseMs,weekMs,sessionCount}` wie bisher.

## Methoden (Promises soweit Aktion)

- `init()`, `getSnapshot()`, `subscribe(fn)`, `dispose()`.
- `configureBackend(url)`: URL lokal konfigurieren/Status prüfen, niemals Bot-Token entgegennehmen.
- `login()`: auth_begin und externen Browser starten; noch kein Anmeldeerfolg.
- `pollLogin()`: einmalige Statusabfrage; Rückgabe aktualisierter Snapshot. Core pollt während seiner Laufzeit auch selbst nach intervalMs bis Abschluss/Ablauf. UI kann **Anmeldung prüfen** aufrufen, nach Browser-Rückkehr ebenfalls.
- `cancelLogin()`, `logout()`.
- `loadGuilds()`, `selectGuild(guildId)`, `selectChannel(channelId)`, `setModeratorRole(roleId)`, `installBot()`. selectGuild lädt Setup und setzt erst danach Auswahl. Rollenänderung nur bei canConfigure. installBot öffnet die native validierte Discord-Installationsseite, behauptet keine Installation; anschließend Setup erneut laden über selectGuild.
- `saveSettings({team?,accent?,theme?})`.
- `start(note?)`, `pause()`, `resume()`, `finish(note?)` wie bisher. Nur start benötigt vollständige neue Einrichtung; ein laufender Dienst bleibt lokal bedienbar.
- `preparePost(input)` ist synchron und rein. Eingabe `{category,title,text,startsAt?,poll?,image?}`. stream nutzt bekannte drei Antworten automatisch, poll braucht `{question,answers:[2..10 strings],durationHours}`. stream nimmt optionale poll.durationHours oder24. Kategorien siehe v2.md; UI-Texte Modstempel, Stream, BIG Match, Allgemein, Umfrage. Nur stream/poll haben Umfragen.
- `prepareEvent(input)` synchron/rein: `{title,description,startsAt,endsAt,location}`. Epoch-Millis. Echte externe Discord-Veranstaltung, keine zusätzliche Kanalnachricht und kein @everyone-Ping.
- Beide prepare-Funktionen liefern `{operation,target,title,mentionLabel,messageCount,image?}`. Der Dialog zeigt dieses unveränderliche Ziel/Objekt. Mit Bild+Poll messageCount2, sonst1. Events messageCount0 (ein Server-Event).
- `submit(prepared)` speichert exakt den vorbereiteten Auftrag lokal und startet Versand. Bei verändertem angemeldetem Konto/Backend-Origin ablehnen; ein geänderter UI-Kanal darf den eingefrorenen Auftrag nicht umleiten. Nach erfolgreichem lokalen Speichern Entwurf leeren, nicht erst nach Discord-ACK.
- `sync()` verarbeitet neue Aufträge beziehungsweise fragt ihren Status ab. Keine alten Webhook-Aufträge senden.
- `checkOperation(id)` liest serverseitigen Status ohne neue Veröffentlichung.
- `retry(id,acknowledgeUncertain=false)` expliziter Versuch desselben serverseitigen Auftrags. Bei uncertain vorher bestehende Bestätigung anzeigen und true übergeben. Keine neue ID, kein bestätigtes Bild doppelt senden.
- `markHandled(id)` erledigt nur die lokale Nachverfolgung und löscht keine Discord-Nachricht. Bei serverseitig sending nicht anbieten; bei uncertain erklärt UI, dass ein Auftrag bereits erfolgt sein kann.
- `refreshPoll(id)` aktualisiert rohe Poll-Daten; UI nutzt actual poll.answers und poll.results.answer_counts; fehlende Zahlen unbekannt.
- `openOperation(id,part?)`: part `image` öffnet Bildnachricht, sonst bestätigte letzte Nachricht/Event über Native open_discord. Native braucht keine freie URL.
- `loadScheduledEvents()` lädt Termine für Auswahl; `openScheduledEvent(eventId)` öffnet Discord-Event.
- `pickRequestImage()`, `discardRequestImage(ref)`, `requestImageUrl(image)` wie bisher.
- `exportData('json'|'csv')`; JSON enthält auch legacyArchive und neue Aufträge, keine Secrets/Bildbytes.

## Prüfung / Hinweise

Core wirft verständliche deutsche Fehler, UI fängt sie ab. Bot noch nicht installiert und fehlende Berechtigungen sind echte Setupzustände. Rollen-Erwähnung ist nicht gleich Kanalzugriffsbegrenzung. @everyone ist eine Erwähnung; Discord-Mitglieder können ihre Benachrichtigungseinstellungen beeinflussen.

Keine frei konfigurierbaren Mention-Schalter. Der Server setzt anhand der Kategorie genau die vereinbarte Erwähnung. Bei Bild+Poll nur einmal pingen. Frei geschriebene zusätzliche Erwähnungen lösen keine weiteren User-/Rollen-Pings aus.

Bildmetadaten/-grenzen unverändert. Beitragstext maximal1800, Titel120. Eigenständige Poll-Frage300, Antworten55 (2–10), Laufzeit1–168Stunden. Eventtitel100, Beschreibung1000, Ort100. Datumswerte Millisekunden, Anzeige lokale Gerätezeit mit Zeitzonenhinweis.
