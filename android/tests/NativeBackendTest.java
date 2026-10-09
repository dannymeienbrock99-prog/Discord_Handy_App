package app.modstempel.mobile;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/** Pure boundary/session projection tests using the real org.json library, without Android runtime. */
public final class NativeBackendTest {
    private static int checks;
    private static final String ORIGIN = "https://backend.example.invalid";
    private static final String GUILD = "123456789012345678";
    private static final String ROLE = "234567890123456789";
    private interface Attempt { void run() throws Exception; }
    private static void check(boolean condition, String label) { checks++; if (!condition) throw new AssertionError(label); }
    private static void rejects(Attempt attempt, String label) throws Exception {
        try { attempt.run(); throw new AssertionError(label + ": accepted unsafe input"); }
        catch (IllegalArgumentException expected) { check(true, label); }
    }
    private static JSONObject obj(Object... values) { return BackendProtocol.object(values); }

    public static void main(String[] args) throws Exception {
        check(ORIGIN.equals(BackendProtocol.canonicalOrigin("  HTTPS://BACKEND.EXAMPLE.INVALID:443/  ")), "Canonical HTTPS origin");
        for (String input : new String[]{null, "", "http://backend.example.invalid", ORIGIN + "/api", ORIGIN + "/%2e", ORIGIN + "/?", ORIGIN + "#",
            "https://user:password@backend.example.invalid", ORIGIN + ":444", "javascript:alert(1)", "file:///private", "//backend.example.invalid", ORIGIN + "\\other", "https://backend.example.invalid.", "https://backend..example.invalid"})
            rejects(() -> BackendProtocol.canonicalOrigin(input), "Invalid backend address");
        Set<String> verifiers = new HashSet<>();
        for (int index = 0; index < 20; index++) {
            String verifier = BackendProtocol.verifier();
            check(verifier.matches("[A-Za-z0-9_-]{43}"), "32 random bytes in Base64url");
            check(BackendProtocol.challenge(verifier).matches("[0-9a-f]{64}"), "SHA256 challenge format");
            check(verifiers.add(verifier), "Independent fresh verifier");
        }
        String verifier = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";
        String loginId = "login_1234567890abcdefghijklmnopqrstuvwxyz";
        check((ORIGIN + "/oauth/start/" + loginId).equals(BackendProtocol.authorizeUrl(ORIGIN, loginId, "/oauth/start/" + loginId)), "Only exact backend login path");
        for (String path : new String[]{"https://discord.com/oauth2/authorize", "//attacker.invalid", "/oauth/start/" + loginId + "?verifier=secret", "/oauth/start/" + loginId + "/", "/oauth/start/../other", "/other"})
            rejects(() -> BackendProtocol.authorizeUrl(ORIGIN, loginId, path), "Login URL cannot leave origin or approved path");
        long now = 1800000000000L;
        JSONObject started = obj("loginId", loginId, "authorizePath", "/oauth/start/" + loginId, "displayCode", "ABCD-EFGH", "expiresAt", now + 600000L, "intervalMs", 3000);
        JSONObject login = BackendProtocol.login(started, verifier, ORIGIN, now);
        check(verifier.equals(login.getString("verifier")), "Private native login retains verifier");
        rejects(() -> BackendProtocol.login(new JSONObject(started.toString()).put("expiresAt", now - 1), verifier, ORIGIN, now), "Expired login rejected");
        rejects(() -> BackendProtocol.login(new JSONObject(started.toString()).put("expiresAt", now + 86400000L), verifier, ORIGIN, now), "Unexpectedly long login rejected");
        rejects(() -> BackendProtocol.login(new JSONObject(started.toString()).put("intervalMs", 0), verifier, ORIGIN, now), "Busy-poll interval rejected");
        rejects(() -> BackendProtocol.login(new JSONObject(started.toString()).put("displayCode", "<script>"), verifier, ORIGIN, now), "Device-code markup rejected");
        rejects(() -> BackendProtocol.token("valid_but_short"), "Token length boundary");
        rejects(() -> BackendProtocol.token("test_session_abcdefghijklmnopqrstuvwxyz\r\nInjected:yes"), "Token header injection rejected");

        JSONObject ids = obj("guildId", GUILD, "roleId", ROLE, "operationId", "operation_1234567890", "acknowledgeUncertain", false);
        String[][] routes = {{"guilds", "GET", "/v2/guilds"}, {"guild_setup", "GET", "/v2/guilds/" + GUILD + "/setup"},
            {"moderator_role", "PUT", "/v2/guilds/" + GUILD + "/moderator-role"}, {"bot_install", "GET", "/v2/guilds/" + GUILD + "/install"},
            {"scheduled_events", "GET", "/v2/guilds/" + GUILD + "/events"}, {"operation_status", "GET", "/v2/operations/operation_1234567890"},
            {"operation_retry", "POST", "/v2/operations/operation_1234567890/retry"}, {"poll_results", "GET", "/v2/operations/operation_1234567890/poll"}};
        for (String[] expected : routes) {
            BackendProtocol.Route route = BackendProtocol.route(expected[0], ids);
            check(expected[1].equals(route.method) && expected[2].equals(route.path), "Fixed route " + expected[0]);
            check((ORIGIN + expected[2]).equals(BackendProtocol.apiUrl(ORIGIN, route.method, route.path)), "URL stays on configured origin");
        }
        rejects(() -> BackendProtocol.route("send", ids), "Legacy send has no backend route");
        rejects(() -> BackendProtocol.route("moderator_role", obj("guildId", GUILD, "roleId", GUILD)), "Everyone cannot become moderator role");
        rejects(() -> BackendProtocol.route("operation_retry", obj("operationId", "operation_1234567890", "acknowledgeUncertain", "true")), "Uncertain acknowledgment must be boolean");
        rejects(() -> BackendProtocol.route("guild_setup", obj("guildId", "123456789012345678/../../auth")), "ID path traversal blocked");
        for (String path : new String[]{"https://attacker.invalid", "//attacker.invalid/v2/guilds", "/v2/guilds?x=1", "/v2/../health", "/v2/auth/logout", "/api/webhooks/123/fake", "/v2/operations/short"})
            rejects(() -> BackendProtocol.apiUrl(ORIGIN, "GET", path), "Only fixed path/method pairs");
        rejects(() -> BackendProtocol.apiUrl(ORIGIN, "DELETE", "/v2/guilds"), "No arbitrary method");

        String install = "https://discord.com/oauth2/authorize?client_id=" + ROLE + "&scope=bot%20applications.commands&permissions=3072&guild_id=" + GUILD + "&disable_guild_select=true&integration_type=0";
        check(install.equals(BackendProtocol.installUrl(install, GUILD)), "Expected bot authorization URL");
        for (String url : new String[]{install.replace("discord.com", "discord.com.attacker.invalid"), install.replace("scope=bot%20applications.commands", "scope=identify"), install + "&redirect_uri=https%3A%2F%2Fattacker.invalid", install + "#token", install + "&client_id=" + ROLE, install.replace("guild_id=" + GUILD, "guild_id=" + ROLE)})
            rejects(() -> BackendProtocol.installUrl(url, GUILD), "Unsafe bot installation URL");

        String token = "test_session_abcdefghijklmnopqrstuvwxyz0123456789";
        JSONObject user = obj("id", GUILD, "username", "moderator", "displayName", "Moderator", "access_token", "should-not-return");
        JSONObject secrets = obj("session", obj("token", token, "user", user, "expiresAt", now + 86400000L), "login", login);
        BackendVault.Snapshot snapshot = new BackendVault.Snapshot(ORIGIN, "generation_1234567890", secrets);
        JSONObject status = BackendVault.publicStatus(snapshot, now);
        String rendered = status.toString();
        check(status.getBoolean("authenticated") && status.getBoolean("configured"), "Native public status retains real session");
        check(status.getJSONObject("pendingLogin").getLong("intervalMs") == 3000, "Public pending-login resume metadata");
        check(!rendered.contains(token) && !rendered.contains(verifier) && !rendered.contains("access_token") && !rendered.contains("loginId"), "Status never exposes token/verifier or private fields");
        check(!BackendVault.publicStatus(snapshot, now + 86400001L).getBoolean("authenticated"), "Expired session is not authenticated");
        check(!BackendVault.publicStatus(new BackendVault.Snapshot("", "", new JSONObject()), now).getBoolean("configured"), "No simulated backend configuration");
        JSONObject response = obj("ok", true, "sessionToken", token, "nested", obj("verifier", verifier, "BOT_TOKEN", "secret", "note", token + " " + verifier),
            "message", "Error https://example.invalid/private?secret=x <b>markup</b>");
        JSONObject safe = BackendProtocol.publicResponse(response, token, verifier);
        check(!safe.toString().contains(token) && !safe.toString().contains(verifier) && !safe.toString().contains("BOT_TOKEN"), "Nested secrets redacted");
        check(!safe.getString("message").contains("https://") && !safe.getString("message").contains("<b>"), "Error URLs and markup masked");
        check("not_found".equals(BackendProtocol.serverFailure(404, obj("ok", false, "kind", "not_found", "message", "Unbekannter Auftrag"), false).getString("kind")), "Unknown operation survives as not_found for safe same-ID recovery");
        check("auth".equals(BackendProtocol.serverFailure(401, null, false).getString("kind")), "Missing session status");
        check("auth".equals(BackendProtocol.serverFailure(401, obj("kind", "network"), false).getString("kind")), "Actual 401 remains an explicit auth rejection");
        check(!"not_found".equals(BackendProtocol.serverFailure(503, obj("kind", "not_found"), false).getString("kind")), "Same-ID recovery requires an actual HTTP 404");
        check("uncertain".equals(BackendProtocol.serverFailure(503, null, true).getString("kind")), "Ambiguous mutation is never success");
        check("network".equals(BackendProtocol.serverFailure(503, null, false).getString("kind")), "Read failure is retryable network error");
        check(BackendProtocol.serverFailure(429, obj("kind", "rate_limited", "retryAfterMs", 250), false).getLong("retryAfterMs") == 250, "Fractional retry preserved in milliseconds");
        System.out.println("Native backend/auth contract: " + checks + " assertions passed. No network requests.");
    }
}
