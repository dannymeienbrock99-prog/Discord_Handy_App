package app.modstempel.mobile;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Constructor;
import java.net.URL;
import java.net.URLConnection;
import java.net.URLStreamHandler;
import java.nio.charset.StandardCharsets;
import java.security.cert.Certificate;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.ScheduledThreadPoolExecutor;

import javax.net.ssl.HttpsURLConnection;

/** Exercises the real BackendClient through a JVM-only HTTPS handler; no sockets are opened. */
public final class NativeBackendTransportTest {
    private static int checks;
    private static final Deque<Fixture> fixtures = new ArrayDeque<>();
    private static final List<FakeConnection> requests = new ArrayList<>();
    private static void check(boolean value, String label) { checks++; if (!value) throw new AssertionError(label); }
    private static JSONObject obj(Object... values) { return BackendProtocol.object(values); }

    private static final class Fixture {
        int status;
        String body;
        String retryAfter;
        boolean fail;
        boolean untilDeadline;
        Fixture(int status, String body) { this.status = status; this.body = body; }
    }

    private static final class FakeConnection extends HttpsURLConnection {
        final Fixture fixture;
        final ByteArrayOutputStream output = new ByteArrayOutputStream();
        boolean closed;
        FakeConnection(URL url, Fixture fixture) { super(url); this.fixture = fixture; }
        @Override public String getCipherSuite() { return "TEST_ONLY_NO_NETWORK"; }
        @Override public Certificate[] getLocalCertificates() { return null; }
        @Override public Certificate[] getServerCertificates() { return new Certificate[0]; }
        @Override public void connect() { }
        @Override public boolean usingProxy() { return false; }
        @Override public synchronized void disconnect() { closed = true; notifyAll(); }
        @Override public OutputStream getOutputStream() { return output; }
        @Override public synchronized int getResponseCode() throws IOException {
            if (fixture.untilDeadline) {
                try { if (!closed) wait(2000); }
                catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
                throw new IOException("Test deadline");
            }
            if (fixture.fail) throw new IOException("Test connection interrupted");
            return fixture.status;
        }
        @Override public InputStream getInputStream() { return new ByteArrayInputStream(fixture.body.getBytes(StandardCharsets.UTF_8)); }
        @Override public InputStream getErrorStream() { return getInputStream(); }
        @Override public String getHeaderField(String name) { return "Retry-After".equals(name) ? fixture.retryAfter : null; }
        long fixedLength() { return fixedContentLengthLong >= 0 ? fixedContentLengthLong : fixedContentLength; }
    }

    public static void main(String[] args) throws Exception {
        URL.setURLStreamHandlerFactory(protocol -> {
            if ("file".equals(protocol) || "jar".equals(protocol) || "jrt".equals(protocol)) return null;
            if (!"https".equals(protocol)) return new URLStreamHandler() {
                @Override protected URLConnection openConnection(URL url) { throw new AssertionError("Unexpected non-HTTPS network request"); }
            };
            return new URLStreamHandler() {
                @Override protected URLConnection openConnection(URL url) {
                    if (fixtures.isEmpty()) throw new AssertionError("Unexpected request without offline fixture");
                    FakeConnection connection = new FakeConnection(url, fixtures.remove());
                    requests.add(connection);
                    return connection;
                }
            };
        });
        ScheduledThreadPoolExecutor timer = new ScheduledThreadPoolExecutor(1);
        timer.setRemoveOnCancelPolicy(true);
        int[] invalidations = {0};
        BackendClient client = new BackendClient(context -> invalidations[0]++, timer);
        String token = "test_session_abcdefghijklmnopqrstuvwxyz0123456789";
        BackendVault.Snapshot context = new BackendVault.Snapshot("https://backend.example.invalid", "generation_1234567890",
            obj("session", obj("token", token, "user", obj("id", "123456789012345678", "username", "mod", "displayName", "Mod"), "expiresAt", 1900000000000L)));
        try {
            fixtures.add(new Fixture(200, "{\"ok\":true,\"guilds\":[]}"));
            JSONObject result = client.request(context, "GET", "/v2/guilds", null, null, true, false, 45000);
            FakeConnection get = requests.get(0);
            check(result.getBoolean("ok"), "Real client accepts bounded valid API JSON");
            check(get.getURL().toString().equals(context.origin + "/v2/guilds"), "Native HTTP uses configured origin and fixed path");
            check(("Bearer " + token).equals(get.getRequestProperty("Authorization")), "Session set only in native header");
            check(!get.getInstanceFollowRedirects(), "Redirects disabled");
            check(!get.getUseCaches() && get.closed, "No cache and connection closed");
            check(get.output.size() == 0 && "GET".equals(get.getRequestMethod()), "GET has no mutation body");

            fixtures.add(new Fixture(200, "{\"ok\":true,\"status\":\"pending\",\"intervalMs\":3000}"));
            client.request(context, "POST", "/v2/auth/poll", obj("loginId", "login_1234567890", "verifier", "test-private-claim"), null, false, false, 45000);
            FakeConnection poll = requests.get(1);
            check(poll.getRequestProperty("Authorization") == null, "No existing session header on public auth endpoint");
            check(!poll.getURL().toString().contains("verifier"), "Polling secret never enters URL");
            check(new JSONObject(new String(poll.output.toByteArray(), StandardCharsets.UTF_8)).getString("verifier").equals("test-private-claim"), "Polling proof uses body");

            JSONObject operation = obj("id", "operation_1234567890", "type", "post", "actorId", "123456789012345678", "guildId", "234567890123456789",
                "channelId", "345678901234567890", "category", "general", "createdAt", 1800000000000L, "data", obj("title", "Grüße", "text", "Test"));
            fixtures.add(new Fixture(200, "{\"ok\":true,\"operation\":{\"id\":\"operation_1234567890\",\"status\":\"sent\"}}"));
            client.request(context, "POST", "/v2/operations", obj("operation", operation), null, true, true, 45000);
            FakeConnection post = requests.get(2);
            check(new JSONObject(new String(post.output.toByteArray(), StandardCharsets.UTF_8)).getJSONObject("operation").similar(operation), "JSON operation uses required envelope");
            check(post.fixedLength() == post.output.size(), "JSON fixed-length byte count");
            check(post.getRequestProperty("Content-Type").startsWith("application/json"), "JSON content type");

            // Synthetic binary fixture isolates transport; Android decoding is covered on-device.
            byte[] original = new byte[]{0, (byte)255, 13, 10, 34, (byte)128, 1};
            Constructor<ImageAttachment> constructor = ImageAttachment.class.getDeclaredConstructor(byte[].class, String.class, int.class, int.class);
            constructor.setAccessible(true);
            ImageAttachment image = constructor.newInstance(original, "png", 1, 1);
            fixtures.add(new Fixture(200, "{\"ok\":true,\"operation\":{\"status\":\"pending\"}}"));
            client.request(context, "POST", "/v2/operations", operation, image, true, true, 200000);
            FakeConnection multipart = requests.get(3);
            String contentType = multipart.getRequestProperty("Content-Type");
            String boundary = contentType.substring(contentType.indexOf("boundary=") + 9);
            byte[] prefix = ImageAttachment.multipartPrefix(boundary, operation.toString().getBytes(StandardCharsets.UTF_8), image.filename, image.mime);
            byte[] suffix = ImageAttachment.multipartSuffix(boundary);
            byte[] wire = multipart.output.toByteArray();
            check(multipart.fixedLength() == wire.length, "Multipart exact streaming length");
            check(Arrays.equals(original, Arrays.copyOfRange(wire, prefix.length, prefix.length + original.length)), "Original image bytes preserved by actual client");
            check(wire.length == prefix.length + original.length + suffix.length, "Multipart contains exactly operation and image");
            check(new String(prefix, StandardCharsets.UTF_8).contains("name=\"operation\"") && new String(prefix, StandardCharsets.UTF_8).contains("name=\"image\""), "Backend field names used on wire");
            check(!new String(prefix, StandardCharsets.UTF_8).contains("files[0]"), "No old Discord-specific multipart field");
            check(multipart.getReadTimeout() == 200000, "Image deadline configured");

            fixtures.add(new Fixture(401, "{\"ok\":false,\"kind\":\"auth\",\"message\":\"Abgelaufen\"}"));
            result = client.request(context, "GET", "/v2/session", null, null, true, false, 45000);
            check(invalidations[0] == 1 && "auth".equals(result.getString("kind")), "401 invalidates native session");
            Fixture failed = new Fixture(0, ""); failed.fail = true; fixtures.add(failed);
            result = client.request(context, "GET", "/v2/session", null, null, true, false, 45000);
            check("network".equals(result.getString("kind")) && invalidations[0] == 1, "Network failure preserves session");

            fixtures.add(new Fixture(404, "{\"ok\":false,\"kind\":\"not_found\",\"message\":\"Unbekannt\"}"));
            result = client.request(context, "GET", "/v2/operations/operation_1234567890", null, null, true, false, 45000);
            check("not_found".equals(result.getString("kind")), "Confirmed missing operation is distinguished");
            Fixture rate = new Fixture(429, ""); rate.retryAfter = "0.25"; fixtures.add(rate);
            result = client.request(context, "POST", "/v2/operations", obj("operation", operation), null, true, true, 45000);
            check("rate_limited".equals(result.getString("kind")) && result.getLong("retryAfterMs") == 250, "429 fractional header retained");
            fixtures.add(new Fixture(200, "<html>not a receipt</html>"));
            result = client.request(context, "POST", "/v2/operations", obj("operation", operation), null, true, true, 45000);
            check("uncertain".equals(result.getString("kind")), "Malformed success cannot confirm mutation");
            fixtures.add(new Fixture(302, ""));
            result = client.request(context, "GET", "/v2/guilds", null, null, true, false, 45000);
            check(!result.getBoolean("ok"), "Redirect is reported and not followed");
            int before = requests.size();
            result = client.request(context, "POST", "https://discord.com/api/webhooks/test", new JSONObject(), null, true, true, 45000);
            check(requests.size() == before && "validation".equals(result.getString("kind")), "Direct webhook or foreign URL never reaches transport");
            Fixture blocked = new Fixture(0, ""); blocked.untilDeadline = true; fixtures.add(blocked);
            long start = System.nanoTime();
            result = client.request(context, "POST", "/v2/operations", obj("operation", operation), null, true, true, 40);
            check("uncertain".equals(result.getString("kind")) && requests.get(requests.size() - 1).closed, "Actual watchdog disconnects in-flight mutation");
            check((System.nanoTime() - start) / 1000000 < 1500, "Watchdog does not wait for server response");
            check(fixtures.isEmpty(), "All local fixtures consumed; no extra requests");
            System.out.println("Native backend HTTP transport: " + checks + " assertions passed with offline HTTPS fixtures. No network requests.");
        } finally { timer.shutdownNow(); }
    }
}
