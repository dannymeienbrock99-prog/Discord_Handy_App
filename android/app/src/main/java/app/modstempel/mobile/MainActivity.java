package app.modstempel.mobile;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.AtomicFile;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;

/** Small local-only WebView shell. All network requests are performed here. */
public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String START_URL = ORIGIN + "/assets/index.html";
    private static final int MAX_STATE = 2 * 1024 * 1024;
    private static final int MAX_EXPORT = 8 * 1024 * 1024;
    private static final int EXPORT_REQUEST = 2401;
    private static final int IMAGE_REQUEST = 2402;
    private static final String CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'";
    private final Object stateLock = new Object();
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService uploadTimer = Executors.newSingleThreadScheduledExecutor();
    private final String fallbackBootId = "process-" + UUID.randomUUID().toString();
    private WebView webView;
    private AtomicFile stateFile;
    private AtomicFile legacyStateFile;
    private BackendVault backendVault;
    private BackendClient backendClient;
    private File imagesDirectory;
    private boolean pageReady;
    private String exportRequestId;
    private byte[] exportBytes;
    private String imageRequestId;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        stateFile = new AtomicFile(new File(getFilesDir(), "modstempel-state.json"));
        legacyStateFile = new AtomicFile(new File(getFilesDir(), "modstempel-state-v1-archive.json"));
        backendVault = new BackendVault(new File(getFilesDir(), "modstempel-backend-v2.json"));
        backendClient = new BackendClient(backendVault, uploadTimer);
        imagesDirectory = new File(getFilesDir(), "modstempel-images");
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(Color.rgb(16, 20, 24));
        frame.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override public WindowInsets onApplyWindowInsets(View view, WindowInsets insets) {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
                return insets.consumeSystemWindowInsets();
            }
        });
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(16, 20, 24));
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setBlockNetworkLoads(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setSaveFormData(false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new LocalClient());
        webView.addJavascriptInterface(new NativeBridge(), "NativeBridge");
        frame.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        frame.requestApplyInsets();
        webView.loadUrl(START_URL);
    }

    @Override protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            notifyResume();
        }
    }

    @Override protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override protected void onDestroy() {
        worker.shutdown();
        // Existing upload deadlines are still allowed to disconnect an in-flight request.
        uploadTimer.shutdown();
        if (webView != null) {
            webView.removeJavascriptInterface("NativeBridge");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override public void onBackPressed() {
        if (!trustedPage()) { finish(); return; }
        webView.evaluateJavascript("Boolean(window.ModstempelUI && window.ModstempelUI.handleBack && window.ModstempelUI.handleBack())", value -> {
            if (!"true".equals(value)) finish();
        });
    }

    private boolean trustedPage() {
        return webView != null && pageReady && isMainPage(webView.getUrl());
    }

    private static boolean isMainPage(String value) {
        return value != null && (value.equals(START_URL) || value.startsWith(START_URL + "#"));
    }

    private void notifyResume() {
        if (trustedPage()) webView.evaluateJavascript("window.dispatchEvent(new Event('modstempel-resume'));", null);
    }

    private final class LocalClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !request.isForMainFrame() || !isMainPage(request.getUrl().toString());
        }

        @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return !isMainPage(url);
        }

        @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
            pageReady = false;
            if (!isMainPage(url)) view.stopLoading();
        }

        @Override public void onPageFinished(WebView view, String url) {
            pageReady = isMainPage(url);
            notifyResume();
        }

        @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel();
        }

        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String path = uri.getPath();
            if (!"GET".equals(request.getMethod()) || !"https".equals(uri.getScheme())
                || !"appassets.androidplatform.net".equals(uri.getHost())
                || (uri.getPort() != -1 && uri.getPort() != 443) || uri.getUserInfo() != null
                || path == null || path.contains("..") || path.contains("\\")
                || uri.getQuery() != null) return blocked();
            try {
                final InputStream body;
                final String mime;
                if (path.startsWith("/images/")) {
                    if (uri.getFragment() != null || request.isForMainFrame()) return blocked();
                    String reference = path.substring("/images/".length());
                    String extension = ImageAttachment.extensionForReference(reference);
                    File target = imageFile(reference);
                    InputStream stored = new AtomicFile(target).openRead();
                    try { ImageAttachment.requireSize(target.length()); }
                    catch (IllegalArgumentException invalid) { stored.close(); throw invalid; }
                    body = stored;
                    mime = ImageAttachment.mimeForExtension(extension);
                } else if (path.startsWith("/assets/")) {
                    String asset = path.substring("/assets/".length());
                    body = getAssets().open(asset);
                    mime = mimeFor(asset);
                } else return blocked();
                Map<String, String> headers = new HashMap<>();
                headers.put("Content-Security-Policy", CSP);
                headers.put("X-Content-Type-Options", "nosniff");
                headers.put("Cache-Control", "no-store");
                return new WebResourceResponse(mime, mime.startsWith("image/") ? null : "UTF-8", 200, "OK", headers, body);
            } catch (IOException | IllegalArgumentException ignored) { return blocked(); }
        }
    }

    private static WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", new HashMap<>(),
            new ByteArrayInputStream("Nicht verfügbar".getBytes(StandardCharsets.UTF_8)));
    }

    private static String mimeFor(String path) {
        String p = path.toLowerCase(Locale.ROOT);
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    /** Synchronous methods run on WebView's dedicated Java bridge thread. */
    public final class NativeBridge {
        @JavascriptInterface public String loadState() {
            synchronized (stateLock) {
                try (InputStream stream = stateFile.openRead()) {
                    String state = new String(readBounded(stream, MAX_STATE), StandardCharsets.UTF_8);
                    return state;
                } catch (FileNotFoundException missing) {
                    return "";
                } catch (Exception ignored) {
                    return "{\"nativeStorageError\":true}";
                }
            }
        }

        @JavascriptInterface public String saveState(String json) {
            if (json == null) return error("permanent", "Der Speicherstand fehlt.").toString();
            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > MAX_STATE) return error("permanent", "Der Verlauf ist zu groß. Bitte zuerst exportieren.").toString();
            try { requireStateForSave(new JSONObject(json)); }
            catch (Exception invalid) { return error("permanent", "Der Speicherstand ist ungültig.").toString(); }
            synchronized (stateLock) {
                try { archiveLegacyBeforeSave(); writeAtomic(stateFile, bytes); return ok().toString(); }
                catch (Exception ignored) { return error("permanent", "Speichern oder Sichern des bisherigen Verlaufs fehlgeschlagen. Der alte Verlauf bleibt erhalten. Bitte den freien Gerätespeicher prüfen.").toString(); }
            }
        }

        @JavascriptInterface public String getConnection() {
            return object("configured", false, "ref", "", "mask", "", "legacyDisabled", true).toString();
        }

        @JavascriptInterface public String storeWebhook(String url) {
            return BackendProtocol.legacyDisabled().toString();
        }

        @JavascriptInterface public String clipboard() {
            try {
                ClipboardManager clipboard = (ClipboardManager)getSystemService(Context.CLIPBOARD_SERVICE);
                ClipData clip = clipboard == null ? null : clipboard.getPrimaryClip();
                if (clip == null || clip.getItemCount() == 0) return error("permanent", "Die Zwischenablage ist leer.").toString();
                CharSequence raw = clip.getItemAt(0).getText();
                if (raw == null || raw.length() > 8192) return error("permanent", "Die Zwischenablage enthält keinen geeigneten Text.").toString();
                return object("ok", true, "text", raw.toString()).toString();
            } catch (Exception ignored) { return error("permanent", "Die Zwischenablage konnte nicht gelesen werden.").toString(); }
        }

        @JavascriptInterface public String clock() {
            String bootId;
            try {
                int count = Settings.Global.getInt(getContentResolver(), Settings.Global.BOOT_COUNT, -1);
                bootId = count >= 0 ? "boot-" + count : fallbackBootId;
            } catch (Exception ignored) { bootId = fallbackBootId; }
            return object("wallMs", System.currentTimeMillis(), "elapsedMs", SystemClock.elapsedRealtime(), "bootId", bootId).toString();
        }

        @JavascriptInterface public void call(final String requestId, final String action, final String bodyJSON) {
            if (requestId == null || requestId.length() > 128 || requestId.isEmpty()) return;
            if (BackendProtocol.legacyAction(action)) { resolve(requestId, BackendProtocol.legacyDisabled()); return; }
            if (bodyJSON == null || bodyJSON.length() > MAX_EXPORT + 4096) {
                resolve(requestId, error("permanent", "Die Anfrage ist zu groß oder unvollständig."));
                return;
            }
            final JSONObject body;
            try { body = new JSONObject(bodyJSON); }
            catch (JSONException ignored) { resolve(requestId, error("permanent", "Die Anfrage ist ungültig.")); return; }
            if ("export".equals(action)) { beginExport(requestId, body); return; }
            if ("pick_image".equals(action)) { beginImagePick(requestId); return; }
            if ("open_discord".equals(action)) { openDiscord(requestId, body); return; }
            try {
                worker.execute(() -> {
                    try {
                        if ("auth_begin".equals(action)) { beginAuth(requestId); return; }
                        if ("bot_install".equals(action)) { installBot(requestId, body); return; }
                        if ("open_portal".equals(action)) {
                            BackendVault.Snapshot context = backendVault.snapshot();
                            JSONObject invalid = connectionFailure(context, false);
                            if (invalid != null) { resolve(requestId, invalid); return; }
                            openExternal(requestId, BackendProtocol.portalUrl(context.origin), ok(), "Die Registrierungsseite konnte nicht im Browser geöffnet werden.");
                            return;
                        }
                        JSONObject result = "remove_image".equals(action) ? removeImage(body.optString("ref", ""))
                            : backendAction(action, body);
                        resolve(requestId, result);
                    } catch (IllegalArgumentException invalid) {
                        resolve(requestId, error("validation", DiscordError.safeText(invalid.getMessage(), 1000)));
                    } catch (Exception failure) {
                        resolve(requestId, error("permanent", "Die sichere Serververbindung konnte nicht geöffnet oder gespeichert werden. Bitte die Einstellungen prüfen."));
                    }
                });
            } catch (RejectedExecutionException ignored) { resolve(requestId, error("network", "Die App wird gerade geschlossen.")); }
        }
    }

    private void resolve(final String requestId, final JSONObject result) {
        runOnUiThread(() -> {
            if (!trustedPage() || isFinishing() || isDestroyed()) return;
            String script = "if(typeof window.__modstempelNativeResolve==='function'){window.__modstempelNativeResolve("
                + javascriptQuote(requestId) + ",JSON.parse(" + javascriptQuote(result.toString()) + "));}";
            webView.evaluateJavascript(script, null);
        });
    }

    private static void requireStateForSave(JSONObject state) {
        if (state.optInt("version", 0) != 2 || state.optJSONObject("profile") == null
            || state.optJSONArray("sessions") == null || state.optJSONArray("events") == null
            || state.optJSONObject("selection") == null)
            throw new IllegalArgumentException("Unknown v2 state");
    }

    /** The first v2 write preserves the complete original v1 bytes before replacing active state. */
    private void archiveLegacyBeforeSave() throws Exception {
        final byte[] original;
        try (InputStream input = stateFile.openRead()) { original = readBounded(input, MAX_STATE); }
        catch (FileNotFoundException newInstall) { return; }
        JSONObject previous = new JSONObject(new String(original, StandardCharsets.UTF_8));
        int version = previous.optInt("version", 0);
        if (version == 2) return;
        if (version != 1) throw new IllegalArgumentException("Unknown previous state");
        try (InputStream existing = legacyStateFile.openRead()) {
            JSONObject archived = new JSONObject(new String(readBounded(existing, MAX_STATE), StandardCharsets.UTF_8));
            if (archived.optInt("version", 0) != 1) throw new IllegalArgumentException("Invalid legacy archive");
        } catch (FileNotFoundException noArchive) { writeAtomic(legacyStateFile, original); }
    }

    private void beginExport(final String requestId, final JSONObject body) {
        String content = body.optString("content", "");
        final byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_EXPORT) { resolve(requestId, error("permanent", "Der Export ist zu groß.")); return; }
        String requestedName = body.optString("filename", "Crazy_Batto-Discord-App-Export.json");
        final String filename = requestedName.replaceAll("[^A-Za-z0-9._-]", "_").substring(0, Math.min(96, requestedName.replaceAll("[^A-Za-z0-9._-]", "_").length()));
        final String mime = "text/csv".equals(body.optString("mime")) ? "text/csv" : "application/json";
        runOnUiThread(() -> {
            if (exportRequestId != null || imageRequestId != null) { resolve(requestId, error("permanent", "Bitte zuerst die laufende Dateiauswahl abschließen.")); return; }
            exportRequestId = requestId;
            exportBytes = bytes;
            try {
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mime);
                intent.putExtra(Intent.EXTRA_TITLE, filename.isEmpty() ? "Crazy_Batto-Discord-App-Export.json" : filename);
                startActivityForResult(intent, EXPORT_REQUEST);
            } catch (Exception ignored) {
                exportRequestId = null;
                exportBytes = null;
                resolve(requestId, error("permanent", "Die Dateiauswahl konnte nicht geöffnet werden."));
            }
        });
    }

    private void beginImagePick(final String requestId) {
        runOnUiThread(() -> {
            if (imageRequestId != null || exportRequestId != null) {
                resolve(requestId, error("permanent", "Bitte zuerst die laufende Dateiauswahl abschließen."));
                return;
            }
            if (!trustedPage() || isFinishing() || isDestroyed()) {
                resolve(requestId, error("permanent", "Die App wird gerade geschlossen."));
                return;
            }
            imageRequestId = requestId;
            try {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/jpeg", "image/png", "image/webp"});
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivityForResult(intent, IMAGE_REQUEST);
            } catch (Exception ignored) {
                imageRequestId = null;
                resolve(requestId, error("permanent", "Die Bildauswahl konnte nicht geöffnet werden."));
            }
        });
    }

    private File imageFile(String reference) throws IOException {
        ImageAttachment.extensionForReference(reference);
        File directory = imagesDirectory.getCanonicalFile();
        File target = new File(directory, reference).getCanonicalFile();
        if (!directory.equals(target.getParentFile())) throw new IllegalArgumentException("Ungültige Bildreferenz.");
        return target;
    }

    private JSONObject importImage(Uri uri) {
        try (InputStream input = getContentResolver().openInputStream(uri)) {
            ImageAttachment image = ImageAttachment.inspect(ImageAttachment.readBounded(input));
            if (!imagesDirectory.isDirectory() && !imagesDirectory.mkdirs()) throw new IOException();
            File target = imageFile(image.reference);
            // Re-selecting an unchanged original never rewrites an image used by saved requests.
            boolean alreadyStored = false;
            try (InputStream existing = new AtomicFile(target).openRead()) {
                byte[] stored = ImageAttachment.readBounded(existing);
                alreadyStored = image.reference.equals(ImageAttachment.referenceFor(stored,
                    ImageAttachment.extensionForReference(image.reference)));
            } catch (IOException | IllegalArgumentException missingOrChanged) { }
            if (!alreadyStored) writeAtomic(new AtomicFile(target), image.bytes);
            return object("ok", true, "image", object("ref", image.reference, "name", image.filename,
                "mime", image.mime, "size", image.bytes.length, "width", image.width, "height", image.height));
        } catch (IllegalArgumentException invalid) {
            return error("permanent", invalid.getMessage());
        } catch (OutOfMemoryError tooLarge) {
            return error("permanent", "Dieses Bild benötigt zu viel Speicher. Bitte eine kleinere Datei wählen.");
        } catch (Exception ignored) {
            return error("permanent", "Das Bild konnte nicht auf dem Handy gespeichert werden. Bitte Datei und freien Speicher prüfen.");
        }
    }

    private ImageAttachment readImage(String reference) throws IOException {
        File target = imageFile(reference);
        try (InputStream input = new AtomicFile(target).openRead()) {
            ImageAttachment image = ImageAttachment.inspect(ImageAttachment.readBounded(input));
            if (!image.reference.equals(reference)) throw new IllegalArgumentException("Das gespeicherte Bild stimmt nicht mehr mit dieser Abfrage überein.");
            return image;
        }
    }

    private JSONObject removeImage(String reference) {
        try {
            File target = imageFile(reference);
            synchronized (stateLock) {
                try {
                    if (storedImageReference(stateFile, reference) || storedImageReference(legacyStateFile, reference))
                        return object("ok", true, "removed", false, "retained", true);
                } catch (Exception unreadableState) {
                    return error("permanent", "Der Verlauf konnte nicht geprüft werden. Das Bild bleibt vorsichtshalber auf dem Handy.");
                }
                boolean existed = target.exists();
                if (existed) {
                    new AtomicFile(target).delete();
                    if (target.exists()) throw new IOException();
                }
                return object("ok", true, "removed", existed);
            }
        } catch (Exception ignored) {
            return error("permanent", "Das gespeicherte Bild konnte nicht entfernt werden.");
        }
    }

    private boolean storedImageReference(AtomicFile source, String reference) throws Exception {
        try (InputStream input = source.openRead()) {
            JSONObject state = new JSONObject(new String(readBounded(input, MAX_STATE), StandardCharsets.UTF_8));
            if ((state.optInt("version", 0) != 1 && state.optInt("version", 0) != 2)
                || state.optJSONObject("profile") == null || state.optJSONArray("sessions") == null
                || state.optJSONArray("events") == null) throw new JSONException("Unknown saved state");
            return containsImageReference(state, reference, 0);
        } catch (FileNotFoundException emptyState) { return false; }
    }

    /** Includes v2 posts and the nested legacyArchive without discarding unknown references. */
    private static boolean containsImageReference(Object value, String reference, int depth) throws JSONException {
        if (depth > 80) throw new JSONException("Saved state nesting limit");
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject)value;
            java.util.Iterator<String> keys = object.keys();
            while (keys.hasNext()) if (containsImageReference(object.opt(keys.next()), reference, depth + 1)) return true;
        } else if (value instanceof JSONArray) {
            JSONArray array = (JSONArray)value;
            for (int index = 0; index < array.length(); index++)
                if (containsImageReference(array.opt(index), reference, depth + 1)) return true;
        } else if (reference.equals(value)) return true;
        return false;
    }

    private void openDiscord(final String requestId, final JSONObject body) {
        final String url;
        try {
            url = BackendProtocol.present(body, "eventId")
                ? discordEventUrl(body.optString("guildId", ""), body.optString("eventId", ""))
                : discordMessageUrl(body.optString("guildId", ""), body.optString("channelId", ""), body.optString("messageId", ""));
        } catch (IllegalArgumentException invalid) {
            resolve(requestId, error("permanent", "Für diese Umfrage fehlt ein gültiger Discord-Nachrichtenlink."));
            return;
        }
        runOnUiThread(() -> {
            if (isFinishing() || isDestroyed()) { resolve(requestId, error("permanent", "Die App wird gerade geschlossen.")); return; }
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                startActivity(intent);
                resolve(requestId, ok());
            } catch (Exception ignored) {
                resolve(requestId, error("permanent", "Discord konnte nicht geöffnet werden. Bitte Discord oder einen Browser installieren."));
            }
        });
    }

    private static void requireSnowflake(String id) {
        if (id == null || !id.matches("[0-9]{17,20}")) throw new IllegalArgumentException();
    }

    private static String discordMessageUrl(String guildId, String channelId, String messageId) {
        requireSnowflake(guildId);
        requireSnowflake(channelId);
        requireSnowflake(messageId);
        return "https://discord.com/channels/" + guildId + "/" + channelId + "/" + messageId;
    }

    private static String discordEventUrl(String guildId, String eventId) {
        requireSnowflake(guildId);
        requireSnowflake(eventId);
        return "https://discord.com/events/" + guildId + "/" + eventId;
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == IMAGE_REQUEST) {
            if (imageRequestId == null) return;
            final String requestId = imageRequestId;
            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                imageRequestId = null;
                resolve(requestId, object("ok", false, "kind", "cancelled", "message", "Bildauswahl abgebrochen."));
                return;
            }
            final Uri uri = data.getData();
            if (!"content".equals(uri.getScheme())) {
                imageRequestId = null;
                resolve(requestId, error("permanent", "Die ausgewählte Bilddatei ist ungültig."));
                return;
            }
            try {
                worker.execute(() -> {
                    JSONObject result = importImage(uri);
                    runOnUiThread(() -> {
                        imageRequestId = null;
                        resolve(requestId, result);
                    });
                });
            } catch (RejectedExecutionException ignored) {
                imageRequestId = null;
                resolve(requestId, error("permanent", "Die App wird gerade geschlossen."));
            }
            return;
        }
        if (requestCode != EXPORT_REQUEST || exportRequestId == null) return;
        final String requestId = exportRequestId;
        final byte[] bytes = exportBytes;
        exportRequestId = null;
        exportBytes = null;
        if (resultCode != RESULT_OK || data == null || data.getData() == null || bytes == null) {
            resolve(requestId, object("ok", false, "kind", "cancelled", "message", "Export abgebrochen."));
            return;
        }
        final Uri uri = data.getData();
        if (!"content".equals(uri.getScheme())) { resolve(requestId, error("permanent", "Das Speicherziel ist ungültig.")); return; }
        worker.execute(() -> {
            try (OutputStream output = getContentResolver().openOutputStream(uri, "wt")) {
                if (output == null) throw new IOException();
                output.write(bytes);
                output.flush();
            } catch (Exception ignored) { resolve(requestId, error("permanent", "Die Exportdatei konnte nicht gespeichert werden.")); return; }
            resolve(requestId, object("ok", true, "message", "Export gespeichert."));
        });
    }

    private JSONObject connectionFailure(BackendVault.Snapshot context, boolean authenticated) {
        if (context.origin.isEmpty()) return error("unconfigured", "Bitte zuerst die HTTPS-Adresse des App-Servers eintragen.");
        if (authenticated && (context.token().isEmpty() || context.session() == null
            || context.session().optLong("expiresAt", 0) <= System.currentTimeMillis()))
            return error("auth", "Bitte zuerst mit Discord anmelden.");
        return null;
    }

    private JSONObject publicReply(JSONObject reply, BackendVault.Snapshot context) {
        return BackendProtocol.publicResponse(reply, context.token(), context.verifier());
    }

    private JSONObject health(BackendVault.Snapshot context) {
        JSONObject response = backendClient.request(context, "GET", "/health", null, null, false, false, 10000);
        if (!Boolean.TRUE.equals(response.opt("ok"))) return publicReply(response, context);
        if (!"Modstempel".equals(response.optString("app")) || !(response.opt("apiVersion") instanceof Number)
            || response.optDouble("apiVersion", 0) != 2 || !(response.opt("configured") instanceof Boolean))
            return error("unconfigured", "Diese Adresse liefert keinen kompatiblen App-Server.");
        if (!Boolean.TRUE.equals(response.opt("accessControl")))
            return error("unconfigured", "Bitte zuerst die Registrierung und Freigabe auf dem App-Server einrichten.");
        return object("ok", true, "configured", response.optBoolean("configured"),
            "message", DiscordError.safeText(response.optString("message", ""), 1000));
    }

    private JSONObject backendStatus() throws Exception {
        BackendVault.Snapshot context = backendVault.snapshot();
        JSONObject result = BackendVault.publicStatus(context, System.currentTimeMillis());
        if (context.origin.isEmpty()) return publicReply(result, context);
        if (surelyOffline()) { result.put("message", "Keine Internetverbindung. Die gespeicherte Anmeldung bleibt erhalten."); return publicReply(result, context); }
        JSONObject server = health(context);
        if (!server.optBoolean("ok", false)) { result.put("message", server.optString("message")); return publicReply(result, context); }
        result.put("serverReady", server.optBoolean("configured"));
        if (!server.optString("message", "").isEmpty()) result.put("message", server.optString("message"));
        if (!server.optBoolean("configured")) {
            if (!result.has("message")) result.put("message", "Der Server ist erreichbar; seine Discord-Anbindung ist noch nicht eingerichtet.");
            return publicReply(result, context);
        }
        if (!context.token().isEmpty()) {
            JSONObject session = backendClient.request(context, "GET", "/v2/session", null, null, true, false, 30000);
            if (session.optBoolean("ok", false)) {
                JSONObject user = BackendProtocol.user(session.optJSONObject("user"));
                if (!context.actorId().equals(user.optString("id"))) {
                    backendVault.clearSession(context);
                    result = BackendVault.publicStatus(backendVault.snapshot(), System.currentTimeMillis());
                    result.put("message", "Die Sitzung gehört nicht mehr zum gespeicherten Konto. Bitte erneut mit Discord anmelden.");
                } else {
                    backendVault.refreshSession(context, user, BackendProtocol.expiry(session));
                    result = BackendVault.publicStatus(backendVault.snapshot(), System.currentTimeMillis());
                    try {
                        result.put("access", BackendProtocol.accessStatus(session.optJSONObject("access")));
                        result.put("accessCheckedAt", System.currentTimeMillis());
                    } catch (IllegalArgumentException invalidAccess) {
                        result.put("message", DiscordError.safeText(invalidAccess.getMessage(), 1000));
                    }
                }
            } else {
                result = BackendVault.publicStatus(backendVault.snapshot(), System.currentTimeMillis());
                result.put("message", publicReply(session, context).optString("message"));
            }
            result.put("serverReady", true);
        }
        return publicReply(result, context);
    }

    private JSONObject backendAction(String action, JSONObject body) throws Exception {
        if ("backend_status".equals(action)) return backendStatus();
        if ("configure_backend".equals(action)) {
            backendVault.configure(BackendProtocol.string(body, "url"));
            return backendStatus();
        }
        if ("auth_poll".equals(action)) return pollAuth();
        if ("auth_cancel".equals(action) || "auth_logout".equals(action)) return closeAuth("auth_logout".equals(action));
        if ("operation_send".equals(action)) return sendOperation(body);
        BackendProtocol.Route route = BackendProtocol.route(action, body);
        BackendVault.Snapshot context = backendVault.snapshot();
        JSONObject invalid = connectionFailure(context, true);
        if (invalid != null) return invalid;
        JSONObject result = backendClient.request(context, route.method, route.path, route.body, null, true, route.mutation, 45000);
        return publicReply(result, context);
    }

    private void beginAuth(String requestId) throws Exception {
        BackendVault.Snapshot context = backendVault.snapshot();
        JSONObject invalid = connectionFailure(context, false);
        if (invalid != null) { resolve(requestId, invalid); return; }
        JSONObject login = context.login();
        boolean serverChecked = false;
        if (login == null || login.optLong("expiresAt", 0) <= System.currentTimeMillis()) {
            JSONObject server = health(context);
            if (!server.optBoolean("ok", false)) { resolve(requestId, server); return; }
            if (!server.optBoolean("configured")) {
                String message = server.optString("message", "");
                resolve(requestId, error("unconfigured", message.isEmpty() ? "Der Server muss zuerst für die Discord-Anmeldung eingerichtet werden." : message));
                return;
            }
            serverChecked = true;
            String verifier = BackendProtocol.verifier();
            JSONObject response = backendClient.request(context, "POST", "/v2/auth/start",
                object("challenge", BackendProtocol.challenge(verifier)), null, false, false, 30000);
            if (!response.optBoolean("ok", false)) { resolve(requestId, BackendProtocol.publicResponse(response, context.token(), verifier)); return; }
            login = BackendProtocol.login(response, verifier, context.origin, System.currentTimeMillis());
            backendVault.saveLogin(context, login);
            context = backendVault.snapshot();
        }
        String id = BackendProtocol.string(login, "loginId");
        String url = BackendProtocol.authorizeUrl(context.origin, id, "/oauth/start/" + id);
        JSONObject result = BackendVault.publicStatus(context, System.currentTimeMillis());
        if (serverChecked) result.put("serverReady", true);
        result.put("status", "pending");
        openExternal(requestId, url, result, "Die Anmeldung konnte nicht im Browser geöffnet werden. Bitte einen Browser installieren und erneut anmelden.");
    }

    private JSONObject pollAuth() throws Exception {
        BackendVault.Snapshot context = backendVault.snapshot();
        JSONObject invalid = connectionFailure(context, false);
        if (invalid != null) return invalid;
        JSONObject login = context.login();
        if (login == null) return error("auth", "Es läuft keine Geräteanmeldung. Bitte die Discord-Anmeldung öffnen.");
        if (BackendProtocol.expiry(login) <= System.currentTimeMillis()) {
            backendVault.clearLogin(context);
            return error("auth", "Die Geräteanmeldung ist abgelaufen. Bitte erneut mit Discord anmelden.");
        }
        String id = BackendProtocol.loginId(BackendProtocol.string(login, "loginId"));
        String verifier = BackendProtocol.string(login, "verifier");
        BackendProtocol.challenge(verifier);
        JSONObject response = backendClient.request(context, "POST", "/v2/auth/poll", object("loginId", id, "verifier", verifier),
            null, false, false, 45000);
        if (!response.optBoolean("ok", false)) {
            if ("auth".equals(response.optString("kind"))) backendVault.clearLogin(context);
            return publicReply(response, context);
        }
        String status = BackendProtocol.string(response, "status");
        if ("pending".equals(status)) {
            long interval = BackendProtocol.integer(response, "intervalMs", 1000, 60000);
            if (interval != login.optLong("intervalMs")) {
                login.put("intervalMs", interval);
                backendVault.saveLogin(context, login);
                context = backendVault.snapshot();
            }
            JSONObject result = BackendVault.publicStatus(context, System.currentTimeMillis());
            result.put("serverReady", true);
            result.put("status", "pending");
            result.put("intervalMs", interval);
            return result;
        }
        if (!"authorized".equals(status)) return error("auth", "Der Server hat keinen gültigen Anmeldestatus geliefert.");
        String token = BackendProtocol.token(BackendProtocol.string(response, "sessionToken"));
        JSONObject user = BackendProtocol.user(response.optJSONObject("user"));
        long expiresAt = BackendProtocol.expiry(response);
        if (expiresAt <= System.currentTimeMillis()) return error("auth", "Die neue Anmeldung ist bereits abgelaufen. Bitte erneut anmelden.");
        // A repeated same-verifier claim is supported by the backend if this atomic write fails.
        backendVault.saveSession(context, token, user, expiresAt);
        JSONObject result = backendStatus();
        result.put("status", "authorized");
        return result;
    }

    private JSONObject closeAuth(boolean logout) throws Exception {
        BackendVault.Snapshot context = backendVault.snapshot();
        if (context.origin.isEmpty()) return BackendVault.publicStatus(context, System.currentTimeMillis());
        JSONObject response = ok();
        if (logout && !context.token().isEmpty()) {
            response = backendClient.request(context, "POST", "/v2/auth/logout", new JSONObject(), null, true, false, 45000);
        } else if (!logout && context.login() != null) {
            response = backendClient.request(context, "POST", "/v2/auth/cancel",
                object("loginId", BackendProtocol.loginId(BackendProtocol.string(context.login(), "loginId")), "verifier", context.verifier()),
                null, false, false, 45000);
        }
        if (logout) backendVault.clearAuthentication(context);
        else backendVault.clearLogin(context);
        JSONObject result = BackendVault.publicStatus(backendVault.snapshot(), System.currentTimeMillis());
        if (!response.optBoolean("ok", false) && !"auth".equals(response.optString("kind")))
            result.put("message", logout ? "Auf diesem Handy abgemeldet. Der Server konnte den Sitzungswiderruf noch nicht bestätigen."
                : "Die Anmeldung wurde auf dem Handy abgebrochen. Die nicht bestätigte Geräteanmeldung auf dem Server läuft automatisch ab.");
        return result;
    }

    private void installBot(String requestId, JSONObject body) throws Exception {
        BackendVault.Snapshot context = backendVault.snapshot();
        JSONObject invalid = connectionFailure(context, true);
        if (invalid != null) { resolve(requestId, invalid); return; }
        BackendProtocol.Route route = BackendProtocol.route("bot_install", body);
        JSONObject response = backendClient.request(context, route.method, route.path, null, null, true, false, 45000);
        if (!response.optBoolean("ok", false)) { resolve(requestId, publicReply(response, context)); return; }
        String url = BackendProtocol.installUrl(BackendProtocol.string(response, "url"), BackendProtocol.string(body, "guildId"));
        openExternal(requestId, url, ok(), "Die Bot-Einladung konnte nicht geöffnet werden. Bitte einen Browser installieren.");
    }

    private void openExternal(String requestId, String url, JSONObject result, String failure) {
        runOnUiThread(() -> {
            if (!trustedPage() || isFinishing() || isDestroyed()) { resolve(requestId, error("permanent", "Die App wird gerade geschlossen.")); return; }
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                startActivity(intent);
                resolve(requestId, result);
            } catch (Exception unavailable) { resolve(requestId, error("permanent", failure)); }
        });
    }

    /** Actual v2 preparation: domain operation only; the backend handles Discord messages and polls. */
    private static JSONObject validateOperationPayload(JSONObject operation, Object imageReference, String actorId) {
        return BackendProtocol.prepareOperation(operation, imageReference, actorId);
    }

    private JSONObject sendOperation(JSONObject body) throws Exception {
        BackendVault.Snapshot context = backendVault.snapshot();
        JSONObject invalid = connectionFailure(context, true);
        if (invalid != null) return invalid;
        JSONObject operation = validateOperationPayload(body.optJSONObject("operation"), body.opt("imageRef"), context.actorId());
        ImageAttachment image = null;
        if (BackendProtocol.present(operation, "image")) {
            try { image = readImage(BackendProtocol.string(operation.getJSONObject("image"), "ref")); }
            catch (FileNotFoundException missing) { return error("validation", "Das Bild zu diesem Auftrag fehlt auf dem Handy. Der Auftrag wurde nicht ohne Bild gesendet."); }
            catch (OutOfMemoryError tooLarge) { return error("validation", "Das Bild benötigt zu viel Speicher. Der Auftrag wurde nicht gesendet."); }
            BackendProtocol.requireSameImage(operation.getJSONObject("image"), image);
        }
        if (surelyOffline()) return error("network", "Keine Internetverbindung. Der Auftrag bleibt auf dem Handy gespeichert.");
        JSONObject payload = image == null ? object("operation", operation) : operation;
        JSONObject response = backendClient.request(context, "POST", "/v2/operations", payload, image, true, true, image == null ? 45000 : 200000);
        return publicReply(response, context);
    }

    private boolean surelyOffline() {
        try {
            ConnectivityManager manager = (ConnectivityManager)getSystemService(Context.CONNECTIVITY_SERVICE);
            if (manager == null) return false;
            Network network = manager.getActiveNetwork();
            if (network == null) return true;
            NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
            return capabilities != null && !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception ignored) { return false; }
    }

    private static long secondsToMs(String value, long fallback) {
        try {
            double seconds = Double.parseDouble(value);
            if (!Double.isFinite(seconds) || seconds < 0) return fallback;
            return Math.max(1, Math.min(604800000L, (long)Math.ceil(seconds * 1000.0)));
        } catch (Exception ignored) { return fallback; }
    }

    private static byte[] readBounded(InputStream input, int maximum) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (output.size() + count > maximum) throw new IOException("Size limit");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }

    private static void writeAtomic(AtomicFile target, byte[] bytes) throws IOException {
        FileOutputStream output = null;
        try {
            output = target.startWrite();
            output.write(bytes);
            target.finishWrite(output);
        } catch (IOException exception) {
            if (output != null) target.failWrite(output);
            throw exception;
        }
    }

    private static JSONObject object(Object... values) {
        JSONObject json = new JSONObject();
        try {
            for (int index = 0; index < values.length; index += 2) json.put((String)values[index], values[index + 1]);
        } catch (JSONException impossible) { throw new IllegalStateException("Invalid internal value"); }
        return json;
    }

    private static JSONObject ok() { return object("ok", true); }
    private static JSONObject error(String kind, String message) { return object("ok", false, "kind", kind, "message", message); }
    private static String javascriptQuote(String value) {
        return JSONObject.quote(value).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029");
    }

}
