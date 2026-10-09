package app.modstempel.mobile;

import org.json.JSONObject;

/** Approval is an explicit current server decision, independent of an authenticated session. */
public final class NativeAccessTest {
    private static int checks;
    private interface Attempt { void run() throws Exception; }
    private static void check(boolean condition, String label) {
        checks++;
        if (!condition) throw new AssertionError(label);
    }
    private static void rejects(Attempt attempt, String label) throws Exception {
        try { attempt.run(); throw new AssertionError(label); }
        catch (IllegalArgumentException expected) { checks++; }
    }
    private static JSONObject status(String name) {
        return BackendProtocol.object("status", name, "isOwner", false, "canUseApp", "approved".equals(name),
            "version", 1, "requestedAt", 1791550000000L, "updatedAt", 1791550000000L,
            "reviewedAt", JSONObject.NULL, "reason", "");
    }
    public static void main(String[] args) throws Exception {
        for (String name : new String[]{"unregistered", "pending", "approved", "rejected", "revoked"}) {
            JSONObject result = BackendProtocol.accessStatus(status(name));
            check(name.equals(result.getString("status")), "Known status preserved");
            check(result.getBoolean("canUseApp") == "approved".equals(name), "Only approved grants access");
        }
        rejects(() -> BackendProtocol.accessStatus(null), "Missing decision must not grant access");
        rejects(() -> BackendProtocol.accessStatus(status("unknown")), "Unknown decision must not grant access");
        rejects(() -> BackendProtocol.accessStatus(status("pending").put("canUseApp", true)), "Pending with use flag rejected");
        rejects(() -> BackendProtocol.accessStatus(status("approved").put("canUseApp", false)), "Conflicting decision rejected");
        rejects(() -> BackendProtocol.accessStatus(status("pending").put("isOwner", true)), "Pending owner is inconsistent");
        rejects(() -> BackendProtocol.accessStatus(status("approved").put("isOwner", "true")), "String owner flag rejected");
        rejects(() -> BackendProtocol.accessStatus(status("approved").put("version", -1)), "Negative revision rejected");
        rejects(() -> BackendProtocol.accessStatus(status("approved").put("version", 1.5)), "Fractional revision rejected");
        rejects(() -> BackendProtocol.accessStatus(status("pending").put("updatedAt", "today")), "Invalid decision time rejected");
        JSONObject safe = BackendProtocol.accessStatus(status("approved").put("sessionToken", "private-session").put("reason", "<b>Hinweis</b>"));
        check(!safe.has("sessionToken"), "Only known approval fields leave native boundary");
        check(!safe.getString("reason").contains("<b>"), "Operator reason markup is removed");
        String privateToken = "test_session_secret_abcdefghijklmnopqrstuvwxyz0123456789";
        String privateVerifier = "test_verifier_secret_abcdefghijklmnopqrstuvwxyz0123456789";
        JSONObject reflected = BackendProtocol.object("ok", true, "access", BackendProtocol.accessStatus(status("revoked")
            .put("reason", "Hinweis: " + privateToken + " / " + privateVerifier)));
        JSONObject publicStatus = BackendProtocol.publicResponse(reflected, privateToken, privateVerifier);
        check(!publicStatus.toString().contains(privateToken), "An access reason never reflects the native session token");
        check(!publicStatus.toString().contains(privateVerifier), "An access reason never reflects the native OAuth verifier");
        check(publicStatus.getJSONObject("access").getString("reason").contains("Hinweis"), "Redaction keeps the useful operator message");
        java.lang.reflect.Method mime = MainActivity.class.getDeclaredMethod("mimeFor", String.class);
        mime.setAccessible(true);
        check("image/jpeg".equals(mime.invoke(null, "background-batto.jpeg")), "The new background has an explicit JPEG MIME type");
        check("image/jpeg".equals(mime.invoke(null, "BACKGROUND.JPG")), "JPEG MIME lookup is case insensitive");
        JSONObject blocked = BackendProtocol.serverFailure(403, BackendProtocol.object("kind", "access", "access", status("revoked"), "message", "Zugang gesperrt"), false);
        check("access".equals(blocked.getString("kind")), "Approval rejection remains distinct from expired session");
        check("revoked".equals(blocked.getJSONObject("access").getString("status")), "Revocation arrives at UI");
        JSONObject missing = BackendProtocol.serverFailure(403, BackendProtocol.object("kind", "access"), false);
        check("access".equals(missing.getString("kind")) && !missing.has("access"), "Malformed rejection never invents approval");
        check(!"access".equals(BackendProtocol.serverFailure(500, BackendProtocol.object("kind", "access", "access", status("approved")), false).getString("kind")), "Network error cannot forge an approval update");
        check("auth".equals(BackendProtocol.serverFailure(401, BackendProtocol.object("kind", "access", "access", status("approved")), false).getString("kind")), "Actual expired session remains auth error");
        check("https://host.example/portal".equals(BackendProtocol.portalUrl("HTTPS://HOST.EXAMPLE:443/")), "Portal uses canonical configured origin");
        for (String bad : new String[]{"http://host.example", "https://host.example/path", "https://user:pass@host.example", "https://host.example/?redirect=other"})
            rejects(() -> BackendProtocol.portalUrl(bad), "Portal cannot target untrusted URL shape");
        JSONObject user = BackendProtocol.object("id", "123456789012345678", "username", "test", "displayName", "Test");
        JSONObject stored = BackendProtocol.object("session", BackendProtocol.object("token", "test_session_abcdefghijklmnopqrstuvwxyz0123456789", "user", user,
            "expiresAt", 1800000000000L, "access", status("approved")));
        JSONObject offline = BackendVault.publicStatus(new BackendVault.Snapshot("https://host.example", "generation_1234567890", stored), 1791550000000L);
        check(offline.getBoolean("authenticated"), "Login may be remembered offline");
        check(!offline.has("access") && !offline.has("accessCheckedAt"), "Cached login never implies current approval");
        System.out.println("Native approval contract: " + checks + " assertions passed. No network requests.");
    }
}
