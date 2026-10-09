# Crazy_Batto Discord App 2.2.0

**GitHub-Sicherung vom 10.10.2026:** Enthalten sind die Android-App-Quellen, Web-App, Verbindungsserver, Windows-Verwaltung und die Webseite mit dem aktuellen Porträt-/Vorstellungstext. Fertige Installationsdateien werden separat bereitgestellt. Für den geschützten App-Download siehe [server/releases/README.md](server/releases/README.md).

Android-App für Moderatorinnen, Moderatoren und Streamer: mit Discord anmelden, Server und Kanal auswählen, Dienste stempeln, Beiträge mit Bild veröffentlichen, Umfragen starten und echte Discord-Events anlegen.

**Version 2.2 heißt Crazy_Batto Discord App und ergänzt eine bearbeitbare öffentliche Webseite.** Die Website-Vorlage vom **09.10.2026** enthält unter **Über mich** dein Originalporträt und die vier von dir gelieferten Vorstellungszeilen. Setup, andere Apps und Social Links bleiben frei. In der Windows-Verwaltung kannst du Bilder und Texte selbst ergänzen oder ändern. Die Webseite zeigt nur Bereiche mit Inhalten. Das bereits bereitgestellte Originalbild `BAtto(3).jpeg` bleibt der Hintergrund.

Dieses Website-Inhaltsupdate benötigt **keine neue APK**. Android-App, Server und Windows-Verwaltung bleiben bei **2.2.0**. Ein erstmals eingerichteter Website-Datenspeicher übernimmt die Vorlage; vorhandene Website-Daten bleiben erhalten. Die kurze Anleitung und der aktuelle Prüfstand stehen in [WEBSITE-PORTRAET.md](WEBSITE-PORTRAET.md).

Neue Nutzer registrieren sich weiterhin mit Discord. Nach deiner Freigabe in der Windows-Verwaltung können sie die APK herunterladen und die App mit ihrem bestätigten Konto verwenden. Der Server prüft die Freigabe auch bei bestehenden Anmeldungen erneut.

Die APK enthält die vollständige App, aber keine vorkonfigurierten Discord-Zugangsdaten und keinen bereits betriebenen Verbindungsserver. Für die echte Anmeldung muss der mitgelieferte Server einmal eingerichtet und unter einer HTTPS-Adresse erreichbar gemacht werden. Die neue Website- und Bilderanleitung steht in [NEU-IN-2.2.md](NEU-IN-2.2.md); die Windows-App ist unter [desktop/README.md](desktop/README.md) beschrieben. [NEU-IN-2.1.md](NEU-IN-2.1.md) dokumentiert die Einführung der persönlichen Freigabe.

## Was enthalten ist

| Bereich | Funktion |
| --- | --- |
| Stempeln | Dienst starten, pausieren, fortsetzen und beenden; Nettozeit und Pausen getrennt |
| Beiträge | Modstempel, Stream, BIG Match, Allgemein und Umfrage; Titel, Nachricht und optionales Bild |
| Events | Echte externe Discord-Veranstaltung mit Titel, Beschreibung, Beginn, Ende und Ort oder Link |
| Verlauf | Dienste, Versandstatus, Event-Aufträge und schreibgeschütztes Archiv aus Version 1 |
| Einstellungen | App-Serveradresse, Discord-Anmeldung und Abmeldung, Server, Kanal, Moderatorrolle und Darstellung |
| Registrierung | Website mit Discord-Anmeldung, Zugangsantrag, Wartestatus und geschütztem APK-Download |
| PC-Verwaltung | Windows-App mit Anfragenliste, Freigeben, Ablehnen, Sperren und Benachrichtigungen im Infobereich |
| Öffentliche Webseite | Über mich, Setupgalerie, Komponenten, andere Apps und Links; sichtbar nach Befüllen und Veröffentlichen |
| Website bearbeiten | Eigene Bilder hochladen/zuordnen, Texte ergänzen, Entwurf speichern und gespeicherte Fassung veröffentlichen |

Das ursprüngliche violette Moderationslogo bleibt das Android-App-Symbol. Der sichtbare Appname lautet **Crazy_Batto Discord App**. Die Paketkennung `app.modstempel.mobile` und der ursprüngliche Signierschlüssel bleiben erhalten, damit die neue Version ein Update der vorhandenen App ist. **Modstempel** bleibt die Bezeichnung der Stempelfunktion und ihrer Beitragskategorie.

### Kategorien und Erwähnungen

| Kategorie | Empfänger der Erwähnung | Besonderheit |
| --- | --- | --- |
| Modstempel | Die in der Server-Einrichtung festgelegte Moderatorrolle | Genau diese Rolle wird erwähnt |
| Stream | `@everyone` | Anwesenheitsumfrage: „Bin dabei“, „Komme später“, „Kann heute nicht“ |
| BIG Match | `@everyone` | Ankündigung mit optionalem Termin und Bild |
| Allgemein | `@everyone` | Allgemeiner Beitrag mit optionalem Bild |
| Umfrage | `@everyone` | Eigene Frage, zwei bis zehn Antworten und einstellbare Laufzeit |
| Discord-Event | Keine zusätzliche Kanal-Erwähnung | Erstellt einen tatsächlichen Termin auf dem ausgewählten Server |

Die Moderatorrolle legt eine Person mit dem Discord-Recht „Server verwalten“ fest. Der Verbindungsserver prüft beim Veröffentlichen die Discord-Rechte sowohl des angemeldeten Kontos als auch des Bots. Für `@everyone` müssen die entsprechenden Erwähnungsrechte vorhanden sein. Das bloße Auswählen eines Kanals verleiht keine neuen Rechte.

Eine Rollen-Erwähnung begrenzt nicht, wer den Beitrag lesen kann. Dafür gelten die normalen Kanalberechtigungen in Discord. Ob eine Erwähnung zusätzlich eine Push-Benachrichtigung auslöst, hängt auch von den Einstellungen der Mitglieder ab. Siehe [Discord: Allowed Mentions](https://docs.discord.com/developers/resources/message#allowed-mentions-object).

## APK installieren oder aktualisieren

1. `Crazy_Batto-Discord-App-2.2.0.apk` auf einem Android-Gerät ab Android 8 öffnen und installieren. Neue Nutzer erhalten den Download auf der Registrierungswebseite nach Betreiberfreigabe.
2. Bei einer bereits installierten Modstempel-Version die neue APK als **Update darüber installieren**. Die bisherige App vorher nicht deinstallieren, damit ihre lokalen Daten erhalten bleiben.
3. Falls Android nachfragt, das Öffnen der APK für die verwendete Download-App erlauben.
4. Crazy_Batto Discord App öffnen und das Zahnrad für **Einstellungen** antippen.

Die APK ist für Android bestimmt. Ein iPhone kann eine Android-APK nicht installieren; dieses Paket enthält keine iOS-App. Die HTML-Dateien sind eine lokale Vorschau der Oberfläche und ersetzen auf dem iPhone keine fertige Anmeldung oder native App.

### Umstieg von Version 1

Beim ersten Start übernimmt Version 2 die vorhandenen Dienste einschließlich Pausen und Zeitständen. Die ursprünglichen Version-1-Daten werden vor der ersten Speicherung zusätzlich unverändert auf dem Gerät archiviert.

- Frühere Meldungen und Streamanfragen stehen im **Archiv aus Version 1**. Sie werden nicht nachträglich an einen neuen Bot oder Kanal gesendet.
- Ein noch laufender alter Dienst lässt sich lokal pausieren, fortsetzen und beenden. Diese Änderungen erzeugen keine neue Discord-Meldung für den alten Dienst.
- Neue Dienste und Beiträge benutzen ausschließlich die neue Discord-Anmeldung und das neu bestätigte Ziel.
- Bilder gespeicherter alter und neuer Aufträge werden nicht durch das Entfernen eines Bildes aus einem neuen Entwurf gelöscht.
- Der JSON-Export enthält den neuen Verlauf und das Version-1-Archiv. Bildreferenzen werden exportiert, die eigentlichen Bilddateien nicht. CSV enthält die Dienstzeiten.

## Einmalige Einrichtung für das Team

Die vollständige Anleitung steht in [`server/README.md`](server/README.md), die Website-Ergänzungen in [NEU-IN-2.2.md](NEU-IN-2.2.md). Zusätzlich zu den untenstehenden Schritten: deine Discord-Konto-ID als `OWNER_DISCORD_ID` eintragen, die zusätzliche Rücksprungadresse `/portal/callback` in Discord freigeben und die neue APK im privaten Serverordner `releases` ablegen. Die Windows-Verwaltung meldet sich anschließend mit deinem Betreiberkonto an.

Die wesentlichen Schritte für die Discord-Verbindung sind:

1. Im [Discord Developer Portal](https://discord.com/developers/applications) die eigene Anwendung für **Crazy_Batto Discord App** und ihren Bot einrichten. Wenn bereits eine Discord-Anwendung vorhanden ist, wird sie weiterverwendet; ihre IDs und Zugangsdaten müssen für den Namenswechsel nicht neu angelegt werden.
2. Eine eigene HTTPS-Adresse für den mitgelieferten Modstempel-Server bereitstellen, beispielsweise `https://modstempel.deine-domain.de`.
3. In Discord beide Rücksprungadressen registrieren: `https://modstempel.deine-domain.de/oauth/callback` und `https://modstempel.deine-domain.de/portal/callback`. Die Beispieldomain durch die tatsächliche eigene Domain ersetzen.
4. Im Serverordner `.env.example` nach `.env` kopieren. Anwendungs-ID, Client-Secret, Bot-Token, öffentliche Adresse, deine eigene Konto-ID als `OWNER_DISCORD_ID` und Verschlüsselungsschlüssel dort eintragen. Zugangsdaten werden auf dem Server gespeichert; in der APK oder im App-Formular stehen keine Bot-Tokens.
5. Den Server mit dem mitgelieferten Docker-Compose- und Caddy-Setup starten. Der Server ist absichtlich noch nicht für echte Discord-Anmeldungen bereit, solange die benötigten Werte fehlen.
6. In der App unter **App-Verbindung** die tatsächliche HTTPS-Adresse eintragen und **Speichern und prüfen** wählen.
7. **Mit Discord anmelden** wählen. Die offizielle Discord-Seite öffnet sich im Browser. Das gewünschte Konto auswählen und die angezeigten Zugriffe bestätigen. Nach Abschluss zur App zurückkehren; bei Bedarf **Anmeldung prüfen** verwenden. Normale Nutzer benötigen die zuvor auf der Webseite beantragte Betreiberfreigabe. Das konfigurierte Betreiberkonto ist automatisch zugelassen.
8. Den Discord-Server auswählen. Falls der Bot dort noch fehlt, kann die Serververwaltung ihn über die angebotene Discord-Installationsseite hinzufügen. Anschließend die Serverdaten erneut laden.
9. Den gewünschten Text- oder Ankündigungskanal auswählen und die Moderatorrolle festlegen beziehungsweise die bereits festgelegte Rolle prüfen.

Die App-Anmeldung und das Hinzufügen des Bots zum Discord-Server sind zwei getrennte Schritte. Die Anmeldung verwendet die Scopes `identify`, `guilds` und `guilds.members.read`; sie liest Kontoidentität, Serverzugehörigkeit und die eigenen Mitgliedsdaten. Der Bot veröffentlicht die bestätigten Beiträge. Informationen zum Ablauf: [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2).

## Beitrag oder Umfrage veröffentlichen

1. Unter **Beiträge** die Kategorie wählen. Direkt darunter steht, welche Rolle beziehungsweise `@everyone` erwähnt wird.
2. Titel und Nachricht eintragen. Ein Beginn ist optional. Bei **Stream** ist die Anwesenheitsumfrage automatisch enthalten; bei **Umfrage** eine eigene Frage und zwei bis zehn verschiedene Antworten eingeben.
3. Optional über **Bild auswählen** ein Bild hinzufügen. Die Vorschau zeigt das vollständige Bild, Format, Abmessungen und Dateigröße.
4. **Beitrag prüfen** antippen. Die Bestätigung zeigt den konkreten Server, Kanal, Empfängerkreis, Inhalt und gegebenenfalls das Bild.
5. Bestätigen. Der Auftrag wird zuerst dauerhaft auf dem Handy gespeichert und anschließend über den Verbindungsserver verarbeitet.
6. Unter **Deine Beiträge** den Status prüfen. Erst eine gespeicherte Discord-Bestätigung bedeutet, dass der Beitrag angekommen ist.

Ein späterer Wechsel der Server- oder Kanalauswahl ändert diesen Auftrag nicht. Auch ein laufender Dienst behält das beim Start bestätigte Konto, den Verbindungsserver, den Discord-Server, den Kanal und die Moderatorrolle. Wartende Aufträge eines anderen Kontos oder Verbindungsservers werden erst mit ihrer ursprünglichen Anmeldung fortgesetzt.

### Bild und Umfrage

Discord hatte die frühere Kombination mit `poll [INVALID_POLL_ATTACHMENTS]` abgelehnt. Deshalb verwendet auch Version 2 bei einem Beitrag mit Bild und Umfrage zwei Nachrichten:

1. Die erste Nachricht enthält die gegliederten Details, das Bild und die vorgesehene Erwähnung.
2. Nach dauerhaft gespeicherter Bildbestätigung folgt die Umfrage ohne Datei-Anhang. Sie enthält den Bezug zum Beitrag, löst aber keine zweite Rollen- oder `@everyone`-Erwähnung aus.

Scheitert erst die Umfrage, bleibt die bestätigte Bildnachricht erhalten. Eine Wiederholung setzt beim noch fehlenden Schritt an. Der Verbindungsserver speichert beide Schritte unabhängig vom Handy und verwendet für Wiederholungen dieselbe Auftrags-ID.

Für reine Bildbeiträge ohne Umfrage bleibt es bei einer Nachricht. Eine Streamanfrage ohne Bild enthält die Textdetails und die Umfrage in einer Nachricht.

### Grenzen

- Ein Bild pro Beitrag: JPG, PNG oder WebP, höchstens 8 MiB, 8.192 Pixel pro Seite und insgesamt 32 Millionen Pixel.
- Die App kopiert die ausgewählte Bilddatei unverändert in ihren privaten Speicher. Bestehende Bildmetadaten bleiben enthalten.
- Beitragstitel bis 120 Zeichen, Nachricht bis 1.800 Zeichen.
- Umfragefrage bis 300 Zeichen, zwei bis zehn unterschiedliche Antworten mit jeweils höchstens 55 Zeichen.
- Antwortfenster von einer bis 168 ganzen Stunden ab der tatsächlichen Veröffentlichung der Umfrage in Discord.
- Geplanter Beitragsbeginn innerhalb der nächsten 31 Tage. Noch nicht begonnene Veröffentlichungen verfallen spätestens zu diesem Beginn. Ohne Beginn gilt eine Stunde für Streamanfragen und 24 Stunden für die übrigen Beiträge.

## Events

Unter **Events** einen Titel, optional eine Beschreibung, Beginn, Ende und einen Ort oder Link eingeben. Die Bestätigung zeigt den tatsächlichen Server. Das erzeugte Event ist eine externe Discord-Veranstaltung, zum Beispiel ein TikTok-Livestream oder ein Community-Abend an einem bestimmten Ort.

Der Beginn muss in der Zukunft liegen, das Ende danach. Die App erlaubt einen Beginn innerhalb eines Jahres, Titel bis 100 Zeichen, Beschreibungen bis 1.000 Zeichen und Orte beziehungsweise Links bis 100 Zeichen. Die Datumsfelder zeigen die lokale Gerätezeit; der Server übermittelt absolute Zeitpunkte an Discord.

**Auf deinem Server → Laden** liest vorhandene Discord-Events. Ein bestätigtes Event lässt sich direkt in Discord öffnen. Das Erstellen eines Events erzeugt keine zusätzliche Kanalnachricht und keinen zusätzlichen `@everyone`-Ping. Für eine separate Ankündigung kann bewusst ein Beitrag unter **BIG Match** oder **Allgemein** erstellt werden.

Das Paket erstellt externe Events. Sprach- und Stage-Events sowie das Bearbeiten oder Löschen bestehender Events sind nicht als App-Aktion eingebaut. Der aktuelle API-Vertrag ist in der [Discord-Dokumentation für Scheduled Events](https://docs.discord.com/developers/resources/guild-scheduled-event) beschrieben.

## Dienste und Verlauf

Ein neuer Dienst beginnt unter **Stempeln** mit dem angemeldeten Discord-Konto und dem ausgewählten Modstempel-Ziel. Der Verbindungsserver verlangt dafür die Moderatorrolle oder Serververwaltungsrechte. Pause, Fortsetzen und Beenden verändern zuerst die lokale Zeitaufzeichnung. Wenn die Verbindung fehlt, können die gespeicherten Meldungen später mit demselben Konto und Ziel abgeglichen werden.

Die Zeitrechnung berücksichtigt Pausen und Dienste über Mitternacht; die Wochensumme beginnt montags. Während eines laufenden Dienstes schützt eine monotone Android-Zeitbasis vor einer Änderung der Geräteuhr innerhalb desselben Geräteboots. Nach einem Neustart des Handys ist eine korrekt eingestellte Uhr erforderlich. Die App ist eine persönliche Stempeluhr, kein manipulationssicheres Anwesenheits- oder Abrechnungssystem.

Der Verlauf und die Dienstzeiten liegen auf diesem Gerät. Es gibt keine geräteübergreifende gemeinsame Dienstliste oder Push-Nachrichten aus der App. Teammitglieder benötigen zum Abstimmen lediglich Zugriff auf die entsprechende Discord-Nachricht; ihre Umfrageantwort startet keinen Dienst.

## Zustellung und Wiederholungen

| Status | Bedeutung |
| --- | --- |
| Wartet | Lokal oder auf dem Server vorgemerkt; noch nicht vollständig bestätigt |
| Wird gesendet | Der Verbindungsserver verarbeitet den Auftrag; die App liest anschließend den Status |
| In Discord bestätigt | Die erforderlichen Nachrichten beziehungsweise das Event besitzen bestätigte Discord-IDs |
| Fehlgeschlagen | Eine eindeutige Ablehnung ist bekannt; der Eintrag bleibt zur Prüfung erhalten |
| Unklar | Eine Antwort oder deren dauerhafte Speicherung fehlt; die Veröffentlichung kann bereits erfolgt sein |
| Lokal erledigt | Nur die lokale Nachverfolgung wurde beendet; keine Nachricht wurde damit gelöscht und kein Versand bestätigt |

Die App fragt bei verlorener Verbindung zuerst den gespeicherten Auftragsstatus ab. Eine unbekannte Zustellung wird nicht unbemerkt mit einer neuen ID wiederholt. Ein ausdrücklich bestätigter erneuter Versuch nach unklarer Zustellung kann trotzdem eine zweite Veröffentlichung verursachen; deshalb zuerst im ursprünglichen Discord-Ziel prüfen.

Ein bestätigtes Bild wird vor der nächsten Phase dauerhaft gespeichert. Discord-`nonce` und `enforce_nonce` unterstützen die kurzzeitige Deduplizierung; die langfristige Zuordnung hält der eigene Auftragsspeicher. Ein einzelner Serverprozess mit beständigem Datenverzeichnis ist dafür erforderlich. Den Server nicht auf mehrere unabhängige Instanzen mit getrennten Speichern skalieren.

Die App hat keinen permanenten Android-Hintergrunddienst. Lokal vorgemerkte Aufträge werden bei geöffneter App oder beim nächsten Öffnen weiterverarbeitet. Bereits beim Verbindungsserver angenommene laufende Veröffentlichungen können dort unabhängig vom App-Fenster fertig werden.

## Code, Tests und APK-Bau

```text
web/                 Oberfläche, native Bridge und CoreV2
android/             Android-Hülle, Keystore-Anbindung und native Protokollprüfungen
server/              Verbindungsserver, Discord-API, OAuth, Docker/Caddy und Backend-Tests
desktop/             Windows-Verwaltung mit sicherer Anmeldung und Tray-Benachrichtigungen
contracts/           Gemeinsamer API- und UI-Vertrag
tests/              Offline-Tests für App-Logik und Bridge
WEBSITE-PORTRAET.md  Website-Inhaltsupdate vom 09.10.2026 und aktueller Prüfstand
PRUEFUNG-2.2.md      Prüfbericht des ursprünglichen Pakets 2.2.0
PRUEFUNG-PAKET.json  Ursprüngliche Signatur-, Asset- und Paketprüfung
build-apk.sh         Reproduzierbarer APK-Bau mit vorhandenem Android-Werkzeugkasten
```

Im Projektordner:

```bash
node --test tests/*.test.cjs
npm --prefix server test
bash android/test-native-contract.sh
bash build-apk.sh
```

Der frühere `core.js` bleibt für reine Zeit-/Bildhilfsfunktionen und Regressionen enthalten. Die aktive App wird ausschließlich von `core-v2.js` erzeugt. Alte Bridge-Versandaktionen werden zusätzlich nativ abgewiesen.

Die JavaScript- und Backend-Tests verwenden Ersatzschnittstellen. Ein bestandener Test ist keine echte Anmeldung bei Discord. Der APK-Bau prüft Kompilierung und Paketstruktur; ein Test auf einem echten Android-Gerät und ein Live-Durchlauf mit dem tatsächlich eingerichteten Discord-Bot sind getrennte Prüfungen. `PRUEFUNG-2.2.md` dokumentiert das ursprüngliche Paket. Für das Website-Inhaltsupdate gilt der gesonderte Prüfstand in [WEBSITE-PORTRAET.md](WEBSITE-PORTRAET.md); die früheren APK-, Windows- und Browserprüfungen wurden dafür nicht erneut ausgeführt.

Die ausgelieferte Update-APK wird mit dem bisherigen Schlüssel signiert. Private Signierschlüssel, Passwörter, OAuth-Secrets, Bot-Tokens, echte `.env`-Dateien und Laufzeitdaten sind nicht Teil des Quellcodepakets. Wer den Quellcode mit einem eigenen Schlüssel baut, kann damit eine unter dem ursprünglichen Schlüssel installierte App nicht direkt aktualisieren.
