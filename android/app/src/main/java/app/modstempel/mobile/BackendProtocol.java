package app.modstempel.mobile;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;

/** Pure, testable boundary between the local UI and the fixed Modstempel v2 API. */
final class BackendProtocol {
    static final int MAX_OPERATION_BYTES = 16 * 1024;
    private static final Set<String> KINDS = set("auth", "access", "forbidden", "validation", "network", "rate_limited", "unconfigured", "uncertain", "permanent", "not_found");
    private static final Set<String> SECRET_KEYS = set("sessiontoken", "verifier", "token", "bottoken", "accesstoken", "refreshtoken", "clientsecret", "authorization", "password", "apikey", "challenge");

    private BackendProtocol() { }

    static JSONObject object(Object... fields) {
        JSONObject result = new JSONObject();
        try { for (int i = 0; i < fields.length; i += 2) result.put((String)fields[i], fields[i + 1]); }
        catch (JSONException impossible) { throw new IllegalStateException(impossible); }
        return result;
    }

    static JSONObject failure(String kind, String message) {
        return object("ok", false, "kind", kind, "message", message);
    }

    /** Fresh server-confirmed approval only. Never infer approval from a saved login. */
    static JSONObject accessStatus(JSONObject raw) {
        if (raw == null) throw new IllegalArgumentException("Der Server hat keine Zugangsprüfung bestätigt. Bitte die Registrierung und Freigabe auf dem App-Server einrichten.");
        String status = string(raw, "status");
        if (!set("unregistered", "pending", "approved", "rejected", "revoked").contains(status)
            || !(raw.opt("isOwner") instanceof Boolean) || !(raw.opt("canUseApp") instanceof Boolean)
            || raw.optBoolean("canUseApp") != "approved".equals(status)
            || raw.optBoolean("isOwner") && !"approved".equals(status))
            throw new IllegalArgumentException("Der Server hat einen ungültigen Zugangsstatus geliefert.");
        JSONObject result = object("status", status, "isOwner", raw.optBoolean("isOwner"),
            "canUseApp", raw.optBoolean("canUseApp"), "version", integer(raw, "version", 0, 9007199254740991L),
            "reason", raw.opt("reason") instanceof String ? DiscordError.safeText(raw.optString("reason"), 500) : "");
        for (String field : Arrays.asList("requestedAt", "updatedAt", "reviewedAt")) {
            try { result.put(field, raw.isNull(field) ? JSONObject.NULL : integer(raw, field, 0, 9007199254740991L)); }
            catch (JSONException invalid) { throw new IllegalArgumentException("Der Zugangsstatus ist ungültig."); }
        }
        return result;
    }

    static String portalUrl(String origin) { return canonicalOrigin(origin) + "/portal"; }

    static JSONObject legacyDisabled() {
        return failure("permanent", "Der frühere Webhook-Versand ist deaktiviert. Bitte mit Discord anmelden und ein neues Ziel auswählen.");
    }

    static boolean legacyAction(String action) {
        return "send".equals(action) || "check".equals(action) || "read_poll".equals(action) || "storeWebhook".equals(action);
    }

    static String canonicalOrigin(String input) {
        try {
            if (input == null || input.length() > 512) throw new IllegalArgumentException();
            URI uri = new URI(input.trim());
            String host = uri.getHost();
            String path = uri.getRawPath();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.isOpaque() || host == null
                || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
                || (uri.getPort() != -1 && uri.getPort() != 443)
                || (path != null && !path.isEmpty() && !"/".equals(path))
                || host.endsWith(".") || host.contains("..")) throw new IllegalArgumentException();
            return "https://" + host.toLowerCase(Locale.ROOT);
        } catch (Exception invalid) {
            throw new IllegalArgumentException("Bitte die HTTPS-Serveradresse ohne Pfad, Zugangsdaten oder Zusatzparameter eingeben.");
        }
    }

    static String verifier() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String challenge(String verifier) {
        if (verifier == null || !verifier.matches("[A-Za-z0-9_-]{43}")) throw new IllegalArgumentException("Ungültige Geräteanmeldung.");
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(64);
            for (byte value : digest) result.append(String.format(Locale.ROOT, "%02x", value & 255));
            return result.toString();
        } catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    static String loginId(String value) {
        if (value == null || !value.matches("[A-Za-z0-9_-]{16,128}")) throw new IllegalArgumentException("Die Geräteanmeldung des Servers ist ungültig.");
        return value;
    }

    static String authorizeUrl(String origin, String id, String path) {
        origin = canonicalOrigin(origin);
        String expected = "/oauth/start/" + loginId(id);
        if (!expected.equals(path)) throw new IllegalArgumentException("Der Server hat einen ungültigen Anmeldelink geliefert.");
        return origin + expected;
    }

    static String token(String value) {
        if (value == null || !value.matches("[A-Za-z0-9._~-]{32,512}")) throw new IllegalArgumentException("Der Server hat keine gültige Sitzung geliefert.");
        return value;
    }

    static String snowflake(String value) {
        if (value == null || !value.matches("[0-9]{17,20}")) throw new IllegalArgumentException("Eine Discord-ID ist ungültig.");
        return value;
    }

    static String operationId(String value) {
        if (value == null || !value.matches("[A-Za-z0-9_-]{16,80}")) throw new IllegalArgumentException("Die Auftrags-ID ist ungültig.");
        return value;
    }

    static String string(JSONObject body, String field) {
        Object raw = body == null ? null : body.opt(field);
        if (!(raw instanceof String)) throw new IllegalArgumentException("Die Anfrage enthält ein ungültiges Feld: " + field + ".");
        return (String)raw;
    }

    static long integer(JSONObject body, String field, long minimum, long maximum) {
        Object raw = body == null ? null : body.opt(field);
        if (!(raw instanceof Number)) throw new IllegalArgumentException("Die Anfrage enthält eine ungültige Zahl: " + field + ".");
        double value = ((Number)raw).doubleValue();
        if (!Double.isFinite(value) || value != Math.rint(value) || value < minimum || value > maximum)
            throw new IllegalArgumentException("Die Anfrage enthält eine ungültige Zahl: " + field + ".");
        return ((Number)raw).longValue();
    }

    static long expiry(JSONObject body) { return integer(body, "expiresAt", 1, 253402300799999L); }

    static JSONObject user(JSONObject body) {
        if (body == null) throw new IllegalArgumentException("Die bestätigte Discord-Identität fehlt.");
        String id = snowflake(string(body, "id"));
        String name = string(body, "username");
        String display = body.opt("displayName") instanceof String ? body.optString("displayName") : name;
        if (name.isEmpty() || name.length() > 128 || display.length() > 128)
            throw new IllegalArgumentException("Die bestätigte Discord-Identität ist ungültig.");
        JSONObject result = object("id", id, "username", name, "displayName", display.isEmpty() ? name : display);
        Object avatar = body.opt("avatarUrl");
        if (avatar instanceof String && ((String)avatar).length() <= 1024) {
            try {
                URI uri = new URI((String)avatar);
                if ("https".equals(uri.getScheme()) && "cdn.discordapp.com".equals(uri.getHost())
                    && uri.getRawUserInfo() == null && uri.getRawFragment() == null && (uri.getPort() == -1 || uri.getPort() == 443))
                    result.put("avatarUrl", avatar);
            } catch (Exception ignored) { }
        }
        return result;
    }

    static JSONObject login(JSONObject body, String verifier, String origin, long now) {
        challenge(verifier);
        String id = loginId(string(body, "loginId"));
        authorizeUrl(origin, id, string(body, "authorizePath"));
        String code = string(body, "displayCode");
        if (!code.matches("[A-Za-z0-9 -]{4,32}")) throw new IllegalArgumentException("Der Gerätecode des Servers ist ungültig.");
        long expires = expiry(body);
        if (expires <= now || expires > now + 15 * 60 * 1000L) throw new IllegalArgumentException("Die Geräteanmeldung ist bereits abgelaufen oder ungültig.");
        return object("loginId", id, "verifier", verifier, "displayCode", code, "expiresAt", expires,
            "intervalMs", integer(body, "intervalMs", 1000, 60000));
    }

    static final class Route {
        final String method;
        final String path;
        final JSONObject body;
        final boolean mutation;
        Route(String method, String path, JSONObject body, boolean mutation) {
            this.method = method; this.path = path; this.body = body; this.mutation = mutation;
        }
    }

    static String apiUrl(String origin, String method, String path) {
        boolean allowed = "GET".equals(method) && ("/health".equals(path) || "/v2/session".equals(path)
            || "/v2/guilds".equals(path) || path != null && (path.matches("/v2/guilds/[0-9]{17,20}/(?:setup|install|events)")
            || path.matches("/v2/operations/[A-Za-z0-9_-]{16,80}(?:/poll)?")))
            || "POST".equals(method) && ("/v2/operations".equals(path) || path != null
                && (path.matches("/v2/auth/(?:start|poll|cancel|logout)") || path.matches("/v2/operations/[A-Za-z0-9_-]{16,80}/retry")))
            || "PUT".equals(method) && path != null && path.matches("/v2/guilds/[0-9]{17,20}/moderator-role");
        if (!allowed) throw new IllegalArgumentException("Diese Backend-Adresse oder Methode ist nicht verfügbar.");
        return canonicalOrigin(origin) + path;
    }

    static Route route(String action, JSONObject input) {
        if ("guilds".equals(action)) return new Route("GET", "/v2/guilds", null, false);
        if ("guild_setup".equals(action) || "moderator_role".equals(action) || "bot_install".equals(action) || "scheduled_events".equals(action)) {
            String base = "/v2/guilds/" + snowflake(string(input, "guildId"));
            if ("guild_setup".equals(action)) return new Route("GET", base + "/setup", null, false);
            if ("bot_install".equals(action)) return new Route("GET", base + "/install", null, false);
            if ("scheduled_events".equals(action)) return new Route("GET", base + "/events", null, false);
            String role = snowflake(string(input, "roleId"));
            if (role.equals(string(input, "guildId"))) throw new IllegalArgumentException("Bitte eine Moderatorrolle statt @everyone auswählen.");
            return new Route("PUT", base + "/moderator-role", object("roleId", role), false);
        }
        if ("operation_status".equals(action) || "operation_retry".equals(action) || "poll_results".equals(action)) {
            String base = "/v2/operations/" + operationId(string(input, "operationId"));
            if ("operation_status".equals(action)) return new Route("GET", base, null, false);
            if ("poll_results".equals(action)) return new Route("GET", base + "/poll", null, false);
            Object acknowledge = input.opt("acknowledgeUncertain");
            if (!(acknowledge instanceof Boolean)) throw new IllegalArgumentException("Die Bestätigung zur Wiederholung fehlt.");
            return new Route("POST", base + "/retry", object("acknowledgeUncertain", acknowledge), true);
        }
        throw new IllegalArgumentException("Diese Backend-Aktion ist nicht verfügbar.");
    }

    static JSONObject prepareOperation(JSONObject input, Object imageReference, String actorId) {
        if (input == null) throw new IllegalArgumentException("Der Auftrag fehlt.");
        JSONObject operation;
        try { operation = new JSONObject(input.toString()); }
        catch (JSONException invalid) { throw new IllegalArgumentException("Der Auftrag ist ungültig."); }
        only(operation, set("id", "type", "actorId", "guildId", "channelId", "moderatorRoleId", "category", "createdAt", "sendBefore", "data", "image"));
        operationId(string(operation, "id"));
        if (!snowflake(actorId).equals(snowflake(string(operation, "actorId"))))
            throw new IllegalArgumentException("Dieser Auftrag gehört zu einem anderen Discord-Konto. Bitte mit dem ursprünglichen Konto anmelden.");
        snowflake(string(operation, "guildId"));
        integer(operation, "createdAt", 1, 253402300799999L);
        if (present(operation, "sendBefore")) integer(operation, "sendBefore", 1, 253402300799999L);
        if (present(operation, "moderatorRoleId")) snowflake(string(operation, "moderatorRoleId"));
        if (present(operation, "channelId")) snowflake(string(operation, "channelId"));
        String type = string(operation, "type");
        JSONObject data = operation.optJSONObject("data");
        if (data == null) throw new IllegalArgumentException("Die Angaben zum Auftrag fehlen.");
        if ("post".equals(type)) {
            snowflake(string(operation, "channelId"));
            if (!set("modstempel", "stream", "big_match", "general", "poll").contains(string(operation, "category")))
                throw new IllegalArgumentException("Die Kategorie des Auftrags ist ungültig.");
            only(data, set("title", "text", "startsAt", "poll"));
        } else if ("stamp".equals(type)) {
            snowflake(string(operation, "channelId"));
            if (!"modstempel".equals(string(operation, "category"))) throw new IllegalArgumentException("Der Modstempel hat eine ungültige Kategorie.");
            only(data, set("action", "at", "sessionId", "name", "team", "note", "activeMs", "pauseMs", "totalMs", "startedAt"));
        } else if ("scheduled_event".equals(type)) {
            only(data, set("title", "description", "startsAt", "endsAt", "location"));
        } else throw new IllegalArgumentException("Diese Auftragsart ist nicht verfügbar.");
        boolean hasRef = imageReference != null && imageReference != JSONObject.NULL;
        boolean hasImage = present(operation, "image");
        if (!"post".equals(type) && (hasRef || hasImage)) throw new IllegalArgumentException("Dieser Auftrag unterstützt kein Bild.");
        if (hasRef != hasImage) throw new IllegalArgumentException("Das angeforderte Bild fehlt. Der Auftrag wurde nicht ohne Bild gesendet.");
        if (hasRef) {
            if (!(imageReference instanceof String)) throw new IllegalArgumentException("Die Bildreferenz ist ungültig.");
            JSONObject image = operation.optJSONObject("image");
            validateImageMetadata(image);
            if (!imageReference.equals(string(image, "ref"))) throw new IllegalArgumentException("Das Bild gehört nicht zu diesem Auftrag.");
        }
        if (operation.toString().getBytes(StandardCharsets.UTF_8).length > MAX_OPERATION_BYTES)
            throw new IllegalArgumentException("Der Auftrag ist zu groß.");
        return operation;
    }

    static void validateImageMetadata(JSONObject image) {
        if (image == null) throw new IllegalArgumentException("Die Bildangaben fehlen.");
        only(image, set("ref", "name", "mime", "size", "width", "height"));
        String extension = ImageAttachment.extensionForReference(string(image, "ref"));
        if (!("Modstempel-Bild." + extension).equals(string(image, "name"))
            || !ImageAttachment.mimeForExtension(extension).equals(string(image, "mime")))
            throw new IllegalArgumentException("Die Bildangaben passen nicht zum Dateiformat.");
        ImageAttachment.requireSize(integer(image, "size", 1, ImageAttachment.MAX_BYTES));
        ImageAttachment.requireDimensions((int)integer(image, "width", 1, ImageAttachment.MAX_DIMENSION),
            (int)integer(image, "height", 1, ImageAttachment.MAX_DIMENSION));
    }

    static void requireSameImage(JSONObject metadata, ImageAttachment image) {
        validateImageMetadata(metadata);
        if (!image.reference.equals(metadata.optString("ref")) || !image.filename.equals(metadata.optString("name"))
            || !image.mime.equals(metadata.optString("mime")) || image.bytes.length != metadata.optLong("size")
            || image.width != metadata.optInt("width") || image.height != metadata.optInt("height"))
            throw new IllegalArgumentException("Das gespeicherte Originalbild stimmt nicht mit diesem Auftrag überein.");
    }

    static String installUrl(String value, String guildId) {
        snowflake(guildId);
        try {
            if (value == null || value.length() > 2048) throw new IllegalArgumentException();
            URI uri = new URI(value);
            if (!"https".equals(uri.getScheme()) || !"discord.com".equals(uri.getHost())
                || (uri.getPort() != -1 && uri.getPort() != 443) || uri.getRawUserInfo() != null || uri.getRawFragment() != null
                || !"/oauth2/authorize".equals(uri.getRawPath()) || uri.getRawQuery() == null) throw new IllegalArgumentException();
            Set<String> seen = new HashSet<>();
            boolean client = false, scope = false;
            for (String part : uri.getRawQuery().split("&", -1)) {
                String[] pair = part.split("=", -1);
                if (pair.length != 2 || !seen.add(pair[0])) throw new IllegalArgumentException();
                String v = java.net.URLDecoder.decode(pair[1], "UTF-8");
                if ("client_id".equals(pair[0])) { snowflake(v); client = true; }
                else if ("scope".equals(pair[0])) {
                    Set<String> scopes = new HashSet<>(Arrays.asList(v.split(" ")));
                    if (!scopes.contains("bot") || !set("bot", "applications.commands").containsAll(scopes)) throw new IllegalArgumentException();
                    scope = true;
                } else if ("permissions".equals(pair[0])) { if (!v.matches("[0-9]{1,20}")) throw new IllegalArgumentException(); }
                else if ("guild_id".equals(pair[0])) { if (!guildId.equals(v)) throw new IllegalArgumentException(); }
                else if ("disable_guild_select".equals(pair[0])) { if (!"true".equals(v)) throw new IllegalArgumentException(); }
                else if ("integration_type".equals(pair[0])) { if (!"0".equals(v)) throw new IllegalArgumentException(); }
                else throw new IllegalArgumentException();
            }
            if (!client || !scope) throw new IllegalArgumentException();
            return value;
        } catch (Exception invalid) { throw new IllegalArgumentException("Der Server hat keinen gültigen Discord-Bot-Installationslink geliefert."); }
    }

    static JSONObject serverFailure(int status, JSONObject body, boolean mutation) {
        String fallback = status == 401 ? "auth" : status == 403 ? "forbidden" : status == 429 ? "rate_limited"
            : status >= 500 ? (mutation ? "uncertain" : "network") : "permanent";
        String kind = body != null && body.opt("kind") instanceof String && KINDS.contains(body.optString("kind")) ? body.optString("kind") : fallback;
        if (status == 401) kind = "auth";
        if ("not_found".equals(kind) && status != 404) kind = fallback;
        if ("access".equals(kind) && status != 403) kind = fallback;
        String detail = body != null && body.opt("message") instanceof String ? DiscordError.safeText(body.optString("message"), 1000) : "";
        if (detail.isEmpty()) detail = status == 401 ? "Die Anmeldung ist abgelaufen. Bitte erneut mit Discord anmelden."
            : status == 403 ? "Für diese Aktion fehlen die erforderlichen Rechte."
            : status == 429 ? "Der Server bittet um eine kurze Pause."
            : status >= 300 && status < 400 ? "Der Server hat die API-Anfrage umgeleitet. Bitte die Serveradresse prüfen."
            : mutation ? "Die Ausführung des Auftrags konnte nicht eindeutig bestätigt werden. Bitte seinen Status aktualisieren."
            : "Der App-Server hat keine gültige Antwort geliefert.";
        JSONObject result = failure(kind, detail);
        if ("access".equals(kind)) {
            try { result.put("access", accessStatus(body.optJSONObject("access"))); }
            catch (Exception invalid) { return failure("access", "Dein Zugang ist nicht freigegeben. Bitte den Status auf der Registrierungsseite prüfen."); }
        }
        if (body != null && body.opt("retryAfterMs") instanceof Number) {
            try { result.put("retryAfterMs", integer(body, "retryAfterMs", 1, 604800000L)); }
            catch (Exception ignored) { }
        }
        return result;
    }

    static JSONObject publicResponse(JSONObject body, String sessionToken, String verifier) {
        try { return (JSONObject)publicValue(body, sessionToken, verifier, 0); }
        catch (Exception invalid) { return failure("network", "Die Antwort des Servers ist ungültig."); }
    }

    private static Object publicValue(Object value, String token, String verifier, int depth) throws JSONException {
        if (depth > 20) throw new JSONException("Response depth");
        if (value instanceof JSONObject) {
            JSONObject source = (JSONObject)value, result = new JSONObject();
            Iterator<String> keys = source.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                String normalized = key.replaceAll("[^A-Za-z]", "").toLowerCase(Locale.ROOT);
                if (SECRET_KEYS.contains(normalized)) continue;
                Object child = source.opt(key);
                if (("message".equals(key) || "error".equals(key)) && child instanceof String)
                    child = DiscordError.safeText((String)child, 1000);
                result.put(key, publicValue(child, token, verifier, depth + 1));
            }
            return result;
        }
        if (value instanceof JSONArray) {
            JSONArray source = (JSONArray)value, result = new JSONArray();
            for (int i = 0; i < source.length(); i++) result.put(publicValue(source.opt(i), token, verifier, depth + 1));
            return result;
        }
        if (value instanceof String) {
            String text = (String)value;
            if (token != null && !token.isEmpty()) text = text.replace(token, "[Sitzung ausgeblendet]");
            if (verifier != null && !verifier.isEmpty()) text = text.replace(verifier, "[Anmeldeprüfung ausgeblendet]");
            return text;
        }
        return value;
    }

    static boolean present(JSONObject object, String key) { return object.has(key) && !object.isNull(key); }
    private static Set<String> set(String... values) { return new HashSet<>(Arrays.asList(values)); }
    private static void only(JSONObject object, Set<String> allowed) {
        Iterator<String> keys = object.keys();
        while (keys.hasNext()) if (!allowed.contains(keys.next())) throw new IllegalArgumentException("Der Auftrag enthält nicht unterstützte Angaben.");
    }
}
