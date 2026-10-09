# Crazy_Batto Discord App · Verwaltung 2.2.0 für Windows

Die PC-Verwaltung bietet zwei Bereiche: **Zugänge** für Registrierungen und Freigaben und **Webseite** für deine eigenen Bilder, Texte, Setup-Galerie und App-Karten. Die Webseite und die Registrierung verwenden denselben Server. Die Anwendung veröffentlicht beim Start keine Inhalte.

## Start und Update

1. Das gesamte ZIP in einen festen Ordner entpacken. Alle DLLs und die Unterordner `x64`, `x86` und `arm64` gehören zur Anwendung und müssen neben der EXE bleiben.
2. `Crazy_Batto-Discord-App-Verwaltung.exe` öffnen. Administratorrechte werden nicht benötigt.
3. Im Reiter **Zugänge** die endgültige HTTPS-Adresse deines Servers eintragen und **Verbinden** wählen.
4. **Mit Discord anmelden** öffnet deinen Standardbrowser. Melde dich mit deinem Betreiberkonto an und vergleiche den Gerätecode mit dem in der PC-App.
5. Nur die auf dem Server über `OWNER_DISCORD_ID` festgelegte Person erhält die Verwaltung. Eine Discord-Moderatorrolle oder die Verwaltung eines Discord-Servers reicht dafür nicht aus.

Die Anwendung benötigt Windows 10 oder 11 mit **.NET Framework 4.8**. Sie ist eine native Windows-Forms-Anwendung; das .NET-10-SDK ist zum Benutzen nicht erforderlich. Die EXE ist nicht mit Authenticode signiert. Ein echter Windows-Laufzeittest ist noch offen, siehe Prüfgrenzen unten.

Zum Update zunächst die bisherige Modstempel-Verwaltung über ihr Tray-Menü **Beenden**. Bestehende Anmeldung, Serveradresse und Benachrichtigungsstände können übernommen werden: DPAPI-Schlüssel, lokaler Speicherpfad, Mutex und Autostart-Kennung bleiben absichtlich kompatibel. Bereits eingeschalteter Windows-Autostart wird beim Öffnen auf die neue EXE aktualisiert; bei bisher ausgeschaltetem Autostart wird nichts eingeschaltet.

Für die Website-Verwaltung muss das Serverpaket **2.2** mit HTTPS und der Discord-Anmeldung eingerichtet sein. Das Paket bucht keinen Server und veröffentlicht keine reale Website automatisch.

## Bilder und Texte bearbeiten

Die Website-Vorlage vom **09.10.2026** enthält bereits dein Originalporträt und die vier gelieferten Vorstellungszeilen unter **Über mich**. Setup, andere Apps und Social Links bleiben frei. Die Vorlage wird nur beim erstmaligen Anlegen der Website übernommen. Bestehen dort schon Inhalte, kannst du Porträt und Text mit den folgenden Schritten selbst einsetzen. Die vorhandene Windows-Verwaltung **2.2.0** bleibt dafür geeignet; ein neues Windows-Paket oder eine neue APK ist nicht nötig. Siehe [WEBSITE-PORTRAET.md](../WEBSITE-PORTRAET.md).

1. **Webseite** öffnen. Der aktuelle gespeicherte Entwurf wird geladen.
2. Unter **Start / Über mich** auf **Eigenes Bild auswählen …** klicken. Für weitere Bilder gibt es unter **Setup** die Schaltfläche **Bild hinzufügen …** und unter **Meine Apps** den jeweiligen Bildbereich einer App-Karte.
3. Im Bildfenster **Datei auswählen …** wählen. Die lokale Vorschau zeigt die tatsächlich ausgewählte Datei, bevor sie hochgeladen wird.
4. **Ausgewählte Datei hochladen** lädt die Originaldatei privat auf deinen Server. Unterstützt sind **JPG, PNG und WebP mit höchstens 4 MiB und 32 Millionen Pixeln**. Das Original wird nicht umgerechnet; nur die lokale Vorschau wird verkleinert und gemäß JPEG-Orientierung angezeigt.
5. **Dieses Bild verwenden** ordnet es dem geöffneten Bereich zu. Ein abgebrochener Dateidialog oder Bilddialog ändert die bisherige Zuordnung nicht. Bereits bestätigte Uploads bleiben beim Abbrechen in der privaten Bildbibliothek verfügbar.
6. Unter **Start / Über mich** den Vorstellungstext eintragen oder ergänzen. Weitere Textfelder kannst du leer lassen. Ein App-Eintrag benötigt lediglich seinen Namen; seine Beschreibung, Bildbeschreibung und sein Link können später folgen.
7. **Entwurf speichern** speichert die aktuelle Zuordnung und deine Texte. Die öffentliche Fassung bleibt dabei unverändert.
8. **Gespeicherten Entwurf veröffentlichen** zeigt dir die konkrete gespeicherte Version und fragt vor der Veröffentlichung nach. Erst die bestätigte Serverantwort wird als erfolgreiche Veröffentlichung angezeigt.

Die Bildbibliothek lässt sich über **Bilder verwalten …** auch unabhängig von einer Zuordnung öffnen. Ein Bild kann an mehreren Stellen verwendet werden. Die Bibliothek zeigt Dateiname, Abmessungen, Vorschau und belegten Speicher. Der Server erlaubt insgesamt bis zu 100 eigene Uploads und 100 MiB. Identische Originaldateien werden anhand ihres Inhalts wiedererkannt.

**Bildzuordnung entfernen** entfernt nur die Verwendung an der jeweiligen Stelle. **Bild löschen …** entfernt dagegen eine unbenutzte Datei aus der privaten Bibliothek. Die mitgelieferten Standardbilder **Drache** und **App-Ansicht** sowie Bilder im aktuellen lokalen Entwurf, im gespeicherten Entwurf oder in der veröffentlichten Fassung sind gegen Löschen geschützt. Dein Porträt ist ein normal verwaltetes Bild. Für das endgültige Entfernen eines öffentlich verwendeten Bildes zuerst die Zuordnung ändern, speichern und veröffentlichen; danach die nicht mehr verwendete Datei löschen.

Ein noch nicht zugeordnetes oder nur im Entwurf verwendetes Uploadbild ist nicht öffentlich abrufbar. Die PC-Vorschau lädt es mit deiner Betreiberanmeldung direkt vom fest eingetragenen Server. Externe Bildadressen werden nicht als Vorschauquelle aufgerufen.

## Texte, Setup, Apps und Links

- **Start / Über mich:** Hauptüberschrift, kurze Einführung, Text über dich, persönliches Bild und optionale Bildbeschreibung.
- **Setup:** optionaler Text, bis zu 24 Komponenten mit Bezeichnung und Modell sowie bis zu 12 Bilder. Bildunterschriften und die Reihenfolge lassen sich später anpassen.
- **Meine Apps:** bis zu 8 App-Karten mit Name, Text, Bild und optionalem Link. Die Karte wird zunächst im lokalen Entwurf bearbeitet; **Übernehmen** veröffentlicht sie noch nicht.
- **Links:** bis zu 12 Social-Media- oder Projektlinks. Erlaubt sind vollständige HTTPS-Adressen ohne Zugangsdaten und besondere Ports oder genau `/portal` als Link zur Registrierung.

Es wird Klartext eingegeben, kein HTML. Bildbeschreibungen helfen Personen, die deine Webseite mit einem Screenreader nutzen. Die einzelnen Bereiche sind bei kleinem Fenster scrollbar.

**Öffentliche Webseite öffnen** öffnet die tatsächlich veröffentlichte Website im Systembrowser. Es ist keine Vorschau ungespeicherter Texte. Im Editor zeigt die Fußzeile getrennt den gespeicherten Entwurf, lokale Änderungen und die veröffentlichte Version mit Datum.

## Änderungen, Konflikte und Verbindungsprobleme

Registrierungsabfragen laufen weiter ungefähr alle 15 Sekunden. Sie laden Website-Inhalte nicht im Hintergrund neu und überschreiben deine Texte nicht.

Jede Speicherung und Veröffentlichung enthält die angezeigte Inhaltsversion. Wenn ein anderer PC inzwischen geändert hat, übernimmt die Verwaltung die andere Fassung nicht ungefragt: deine Eingaben bleiben stehen, und der neu gelesene Serverstand wird getrennt vermerkt. **Serverstand laden** fragt vor dem Verwerfen ungespeicherter Änderungen nach. Du kannst vorher abbrechen und Texte kopieren. Es gibt kein automatisches Überschreiben einer neueren Fassung.

Bei verlorener oder unlesbarer Antwort wird eine Änderung nicht automatisch wiederholt und nicht als erfolgreich angezeigt. Prüfe zunächst den aktuellen Serverstand. Die Veröffentlichung ist bei ungespeicherten Änderungen oder ungeklärtem Serverstand gesperrt. Auch ein HTTP-200-Antwortstatus allein reicht nicht: Inhalt, Bilder und Versionsangaben müssen zur Aktion passen.

Beim Abmelden oder beim tatsächlichen Beenden fragt die Anwendung vor dem Verwerfen ungespeicherter Website-Änderungen nach. Minimieren in den Infobereich lässt sie dagegen im Arbeitsspeicher bestehen. Wird die Betreiberberechtigung vom Server entzogen oder läuft die Anmeldung ab, entfernt die Anwendung die privaten Website-Daten und schließt geöffnete Bearbeitungsfenster. Bereits gespeicherte Entwürfe und Uploads bleiben serverseitig erhalten.

## Registrierungen entscheiden

Im Reiter **Zugänge** erscheinen offene, freigegebene, abgelehnte und gesperrte Registrierungen. Die Suche umfasst Discord-Name, Discord-ID und die Nachricht aus der Registrierung. Nach Auswahl einer Zeile stehen **Freigeben …**, **Ablehnen …** und **Zugang sperren …** entsprechend dem Status bereit.

Das Entscheidungsfenster zeigt die bestätigte Discord-ID und die Auswirkung. Ein optionaler Hinweis mit höchstens 500 Zeichen wird der Person im Portal angezeigt. Erst die konkrete Schaltfläche sendet die Entscheidung. Veraltete Datensatzversionen führen zum Neuladen; Entscheidungen werden bei unterbrochener Verbindung nicht automatisch wiederholt.

Freigabe erlaubt den APK-Download und die servergebundene App-Nutzung. Eine spätere Sperre blockiert neue Downloads und App-Aufrufe. Eine bereits heruntergeladene APK bleibt als Datei vorhanden; die Serverprüfung lässt sich dadurch nicht umgehen.

## Meldungen, Hintergrundbetrieb und Autostart

Während die Verwaltung läuft und verbunden ist, prüft sie ungefähr alle 15 Sekunden auf neue Anfragen. Neue offene Registrierungen erscheinen über das Windows-Symbol im Infobereich. Ein Klick auf eine solche Meldung öffnet den Reiter **Zugänge**. Windows-Einstellungen und Konzentrationsmodus können die Anzeige beeinflussen.

Minimieren verbirgt das Fenster; das Tray-Symbol bleibt verfügbar. Bei aktivierter Option **Beim Schließen im Infobereich weiterlaufen** wirkt das X ebenso. **Beenden** im Tray-Menü schließt das Programm vollständig. **Mit Windows starten** ist für neue Nutzer ausgeschaltet und kann bewusst aktiviert werden.

Bei ausgeschaltetem PC, vollständig beendeter App oder fehlender Verbindung gibt es keine PC-Meldung. Die Anfragen bleiben auf dem Server und werden beim nächsten Verbinden gelesen. Das ist eine regelmäßige Abfrage, kein Offline-Pushdienst.

## Anmeldung und lokale Daten

Der Discord-Anmeldevorgang läuft im Systembrowser. In der PC-App werden weder Discord-Passwörter noch Bot-Token oder Client-Secrets eingegeben. Sitzung und Einstellungen liegen verschlüsselt mit Windows DPAPI für das aktuelle Windows-Konto unter:

`%LOCALAPPDATA%\Modstempel\Verwaltung\state.dpapi`

Der bestehende technische Pfad bleibt nach der Umbenennung erhalten. Der Server prüft die Betreiberberechtigung bei jedem Verwaltungsaufruf erneut. **Abmelden** entfernt die lokale Anmeldung und versucht zusätzlich, die serverseitige Sitzung zu beenden. Fehlt dafür eine Serverbestätigung, zeigt die Verwaltung das an.

## Bauen und prüfen

```text
dotnet restore Modstempel.Verwaltung.csproj
dotnet build Modstempel.Verwaltung.csproj -c Release --no-restore
dotnet run --project tests/Desktop.Tests.csproj -c Release
python package.py
```

Der hier ausgeführte Build verwendet Microsoft .NET SDK 10.0.401 und Framework-4.8-Referenzen 1.0.3. Das Projekt behält den internen Dateinamen `Modstempel.Verwaltung.csproj` für bestehende Buildabläufe. Die neuen Ausgabedateien heißen `Crazy_Batto-Discord-App-Verwaltung`.

Für JPEG-, PNG- und WebP-Vorschauen werden **SkiaSharp 4.153.1**, die zugehörigen Windows-Nativbibliotheken und vier Microsoft-Systembibliotheken mitgeliefert. Das Windows-ZIP enthält die vom NuGet-Paket vorgesehenen Bibliotheken für x64, x86 und ARM64. Das Programm selbst ist AnyCPU; die jeweilige Prozessarchitektur bestimmt die geladene Bildbibliothek. In den geprüften direkten Importen der x64-/x86-Bildbibliotheken stehen Windows-System-DLLs, keine gesonderte VC++-Runtime-DLL. Eine zusätzliche VC++-Installation wird daher nicht als Voraussetzung dieses Pakets angegeben. Die Prüfung am echten Windows-PC steht weiterhin aus.

Versionen, Hashes, Lizenztexte und Drittanbieterhinweise sind in `PAKET-MANIFEST.json` beziehungsweise `THIRD-PARTY/` enthalten. macOS- und Linux-Bibliotheken, SDKs, Build-Caches und Testprogramme werden nicht in das Windows-ZIP aufgenommen.

### Tatsächlich geprüft

Die folgenden Ergebnisse beziehen sich auf das ursprüngliche Windows-Paket **2.2.0**. Die Windows-Prüfungen wurden für das Website-Inhaltsupdate nicht erneut ausgeführt; dessen aktueller Prüfstand steht in [WEBSITE-PORTRAET.md](../WEBSITE-PORTRAET.md).

- Windows-GUI-EXE für .NET Framework 4.8 erfolgreich gebaut, ohne Compilerwarnungen.
- Produktive Core-/HTTP-Tests für Anmeldung, Betreiberrolle, Entscheidung, Pagination und Fehlerstatus sowie Website-Versionen, getrenntes Speichern/Veröffentlichen, Konflikte, Tokenbindung, Upload-Originalbytes, Bildgrößen und Fristen bis zum letzten Antwortbyte.
- JPEG, PNG und WebP tatsächlich mit dem Bilddecoder unter Linux gelesen; lokale Vorschaugröße, JPEG-Portraitorientierung und unveränderte Originaldateien geprüft.
- PE-/CLR-Produktname, Version 2.2.0.0, AnyCPU, Framework-4.8-Ziel und unveränderte Einbettung des Drachenhintergrunds geprüft.
- Windows-Paket auf benötigte managed/native DLLs, offizielle Lizenztexte und Dateihashes geprüft. Genaue Ergebnisse stehen in `PRUEFUNG-WINDOWS.json`.

### Noch auf deinem Windows-PC prüfen

Die Buildumgebung ist Linux. Es wurden **kein echtes Windows-Fenster, Windows-DPI-Verhalten, DPAPI-Roundtrip, Autostart oder echte Tray-Meldungen ausgeführt**. Der Bilddecoder wurde mit seiner Linux-Bibliothek ausgeführt, nicht mit den mitgelieferten Windows-DLLs. Der vollständige Geräte-Login benötigt den eingerichteten HTTPS-Server und deine Discord-Anwendung.

Nach Einrichtung am Betreiber-PC einmal prüfen: Anmeldung, Testregistrierung und Meldung, Freigabe, Bildauswahl für JPG/PNG/WebP, private Bildvorschau, Entwurf speichern, bewusste Veröffentlichung, Abbruch eines Bilddialogs, spätere Sperre und optionaler Autostart. In dieser Buildumgebung wurden keine realen Konten freigegeben, keine Discord-Nachrichten gesendet und keine Website öffentlich bereitgestellt.

### Herstellerdokumentation

- [SkiaSharp 4.153.1 und unterstützte Frameworks](https://www.nuget.org/packages/SkiaSharp/4.153.1)
- [SkiaSharp Windows-Nativpaket](https://www.nuget.org/packages/SkiaSharp.NativeAssets.Win32/4.153.1)
- [Windows-Infobereich und NotifyIcon](https://learn.microsoft.com/en-us/dotnet/desktop/winforms/controls/notifyicon-component-overview-windows-forms)
- [Windows DPAPI: CurrentUser](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.dataprotectionscope?view=netframework-4.8.1)
- [.NET Framework 4.8](https://dotnet.microsoft.com/en-us/download/dotnet-framework/net48)
