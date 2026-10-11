# Crazy_Batto – Übergabe für den nächsten Chat

**Stand: 11. Oktober 2026 · Version 7.** Die bestehende Webseite ist auf den ursprünglichen Seitenaufbau zurückgeführt. Die passenden Bilder sind an ihren vorhandenen Plätzen ausgetauscht; die früher ausdrücklich gewünschte Maus ist als einzelnes Foto eingefügt.

## 1. Ziel und aktueller Stand

Eine persönliche, deutschsprachige Webseite für **Crazy_Batto** mit Vorstellung, Hardwaregeschichte, aktuellem Gaming-Setup und eigenen Softwareprojekten. Das Projekt ist eine vollständig lokal nutzbare statische Webseite aus HTML, CSS und JavaScript. Es gibt sechs echte Seiten, gemeinsame Navigation und zwei unabhängige Bildergalerien.

| Datei in `webseite/` | Inhalt |
| --- | --- |
| `index.html` | Animierter Header, Drachenlogo, Porträt, Kurzvorstellung, „Über mich“, Links zu beiden Setup-Seiten, Software-Vorstellung sowie vorbereitete Team-/Kontaktbereiche |
| `altes-setup.html` | „Mein altes Setup – So habe ich angefangen“ mit der Geschichte ab 2022, Komponenten und drei Bildern |
| `gaming-setup.html` | „Mein Gaming-Setup“ mit einem Gesamtfoto als Titelbild, zehn Galeriefotos und der vollständigen vereinbarten Ausstattung |
| `software.html` | „Software“, Projekt 01: Batto OBS Tool, ausgewählte Funktionen und acht Programmscreenshots |
| `discord-app.html` | Projekt 02: Crazy_Batto Discord App, vorhandene Funktionen und App-Abbildung |
| `registrierung.html` | Discord-Anmeldung, Zugangsanfrage, Freigabestatus und geschützter Download; lokal als ausdrückliche Vorschau |

Die gemeinsame Navigation führt zu Start, Über mich, Mein altes Setup, Mein Gaming-Setup, Software, Team und Kontakt. „Über mich“, Team und Kontakt sind Abschnitte der Startseite. Beide Setup-Themen und Software sind eigene Seiten.

Die zuletzt gezeigte Chat-Vorschau startete direkt bei **Software**, damit die neueste Änderung sofort sichtbar war. Für die gewöhnliche Webseite bleibt `index.html` die Startseite.

## 2. Designentscheidungen

Der Nutzer hat zuerst Weiß, Gold und Carbon gewünscht und diesen Entwurf anschließend ausdrücklich verworfen, weil er zu weiß war. Der aktuelle Wunsch lautet **dunkler Marmor und Gold**.

Der bestehende Entwurf verwendet:

- Schwarzen bzw. sehr dunklen Marmor mit natürlichen goldenen Adern.
- Anthrazitfarbene Inhaltsflächen, Navigation, Bilderrahmen und Fußbereich.
- Warme Goldtöne für Überschriftenakzente, Linien, Links und Buttons.
- Helle, gut lesbare Schrift.
- Responsive Anordnung für Handy und größere Bildschirme.

Die wesentlichen Farbwerte stehen in `quellcode/style.css`: dunkle Grundfläche `#101114`, heller Text `#eee9de`, sekundärer Text `#b9b4aa`, Gold `#d9b770`. Der Hintergrund liegt als `webseite/assets/marble-gold.webp` vor; sein ursprünglicher Generierungsprompt ist in `webseite/assets/marble-gold-prompt.txt` gespeichert.

Das ist der aktuelle Ausgangspunkt für weitere Änderungen. Neue Inhalte sollen in diesen vorhandenen Entwurf eingefügt werden.

## 3. Marke, Kopfbereich und persönliche Vorstellung

Die vom Nutzer vorgegebenen Angaben lauten:

- **Crazy_Batto**
- **Inhaber und Gründer von Team TABH**
- **36 Jahre alt**
- **Social-Media-Content-Creator für Hardware und Gaming**

Texte sind sprachlich geglättet und in persönlicher Ich-Form geschrieben. Der Markenname auf dieser Webseite ist Crazy_Batto; das Team in dieser Projektvorstellung heißt Team TABH.

Das ursprüngliche Drachenlogo und das Porträt sind unverändert eingebunden. Der Header auf der Startseite ist ein echtes GIF in Endlosschleife. Eine Schaltfläche wechselt zwischen Animation und Standbild. Eine Systemeinstellung für reduzierte Bewegung wird berücksichtigt.

| Medium | Datei im Paket | Eigenschaften |
| --- | --- | --- |
| Verwendeter Web-Header | `webseite/assets/header.gif` | 1260 × 420 Pixel, 20 Bilder/s, ungefähr 12 Sekunden |
| Zusätzlicher HQ-Export | `arbeitsmaterial/extra/Crazy_Batto-Header-HQ.gif` | 2160 × 720 Pixel, 30 Bilder/s; die große Datei im Paket |
| Ursprüngliches Header-Video | `arbeitsmaterial/originale/header-quelle.mp4` | Grundlage für die GIF-Erstellung |
| Standbild | `webseite/assets/header-poster.webp` | Wird beim Pausieren eingeblendet |
| Porträt | `webseite/assets/portrait.png` | Original „Dein Porträt.png“ |
| Logo | `webseite/assets/logo.jpeg` | Original „Mein Logo.jpeg“ |

In der kompakten Chat-Vorschau wurde das GIF durch eine eingebettete MP4-Version ersetzt, um die Dateigröße zu begrenzen. Die ausgelieferte Webseite verwendet weiterhin das GIF.

### Über mich – vereinbarte Geschichte

2022 hat Crazy_Batto wieder angefangen, sich mit PCs zu beschäftigen. Seitdem ist sein Ziel, den eigenen PC ständig zu verbessern. Dabei hat er sich auf **ASUS ROG** konzentriert.

Mit der Zeit begann er, Grafikkarten zu sammeln. Genannt sind **Matrix 5870, Matrix GTX 780 Ti, Poseidon GTX 780, HD 7970, MARS 760 Dual GPU** und weitere Modelle. Bei den Mainboards nennt er das **ROG Crosshair VIII** und **zweimal das ROG Crosshair VIII Formula**.

Sein besonderes Schmuckstück ist das **ROG Crosshair X870E Glacial** als Herz des neuen Systems zusammen mit der **ROG Astral RTX 5080**. Der Vorstellungstext verlinkt dazu auf „Mein Gaming-Setup“.

„Über mich“ steht auf der Startseite vor den Setup-Verweisen. Die frühere Bitte, die Abschnitte 3 und 4 zu tauschen, ist in diese Reihenfolge eingeflossen; die fertige Webseite zeigt keine alten Entwurfsnummern.

## 4. Mein altes Setup – So habe ich angefangen

Der Nutzer wollte diesen Bereich ausdrücklich auf einer eigenen Seite. Die Geschichte beginnt **2022**.

| Schritt | Angaben |
| --- | --- |
| Anfang | B450 AORUS ELITE; AMD Ryzen 5 5600; Kingston DDR4 HyperX Predator 32 GB; ASUS Radeon RX 480 ROG STRIX OC 8 GB GDDR5 |
| Späterer Umbau | Wechsel zum ASUS ROG Strix B450-F Gaming und ASUS ROG Strix LC III 360 ARGB LCD White Edition |
| Grafikkarten-Umbau | RX 480 auf AIO umgebaut, mit NZXT RL-KRX53 und NZXT Kraken G12 GPU-Montagehalterung |

Die zeitliche Erzählung entspricht den Angaben des Nutzers; zusätzliche Kauf-, Umbau- oder Produktdaten wurden nicht erfunden.

| Ursprünglicher Upload | Datei in `webseite/assets/` |
| --- | --- |
| `Anfang.jpeg` | `13_Anfang_bearbeitet.png` |
| `Altes setup.jpeg` | `14_Altes-Setup_bearbeitet.png` |
| `Kraken G12.png` | `15_Kraken-G12_bearbeitet.png` |

## 5. Mein Gaming-Setup

Die vollständige vereinbarte Liste steht in `quellcode/gaming-specs.html` und ist auf `gaming-setup.html` eingebunden. Sie umfasst **neun Kategorien mit 33 Einträgen**.

### PC-Komponenten

- AMD Ryzen 7 9800X3D
- ASUS ROG Crosshair X870E Glacial
- ASUS ROG Astral GeForce RTX 5080, 16 GB
- Corsair Vengeance RGB DDR5-6000 CL30, 32 GB (2 × 16 GB)
- Corsair Vengeance RGB DDR5 Light Enhancement Kit
- ASUS ROG Strix 1200 W Platinum
- Lian Li O11 Dynamic, weiß

### Wasserkühlung

- Alphacool Full-Cover GPU-Wasserblock
- EK Quantum Velocity² D-RGB CPU-Waterblock
- Aqua Computer D5 NEXT
- Aqua Computer high flow NEXT
- Stealkey Customs SK-Crosscool III (Lian Li O11 Dynamic EVO RGB)
- 3 × Corsair 360-mm-Radiatoren

### Lüfter, Steuerung und RGB-Zubehör

- 9 × Corsair iCUE LINK RX120 PWM-Lüfter, 120 mm, weiß
- 3 × Corsair QL120 RGB PWM-Lüfter, 120 mm
- Lian Li EDGE HUB, 4 × USB, 6 × PWM, weiß
- Lian-Li Strimer Wireless
- Lian-Li Strimer Wireless 12V-2x6 GPU-Kabel
- 1 × Custom RGB Slotcover Crazy_Batto, weiß
- 1 × Custom RGB Slotcover ASUS ROG mit Logo, weiß
- 3 × RGB Slotcover / Slotblende Viking, mit RGB, weiß

### Monitore

- Minifire Curved, 34″ · 165 Hz · 3440 × 1440
- LG UltraGear Curved, 49″ · 5120 × 1440
- Samsung Curved Monitor, 27″

### Tastaturen

- ASUS ROG Azoth White RGB, 75 %
- Roccat Vulcan 122 AIMO

### Mäuse

- ASUS ROG Spatha X
- Mad Catz R.A.T. 8, weiß

### Handheld und portables Display

- Steam Deck
- Portable Touch Monitor, 10,3″ · 1920 × 720 · 60 Hz

### Controller

- Xbox Elite Controller Series 2
- PlayStation 5 Controller

### Mikrofon

- ROG Carnyx, weiß

Weitere Modellvarianten, Speicherlaufwerke, Monitorfrequenzen oder Ausstattungsangaben aus anderen Chats gehören nicht automatisch zu dieser vereinbarten Liste. Insbesondere wurde für den LG-Monitor hier keine Bildwiederholrate genannt und für den Samsung-Monitor keine Auflösung.

Die Gehäusebezeichnung **O11 Dynamic** und der Klammerzusatz **O11 Dynamic EVO RGB** beim SK-Crosscool III wurden vom Nutzer unterschiedlich angegeben und so erhalten.

### Fotos

Das Titelbild bleibt die zugewiesene Gesamtansicht des Gaming-Platzes. Die fertige Bearbeitung `16_Ganzes-Setup_bearbeitet.png` ersetzt `gaming-setup-gesamt.jpeg` an demselben Platz.

Die vorhandene Galerie hat nach dem Entfernen der doppelten Aufbauaufnahme zehn Einträge in dieser Reihenfolge:

1. `gamingCoolingFront`: bestehende Frontaufnahme `gaming-wasserkuehlung-front.jpg`.
2. `gaming1`: bestehendes Foto `gaming-1.jpg`.
3. `gaming4`: bestehendes Foto `gaming-4.jpg`.
4. `gaming2`: bestehendes Foto `gaming-2.jpg`.
5. `gaming3`: bestehendes Foto `gaming-3.jpg`.
6. `gaming7`: bestehendes Foto `gaming-7.jpeg`.
7. `gaming8`: ersetzt durch `24_Wasserkuehlung_Rote-Rohre_Detail-1.png`.
8. `gaming9`: ersetzt durch `25_Wasserkuehlung_Rote-Rohre_Detail-2.png`.
9. `gamingBuild`: ersetzt durch `23_PC-Aufbau_ohne-Rohre_bearbeitet.png`.
10. `gamingSlotcovers`: bestehendes Foto `gaming-rgb-slotcover.jpeg`.

`gaming-5.jpg` zeigt denselben Aufbau als anderen Ausschnitt und ist als Dopplung entfernt. Auch die identischen gelieferten Originale `5(3).jpg` und `5(4).jpg` werden durch die eine fertige PNG23 abgedeckt. Die übrige Reihenfolge, die vorhandenen Beschriftungen und das Galerielayout bleiben erhalten. Der Zähler beginnt bei 1 / 10.

Die Baseline verwendete die Frontaufnahme vorläufig als Startbild, weil eine Datei mit dem genauen Namen „Vom Aufbau bis zur Wasserkühlung“ nicht gefunden worden war. Diese bestehende Auswahl wird bei der reinen Austauschkorrektur beibehalten. Eine abweichende Zuordnung wird nicht behauptet.

## 6. Software – Projekt 01: Batto OBS Tool

Der Nutzer hat die Softwarevorstellung zuletzt beauftragt. Der gewünschte Name lautet **Batto OBS Tool**. Die Vorstellung beschreibt ein selbst programmiertes Tool für den Creator-Alltag. Als erster Einblick werden nur ausgewählte Bereiche gezeigt.

### Freigabe und Umfang

Die ausdrückliche Nutzervorgabe: **Nicht alles veröffentlichen, da das Programm noch nicht von ihm freigegeben ist.**

- Auf der Seite steht deutlich **„In Entwicklung · Noch nicht freigegeben“**.
- Das Programm steht dort **nicht zum Download**.
- Es wird kein Release-Datum genannt.
- Es gibt keine vollständige Funktionsliste.
- Das vorliegende Paket enthält die Webseite über das Tool, nicht dessen Programmcode oder Installer.

### Ausgewählte Inhalte

| Bereich | Aktueller Inhalt der Vorstellung |
| --- | --- |
| Multi-Chat | TikTok, YouTube und Twitch in einer gemeinsamen Ansicht |
| CNG | Die Anbindung steht noch aus |
| RGB | Effekte gestalten und in einer grafischen Setup-Vorschau ansehen |
| Lüfterkurven | Eigene Kurven entwerfen und anpassen; im gezeigten Entwicklungsstand übernimmt iCUE die tatsächliche Lüftersteuerung |
| Jarvis | Ein eigener Assistent, als erster Einblick vorgestellt |
| Batto Touch Deck | Ausgewählte Befehle und Aktionen über Schaltflächen aufrufen |
| Anpassbarkeit | Chatfarben, Hintergründe und zusätzliche Widget-Fenster |

Die Schreibweise im aktuellen Webseitentext lautet **Jarvis**. Frühere Bezeichnungen wie „Creator Hub“ oder abweichende Schreibweisen aus anderen Projekten werden nicht auf diese Seite übertragen.

Die Screenshots zeigen Entwicklungsstände. Die **Strimer-Wireless-Ansicht ist ausdrücklich eine virtuelle Demo ohne Hardware-Ausgabe**. Die Texte behaupten deshalb keine allgemeine, bereits fertige Ansteuerung jeder gezeigten Hardware. Der entsprechende Hinweis steht in der Bildunterschrift.

### Zuordnung aller neun letzten Uploads

| Ursprünglicher Upload | Inhalt | Verwendung / Datei |
| --- | --- | --- |
| `1000157322.jpg` | Startoberfläche mit Drachenmotiv | Titelbild und Startseitenverweis; `webseite/assets/software-start.jpg` |
| `1000157321.jpg` | Multi-Chat | Galerie 1; `webseite/assets/software-multi-chat.jpg` |
| `1000157318.jpg` | RGB-Vorschau | Galerie 2; `webseite/assets/software-rgb.jpg` |
| `1000157323.jpg` | Lüfterkurven | Galerie 3; `webseite/assets/software-luefterkurven.jpg` |
| `1000157324.jpg` | Jarvis / Touch Deck | Galerie 4; `webseite/assets/software-touch-deck.jpg` |
| `1000157319.jpg` | Virtuelle Strimer-Demo | Galerie 5; `webseite/assets/software-strimer.jpg` |
| `1000157325.jpg` | Widget-Fenster | Galerie 6; `webseite/assets/software-widgets.jpg` |
| `1000157320.jpg` | Arbeitsoberfläche | Galerie 7; `webseite/assets/software-uebersicht.jpg` |
| `1000157317.jpg` | Handy-Screenshot der bestehenden Webseite | Referenz unter `arbeitsmaterial/referenzen/website-1000157317.jpg`; kein Programmscreenshot |

Es sind somit **acht Programmbilder: ein Titelbild und sieben Galerieansichten**. Das neunte Bild gehört nicht zur Softwaregalerie. Die acht Programmbilder wurden gegenüber den Uploads nicht verändert. Die normale Webseite bietet für das gewählte Galeriebild einen Link zum Öffnen in voller Größe.

## 7. Bearbeitbare Dateien und Build

`quellcode/` ist die maßgebliche Quelle innerhalb dieses Übergabepakets. Die ursprüngliche Arbeitsfassung hieß `website-source/`; der Build wurde für die Übergabe auf die hier enthaltenen, relativen Ordnerpfade angepasst.

| Datei in `quellcode/` | Aufgabe |
| --- | --- |
| `layout.html` | Gemeinsame Hülle, Logo, Navigation und Footer |
| `document.html` | Vollständiger HTML-Seitenrahmen, Metadaten, CSS-/JS-Einbindung |
| `banner.html` | Animierter Header mit Pausenschalter |
| `home.html` | Startseite mit Vorstellung und Projektverweisen |
| `old.html`, `old-intro.html`, `old-history.html` | Alte Setup-Seite |
| `gaming.html`, `gaming-intro.html`, `gaming-specs.html`, `gallery.html` | Gaming-Setup-Seite und Fotogalerie |
| `software.html`, `software-gallery.html` | Softwarevorstellung und Screenshot-Galerie |
| `style.css` | Gemeinsame Gestaltung, einschließlich dunklem Marmor und Gold |
| `script.js` | Header-Pause, unabhängige Galerieauswahl und Navigation der Chat-Vorschau |
| `inline-template.html`, `inline-assets.html` | Vorlagen für die optionale eingebettete Chat-Vorschau |
| `build.py` | Erzeugt die vier Webseiten und optional die Chat-Vorschau |
| `LIESMICH.txt` | Lesehinweise für die fertig gebaute Webseite |

Ein normaler Build ist mit `python3 quellcode/build.py` aus dem entpackten Projektordner möglich. Er benötigt keine externen Python-Pakete, keine Node-Installation und keine Internetverbindung. Die Originalbilder bleiben in `webseite/assets/`.

Mit `--preview-output DATEIPFAD` kann zusätzlich eine HTML-Fragmentdatei erzeugt werden. Dafür liegen sämtliche benötigten komprimierten Medien unter `arbeitsmaterial/vorschau/`. Eine neue interaktive Vorschau muss im nächsten Chat mit dessen verfügbaren Vorschaufunktionen ausgegeben werden; frühere absolute Workspace-Pfade sind dort nicht gültig.

Die Galerien werden getrennt über `data-gallery` initialisiert. Der Software-Bereich darf nicht versehentlich die Gaming-Bilder oder deren Zähler ändern. Die gemeinsame CSS-Wurzel ist `#cb-website`.

### Nicht als aktuellen Stand verwenden

Frühere Skizzen, weiße Entwürfe und alte Einzeldateien wie `header-template.html` wurden durch die aktuelle Vier-Seiten-Fassung abgelöst. Sie sind für die Fortsetzung nicht erforderlich. Alle aktuellen Inhalte stehen in diesem Paket.

## 8. Frühere Prüfungen vor dieser Austauschkorrektur

Vor dieser Übergabe wurden die vier Seiten, sämtliche internen Links und Anker, die acht unveränderten Software-Originalbilder und die Einbettung der Medien geprüft.

Eine Prüfung mit lokalen DOM-Stubs bestätigte die 15 Galerieauswahlen beider Galerien sowie die internen Vorschau-Verknüpfungen. Bilddaten, Alternativtexte, Beschriftungen, Zähler, Auswahlzustände und der Software-Originalbildlink wurden dabei geprüft. Die jeweils andere Galerie blieb unverändert.

Die Software-Vorschaubilder stehen am Desktop in vier Spalten und unter 580 Pixeln in zwei Spalten. Die Software-Einführung wird unter 900 Pixeln einspaltig, die Funktionsübersicht unter 580 Pixeln. Die letzte Chat-Vorschau lag unter 1 MB.

Eine zusätzliche visuelle Browserprüfung war in der bisherigen Arbeitsumgebung nicht verfügbar. Das ist eine Grenze der bisherigen Prüfung, kein behaupteter vollständiger Browser-Test.

## 9. Tatsächlich noch offene Inhalte

- Teammitglieder und ausführlichere Teamdarstellung.
- Echte Kontaktmöglichkeiten und klickbare Social-Media-Links. Bisher stehen die Plattformnamen als Text im vorbereiteten Kontaktbereich.
- Vollständige Inhalte für Impressum und Datenschutz. Die Begriffe stehen bisher nur im Footer; entsprechende Seiten wurden nicht erstellt.
- Hosting, Domain und öffentliche Bereitstellung der Webseite.
- Weitere Softwareprojekte, sofern der Nutzer sie als nächste Inhalte vorgibt.

Für die zuletzt gewünschte Batto-OBS-Tool-Seite ist kein unerledigter Änderungsauftrag offen. Die nächste konkrete Erweiterung wird im neuen Chat vorgegeben.

## 10. Praktische Hinweise für die Fortsetzung

Der Nutzer möchte direkte Umsetzung, saubere deutsche Formulierungen und sichtbare Ergebnisse. Die bestehenden Dateien und die bereits gewählten Inhalte sind der Ausgangspunkt. Fehlende Angaben nicht aus anderen Erinnerungen oder älteren Projekten hineinmischen.

Frühere Nachrichten enthielten automatische Meldungen, dass Bilder nicht gefunden werden konnten. Die relevanten Dateien waren tatsächlich vorhanden und sind jetzt im Paket enthalten. Für diese vorhandenen Bilder ist kein erneutes Hochladen erforderlich, solange das Paket im neuen Chat verfügbar ist.

Nach weiteren Änderungen die gesamte Webseite wieder als vollständiges Paket mit allen benötigten Medien bereitstellen. Einzelne frühere Chat-Dateilinks oder absolute Pfade ersetzen keine Dateiübertragung in einen neuen Chat.

## 11. Ergänzung am 10. Oktober 2026: Discord-App und Registrierung

Dieser Abschnitt ergänzt den zuvor beschriebenen Vier-Seiten-Stand. Aktuell
sind es sechs Seiten. Der Nutzer verlangte wörtlich „Am 2022 habe ich wieder
angefangen“; der Satz in `home.html` wurde entsprechend übernommen und soll
nicht stillschweigend wieder auf „2022 habe ich …“ zurückgesetzt werden.

Die Startseite stellt jetzt beide Projekte vor. Navigation und Footer enthalten
Discord-App und Registrierung. Das Batto OBS Tool bleibt inhaltlich unverändert:
keine Freigabe, kein Programm-Download, kein Release-Termin, CNG ausstehend,
iCUE für die tatsächliche Lüftersteuerung und Strimer als virtuelle Demo.

`discord.html` beschreibt die vorhandene Crazy_Batto Discord App. Das Bild
`assets/discord-app.png` ist die unveränderte echte App-Abbildung aus dem alten
Projekt mit ausdrücklich bezeichnetem Testkonto. Nur Moderatorrolle bei
Modstempel; @everyone bei Stream, BIG Match, Allgemein und Umfrage. Events
werden ohne zusätzliche Kanalnachricht angelegt. Die APK ist für Android.

`registration.html` und `registration.js` folgen dem bereits implementierten
Portalvertrag: Discord-OAuth, danach ein ausdrücklich abgesendeter Antrag mit
optionaler Nachricht (max. 500 Zeichen), Eigentümerentscheidung und erst danach
ein durch Sitzung und aktuelle Freigabe geschützter Download. Keine neue
E-Mail-/Passwortregistrierung. Die Windows-Verwaltung zeigt Anfragen und
benachrichtigt bei bestehender Verbindung; keine Hintergrundzustellung bei
ausgeschaltetem PC versprechen.

Der Modus ist standardmäßig `data-portal-mode="offline"`. Die Einzeldatei und
das normale Webseiten-ZIP senden keine Portal-Anfragen. Sie zeigen ausdrücklich
beschriftete Beispielansichten. Nur `export_server.py` setzt den Modus auf
`live` und erzeugt absolute URLs für den vorhandenen Backend-Server. Seine
Portal-APIs und Freigabeprüfungen bleiben maßgeblich. Eine Auswahl der Ansicht
„Freigegeben“ in der Offline-Vorschau erteilt keine echte Freigabe.

Die neue Server-Startseite und die sechs Inhalte liegen unter
`server/public/showcase`; die bisherige über die PC-Verwaltung bearbeitbare
CMS-Ansicht bleibt unter `/site` erhalten. Deren Schema wurde nicht auf die
umfangreichere neue Sechs-Seiten-Webseite übertragen: Es hat bisher nur einen
Setup-Bereich und weniger Hardwareeinträge. Eine Erweiterung der PC-Bearbeitung
für alle neuen Vorlagen ist ein eigener, noch offener Schritt.

Neue Quelldateien: `discord.html`, `discord.css`, `registration.html`,
`registration.css`, `registration.js`, `export_server.py` sowie die portable
Einzeldatei-Erzeugung unter `quellcode/offline/`. `build.py` bündelt die drei
CSS-Dateien und die beiden JavaScript-Dateien. Die kleine bisherige
Chat-Vorschau kann durch die zusätzlichen Inhalte größer als 1 MB sein;
die Offline-HTML verwendet alle Originalmedien ohne diese Größenbegrenzung.

## 12. Maßgebliche Korrektur: nur vorhandene Bilder austauschen

Der Nutzer hat die eigenständigen Ergänzungen in V5/V6 ausdrücklich zurückgewiesen. Maßgebliche Struktur ist der vorhandene Stand vor dem Foto-Umbau, Git-Commit `7c129d94038c75e9f4a911d96158eac0f2518827`.

Es gibt wieder genau die beiden ursprünglichen Galerien: Gaming und Software. Die zusätzliche Hardware-Sammlungssektion, die zusätzliche Galerie auf „Mein altes Setup“ und die Mausgalerie samt ihren neuen Überschriften und Beschreibungen wurden entfernt. Die persönlichen Texte, die sechs Seiten, ihre Reihenfolge und die Gestaltung sind erhalten.

Sieben vorhandene Bildplätze verwenden die passenden fertigen PNG-Dateien. Die frühere Bitte um die Maus wird mit einem einzelnen Foto `08_ROG-Maus_Ansicht-06.png` vor dem vorhandenen Über-mich-Text umgesetzt, ohne zusätzliche Überschrift oder Beschreibung. Diese Aufnahme war bereits das Anfangsbild der entfernten Mausgalerie. Ein Originaldateiname exakt „MAus“ ist in der verfügbaren CSV nicht belegt.

Die vollständige Materialliste steht in `BILDZUORDNUNG_WEBSEITE.csv`; acht fertige PNGs werden verwendet. Die übrigen Bilder haben keinen zugeordneten vorhandenen Platz und bleiben in den ursprünglichen Fotopaketen erhalten. Aus ihnen keine neuen Abschnitte erstellen, solange der Nutzer das nicht beauftragt.

Die Offline-Datei sowie `index.html` und `00-STARTEN.html` im ZIP-Hauptordner starten wieder regulär oben. Der automatische Mausanker aus V6 wurde entfernt. Die Root-Startdateien führen auf die vorhandenen Seiten unter `webseite/`. Die dynamische Bildpfadübernahme im Build bleibt bestehen, damit die fertigen Fotos in allen Exporten gleich sind.

Diese Übergabe ersetzt die abweichenden Foto- und Einstiegsvorgaben aus V5/V6. Die Grenzen der Softwarevorstellung und die Freigabeabhängigkeit des echten App-Zugangs gelten weiter.
