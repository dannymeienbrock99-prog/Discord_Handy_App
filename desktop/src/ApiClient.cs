using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Modstempel.Desktop
{
    public sealed class Snapshot
    {
        public long Revision; public Counts Counts; public List<Registration> Rows;
    }
    public sealed partial class ApiClient : IDisposable
    {
        private readonly HttpClient http;
        private readonly string origin;
        private readonly string bearer;
        private readonly TimeSpan deadline = TimeSpan.FromSeconds(45);
        private const int ResponseLimit = 2 * 1024 * 1024;
        public ApiClient(string rawOrigin, string token = null)
        {
            origin = Policy.Origin(rawOrigin);
            if (!String.IsNullOrEmpty(token) && !Policy.ValidToken(token)) throw new ApiException("auth", "Die gespeicherte Anmeldung ist ungültig.", 401);
            bearer = token;
            http = new HttpClient(new HttpClientHandler {
                AllowAutoRedirect = false, UseCookies = false,
                AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate,
                CheckCertificateRevocationList = true
            }) { Timeout = TimeSpan.FromSeconds(45) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd("Crazy_Batto-Discord-App-Verwaltung/2.2.0");
            http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        }
        // Internal test seam substitutes the transport, never the origin/bearer rules or API routes.
        internal ApiClient(string rawOrigin, string token, HttpMessageHandler transport, TimeSpan? requestDeadline = null)
        {
            origin = Policy.Origin(rawOrigin);
            if (!String.IsNullOrEmpty(token) && !Policy.ValidToken(token)) throw new ApiException("auth", "Die gespeicherte Anmeldung ist ungültig.", 401);
            bearer = token; if (requestDeadline.HasValue) deadline = requestDeadline.Value;
            http = new HttpClient(transport) { Timeout = deadline };
        }
        private async Task<T> Send<T>(string method, string path, byte[] body, bool authenticated, CancellationToken cancel, bool decision = false) where T : ApiReply
        {
            if (authenticated && !Policy.ValidToken(bearer)) throw new ApiException("auth", "Bitte zuerst mit Discord anmelden.", 401);
            using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancel))
            using (var request = new HttpRequestMessage(new HttpMethod(method), origin + path))
            {
                timeout.CancelAfter(deadline);
                if (authenticated) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
                if (body != null) { request.Content = new ByteArrayContent(body); request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json"); }
                try
                {
                    using (var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token).ConfigureAwait(false))
                    {
                        if ((int)response.StatusCode >= 300 && (int)response.StatusCode < 400)
                            throw new ApiException("network", "Der Server leitet die Anfrage weiter. Bitte die endgültige HTTPS-Adresse in den Einstellungen verwenden.", (int)response.StatusCode);
                        if (response.Content.Headers.ContentLength > ResponseLimit) throw BadBody(decision);
                        byte[] bytes;
                        using (var input = await response.Content.ReadAsStreamAsync().ConfigureAwait(false))
                        using (var output = new MemoryStream())
                        {
                            var buffer = new byte[8192]; int read;
                            while ((read = await input.ReadAsync(buffer, 0, buffer.Length, timeout.Token).ConfigureAwait(false)) > 0)
                            {
                                if (output.Length + read > ResponseLimit) throw BadBody(decision);
                                output.Write(buffer, 0, read);
                            }
                            bytes = output.ToArray();
                        }
                        if (!response.IsSuccessStatusCode)
                        {
                            ApiReply error = null; try { error = Json.Decode<ApiReply>(bytes); } catch { }
                            var status = (int)response.StatusCode;
                            var kind = error == null ? status == 401 ? "auth" : status == 403 ? "forbidden" : status == 409 ? "conflict" : status == 429 ? "rate_limited" : "network" : error.Kind;
                            var message = error == null || String.IsNullOrEmpty(error.Message) ? "Der Server konnte die Anfrage nicht bestätigen (HTTP " + status + ")." : error.Message;
                            throw new ApiException(kind, message, status, Math.Max(0, error == null ? 0 : error.RetryAfterMs ?? 0));
                        }
                        T value;
                        try { value = Json.Decode<T>(bytes); } catch { throw BadBody(decision); }
                        if (value == null || !value.Ok) throw BadBody(decision);
                        return value;
                    }
                }
                catch (OperationCanceledException)
                {
                    if (cancel.IsCancellationRequested) throw;
                    throw new ApiException(decision ? "uncertain" : "network", decision ? "Keine sichere Bestätigung erhalten. Bitte zuerst die Liste aktualisieren und den Status prüfen; die Entscheidung wurde nicht automatisch wiederholt." : "Der Server antwortet gerade nicht. Die Verbindung wird erneut geprüft.");
                }
                catch (HttpRequestException) { throw new ApiException(decision ? "uncertain" : "network", decision ? "Die Verbindung wurde unterbrochen. Bitte zuerst die Liste aktualisieren und den Status prüfen; die Entscheidung wurde nicht automatisch wiederholt." : "Der Server ist nicht erreichbar. Bitte Internetverbindung und HTTPS-Serveradresse prüfen."); }
                catch (IOException) { throw BadBody(decision); }
            }
        }
        private static ApiException BadBody(bool decision)
        {
            return new ApiException(decision ? "uncertain" : "network", decision ? "Die Entscheidung konnte nicht sicher bestätigt werden. Bitte zuerst die Liste aktualisieren; sie wurde nicht automatisch wiederholt." : "Der Server hat keine vollständige, lesbare Antwort geliefert. Bitte später aktualisieren.");
        }
        public Task<HealthReply> Health(CancellationToken cancel) { return Send<HealthReply>("GET", "/health", null, false, cancel); }
        public Task<LoginStart> Start(string challenge, CancellationToken cancel) { return Send<LoginStart>("POST", "/v2/auth/start", Json.Encode(new ChallengeRequest { Challenge = challenge }), false, cancel); }
        public Task<LoginPoll> Poll(ClaimRequest claim, CancellationToken cancel) { return Send<LoginPoll>("POST", "/v2/auth/poll", Json.Encode(claim), false, cancel); }
        public Task<ApiReply> Cancel(ClaimRequest claim, CancellationToken cancel) { return Send<ApiReply>("POST", "/v2/auth/cancel", Json.Encode(claim), false, cancel); }
        public Task<ApiReply> Logout(CancellationToken cancel) { return Send<ApiReply>("POST", "/v2/auth/logout", Json.Encode(new EmptyRequest()), true, cancel); }
        public Task<SessionReply> Session(CancellationToken cancel) { return Send<SessionReply>("GET", "/v2/session", null, true, cancel); }
        public Task<SummaryReply> Summary(CancellationToken cancel) { return Send<SummaryReply>("GET", "/v2/admin/summary", null, true, cancel); }
        public Task<DecisionReply> Decide(Registration row, string decision, string reason, CancellationToken cancel)
        {
            var request = Policy.Decision(row, decision, reason);
            return Send<DecisionReply>("POST", "/v2/admin/registrations/" + row.UserId + "/decision", Json.Encode(request), true, cancel, true);
        }
        public async Task<Snapshot> ReadSnapshot(CancellationToken cancel)
        {
            for (int attempt = 0; attempt < 3; attempt++)
            {
                int offset = 0, total = -1; long revision = -1; Counts counts = null;
                var rows = new List<Registration>(); var ids = new HashSet<string>(StringComparer.Ordinal); bool changed = false;
                do
                {
                    var page = await Send<ListReply>("GET", "/v2/admin/registrations?status=all&limit=200&offset=" + offset, null, true, cancel).ConfigureAwait(false);
                    if (page.Revision < 0 || page.Total < 0 || page.Total > 100000 || page.Counts == null || page.Registrations == null || page.Registrations.Count > 200) throw BadBody(false);
                    if (revision < 0) { revision = page.Revision; total = page.Total; counts = page.Counts; }
                    if (revision != page.Revision || total != page.Total) { changed = true; break; }
                    foreach (var row in page.Registrations)
                    {
                        Policy.ValidateRegistration(row);
                        if (!ids.Add(row.UserId)) throw BadBody(false);
                        rows.Add(row);
                    }
                    if (rows.Count > total) throw BadBody(false);
                    if (!page.NextOffset.HasValue)
                    {
                        if (rows.Count != total) throw BadBody(false);
                        return new Snapshot { Revision = revision, Counts = counts, Rows = rows };
                    }
                    if (page.Registrations.Count == 0 || page.NextOffset.Value != offset + page.Registrations.Count || page.NextOffset.Value >= total) throw BadBody(false);
                    offset = page.NextOffset.Value;
                } while (!cancel.IsCancellationRequested);
                cancel.ThrowIfCancellationRequested();
                if (!changed) throw BadBody(false);
            }
            throw new ApiException("network", "Während des Ladens wurden mehrere Anfragen verändert. Die Liste wird gleich erneut abgeglichen.");
        }
        public void Dispose() { http.Dispose(); }
    }
}
