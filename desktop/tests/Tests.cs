using System;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Modstempel.Desktop;

internal static class Tests
{
    private const string Host = "https://modstempel.example";
    private static readonly string Token = new string('a', 64);
    private static int assertions;
    private static readonly CancellationToken None = CancellationToken.None;
    private static void Check(bool success, string description)
    { assertions++; if (!success) throw new Exception("FAIL: " + description); }
    private static void Throws(Action action, string description)
    { bool thrown = false; try { action(); } catch { thrown = true; } Check(thrown, description); }
    private static async Task<ApiException> Fails(Func<Task> action, string kind, string description)
    {
        try { await action(); } catch (ApiException error) { Check(error.Kind == kind, description + " (kind)"); return error; }
        throw new Exception("FAIL: " + description + " (no exception)");
    }
    private static Registration Row(int n, string status = "pending", int version = 1)
    {
        var id = (111111111111111110L + n).ToString();
        return new Registration { UserId = id, User = new DiscordUser { Id = id, Username = "user" + n, DisplayName = "Nutzer " + n }, Status = status, Version = version, RequestedAt = 1791541800000 + n, UpdatedAt = 1791541800000 + n, Note = "Stream-Team", Reason = "" };
    }
    private static HttpResponseMessage Response<T>(T value, HttpStatusCode code = HttpStatusCode.OK)
    { return new HttpResponseMessage(code) { Content = new ByteArrayContent(Json.Encode(value)) }; }
    private static HttpResponseMessage Page(List<Registration> rows, int total, int? next, long revision = 1)
    { return Response(new ListReply { Ok = true, Registrations = rows, Total = total, NextOffset = next, Revision = revision, Counts = new Counts { Pending = total } }); }
    private static async Task Main(string[] args)
    {
        if(args.Length==3&&args[0]=="--inspect") { BinaryInspector.Run(args[1],args[2]);return; }
        Check(Policy.Origin("  https://example.org/ ") == "https://example.org", "canonical HTTPS origin");
        Check(Policy.Origin("https://example.org:443") == "https://example.org", "default port normalization");
        foreach (var bad in new[] { "", "http://example.org", "https://u:p@example.org", "https://example.org:8443", "https://example.org/a", "https://example.org/a/..", "https://example.org/%2e/", "https://example.org?x=1", "https://example.org?", "https://example.org#", "https://example.org#test", "https://example.org\\a", "https://exa mple.org", "https://example.org\n/path", "javascript:alert(1)", "//example.org" }) Throws(() => Policy.Origin(bad), "origin rejects " + bad.Replace("\n", "newline"));
        var verifier = Policy.NewVerifier();
        Check(verifier.Length == 43 && Policy.ValidToken(verifier), "32-byte Base64url verifier");
        Check(Policy.Hash(verifier).Length == 64, "hex challenge length");
        Check(Policy.Hash("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "challenge SHA256 UTF8 vector");
        Check(new HashSet<string>(Enumerable.Range(0, 200).Select(_ => Policy.NewVerifier())).Count == 200, "fresh RNG verifiers");
        var login = new LoginStart { LoginId = new string('b', 32), AuthorizePath = "/oauth/start/" + new string('b', 32), DisplayCode = "12AB-345C", ExpiresAt = Policy.Now + 600000 };
        Check(Policy.AuthorizeUri(Host, login).AbsoluteUri == Host + login.AuthorizePath, "browser bound to configured origin");
        login.AuthorizePath = "https://other.example/"; Throws(() => Policy.AuthorizeUri(Host, login), "absolute OAuth URL rejected");
        login.AuthorizePath = "/oauth/start/" + login.LoginId + "?token=evil"; Throws(() => Policy.AuthorizeUri(Host, login), "OAuth query rejected");
        login.AuthorizePath = "/oauth/start/" + login.LoginId; login.ExpiresAt = Policy.Now - 1; Throws(() => Policy.AuthorizeUri(Host, login), "expired OAuth rejected");
        var session = new SessionReply { Ok = true, User = Row(1).User, ExpiresAt = Policy.Now + 600000, Access = new Access { IsOwner = true, CanUseApp = true, Status = "approved" } };
        Policy.ValidateOwner(session); Check(true, "approved owner accepted");
        session.Access.IsOwner = false; Throws(() => Policy.ValidateOwner(session), "ordinary approved user cannot administer");
        session.Access.IsOwner = true; session.Access.CanUseApp = false; Throws(() => Policy.ValidateOwner(session), "owner claim alone insufficient");
        session.Access.CanUseApp = true; session.Access.Status = "pending"; Throws(() => Policy.ValidateOwner(session), "pending owner claim rejected");
        session.Access = null; Throws(() => Policy.ValidateOwner(session), "legacy session without access cannot administer");
        var row = Row(1); var decision = Policy.Decision(row, "approve", "  Willkommen!  ");
        Check(decision.ExpectedVersion == 1 && decision.Decision == "approve" && decision.Reason == "Willkommen!", "explicit decision version and reason");
        foreach (var status in new[] { "pending", "approved", "rejected", "revoked" })
        foreach (var action in new[] { "approve", "reject", "revoke", "unexpected" })
        {
            var valid = action == "approve" && status != "approved" || action == "reject" && status == "pending" || action == "revoke" && status == "approved";
            Check(Policy.CanDecide(Row(1, status), action) == valid, status + " -> " + action);
        }
        Throws(() => Policy.Decision(row, "approve", new string('a', 501)), "reason length bounded");
        var wrongId = Row(1); wrongId.UserId = Row(2).UserId; Throws(() => Policy.ValidateRegistration(wrongId), "registration identity mismatch rejected");
        Check(Policy.Matches(row, "all", "USER1"), "case-insensitive name search");
        Check(Policy.Matches(row, "pending", row.UserId), "exact Discord ID search");
        Check(!Policy.Matches(row, "approved", ""), "status filter");
        var pending = new[] { Row(1), Row(2), Row(3, "approved") };
        Check(Policy.NewPending(pending, null).Count == 2, "first startup reports all unseen pending");
        Check(Policy.NewPending(pending, new[] { Policy.Fingerprint(pending[0]), Policy.Fingerprint(pending[1]) }).Count == 0, "no repeat notifications for seen requests");
        Check(Policy.NewPending(pending.Concat(new[] { Row(4) }), new[] { Policy.Fingerprint(pending[0]), Policy.Fingerprint(pending[1]) }).Single().UserId == Row(4).UserId, "offline new request notified on restart");
        var roundtrip = Json.Decode<Registration>(Json.Encode(row)); Check(roundtrip.UserId == row.UserId && roundtrip.RequestedAt == row.RequestedAt && roundtrip.Note == row.Note, "API DTO roundtrip");
        var noAccess = Json.Decode<SessionReply>(Encoding.UTF8.GetBytes("{\"ok\":true,\"user\":{\"id\":\"111111111111111111\"},\"expiresAt\":9999999999999}")); Throws(() => Policy.ValidateOwner(noAccess), "missing access fail closed");

        await TransportTests();
        assertions += await SiteTests.Run();
        Console.WriteLine("PASS: " + assertions + " desktop core and HTTP contract assertions.");
        Console.WriteLine("Compiled production core, API, website state and image decoder under .NET 10. Windows UI, DPAPI, tray and autostart require a real Windows smoke test.");
    }
    private static async Task TransportTests()
    {
        var capture = new Stub(async request => {
            Check(request.RequestUri.GetLeftPart(UriPartial.Authority) == Host, "all requests use configured origin");
            Check(request.Headers.Authorization == null, "device auth sends no bearer");
            var body = Encoding.UTF8.GetString(await request.Content.ReadAsByteArrayAsync());
            Check(!body.Contains(Token), "device auth body contains no app token");
            return Response(new LoginStart { Ok = true, LoginId = "test" });
        });
        using (var api = new ApiClient(Host, Token, capture)) await api.Start(Policy.Hash("abc"), None);
        Check(capture.Calls == 1, "auth makes one request");
        capture = new Stub(async request => {
            Check(request.Method.Method == "POST" && request.RequestUri.AbsolutePath == "/v2/admin/registrations/111111111111111111/decision", "decision fixed authenticated endpoint");
            Check(request.Headers.Authorization.Scheme == "Bearer" && request.Headers.Authorization.Parameter == Token, "bearer authenticated decision");
            Check(request.Content.Headers.ContentType.MediaType == "application/json", "decision JSON content type");
            var body = Json.Decode<DecisionRequest>(await request.Content.ReadAsByteArrayAsync());
            Check(body.Decision == "approve" && body.ExpectedVersion == 4 && body.Reason == "ja", "server exact compare-and-set fields");
            return Response(new DecisionReply { Ok = true, Registration = Row(1, "approved", 5), Revision = 4 });
        });
        using (var api = new ApiClient(Host, Token, capture)) await api.Decide(Row(1, "pending", 4), "approve", "ja", None);
        Check(capture.Calls == 1, "decision sends once");
        capture = new Stub(request => Task.FromResult(new HttpResponseMessage(HttpStatusCode.Redirect) { Headers = { Location = new Uri("https://other.example/") }, Content = new StringContent("") }));
        using (var api = new ApiClient(Host, Token, capture)) await Fails(async () => await api.Session(None), "network", "redirect is rejected");
        Check(capture.Calls == 1, "redirect never followed with bearer");
        capture = new Stub(request => { throw new HttpRequestException("test transport failure"); });
        using (var api = new ApiClient(Host, Token, capture)) await Fails(async () => await api.Decide(Row(1), "approve", "", None), "uncertain", "lost decision response is uncertain");
        Check(capture.Calls == 1, "uncertain decision never auto-retries");
        capture = new Stub(request => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("not JSON") }));
        using (var api = new ApiClient(Host, Token, capture)) await Fails(async () => await api.Decide(Row(1), "approve", "", None), "uncertain", "unreadable decision response is uncertain");
        foreach (var error in new[] { new ApiReply { Kind = "auth", Message = "Abgelaufen" }, new ApiReply { Kind = "forbidden", Message = "Kein Betreiber" }, new ApiReply { Kind = "conflict", Message = "Geändert" }, new ApiReply { Kind = "rate_limited", Message = "Später", RetryAfterMs = 30000 } })
        {
            var status = error.Kind == "auth" ? HttpStatusCode.Unauthorized : error.Kind == "forbidden" ? HttpStatusCode.Forbidden : error.Kind == "conflict" ? HttpStatusCode.Conflict : (HttpStatusCode)429;
            capture = new Stub(request => Task.FromResult(Response(error, status)));
            using (var api = new ApiClient(Host, Token, capture)) { var result = await Fails(async () => await api.Summary(None), error.Kind, "server " + error.Kind); Check(result.Status == (int)status && result.RetryAfterMs == (error.RetryAfterMs ?? 0), "status and retry window preserved"); }
        }
        capture = new Stub(request => Task.FromResult(Response(new SummaryReply { Ok = true })));
        using (var api = new ApiClient(Host, null, capture)) await Fails(async () => await api.Summary(None), "auth", "no unauthenticated admin request");
        Check(capture.Calls == 0, "missing session blocks before network");
        var responses = new Queue<HttpResponseMessage>();
        responses.Enqueue(Page(new List<Registration> { Row(1), Row(2) }, 3, 2)); responses.Enqueue(Page(new List<Registration> { Row(3) }, 3, null));
        capture = new Stub(request => Task.FromResult(responses.Dequeue()));
        using (var api = new ApiClient(Host, Token, capture)) { var snapshot = await api.ReadSnapshot(None); Check(snapshot.Rows.Count == 3 && snapshot.Revision == 1, "all pages collected"); }
        Check(capture.Uris[1].Query == "?status=all&limit=200&offset=2", "next page uses exact returned offset");
        responses.Enqueue(Page(new List<Registration> { Row(1) }, 2, 1, 1)); responses.Enqueue(Page(new List<Registration> { Row(2) }, 2, null, 2)); responses.Enqueue(Page(new List<Registration> { Row(3), Row(1) }, 2, null, 2));
        capture = new Stub(request => Task.FromResult(responses.Dequeue()));
        using (var api = new ApiClient(Host, Token, capture)) { var snapshot = await api.ReadSnapshot(None); Check(snapshot.Rows.Count == 2 && snapshot.Rows[0].UserId == Row(3).UserId && snapshot.Revision == 2, "changing revision discards mixed snapshot"); }
        Check(capture.Calls == 3 && capture.Uris[2].Query.EndsWith("offset=0"), "revision change restarts from first page");
        capture = new Stub(request => Task.FromResult(Page(new List<Registration> { Row(1), Row(1) }, 2, null)));
        using (var api = new ApiClient(Host, Token, capture)) await Fails(async () => await api.ReadSnapshot(None), "network", "duplicate rows rejected");
        capture = new Stub(request => Task.FromResult(Page(new List<Registration> { Row(1) }, 5, null)));
        using (var api = new ApiClient(Host, Token, capture)) await Fails(async () => await api.ReadSnapshot(None), "network", "truncated page set rejected");
        capture = new Stub(request => Task.FromResult(Page(new List<Registration> { Row(1) }, 5, 0)));
        using (var api = new ApiClient(Host, Token, capture)) await Fails(async () => await api.ReadSnapshot(None), "network", "pagination cannot loop");
        capture = new Stub(request => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(new string('x', 2 * 1024 * 1024 + 1)) }));
        using (var api = new ApiClient(Host, Token, capture)) await Fails(async () => await api.Summary(None), "network", "response size bounded");
        capture = new Stub(request => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StreamContent(new StalledBody()) }));
        using (var api = new ApiClient(Host, Token, capture, TimeSpan.FromMilliseconds(60))) await Fails(async () => await api.Summary(None), "network", "deadline includes stalled body after headers");
        capture = new Stub(request => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StreamContent(new StalledBody()) }));
        using (var api = new ApiClient(Host, Token, capture, TimeSpan.FromMilliseconds(60))) await Fails(async () => await api.Decide(Row(1), "approve", "", None), "uncertain", "decision body timeout remains uncertain");
        Check(capture.Calls == 1, "body timeout does not repeat decision");
    }
    private sealed class Stub : HttpMessageHandler
    {
        public int Calls; public readonly List<Uri> Uris = new List<Uri>(); private readonly Func<HttpRequestMessage, Task<HttpResponseMessage>> reply;
        public Stub(Func<HttpRequestMessage, Task<HttpResponseMessage>> value) { reply = value; }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) { Calls++; Uris.Add(request.RequestUri); return reply(request); }
    }
    private sealed class StalledBody : Stream
    {
        public override bool CanRead { get { return true; } }
        public override bool CanSeek { get { return false; } }
        public override bool CanWrite { get { return false; } }
        public override long Length { get { throw new NotSupportedException(); } }
        public override long Position { get { throw new NotSupportedException(); } set { throw new NotSupportedException(); } }
        public override async Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancel) { await Task.Delay(Timeout.Infinite, cancel); return 0; }
        public override int Read(byte[] buffer, int offset, int count) { throw new NotSupportedException(); }
        public override void Flush() { }
        public override long Seek(long value, SeekOrigin origin) { throw new NotSupportedException(); }
        public override void SetLength(long value) { throw new NotSupportedException(); }
        public override void Write(byte[] buffer, int offset, int count) { throw new NotSupportedException(); }
    }
}
