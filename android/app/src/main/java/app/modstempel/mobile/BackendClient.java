package app.modstempel.mobile;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import javax.net.ssl.HttpsURLConnection;

/** Fixed HTTPS backend transport. Authentication replies stay native until the caller persists them. */
final class BackendClient {
    interface SessionInvalidator { void clearSession(BackendVault.Snapshot context) throws Exception; }
    private final SessionInvalidator vault;
    private final ScheduledExecutorService timer;

    BackendClient(SessionInvalidator vault, ScheduledExecutorService timer) { this.vault = vault; this.timer = timer; }

    JSONObject request(BackendVault.Snapshot context, String method, String path, JSONObject body,
            ImageAttachment image, boolean authenticated, boolean mutation, long deadlineMs) {
        HttpsURLConnection connection = null;
        ScheduledFuture<?> deadline = null;
        boolean started = false;
        try {
            String url = BackendProtocol.apiUrl(context.origin, method, path);
            if (authenticated) BackendProtocol.token(context.token());
            if (image != null && (!"POST".equals(method) || !"/v2/operations".equals(path)))
                throw new IllegalArgumentException("Ein Bild ist nur für einen neuen Auftrag erlaubt.");
            byte[] bytes = body == null ? null : body.toString().getBytes(StandardCharsets.UTF_8);
            if (bytes != null && bytes.length > 32 * 1024) throw new IllegalArgumentException("Die Anfrage ist zu groß.");
            connection = (HttpsURLConnection)new URL(url).openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout((int)Math.min(10000L, deadlineMs));
            connection.setReadTimeout((int)deadlineMs);
            connection.setUseCaches(false);
            connection.setRequestMethod(method);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "Crazy_Batto-Discord-App/2.2.0 Android");
            if (authenticated) connection.setRequestProperty("Authorization", "Bearer " + context.token());
            final HttpsURLConnection active = connection;
            deadline = timer.schedule(() -> active.disconnect(), deadlineMs, TimeUnit.MILLISECONDS);
            if (bytes != null) {
                connection.setDoOutput(true);
                byte[] prefix = null, suffix = null;
                if (image == null) {
                    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                    connection.setFixedLengthStreamingMode(bytes.length);
                } else {
                    String boundary = "Modstempel_" + UUID.randomUUID().toString().replace("-", "");
                    prefix = ImageAttachment.multipartPrefix(boundary, bytes, image.filename, image.mime);
                    suffix = ImageAttachment.multipartSuffix(boundary);
                    connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
                    connection.setFixedLengthStreamingMode((long)prefix.length + image.bytes.length + suffix.length);
                }
                started = true;
                try (OutputStream output = connection.getOutputStream()) {
                    if (image == null) output.write(bytes);
                    else ImageAttachment.writeMultipart(output, prefix, image.bytes, suffix);
                }
            }
            int status = connection.getResponseCode();
            if (authenticated && status == 401) vault.clearSession(context);
            JSONObject parsed = null;
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (stream != null) try (InputStream input = stream) {
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (output.size() + count > 2 * 1024 * 1024) throw new java.io.IOException("Response size limit");
                    output.write(buffer, 0, count);
                }
                try { parsed = new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8)); }
                catch (Exception invalid) { }
            }
            if (status >= 200 && status < 300 && parsed != null && Boolean.TRUE.equals(parsed.opt("ok"))) return parsed;
            if (status >= 200 && status < 300 && (parsed == null || !(parsed.opt("ok") instanceof Boolean)))
                return BackendProtocol.failure(mutation ? "uncertain" : "network",
                    mutation ? "Der Server hat die Ausführung nicht eindeutig bestätigt. Bitte den Status dieses Auftrags aktualisieren."
                        : "Der Server hat keine gültige Antwort geliefert.");
            JSONObject failure = BackendProtocol.serverFailure(status, parsed, mutation);
            if (status == 429 && !failure.has("retryAfterMs")) {
                long retry = 1000;
                try {
                    double seconds = Double.parseDouble(connection.getHeaderField("Retry-After"));
                    if (Double.isFinite(seconds) && seconds >= 0) retry = Math.max(1L, Math.min(604800000L, (long)Math.ceil(seconds * 1000)));
                } catch (Exception ignored) { }
                failure.put("retryAfterMs", retry);
            }
            return failure;
        } catch (IllegalArgumentException invalid) {
            return BackendProtocol.failure("validation", DiscordError.safeText(invalid.getMessage(), 1000));
        } catch (Exception unavailable) {
            return mutation && started
                ? BackendProtocol.failure("uncertain", "Die Ausführung des Auftrags konnte nicht bestätigt werden. Bitte den Status dieses Auftrags aktualisieren; er wird nicht mit einer neuen ID gesendet.")
                : BackendProtocol.failure("network", "Der App-Server konnte nicht erreicht werden. Die Anmeldung und der Verlauf bleiben auf dem Handy gespeichert.");
        } finally {
            if (deadline != null) deadline.cancel(false);
            if (connection != null) connection.disconnect();
        }
    }
}
