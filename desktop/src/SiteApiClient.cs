using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using System.Threading.Tasks;

namespace Modstempel.Desktop
{
    public sealed partial class ApiClient
    {
        private async Task<T> SiteSend<T>(string method, string path, byte[] body, CancellationToken cancel, bool mutation) where T : ApiReply
        {
            try { return await Send<T>(method, path, body, true, cancel, mutation).ConfigureAwait(false); }
            catch (ApiException error)
            {
                if (error.Kind == "uncertain") throw new ApiException("uncertain", "Der Server hat diese Website-Änderung nicht eindeutig bestätigt. Sie wurde nicht automatisch wiederholt. Bitte den Serverstand prüfen; deine Eingaben bleiben erhalten.", error.Status);
                throw;
            }
        }
        public async Task<SiteReply> Site(CancellationToken cancel)
        {
            SiteReply value;
            try { value = await SiteSend<SiteReply>("GET", "/v2/admin/site", null, cancel, false).ConfigureAwait(false); }
            catch (ApiException error) { if (error.Status == 404) throw new ApiException("unconfigured", "Dieser Server bietet noch keine Website-Verwaltung. Bitte das Serverpaket für Crazy_Batto Discord App 2.2 einrichten.", 404); throw; }
            SitePolicy.ValidateSnapshot(value); return value;
        }
        public async Task<SiteReply> SaveSite(long expectedVersion, SiteContent content, System.Collections.Generic.IEnumerable<SiteImage> images, CancellationToken cancel)
        {
            if (expectedVersion < 0 || expectedVersion >= 9007199254740991L) throw new ArgumentException("Bitte zuerst den aktuellen Website-Stand laden.");
            var sent = SitePolicy.Normalize(content, images);
            var body = Json.Encode(new SiteSaveRequest { ExpectedVersion = expectedVersion, Content = sent });
            if (body.Length > SitePolicy.ContentLimit) throw new ArgumentException("Die Website-Texte sind zusammen zu lang.");
            var value = await SiteSend<SiteReply>("POST", "/v2/admin/site", body, cancel, true).ConfigureAwait(false);
            try { SitePolicy.VerifySaved(value, expectedVersion, sent); }
            catch (ApiException error) { throw new ApiException("uncertain", "Speicherung nicht eindeutig bestätigt: " + error.Message); }
            return value;
        }
        public async Task<SiteReply> PublishSite(long expectedVersion, SiteContent savedDraft, CancellationToken cancel)
        {
            if (expectedVersion < 0 || expectedVersion >= 9007199254740991L || savedDraft == null) throw new ArgumentException("Bitte zuerst einen aktuellen Entwurf speichern.");
            var value = await SiteSend<SiteReply>("POST", "/v2/admin/site/publish", Json.Encode(new SitePublishRequest { ExpectedVersion = expectedVersion }), cancel, true).ConfigureAwait(false);
            try { SitePolicy.VerifyPublished(value, expectedVersion, savedDraft); }
            catch (ApiException error) { throw new ApiException("uncertain", "Veröffentlichung nicht eindeutig bestätigt: " + error.Message); }
            return value;
        }
        public async Task<SiteImagesReply> UploadSiteImage(byte[] bytes, string filename, CancellationToken cancel)
        {
            var sent = SitePolicy.Upload(bytes, filename); var expectedId = SitePolicy.ImageId(bytes);
            var value = await SiteSend<SiteImagesReply>("POST", "/v2/admin/site/images", Json.Encode(sent), cancel, true).ConfigureAwait(false);
            try
            {
                SitePolicy.ValidateImages(value.Images, value.Quota);
                if (value.Image != null) SitePolicy.ValidateImages(new System.Collections.Generic.List<SiteImage> { value.Image }, value.Quota);
                if (value.Image == null || value.Image.Id != expectedId || value.Image.MimeType != sent.MimeType || value.Image.Size != bytes.LongLength ||
                    !value.Images.Any(i => i.Id == expectedId && i.Size == bytes.LongLength && i.MimeType == sent.MimeType))
                    throw new ApiException("network", "Das bestätigte Bild entspricht nicht der hochgeladenen Datei.");
            }
            catch (ApiException error) { throw new ApiException("uncertain", "Bildupload nicht eindeutig bestätigt: " + error.Message); }
            return value;
        }
        public async Task<SiteImagesReply> DeleteSiteImage(string imageId, CancellationToken cancel)
        {
            var path = SitePolicy.ImagePath(imageId);
            if (imageId == "brand-dragon" || imageId == "discord-app") throw new ArgumentException("Mitgelieferte Bilder können nicht gelöscht werden.");
            var value = await SiteSend<SiteImagesReply>("DELETE", path, null, cancel, true).ConfigureAwait(false);
            try
            {
                SitePolicy.ValidateImages(value.Images, value.Quota);
                if (value.Images.Any(i => i.Id == imageId)) throw new ApiException("network", "Das Bild befindet sich weiterhin in der Serverliste.");
            }
            catch (ApiException error) { throw new ApiException("uncertain", "Löschen nicht eindeutig bestätigt: " + error.Message); }
            return value;
        }
        public async Task<byte[]> SiteImageBytes(SiteImage image, CancellationToken cancel)
        {
            if (image == null) throw new ArgumentException("Bitte ein Bild auswählen.");
            var path = SitePolicy.ImagePath(image.Id);
            if (!Policy.ValidToken(bearer)) throw new ApiException("auth", "Bitte zuerst als Betreiber anmelden.", 401);
            using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancel))
            using (var request = new HttpRequestMessage(HttpMethod.Get, origin + path))
            {
                timeout.CancelAfter(deadline); request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
                request.Headers.Accept.Clear(); request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("image/*"));
                try
                {
                    using (var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token).ConfigureAwait(false))
                    {
                        int status = (int)response.StatusCode;
                        if (status >= 300 && status < 400) throw new ApiException("network", "Die Bildanfrage wurde weitergeleitet. Es wurde kein anderer Server aufgerufen.", status);
                        int limit = response.IsSuccessStatusCode ? SitePolicy.ImageLimit : ResponseLimit;
                        if (response.Content.Headers.ContentLength > limit) throw new ApiException("network", "Die Bildantwort ist zu groß.");
                        byte[] bytes;
                        using (var stream = await response.Content.ReadAsStreamAsync().ConfigureAwait(false))
                        using (var output = new MemoryStream())
                        {
                            byte[] buffer = new byte[8192]; int count;
                            while ((count = await stream.ReadAsync(buffer, 0, buffer.Length, timeout.Token).ConfigureAwait(false)) > 0)
                            { if (output.Length + count > limit) throw new ApiException("network", "Die Bildantwort ist zu groß."); output.Write(buffer, 0, count); }
                            bytes = output.ToArray();
                        }
                        if (!response.IsSuccessStatusCode)
                        {
                            ApiReply error = null; try { error = Json.Decode<ApiReply>(bytes); } catch { }
                            throw new ApiException(status == 401 ? "auth" : status == 403 ? "forbidden" : error == null ? "network" : error.Kind,
                                error == null || String.IsNullOrEmpty(error.Message) ? "Das Bild konnte nicht geladen werden (HTTP " + status + ")." : error.Message, status);
                        }
                        var mime = response.Content.Headers.ContentType == null ? null : response.Content.Headers.ContentType.MediaType;
                        if (mime != image.MimeType || bytes.LongLength != image.Size || SitePolicy.ImageMime(bytes) != mime ||
                            !image.BuiltIn && SitePolicy.ImageId(bytes) != image.Id) throw new ApiException("network", "Die Vorschau stimmt nicht mit dem gewählten Serverbild überein.");
                        return bytes;
                    }
                }
                catch (OperationCanceledException) { if (cancel.IsCancellationRequested) throw; throw new ApiException("network", "Die Bildvorschau hat nicht rechtzeitig geantwortet. Bitte erneut auswählen."); }
                catch (HttpRequestException) { throw new ApiException("network", "Die Bildvorschau konnte nicht geladen werden. Bitte die Verbindung prüfen."); }
                catch (IOException) { throw new ApiException("network", "Die Bildvorschau wurde unvollständig übertragen."); }
                catch (ArgumentException error) { throw new ApiException("network", error.Message); }
            }
        }
    }
}
