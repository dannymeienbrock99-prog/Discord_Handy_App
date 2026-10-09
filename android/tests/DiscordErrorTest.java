package app.modstempel.mobile;

import org.json.JSONArray;
import org.json.JSONObject;

/** Actual org.json parser tests, without Android UI or network requests. */
public final class DiscordErrorTest {
    private static int checks;

    private static void check(boolean value, String label) {
        checks++;
        if (!value) throw new AssertionError(label);
    }

    private static String body(long code, String text, JSONObject errors) throws Exception {
        JSONObject object = new JSONObject().put("code", code).put("message", text);
        if (errors != null) object.put("errors", errors);
        return object.toString();
    }

    private static JSONObject leaf(String code) throws Exception {
        return new JSONObject().put("_errors", new JSONArray().put(new JSONObject().put("code", code).put("message", "Private server details that are not copied")));
    }

    private static String repeated(char value, int length) {
        StringBuilder text = new StringBuilder(length);
        for (int index = 0; index < length; index++) text.append(value);
        return text.toString();
    }

    public static void main(String[] args) throws Exception {
        check(JSONObject.class.getProtectionDomain().getCodeSource().getLocation().toString().contains("json-20240303.jar"), "Uses actual pinned org.json dependency, not the Android stub");
        check(new JSONObject("{\"value\":7}").getInt("value") == 7, "Actual JSON parsing works");

        long[] codes = {50035, 50109, 40005, 50045, 50046, 50110, 50123, 50146, 400001, 520002, 520004, 220001, 200000, 200001, 240000};
        String[] words = {"Format oder ein Feld", "JSON", "Uploadgröße", "Uploadgröße", "Bilddatei", "Bilddatei", "Bilddatei", "Bildanhang", "eingeschränkt", "keine Umfragen", "Emoji", "Thread", "AutoMod", "AutoMod", "Link"};
        for (int index = 0; index < codes.length; index++) {
            String message = DiscordError.message(400, body(codes[index], "Actual server error", null));
            check(message.contains(words[index]), "Known code has the correct German explanation: " + codes[index]);
            check(message.contains("HTTP 400") && message.contains("Discord " + codes[index]), "Exact status and numeric code preserved: " + codes[index]);
            check(codes[index] == 50035 || !message.contains("Actual server error"), "Known explanation does not duplicate raw server text: " + codes[index]);
        }

        JSONObject imageErrors = new JSONObject().put("embeds", new JSONObject().put("0", new JSONObject().put("image", new JSONObject().put("url", leaf("URL_TYPE_INVALID_URL")))));
        String imageMessage = DiscordError.message(400, body(50035, "Invalid Form Body", imageErrors));
        check(imageMessage.contains("embeds[0].image.url"), "Real nested object field path retained");
        check(imageMessage.contains("URL_TYPE_INVALID_URL"), "Real nested error code retained");
        check(imageMessage.contains("Invalid Form Body"), "50035 retains actual short Discord message");
        check(!imageMessage.contains("Private server details"), "Only requested code, never raw nested server messages, copied");

        JSONObject arrayErrors = new JSONObject().put("attachments", new JSONArray().put(new JSONObject().put("filename", leaf("BASE_TYPE_REQUIRED"))));
        String arrayMessage = DiscordError.message(400, body(50035, "Invalid Form Body", arrayErrors));
        check(arrayMessage.contains("attachments[0].filename") && arrayMessage.contains("BASE_TYPE_REQUIRED"), "Array-shaped errors supported");
        String rootError = DiscordError.message(400, body(50035, "Invalid Form Body", leaf("JSON_TYPE_CONVERT")));
        check(rootError.contains("Anfrage [JSON_TYPE_CONVERT]"), "Root error path remains meaningful");
        String pollAttachment = DiscordError.message(400, body(50035, "Invalid Form Body", new JSONObject().put("poll", leaf("INVALID_POLL_ATTACHMENTS"))));
        check(pollAttachment.contains("keinen Bildanhang direkt an einer Umfrage"), "Observed poll attachment rejection gets a specific explanation");
        check(pollAttachment.contains("getrennte Nachrichten"), "Poll attachment explanation states the required separation");
        check(pollAttachment.contains("HTTP 400") && pollAttachment.contains("Discord 50035"), "Specific explanation retains actual HTTP and Discord status");
        check(pollAttachment.contains("poll [INVALID_POLL_ATTACHMENTS]") && pollAttachment.contains("Invalid Form Body"), "Specific explanation retains actual field and server evidence");
        String otherPollError = DiscordError.message(400, body(50035, "Invalid Form Body", new JSONObject().put("poll", leaf("NOT_INVALID_POLL_ATTACHMENTS"))));
        check(!otherPollError.contains("keinen Bildanhang"), "Only exact observed field code receives the specific diagnosis");

        String unknown = DiscordError.message(409, body(987654, "A new useful API rejection", imageErrors));
        check(unknown.contains("HTTP 409") && unknown.contains("Discord 987654"), "Unknown code never fabricates a known diagnosis");
        check(unknown.contains("A new useful API rejection"), "Unknown code retains short actual API message");
        check(unknown.contains("embeds[0].image.url"), "Unknown code retains field diagnostics");

        for (String response : new String[]{null, "", " ", "{invalid", "<html><body>Proxy error with private content</body></html>", repeated('x', 128 * 1024 + 1)}) {
            String message = DiscordError.message(400, response);
            check(message.contains("HTTP 400"), "Fallback keeps actual HTTP status");
            check(!message.contains("private content") && !message.contains("<html>") && !message.contains("{invalid"), "Invalid or HTML body never copied");
        }
        check(DiscordError.message(413, "").contains("zu groß"), "HTTP413 remains useful even without a Discord JSON code");
        for (int status : new int[]{401, 403, 404}) {
            String message = DiscordError.message(status, "{}");
            check(message.contains("HTTP " + status) && message.contains("Webhook"), "Connection status fallback preserved");
        }
        check(DiscordError.message(302, "").contains("umgeleitet"), "Redirect fallback preserved");

        for (Object invalidCode : new Object[]{"50035", -1, 1.25, new JSONObject(), new JSONArray(), JSONObject.NULL}) {
            String response = new JSONObject().put("code", invalidCode).put("message", "Diagnostic text").toString();
            String message = DiscordError.message(400, response);
            check(!message.contains("· Discord "), "Only numeric, nonnegative integer Discord codes accepted");
        }

        String fakeWebhookToken = repeated('Q', 68);
        String fakeBotToken = repeated('M', 25) + ".AbCdEf." + repeated('R', 32);
        String fakeOpaque = repeated('x', 50);
        String[] sensitive = {
            "https://discord.com/api/webhooks/123456789012345678/" + fakeWebhookToken,
            "discord.com/api/webhooks/123456789012345678/" + fakeWebhookToken,
            "https://example.invalid/private?q=hidden",
            "Bearer smallSecret123",
            "Authorization: Bearer smallSecret123",
            "token='smallSecret123'",
            "\"api_key\":\"smallSecret123\"",
            "password: smallSecret123",
            fakeBotToken,
            "mfa." + repeated('A', 40),
            fakeOpaque
        };
        for (String secret : sensitive) {
            String message = DiscordError.message(400, body(50035, "Invalid input: " + secret, null));
            check(!message.contains(secret) && !message.contains("smallSecret123") && !message.contains(fakeWebhookToken) && !message.contains(fakeOpaque), "Sensitive server value redacted");
        }
        String html = DiscordError.message(400, body(50035, "<script>no markup</script> &lt;img src=x&gt;\nInvalid\tinput\u202e", null));
        check(!html.contains("<script>") && !html.contains("<img") && !html.contains("&lt;"), "HTML and encoded tags suppressed");
        check(!html.contains("\n") && !html.contains("\t") && !html.contains("\u202e"), "Controls and bidirectional formatting suppressed");
        JSONObject untrustedKeys = new JSONObject().put("https://discord.com/api/webhooks/123456789012345678/" + fakeWebhookToken, leaf(fakeBotToken));
        String keyMessage = DiscordError.message(400, body(50035, "Invalid Form Body", untrustedKeys));
        check(!keyMessage.contains(fakeWebhookToken) && !keyMessage.contains(fakeBotToken) && !keyMessage.contains("https://"), "Untrusted field keys and codes cannot echo URLs or tokens");

        JSONObject manyFields = new JSONObject();
        for (int index = 0; index < 50; index++) manyFields.put(String.valueOf(index), new JSONObject().put("filename", leaf("BASE_TYPE_INVALID_FIELD_CHOICE")));
        String bounded = DiscordError.message(400, body(50035, repeated('x', 100) + " " + repeated('ü', 4000), new JSONObject().put("attachments", manyFields)));
        check(bounded.length() <= 840, "Complete persisted UI message is bounded to840characters");
        int count = bounded.split("BASE_TYPE_INVALID_FIELD_CHOICE", -1).length - 1;
        check(count <= 5, "No more than five field diagnostics returned");
        JSONObject nested = leaf("BASE_TYPE_REQUIRED");
        for (int index = 0; index < 40; index++) nested = new JSONObject().put("field", nested);
        String depthBounded = DiscordError.message(400, body(50035, "Invalid Form Body", nested));
        check(!depthBounded.contains("BASE_TYPE_REQUIRED"), "Deeply nested field traversal is bounded");
        check(depthBounded.contains("HTTP 400") && depthBounded.contains("Discord 50035"), "Deep errors keep usable top-level diagnostics");
        System.out.println("Discord error parser: " + checks + " assertions passed with real org.json20240303. No network requests.");
    }
}
