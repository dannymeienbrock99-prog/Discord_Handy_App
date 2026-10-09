using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Modstempel.Desktop
{
    public static class SitePolicy
    {
        public const int ImageLimit = 4 * 1024 * 1024;
        public const int ContentLimit = 64 * 1024;
        public const long PixelLimit = 32000000;
        public static bool ValidImageId(string id)
        { return id == "brand-dragon" || id == "discord-app" || id != null && Regex.IsMatch(id, "^img_[a-f0-9]{64}$"); }
        public static string ImagePath(string id)
        {
            if (!ValidImageId(id)) throw new ArgumentException("Bitte ein vorhandenes Website-Bild auswählen.");
            return "/v2/admin/site/images/" + id;
        }
        public static string Link(string text, bool optional = true)
        {
            text = (text ?? "").Trim();
            if (text.Length == 0 && optional) return null;
            if (text == "/portal") return text;
            Uri uri;
            if (text.Length > 1000 || text.Any(Char.IsControl) || text.Any(Char.IsWhiteSpace) || text.IndexOf('\\') >= 0 ||
                !text.StartsWith("https://", StringComparison.OrdinalIgnoreCase) || !Uri.TryCreate(text, UriKind.Absolute, out uri) ||
                uri.Scheme != "https" || uri.Port != 443 || !String.IsNullOrEmpty(uri.UserInfo) || String.IsNullOrEmpty(uri.IdnHost))
                throw new ArgumentException("Links müssen vollständige HTTPS-Adressen ohne Zugangsdaten oder genau /portal sein.");
            var canonical = new UriBuilder(uri) { Host = uri.IdnHost, Port = -1 }.Uri.AbsoluteUri;
            if (canonical.Length > 1000) throw new ArgumentException("Die normalisierte Link-Adresse ist länger als 1000 Zeichen.");
            return canonical;
        }
        private static string Text(string value, int max, string label, bool required = false)
        {
            value = (value ?? "").Trim();
            if (value.Length > max || value.Any(c => Char.IsControl(c) && c != '\n' && c != '\r' && c != '\t'))
                throw new ArgumentException(label + " darf höchstens " + max + " Zeichen und keine unsichtbaren Steuerzeichen enthalten.");
            if (required && value.Length == 0) throw new ArgumentException("Bitte " + label + " ergänzen.");
            return value;
        }
        private static string Reference(string id, HashSet<string> images, bool required = false)
        {
            if (String.IsNullOrEmpty(id) && !required) return null;
            if (!ValidImageId(id) || !images.Contains(id)) throw new ArgumentException("Ein zugeordnetes Bild fehlt. Bitte das Bild erneut auswählen.");
            return id;
        }
        public static SiteContent Normalize(SiteContent value, IEnumerable<SiteImage> images)
        {
            if (value == null || value.About == null || value.Setup == null || value.Apps == null || value.SocialLinks == null ||
                value.Setup.Components == null || value.Setup.Images == null) throw new ArgumentException("Der Website-Inhalt ist unvollständig. Bitte den Serverstand erneut laden.");
            if (value.Setup.Components.Count > 24 || value.Setup.Images.Count > 12 || value.Apps.Count > 8 || value.SocialLinks.Count > 12)
                throw new ArgumentException("Erlaubt sind bis zu 24 Setup-Komponenten, 12 Setup-Bilder, 8 Apps und 12 Links.");
            var known = new HashSet<string>((images ?? new SiteImage[0]).Select(i => i.Id), StringComparer.Ordinal);
            var result = Json.Decode<SiteContent>(Json.Encode(value));
            result.HeroTitle = Text(result.HeroTitle, 100, "die Hauptüberschrift", true);
            result.HeroText = Text(result.HeroText, 500, "Der Einführungstext");
            result.About.Title = Text(result.About.Title, 100, "Die Überschrift für Über mich");
            result.About.Text = Text(result.About.Text, 5000, "Der Text über dich");
            result.About.ImageId = Reference(result.About.ImageId, known);
            result.About.ImageAlt = Text(result.About.ImageAlt, 300, "Die Bildbeschreibung");
            result.Setup.Title = Text(result.Setup.Title, 100, "Die Setup-Überschrift");
            result.Setup.Text = Text(result.Setup.Text, 5000, "Der Setup-Text");
            foreach (var c in result.Setup.Components)
            {
                if (c == null) throw new ArgumentException("Eine Setup-Komponente ist unvollständig.");
                c.Label = Text(c.Label, 80, "die Bezeichnung der Komponente", true); c.Value = Text(c.Value, 300, "das Modell der Komponente", true);
            }
            foreach (var i in result.Setup.Images)
            {
                if (i == null) throw new ArgumentException("Ein Setup-Bild ist unvollständig.");
                i.ImageId = Reference(i.ImageId, known, true); i.Alt = Text(i.Alt, 300, "Die Bildbeschreibung"); i.Caption = Text(i.Caption, 500, "Die Bildunterschrift");
            }
            var appIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var app in result.Apps)
            {
                if (app == null || app.Id == null || !Regex.IsMatch(app.Id, "^[a-z0-9][a-z0-9-]{0,39}$") || !appIds.Add(app.Id))
                    throw new ArgumentException("App-Karten benötigen unterschiedliche gültige Kennungen. Bitte eine betroffene Karte neu anlegen.");
                app.Name = Text(app.Name, 100, "den Namen der App", true); app.Description = Text(app.Description, 3000, "Die App-Beschreibung");
                app.ImageId = Reference(app.ImageId, known); app.ImageAlt = Text(app.ImageAlt, 300, "Die App-Bildbeschreibung");
                app.Url = Link(app.Url); app.ButtonLabel = Text(app.ButtonLabel, 60, "Der Text auf der Link-Schaltfläche");
            }
            foreach (var link in result.SocialLinks)
            {
                if (link == null) throw new ArgumentException("Ein Social-Link ist unvollständig.");
                link.Label = Text(link.Label, 80, "den Namen des Links", true); link.Url = Link(link.Url);
            }
            if (Json.Encode(new SiteSaveRequest { ExpectedVersion = 9007199254740991L, Content = result }).Length > ContentLimit)
                throw new ArgumentException("Die Website-Texte sind zusammen zu lang (maximal 64 KiB). Bitte einzelne Texte kürzen.");
            return result;
        }
        public static bool Same(SiteContent a, SiteContent b)
        { return a != null && b != null && Json.Encode(a).SequenceEqual(Json.Encode(b)); }
        public static void ValidateImages(List<SiteImage> images, SiteQuota quota)
        {
            if (images == null || images.Count > 102 || quota == null || quota.UsedBytes < 0 || quota.MaxBytes <= 0 || quota.UsedBytes > quota.MaxBytes ||
                quota.MaxImageBytes <= 0 || quota.MaxImageBytes > ImageLimit || quota.MaxImages < 1 || quota.MaxImages > 100)
                throw new ApiException("network", "Die Bildliste des Servers ist unvollständig. Bitte erneut laden.");
            var ids = new HashSet<string>(StringComparer.Ordinal);
            foreach (var i in images)
            {
                if (i == null || !ValidImageId(i.Id) || !ids.Add(i.Id) || i.Filename == null || i.Filename.Length > 500 ||
                    i.Size < 1 || i.Size > ImageLimit || i.Width < 1 || i.Height < 1 || (long)i.Width * i.Height > PixelLimit ||
                    !new[] { "image/jpeg", "image/png", "image/webp" }.Contains(i.MimeType) ||
                    i.BuiltIn != (i.Id == "brand-dragon" || i.Id == "discord-app") ||
                    i.Url != (i.Id == "brand-dragon" ? "/site/assets/brand-dragon.jpeg" : i.Id == "discord-app" ? "/site/assets/discord-app.png" : ImagePath(i.Id)))
                    throw new ApiException("network", "Der Server hat ungültige Bildangaben geliefert. Es wurde keine externe Bildadresse aufgerufen.");
            }
        }
        public static void ValidateSnapshot(SiteReply value)
        {
            if (value == null || !value.Ok || value.Version < 1 || value.Version > 9007199254740991L || value.PublishedVersion < 1 || value.PublishedVersion > value.Version ||
                value.PublishedAt.HasValue && value.PublishedAt.Value <= 0 || value.UpdatedAt.HasValue && value.UpdatedAt.Value <= 0)
                throw new ApiException("network", "Der Server hat keinen gültigen Website-Stand geliefert.");
            ValidateImages(value.Images, value.Quota);
            if (!Complete(value.Draft) || !Complete(value.Published)) throw new ApiException("network", "Die Website-Antwort enthält fehlende Textfelder. Sie wurde nicht als gespeicherter Stand übernommen.");
            try { Normalize(value.Draft, value.Images); Normalize(value.Published, value.Images); }
            catch (ArgumentException error) { throw new ApiException("network", "Website-Stand nicht lesbar: " + error.Message); }
        }
        private static bool Complete(SiteContent c)
        {
            return c != null && c.HeroTitle != null && c.HeroText != null && c.About != null && c.About.Title != null && c.About.Text != null && c.About.ImageAlt != null &&
                c.Setup != null && c.Setup.Title != null && c.Setup.Text != null && c.Setup.Components != null && c.Setup.Images != null && c.Apps != null && c.SocialLinks != null &&
                c.Setup.Components.All(i => i != null && i.Label != null && i.Value != null) && c.Setup.Images.All(i => i != null && i.ImageId != null && i.Alt != null && i.Caption != null) &&
                c.Apps.All(a => a != null && a.Id != null && a.Name != null && a.Description != null && a.ImageAlt != null && a.ButtonLabel != null) && c.SocialLinks.All(l => l != null && l.Label != null);
        }
        public static void VerifySaved(SiteReply value, long expectedVersion, SiteContent sent)
        {
            ValidateSnapshot(value);
            if (value.Version != expectedVersion + 1 || !Same(Normalize(value.Draft, value.Images), Normalize(sent, value.Images)))
                throw new ApiException("uncertain", "Der gespeicherte Entwurf ist nicht eindeutig bestätigt. Deine Eingaben bleiben erhalten; bitte zuerst den Serverstand prüfen.");
        }
        public static void VerifyPublished(SiteReply value, long expectedVersion, SiteContent savedDraft)
        {
            ValidateSnapshot(value);
            if (value.Version != expectedVersion + 1 || value.PublishedVersion != value.Version || !value.PublishedAt.HasValue ||
                !Same(Normalize(value.Published, value.Images), Normalize(savedDraft, value.Images)) || !Same(value.Draft, value.Published))
                throw new ApiException("uncertain", "Die Veröffentlichung ist nicht eindeutig bestätigt. Bitte den aktuellen Serverstand prüfen, bevor du erneut veröffentlichst.");
        }
        public static HashSet<string> References(SiteContent value)
        {
            var ids = new HashSet<string>(StringComparer.Ordinal);
            if (value == null) return ids;
            if (value.About != null && value.About.ImageId != null) ids.Add(value.About.ImageId);
            if (value.Setup != null && value.Setup.Images != null) foreach (var i in value.Setup.Images) if (i != null && i.ImageId != null) ids.Add(i.ImageId);
            if (value.Apps != null) foreach (var app in value.Apps) if (app != null && app.ImageId != null) ids.Add(app.ImageId);
            return ids;
        }
        public static string ImageMime(byte[] bytes)
        {
            if (bytes == null || bytes.Length == 0 || bytes.Length > ImageLimit) throw new ArgumentException("Bitte ein JPG-, PNG- oder WebP-Bild mit höchstens 4 MiB auswählen.");
            if (bytes.Length >= 8 && bytes.Take(8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })) return "image/png";
            if (bytes.Length >= 3 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255) return "image/jpeg";
            if (bytes.Length >= 12 && Encoding.ASCII.GetString(bytes, 0, 4) == "RIFF" && Encoding.ASCII.GetString(bytes, 8, 4) == "WEBP") return "image/webp";
            throw new ArgumentException("Die Datei ist kein unterstütztes JPG-, PNG- oder WebP-Bild. Bitte eine andere Bilddatei auswählen.");
        }
        public static string ImageId(byte[] bytes)
        { using (var sha = SHA256.Create()) return "img_" + String.Concat(sha.ComputeHash(bytes).Select(b => b.ToString("x2"))); }
        public static SiteUploadRequest Upload(byte[] bytes, string filename)
        {
            var mime = ImageMime(bytes);
            filename = Text(Path.GetFileName(filename), 160, "Der Dateiname", true);
            return new SiteUploadRequest { Filename = filename, MimeType = mime, DataBase64 = Convert.ToBase64String(bytes) };
        }
    }
    public sealed class SiteEditState
    {
        public SiteReply Saved { get; private set; }
        public SiteReply Observed { get; private set; }
        public bool Dirty { get; private set; }
        public bool NeedsRefresh { get; private set; }
        public void Changed() { if (Saved != null) Dirty = true; }
        public void Uncertain() { NeedsRefresh = true; }
        public void Observe(SiteReply remote)
        { SitePolicy.ValidateSnapshot(remote); Observed = remote; if (Saved != null && remote.Version != Saved.Version) NeedsRefresh = true; }
        public void Load(SiteReply value, bool discardConfirmed = false)
        {
            SitePolicy.ValidateSnapshot(value);
            if (Dirty && !discardConfirmed) throw new InvalidOperationException("Nicht gespeicherte Änderungen dürfen nicht überschrieben werden.");
            Saved = value; Observed = null; Dirty = false; NeedsRefresh = false;
        }
        public void SavedReply(SiteReply value, long expectedVersion, SiteContent sent)
        {
            SitePolicy.VerifySaved(value, expectedVersion, sent);
            if (Saved == null || value.PublishedVersion != Saved.PublishedVersion || value.PublishedAt != Saved.PublishedAt || !SitePolicy.Same(value.Published, Saved.Published))
                throw new ApiException("uncertain", "Der Server meldet beim Speichern eine andere öffentliche Fassung. Bitte den Serverstand prüfen; deine Eingaben bleiben erhalten.");
            Load(value, true);
        }
        public void PublishedReply(SiteReply value, long expectedVersion)
        {
            if (Saved == null || Dirty || NeedsRefresh) throw new InvalidOperationException("Zuerst den Entwurf speichern und den aktuellen Stand prüfen.");
            SitePolicy.VerifyPublished(value, expectedVersion, Saved.Draft); Load(value);
        }
        public void Clear() { Saved = null; Observed = null; Dirty = false; NeedsRefresh = false; }
    }
}
