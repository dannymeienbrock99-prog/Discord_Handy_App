package app.modstempel.mobile;

import org.json.JSONArray;
import org.json.JSONObject;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;

/** Reflects the actual MainActivity v2 operation and saved-image guards with real org.json. */
public final class NativeSendContractTest {
    private static int checks;
    private static Method guard;
    private static final String ACTOR = "123456789012345678";
    private static final String GUILD = "234567890123456789";
    private static final String CHANNEL = "345678901234567890";
    private static final String IMAGE_REF = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.png";

    private static void check(boolean condition, String label) {
        checks++;
        if (!condition) throw new AssertionError(label);
    }

    private static JSONObject post() throws Exception {
        return new JSONObject().put("id", "operation_1234567890").put("type", "post")
            .put("actorId", ACTOR).put("guildId", GUILD).put("channelId", CHANNEL)
            .put("category", "general").put("createdAt", 1800000000000L)
            .put("data", new JSONObject().put("title", "Test").put("text", "Grüße"));
    }

    private static JSONObject metadata() throws Exception {
        return new JSONObject().put("ref", IMAGE_REF).put("name", "Modstempel-Bild.png")
            .put("mime", "image/png").put("size", 24).put("width", 1).put("height", 1);
    }

    private static void accepts(JSONObject payload, Object imageRef, String label) throws Exception {
        String before = payload.toString();
        JSONObject prepared = (JSONObject)guard.invoke(null, payload, imageRef, ACTOR);
        check(prepared != payload && prepared.similar(payload), label + ": copied complete domain operation");
        check(before.equals(payload.toString()), label + ": source remains unchanged");
    }

    private static void rejects(JSONObject payload, Object imageRef, String actor, String label) throws Exception {
        String before = payload == null ? null : payload.toString();
        try {
            guard.invoke(null, payload, imageRef, actor);
            throw new AssertionError(label + ": invalid operation accepted");
        } catch (InvocationTargetException expected) {
            check(expected.getCause() instanceof IllegalArgumentException, label + ": validation failure");
            check(expected.getCause().getMessage() != null, label + ": useful message");
        }
        check(payload == null || before.equals(payload.toString()), label + ": source remains unchanged");
    }

    public static void main(String[] args) throws Exception {
        Class<?> activity = Class.forName("app.modstempel.mobile.MainActivity");
        guard = activity.getDeclaredMethod("validateOperationPayload", JSONObject.class, Object.class, String.class);
        guard.setAccessible(true);
        check(JSONObject.class.getProtectionDomain().getCodeSource().getLocation().toString().contains("json-20240303.jar"), "Actual JSON implementation");
        accepts(post(), null, "Ordinary post");
        accepts(post(), JSONObject.NULL, "Optional null imageRef");
        accepts(post().put("image", metadata()), IMAGE_REF, "Original-image post");
        JSONObject withPoll = post().put("category", "poll").put("image", metadata());
        withPoll.getJSONObject("data").put("poll", new JSONObject().put("question", "Wer ist dabei?")
            .put("answers", new JSONArray().put("Ja").put("Nein")).put("durationHours", 24));
        accepts(withPoll, IMAGE_REF, "Image and poll in one domain operation; backend splits Discord messages");
        JSONObject stamp = post().put("type", "stamp").put("category", "modstempel")
            .put("data", new JSONObject().put("action", "start").put("at", 1800000000000L).put("sessionId", "session_1234567890")
                .put("name", "Moderator").put("team", "A").put("note", "").put("activeMs", 0).put("pauseMs", 0).put("totalMs", 0).put("startedAt", 1800000000000L));
        accepts(stamp, null, "Modstempel operation");
        JSONObject event = post().put("type", "scheduled_event").put("data", new JSONObject().put("title", "Event")
            .put("description", "").put("startsAt", 1900000000000L).put("endsAt", 1900003600000L).put("location", "Discord"));
        event.remove("channelId"); event.remove("category");
        accepts(event, null, "External scheduled event without channel post");

        rejects(null, null, ACTOR, "Missing operation");
        rejects(post(), null, "456789012345678901", "Account change");
        rejects(post().put("actorId", 123456789012345678L), null, ACTOR, "Snowflake must remain string");
        for (String id : new String[]{"", "../operation_1234567890", "short", "operation_1234567890?x=1", "https://example.invalid"}) {
            rejects(post().put("id", id), null, ACTOR, "Unsafe operation ID");
        }
        rejects(post().put("type", "webhook"), null, ACTOR, "No legacy transport type");
        rejects(post().put("url", "https://example.invalid"), null, ACTOR, "No arbitrary URL field");
        rejects(post().put("payload", new JSONObject()), null, ACTOR, "No arbitrary Discord payload");
        rejects(post().put("data", new JSONObject().put("embeds", new JSONArray())), null, ACTOR, "No direct Discord data");
        rejects(post().put("createdAt", "1800000000000"), null, ACTOR, "Dates must be epoch-millisecond numbers");
        rejects(post().put("createdAt", -1), null, ACTOR, "Invalid creation date");
        rejects(post().put("channelId", GUILD + "/other"), null, ACTOR, "Path injection blocked");
        rejects(post().put("category", "unknown"), null, ACTOR, "Unknown category");
        rejects(post(), IMAGE_REF, ACTOR, "ImageRef without metadata");
        rejects(post().put("image", metadata()), null, ACTOR, "Requested image must not be dropped");
        rejects(post().put("image", metadata()), "", ACTOR, "Empty imageRef");
        rejects(post().put("image", metadata()), 12, ACTOR, "Non-string imageRef");
        rejects(post().put("image", metadata().put("ref", IMAGE_REF.replace(".png", ".jpg"))), IMAGE_REF, ACTOR, "Wrong referenced file");
        rejects(post().put("image", metadata().put("mime", "text/html")), IMAGE_REF, ACTOR, "Unsafe MIME");
        rejects(post().put("image", metadata().put("size", 8388609)), IMAGE_REF, ACTOR, "Upload limit");
        rejects(post().put("image", metadata().put("width", 8192).put("height", 8192)), IMAGE_REF, ACTOR, "Pixel limit");
        rejects(post().put("image", metadata().put("size", "24")), IMAGE_REF, ACTOR, "Numeric metadata type");
        rejects(stamp.put("image", metadata()), IMAGE_REF, ACTOR, "No stamp attachment");
        rejects(event.put("image", metadata()), IMAGE_REF, ACTOR, "No scheduled-event attachment");

        for (String action : new String[]{"send", "check", "read_poll", "storeWebhook"}) {
            check(BackendProtocol.legacyAction(action), "Old action explicitly disabled");
            check(!BackendProtocol.legacyDisabled().getBoolean("ok"), "Legacy returns explicit failure");
        }
        check(!BackendProtocol.legacyAction("operation_send"), "New operation action available");
        for (String type : new String[]{"app.modstempel.mobile.MainActivity$WebhookVault", "app.modstempel.mobile.MainActivity$Endpoint"}) {
            try { Class.forName(type); throw new AssertionError("Legacy transport class is still compiled"); }
            catch (ClassNotFoundException removed) { check(true, "Old webhook code removed"); }
        }

        Method refs = activity.getDeclaredMethod("containsImageReference", Object.class, String.class, int.class);
        refs.setAccessible(true);
        JSONObject legacy = new JSONObject().put("events", new JSONArray().put(new JSONObject().put("request", new JSONObject().put("image", metadata()))));
        JSONObject v2 = new JSONObject().put("legacyArchive", legacy).put("events", new JSONArray());
        check((Boolean)refs.invoke(null, legacy, IMAGE_REF, 0), "v1 request image retained");
        check((Boolean)refs.invoke(null, v2, IMAGE_REF, 0), "v2 legacyArchive image retained");
        check((Boolean)refs.invoke(null, new JSONObject().put("events", new JSONArray().put(post().put("image", metadata()))), IMAGE_REF, 0), "v2 operation image retained");
        check(!(Boolean)refs.invoke(null, v2, IMAGE_REF.replace(".png", ".jpg"), 0), "Unreferenced file distinguished");
        Method state = activity.getDeclaredMethod("requireStateForSave", JSONObject.class);
        state.setAccessible(true);
        state.invoke(null, new JSONObject().put("version", 2).put("profile", new JSONObject()).put("sessions", new JSONArray())
            .put("events", new JSONArray()).put("selection", new JSONObject()));
        check(true, "Real v2 saved schema does not require derived posts array");
        System.out.println("Native v2 send/state contract: " + checks + " assertions passed. No network requests.");
    }
}
