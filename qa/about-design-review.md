# Über mich – Gestaltung und Prüfgrenzen

Stand: Website-Inhaltsupdate vom 09.10.2026, App-/Server-Version 2.2.0.

## Grundlage

Die vorhandene Website bleibt die gestalterische Grundlage. Referenz: `qa/site-screens/website-default-desktop.png` (historischer Browserstand vor der Biografie). Das Originalporträt ist `server/site-default-images/ich.jpeg`. Der Nutzer hat genau vier Vorstellungszeilen geliefert; diese ersetzen die frühere leere Über-mich-Vorlage. Weitere persönliche Inhalte wurden nicht erfunden.

## Methode und Grenzen

Die beiden neuen PNGs sind **statische Gestaltungsexporte des Abschnitts**, keine Screenshots eines Browsers. `qa/render-about-design.cjs` setzt die konkreten Abstände, Farben, Texte und das Originalbild in einer Canvas-Komposition um. Die dafür verwendete DejaVu Sans nähert die Systemschrift der Website an; deren tatsächliche Darstellung hängt vom Endgerät ab.

Desktop 1536 × 965 und Handy 390 × 844 wurden zusammen mit dem Originalfoto und dem bisherigen Webseitenbild visuell angesehen. Der Webseitenquellcode wurde überprüft. **Eine vollständig verifizierte Übereinstimmung der laufenden Website mit dem Entwurf kann damit nicht bestätigt werden.**

Die automatische Browser-Sicherheitsprüfung hat das Öffnen der lokalen Dateivorschau blockiert (nur HTTP/HTTPS erlaubt); der Cloudbrowser konnte den lokalen HTTP-Server nicht erreichen. Lokal fehlt eine ausführbare Browserinstallation. Es wurden keine Umgehung dieser Sperre und kein öffentlicher Upload zur Browserprüfung vorgenommen. Ein DOM-Laufzeitpaket ist ebenfalls nicht installiert. Browserdarstellung und echte Bilddialog-Interaktion bleiben offen.

## Vergleich und Korrekturen

| Punkt | Grundlage und sichtbarer Befund | Umsetzung / verbleibende Grenze |
| --- | --- | --- |
| Wortlaut | Vier vom Nutzer gelieferte Zeilen; im öffentlichen HTTP-Inhalt exakt enthalten. | Keine zusätzlichen Aussagen. Crazy_Batto und Team TABH hervorgehoben. Die HTML-Ausgabe verwendet Textknoten, kein interpretiertes HTML aus Inhaltsfeldern. |
| Aufbau | Bestehende offene, dunkle Website; kein neues Kartensystem. | Porträt links, Vorstellung rechts; Überschrift darüber. Neue Komposition visuell geprüft, echtes CSS-Layout noch nicht im Browser geprüft. |
| Schrift | Kräftige vorhandene Überschriften mit zurückhaltendem Fließtext. | Desktop Name 56 px, Handy 36 px; Body 22/18 px. Systemschrift im Produkt, DejaVu Sans nur im statischen Export. |
| Farben | Hintergrund #0b0c0f, Text #f0f0f2, roter Akzent #c62737 wie im vorherigen Websitebild. | Kein zusätzlicher Farbverlauf oder Farbfilter auf dem Porträt. |
| Foto | Vollständiges Nutzerfoto im Seitenverhältnis 1122:1402. | Datei und SHA256 unverändert. Vollständige Bildfläche in der Vorschau, kein zugeschnittener Kopf oder künstlicher Hintergrund. |
| Abstände | Breite offene Spalten, deutliche Trennung von Überschrift und Inhalt. | Desktop Bild 530 px breit, Bild-/Textbereich vertikal mittig; Handy 20 px Außenabstand und 29 px zwischen Foto und Text. |
| Umbruch | Im ersten Handyexport stand TABH allein auf einer Zeile. | Nur Team TABH wird fett gesetzt und bleibt als zusammenhängende Wortgruppe erhalten. Im finalen 390-px-Export passt die Rollenbeschreibung in eine Zeile. Kleinere Browserbreiten bleiben praktisch zu prüfen. |
| Bildbedienung | Bestehende echte Bildvergrößerung und barrierefreie Bildbeschreibung. | Codepfad beibehalten. Aktuelle Klick-/Tastaturbedienung des Dialogs nicht erneut ausgeführt. |

## Textvergleich und Zustände

Der Vergleich der Vorlagen-/HTTP-Texte mit dem erlaubten Nutzertext ist bestanden. Hero, Registrierungsbeschriftungen und Drachenmotiv wurden nicht geändert. „Über mich“ wird als befüllter Abschnitt samt Navigationslink vorgesehen; Setup, Apps und Social Links bleiben leer. Die Ausblendungslogik ist im Quellcode vorhanden, wurde diesmal aber nicht im DOM ausgeführt.

Die 87 Servertests decken die neue Erstbefüllung und vorhandene Eigentümer-/Veröffentlichungsregeln ab. Die 32 Website-Tests sind eine Teilmenge dieser 87. Die lokale HTTP-Prüfung bestätigt die öffentlichen Inhalte und unveränderten Bildbytes. Dies ersetzt keine Browserprüfung. Alte Browsernachweise im Paket beziehen sich ausschließlich auf den Stand vor diesem Inhaltsupdate.

Die Gestaltungsexporte enthalten nach der Umbruchkorrektur keine sichtbaren abgeschnittenen Inhalte. Offene Freigabeprüfung für die laufende Website: Desktop-/Handy-Layout einschließlich 320 px, dynamisches Ein-/Ausblenden der Navigation und Abschnitte, Bilddialog per Klick und Tastatur sowie der echte Durchlauf auf dem eingerichteten Server.
