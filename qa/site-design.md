> Historischer Prüfstand der ursprünglichen Version 2.2.0 vor dem Porträt-/Biografie-Update. Der aktuelle Auftrag und seine offenen Browserprüfungen stehen in `qa/about-design-review.md` und `WEBSITE-PORTRAET.md`.

# Website 2.2 – Design und Inhaltsgrenzen

## Aktueller Auftrag

Die öffentliche Seite startet mit dem bestehenden Drachenmotiv und der Registrierung zur **Crazy_Batto Discord App**. Persönliche Bilder, Biografie, Setup und weitere Projekte lädt bzw. ergänzt der Besitzer später selbst. Leere Inhalte werden öffentlich weder mit Beispieltexten noch mit Platzhalterbildern ersetzt. Die Bild- und Textpflege erfolgt in der PC-Verwaltung.

## Konzepte

- Verbindlicher leerer Startzustand: `generated_images/exec-f7cf245e-04a9-4db5-ba2a-dcb86a07de23.png` (1536 × 1024).
- Interne Strukturstudie Hero/Über mich: `generated_images/exec-7544c509-3562-4b33-8e70-e88c8f0ffe1c.png`.
- Interne Strukturstudie Setup: `generated_images/exec-f3f4fc0f-a3bd-420b-a29a-78dbac61620c.png`.
- Interne Strukturstudie Apps: `generated_images/exec-acdbda47-5b60-4682-ae8e-ad2b0cee25fc.png`.

Die drei ursprünglichen Strukturstudien entstanden vor der Präzisierung „Bilder selbst hochladen, Texte später“. Ihre persönlichen Beispieltexte werden **nicht** veröffentlicht oder als Standard gespeichert. Die leeren und befüllten Layouts verwenden dieselbe visuelle Sprache; befüllte Zustände werden ausschließlich mit klar bezeichneten QA-Daten geprüft.

## Designsystem vor Implementierung

- Nahezu schwarzer Hintergrund `#0b0c0f`, neutrale silberweiße Texte `#f0f0f2`, graue Nebentexte `#aeb0b8`, dunkle Trennlinien `#30333b`, roter Akzent `#c62737`.
- Systemschrift Segoe UI / system-ui, kräftige breite Hauptüberschrift, 20–22 px Einleitung, 16–18 px Navigation und Steuerelemente; mobile Überschriften skalieren ohne abgeschnittene Wörter.
- Breiter offener Hero: links Name und echte Registrierung, rechts unverändertes Drachenbild. Nur ein seitlicher Randverlauf verbindet das Originalbild mit dem schwarzen Hintergrund; keine farbliche Überlagerung des Motivs.
- Schlichte Kopfzeile und Fußzeile. Links zu „Über mich“, „Mein Setup“ und „Meine Apps“ erscheinen erst, wenn dort reale Inhalte vorhanden sind.
- Breite ruhige Abschnitte mit dünnen Trennlinien, Komponenten als Definitionsliste, Projekte als offene Bild-/Textzeilen, keine wiederholte Kachelsammlung.
- Echte Uploadbilder verwenden zusammengehörige, gleichmäßig angeordnete Bildflächen. Die Vergrößerung im Dialog ist eine funktional notwendige Ergänzung zum statischen Konzept, damit hochgeladene Fotos und App-Screenshots tatsächlich betrachtet werden können.
- Symbole aus dem bestehenden SVG-Satz, Pfeil mit 1,8 px Strichstärke. Interaktive Texte, Eingaben, Links und Überschriften bleiben HTML.

## Erlaubter Text im leeren Startzustand

„Crazy_Batto“, „Crazy_Batto Discord App“, „Zur Registrierung“, „Mit Discord registrieren. Nach meiner Freigabe kannst du die Android-App herunterladen.“, „Zugang anfragen“, „Schon registriert? Status ansehen“. Keine anderen persönlichen Aussagen. Systemfehler erscheinen nur beim tatsächlichen Ladefehler.

## Reaktions- und Inhaltsregeln

- Registrierung bleibt unter `/portal`; der öffentliche Auftritt unter `/` ist ohne Anmeldung lesbar.
- Website-API enthält ausschließlich veröffentlichte Inhalte. Darstellung über `textContent`, kein HTML aus Inhaltsfeldern.
- Bilder werden nur anhand bekannter Bild-IDs auf feste lokale Routen aufgelöst. Externe Bild-URLs werden niemals verwendet.
- Projekt-/Sociallinks werden ausschließlich bei zulässigem HTTPS-Link oder exakt `/portal` aktiviert. Kein leerer oder vorgetäuschter Link.
- Bilder ohne verfügbare Datei werden ausgeblendet. Leere Abschnitte und die zugehörige Navigation verschwinden.

## Abschließender Vergleich

Methode: lokaler Playwright-Chromium mit dem echten HTTP-Service und einer ausschließlich temporären Testdatenbank. Browser/IAB hat keine Verbindung zu diesem Entwicklungscontainer. Der Entwurf des leeren Startzustands und die jeweils neuesten echten Screenshots wurden in demselben `view_image`-Durchgang angesehen, darunter Desktop 1536 × 1024 und Mobil 390/320 px. Setup und Apps wurden zusätzlich jeweils mit ihrer eigenen Strukturstudie im selben Durchgang verglichen.

| Vergleichspunkt | Befund und Umsetzung |
|---|---|
| Sichtbarer Text | Der automatische Textvergleich des leeren Startzustands entspricht der erlaubten Liste. Keine Biografie, Hardwareliste oder Projektbeschreibung aus den Strukturstudien wird als Anfangsinhalt ausgeliefert. |
| Aufbau | Header mit Brand links und Registrierung rechts, offener Hero mit Name links und Originalmotiv rechts, schmale Fußzeile mit Trennlinie. Leere Abschnitte erzeugen keine Leerflächen. |
| Typografie | Appname in zwei bewusst gesetzten Zeilen. Kräftige Hauptüberschrift, zurückhaltende funktionale Erklärung, eigene Größen für Buttons und Links. Die Android-Kopfzeile nutzt ebenfalls zwei vollständige Zeilen. |
| Farben und Flächen | Nahezu schwarzer neutraler Grund, silberne Texte, graue Begleittexte und roter CTA wie im finalen Konzept. Keine erfundenen Karten oder farbige Überlagerung des Originals. |
| Motiv und Beschnitt | Der erste Browserstand schnitt Drachenkopf und Schwert zu eng an. Behoben durch vollständige Darstellung im ursprünglichen Seitenverhältnis und dezentes Ausblenden an den Rändern. Die Originaldatei bleibt bytegleich. |
| Abstände | Der Text saß im ersten Desktopstand höher als im Konzept. Die obere Innenluft des Desktop-Herotextes wurde korrigiert; Primäraktion und Statuslink sitzen jetzt im unteren linken Heroabschnitt. |
| Kleine Displays | 320–1536 px ohne horizontalen Überlauf, einschließlich maximal langer Inhaltsfelder. Bei 320 px entfällt nur der dekorative Pfeil in der Headeraktion, damit Brand und Registrierung in eine Zeile passen. Inhalte sind vertikal scrollbar. |
| Befüllte Inhaltsstruktur | Über-mich-Text/Bild, Komponenten mit feinen Trennlinien, freie Projektzeilen und echte Bildvergrößerung funktionieren. Diese Struktur ist vorbereitet, der Besitzer entscheidet später über reale Texte/Bilder. |
| Bilder und Dialog | Echte JPEG-, PNG- und WebP-Uploads werden im Browser dekodiert. Eine rein bildbasierte Veröffentlichung funktioniert ohne Text; Bilddialog mit Beschriftung sowie Escape/Schließen funktionieren. |

Bewusste Abweichungen von den **frühen internen Strukturstudien**: Dort gezeigte Texte, Setupdaten und weiterer Appname werden aufgrund der anschließenden ausdrücklichen Nutzerpräzisierung nicht vorbefüllt. Die Apps sind neutrale offene Bild-/Textzeilen statt eines fest eingebrannten Dragon-Werbebanners; dadurch können die später hochgeladenen eigenen Projektbilder unverfälscht erscheinen. Bildvergrößerung und lange freie Inhalte sind funktional notwendige Varianten des statischen Entwurfs. Die Originalgrafik wird direkt verwendet; das Bildgenerierungsmodell hat das Motiv in den Konzepten leicht anders proportioniert, was nicht als neue Nutzerdatei übernommen wird.

Der veröffentlichte leere Startzustand wurde gegen das neue finale Konzept überprüft. Nach Korrektur des Beschnitts und der Abstände bleiben keine wesentlichen behebbaren Layoutabweichungen oder abgeschnittenen Bedienelemente. Die Bild-/Textfreiheit bleibt erhalten.

## Prüfungen

- `qa/site-app-tests.log`: 106 bestehende App-Tests bestanden.
- `qa/site-access.json`: 13 Browsergruppen für umbenannte Android-Webansicht und bestehende Portal-/Freigabeflüsse bestanden.
- `qa/site-browser.json`: 16 Browsergruppen mit echtem lokalem HTTP-Service, privatem Upload/Entwurf, Veröffentlichung und Entzug bestanden. Nach der einmaligen synthetischen Betreiberanmeldung führen jegliche weiteren Discord-Aufrufe zum Testfehler; tatsächlich keine Discord-Aufrufe, Fremd-Requests oder Browserfehler.
- Finale reine Medienprüfung nach den CSS-Korrekturen: Originalmotiv vollständig bei 1536, 390 und 320 px dargestellt. Kein externer Dienst wurde angesprochen.
