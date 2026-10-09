# Crazy_Batto Discord App 2.2 – eigene Webseite und Bilder

Die bisherige App **Modstempel** heißt jetzt **Crazy_Batto Discord App**. Der Name wird auf Android, in der Windows-Verwaltung, auf der Webseite und bei der Anmeldung angezeigt. Die Funktion und Beitragskategorie **Modstempel** behält ihre Bezeichnung.

Die Android-Paketkennung und der ursprüngliche Signierschlüssel bleiben beim Wechsel auf Version 2.2 erhalten. Die APK wird über die vorhandene App installiert; Verlauf und gespeicherte Anmeldung werden weiterverwendet. Die technische Serverkennung `Modstempel` bleibt aus Kompatibilitätsgründen erhalten.

Das Website-Inhaltsupdate vom **09.10.2026** ergänzt deine Vorstellung. App, Server und Windows-Verwaltung bleiben bei **2.2.0**; dafür ist **keine neue APK** nötig. Details stehen in [WEBSITE-PORTRAET.md](WEBSITE-PORTRAET.md).

## Deine Vorstellung ist vorbereitet

Die Anfangsvorlage enthält unter **Über mich** dein unverändertes Originalporträt `ich.jpeg` und genau diese vier Zeilen:

```text
Crazy_Batto
Inhaber und Gründer von Team TABH
36 Jahre alt
Social-Media-Content-Creator für Hardware und Gaming
```

Setup-Komponenten, weitere Fotos, Beschreibungen anderer Apps und Social Links bleiben frei. Die Startseite enthält außerdem den Appnamen, dein Drachenmotiv und den Zugang zur Registrierung. Leere Bereiche erscheinen nicht als Platzhalter; sie werden nach dem Ergänzen und Veröffentlichen sichtbar.

| Bereich | Was du selbst ergänzen kannst |
| --- | --- |
| Über mich | Vorbereitetes Porträt und Vorstellungstext ändern oder ergänzen |
| Mein Setup | Fotos mit Bildunterschriften, Beschreibung und Komponenten als Name/Wert-Liste |
| Meine Apps | Eigene App-Einträge mit Name, Beschreibung, Bild und optionalem HTTPS-Link |
| Weitere Links | Eigene Linkbeschriftungen und HTTPS-Adressen |

Das vorhandene Drachenmotiv bleibt als mitgeliefertes Brandbild verfügbar. Eine tatsächliche Ansicht der neuen Discord-App ist ebenfalls als optionales Standardbild vorhanden. Beide Bilder werden nicht automatisch als persönliches Foto oder Setupfoto verwendet.

## Bilder über die Windows-Verwaltung hochladen

1. Das neue Windows-ZIP vollständig in einen festen Ordner entpacken und die Verwaltungs-EXE öffnen.
2. Die HTTPS-Adresse deines eingerichteten Servers verbinden und dich mit deinem Betreiberkonto anmelden.
3. Den Bereich **Webseite** öffnen. Dort liegen die Inhalte und die Bildverwaltung.
4. Ein eigenes Bild auswählen und hochladen. Unterstützt werden **JPG, PNG und WebP**, bis **4 MiB pro Datei** und **32 Millionen Pixel**.
5. Das hochgeladene Bild dem gewünschten Bereich zuordnen: persönliches Bild, Setupgalerie oder App-Eintrag. Bildunterschriften und Beschreibungstexte können zunächst leer bleiben. Ein App-Eintrag benötigt lediglich seinen Namen.
6. **Entwurf speichern** wählen. Damit sind die Änderungen auf deinem Server gesichert.
7. Wenn die gespeicherte Fassung öffentlich erscheinen soll, **Gespeicherten Entwurf veröffentlichen** wählen. Anschließend die öffentliche Webseite öffnen oder neu laden.

Die Originaldatei wird unverändert übertragen. Die PC-App erstellt nur für ihre Anzeige eine Vorschau. Für die zusätzlichen Bildformate enthält das Windows-Paket die benötigten Programmbibliotheken; die EXE deshalb zusammen mit den übrigen Dateien und Unterordnern benutzen.

Der Bildspeicher bietet bis zu **100 eigene Bilder und insgesamt 100 MiB**. In der Setupgalerie können bis zu zwölf Bilder, in der Komponentenliste bis zu 24 Angaben und in der Appliste bis zu acht App-Einträge erscheinen. Bereits hochgeladene Bilder können mehrfach zugeordnet werden.

Ein Bild, das noch im gespeicherten Entwurf oder auf der veröffentlichten Webseite verwendet wird, lässt sich nicht endgültig aus der Bildverwaltung löschen. Entferne zuerst die Zuordnung, speichere die Änderung und veröffentliche sie bei Bedarf. Anschließend kann das unbenutzte Bild gelöscht werden.

## Entwurf und öffentliche Fassung

Hochladen, Speichern und Veröffentlichen sind getrennte Schritte. Ein neu hochgeladenes Bild allein verändert die öffentliche Webseite nicht. Bilder, die nur im Entwurf vorkommen, können über die öffentliche Bildadresse nicht abgerufen werden.

Auf der Webseite steht immer die zuletzt veröffentlichte Fassung. Änderungen eines anderen Verwaltungsfensters werden anhand einer Version erkannt. Bei einem Konflikt muss der aktuelle Stand geladen und die eigene Änderung erneut geprüft werden; sie wird nicht ungefragt darübergeschrieben.

Texte sind gewöhnlicher Text. Für die Inhalte ist kein HTML, kein CSS und keine Programmierung nötig. App- und Profilverweise verwenden HTTPS; die eingebaute Registrierungsseite kann direkt als Ziel gewählt werden.

## Registrierung und persönliche Freigabe

Die öffentliche Vorstellung liegt unter der Hauptadresse deines Servers. **Registrieren** führt zu `/portal`. Die Anmeldung über Discord, deine persönliche Freigabe, der geschützte APK-Download und das spätere Sperren eines Zugangs bleiben Teil derselben Anwendung.

Die Benutzerregistrierungen bleiben in der Windows-Verwaltung erreichbar. Benachrichtigungen funktionieren bei laufender, angemeldeter und verbundener Verwaltung. Das Bearbeiten der Webseite erteilt niemandem Zugang zur App und versendet keine Discord-Nachricht.

## Server mit Websitefunktion 2.2 betreiben

Der Server muss die neue Websitefunktion bereitstellen. Die Version wird über `/health` zusätzlich mit `siteContent: true` angezeigt. Die private Konfiguration für Discord, Betreiberkonto und Verschlüsselung wird weiterverwendet.

- APK: `server/releases/Crazy_Batto-Discord-App-2.2.0.apk`.
- APK-Version in `.env`: `APK_VERSION=2.2.0`.
- Bei direktem Node-Betrieb: `APK_PATH=./releases/Crazy_Batto-Discord-App-2.2.0.apk`.
- Docker Compose verwendet den passenden Dateipfad im schreibgeschützten Release-Verzeichnis.
- Die neue öffentliche Website liegt unter `/`; die Registrierung bleibt unter `/portal`.
- Beide bestehenden Discord-Rücksprungadressen `/oauth/callback` und `/portal/callback` bleiben erforderlich.

`server/site-default.json` enthält die vorbereitete Vorstellung; das Originalporträt liegt unter `server/site-default-images/ich.jpeg`. Beim erstmaligen Anlegen der Website übernimmt der Server diese Vorlage samt Bild. Spätere Neustarts und Paketupdates überschreiben deine gespeicherten Texte oder Bildzuordnungen nicht. Wenn bereits Website-Daten vorhanden sind, setzt du Porträt und Text über die PC-Verwaltung und veröffentlichst den gespeicherten Entwurf. Die Schritte stehen in [WEBSITE-PORTRAET.md](WEBSITE-PORTRAET.md).

Eine Sicherung umfasst die private Datenbank, den Ordner `site-images` mit deinen Websitebildern, den bisherigen Bildordner für Discord-Beiträge und die private Serverkonfiguration mit unverändertem Verschlüsselungsschlüssel. Das gesamte bisherige Datenvolume zu sichern schließt beide Bildbereiche ein.

## Auslieferung und Prüfstand

Die Pakete enthalten keine Zugangsdaten zu deinem VPS oder Discord-Konto. Die öffentliche Domain, HTTPS und Discord-Anwendung werden beim folgenden Einrichtungsschritt verbunden. Es wurde hier keine öffentliche Webseite mit persönlichen Angaben veröffentlicht.

`PRUEFUNG-2.2.md` beschreibt die Prüfungen des ursprünglichen Pakets 2.2.0. Den aktuellen Prüfstand des Website-Inhaltsupdates dokumentiert [WEBSITE-PORTRAET.md](WEBSITE-PORTRAET.md). Frühere Geräte- oder Browserprüfungen wurden dafür nicht erneut ausgeführt. Die genaue Schnittstelle für Bilder und Websiteinhalte steht in `contracts/site-v2.2.md`.
