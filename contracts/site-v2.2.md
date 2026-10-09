# Website-Vertrag 2.2

Sichtbarer Produktname: **Crazy_Batto Discord App**. `/v2`, Android-Paket, gespeicherte Schlüssel und `health.app: "Modstempel"` bleiben kompatibel.

## Statische Website und öffentliche Daten

- `GET|HEAD /` und `/site` und `/site/`: `server/public/site/index.html`.
- `/portal` und `/portal/`: bestehende Registrierung. Nach Portal-OAuth folgt die Weiterleitung **`/portal`**.
- `GET|HEAD /site/assets/{site.css,site.js,icons.svg,brand-dragon.jpeg,discord-app.png}`: exakte Dateinamen-Whitelist unter `server/public/site/`. Keine allgemeinen Dateipfade.
- `GET /site/api/content`: `{ok:true,version,publishedAt,content,images}`. `version` ist die veröffentlichte Inhaltsversion; `publishedAt` Millisekunden UTC oder `null` für die mitgelieferten Anfangsinhalte. `images` enthält ausschließlich referenzierte veröffentlichte Bilder.
- `GET|HEAD /site/media/:id`: nur aktuell im veröffentlichten Inhalt referenzierte hochgeladene Bilder. Unbekannte oder nur im Entwurf verwendete Bilder ergeben 404; Antworten werden nicht zwischengespeichert.
- `/health` ergänzt `displayName:"Crazy_Batto Discord App"`, `siteContent:true`, `appVersion:"2.2.0"`; `app:"Modstempel"`, `apiVersion:2`, `accessControl:true` bleiben.

## Inhaltsobjekt

Alle angegebenen Felder sind vorhanden. Texte sind Klartext, kein HTML. Arrays dürfen leer sein; `imageId` darf `null` sein. `url` darf `null` sein (dann kein Link).

```json
{
  "heroTitle": "Crazy_Batto",
  "heroText": "Content Creator. Eigene Ideen. Eigene Apps.",
  "about": {"title":"Über mich","text":"…","imageId":"brand-dragon","imageAlt":"Crazy_Batto Drachenmotiv"},
  "setup": {
    "title":"Mein Setup","text":"…",
    "components":[{"label":"Prozessor","value":"AMD Ryzen 7 9800X3D"}],
    "images":[{"imageId":"img_<64hex>","alt":"…","caption":"…"}]
  },
  "apps":[{"id":"discord-app","name":"Crazy_Batto Discord App","description":"…","imageId":"discord-app","imageAlt":"App-Vorschau","url":"/portal","buttonLabel":"Zugang beantragen"}],
  "socialLinks":[{"label":"GitHub","url":"https://github.com/…"}]
}
```

Grenzen (JS UTF-16-Zeichen): heroTitle 100, heroText 500; about/setup title 100 und text 5000; höchstens 24 Komponenten mit label 80 und value 300; höchstens 12 Setupbilder mit alt 300 und caption 500; höchstens 8 Apps mit eindeutiger id `[a-z0-9][a-z0-9-]{0,39}`, name 100, description 3000, imageAlt 300, buttonLabel 60; höchstens 12 socialLinks mit label 80; URL höchstens 1000. heroTitle, Komponentenfelder, App-ID/-Name und Link-Label sind nicht leer; Titel der Über-mich-/Setupabschnitte dürfen leer sein. Bilder müssen bekannte IDs sein; Setupbilder nicht null. URLs sind HTTPS ohne Zugangsdaten oder exakt `/portal`; keine anderen relativen Pfade oder URL-Schemata. Nicht bekannte Inhaltsfelder werden abgewiesen, damit ein Client keine Inhalte versehentlich verliert.

## Bildobjekte

Owner: `{id,url,mimeType,width,height,size,filename,builtIn}`. Öffentliche Antwort: gleich, **ohne filename**.

- Built-in `brand-dragon`: URL `/site/assets/brand-dragon.jpeg`, MIME `image/jpeg`.
- Built-in `discord-app`: URL `/site/assets/discord-app.png`, MIME `image/png`.
- Upload-ID: `img_` plus SHA-256 als 64 kleine Hex-Zeichen; öffentliche URL `/site/media/:id`, Owner-Vorschau `/v2/admin/site/images/:id` (Bearer erforderlich).
- Der ursprüngliche Dateiname ist ausschließlich Owner-Metadatum und wird nicht für Dateisystempfade oder öffentliche URLs benutzt.

## Besitzer-API

Alle `/v2/admin/site*` verwenden die bestehende Bearer-Anmeldung und `requireOwner`, einschließlich erneuter Prüfung vor dem Commit. Websiteänderungen erzeugen **keine Discord-Nachrichten**.

- `GET /v2/admin/site`: `{ok:true,version,publishedVersion,publishedAt,updatedAt,draft,published,images,quota:{usedBytes,maxBytes,maxImageBytes,maxImages}}`.
- `POST /v2/admin/site`, JSON `{expectedVersion,content}`: speichert einen Entwurf; erhöht globale `version` um 1. Antwort ist das komplette Owner-Objekt.
- `POST /v2/admin/site/publish`, JSON `{expectedVersion}`: veröffentlicht **den bereits gespeicherten Entwurf**, erhöht `version` um 1, setzt `publishedVersion` auf diese Version und `publishedAt` auf die aktuelle Zeit. Antwort ist das komplette Owner-Objekt.
- Fehlende/ungültige `expectedVersion`: 400; veraltete Version: 409 `kind:"conflict"`. Client lädt neu und überschreibt nicht automatisch.
- `POST /v2/admin/site/images`, JSON `{filename,mimeType,dataBase64}`: höchstens 4 MiB dekodiert, Standard-Base64 ohne Präfix/Leerzeichen; MIME exakt `image/jpeg`, `image/png`, `image/webp`. Maximal 32 Millionen Pixel, keine erfundenen Maße vom Client. Dateiinhalt und Bildstruktur werden geprüft. Rückgabe `{ok:true,image,images,quota}`; identische Bytes werden dedupliziert. Ändert die Inhaltsversion nicht.
- `GET|HEAD /v2/admin/site/images/:id`: authentifizierte Bildbytes; Built-ins dürfen hier ebenfalls gelesen werden. Die `url` der Built-ins bleibt der feste statische Pfad.
- `DELETE /v2/admin/site/images/:id`: nur eigene Uploads, die weder im Entwurf noch in der veröffentlichten Fassung vorkommen. Referenziert oder Built-in: 409. Rückgabe `{ok:true,images,quota}`. Ändert Inhaltsversion nicht.
- Gesamtgrenze: 100 MiB und 100 Uploads; JSON-Upload-Limit 6 MiB, Inhalts-JSON-Limit 64 KiB. Keine beliebigen URLs zum Bildabruf, keine SVG/HTML-Dateien.

## Speicherung und Anfangsinhalte

Die bestehende private Dateidatenbank erhält additive `site`-Daten; bestehende Registrierungen und App-Daten bleiben erhalten. Uploadbytes liegen privat unter `DATA_DIR/site-images`, getrennt von Discord-Beitragsbildern. Backups benötigen die Datenbank **und beide Bildordner**.

`server/site-default.json` enthält exakt das obige Inhaltsobjekt und wird **nur beim erstmaligen Anlegen von Websiteinhalten** übernommen. Root liefert diese Datei samt tatsächlich vorhandenen, passenden Built-in-Bildern. Bei fehlender Datei wird ein zurückhaltender Crazy_Batto/Discord-App-Standard verwendet. Ein erneuter Serverstart oder Paketupdate überschreibt keine gespeicherten Inhalte. Ausgelieferte Anfangsinhalte erscheinen öffentlich; sie sind keine Anmeldung oder Serverbereitstellung.
