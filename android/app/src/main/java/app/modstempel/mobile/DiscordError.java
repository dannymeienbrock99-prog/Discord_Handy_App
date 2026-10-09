package app.modstempel.mobile;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Bounded, redacted diagnostics for explicit Discord rejections. Never returns the response body. */
final class DiscordError {
    private static final int MAX_MESSAGE = 840;
    private static final int MAX_BODY = 128 * 1024;

    private DiscordError() { }

    static String message(int status, String response) {
        JSONObject body = null;
        if (response != null && response.length() <= MAX_BODY) {
            try { body = new JSONObject(response); }
            catch (Exception invalidJson) { }
        }
        long code = discordCode(body);
        List<String> fields = new ArrayList<>();
        Set<String> diagnosticCodes = new LinkedHashSet<>();
        if (body != null) collect(body.opt("errors"), "", fields, diagnosticCodes, 0, new int[]{0});
        String explanation = code == 50035 && diagnosticCodes.contains("INVALID_POLL_ATTACHMENTS")
            ? "Discord erlaubt keinen Bildanhang direkt an einer Umfrage. Bild und Umfrage müssen als getrennte Nachrichten gesendet werden."
            : knownMessage(code);
        boolean known = explanation != null;
        if (explanation == null) explanation = statusMessage(status);
        StringBuilder result = new StringBuilder(explanation);
        result.append(" (HTTP ").append(status);
        if (code >= 0) result.append(" · Discord ").append(code);
        result.append(')');

        if (body != null && (!known || code == 50035)) {
            Object raw = body.opt("message");
            String detail = raw instanceof String ? redact((String)raw, 200) : "";
            if (!detail.isEmpty()) result.append(" Discord meldet: ").append(detail);
        }
        if (!fields.isEmpty()) {
            result.append(" Felder: ");
            for (int index = 0; index < fields.size(); index++) {
                if (index > 0) result.append("; ");
                result.append(fields.get(index));
            }
        }
        return limit(result.toString(), MAX_MESSAGE);
    }

    private static long discordCode(JSONObject body) {
        Object raw = body == null ? null : body.opt("code");
        if (!(raw instanceof Number)) return -1;
        double value = ((Number)raw).doubleValue();
        if (!Double.isFinite(value) || value < 0 || value > 999999999999L || value != Math.rint(value)) return -1;
        return ((Number)raw).longValue();
    }

    private static String knownMessage(long code) {
        if (code == 50035) return "Discord hat das Format oder ein Feld der Abfrage abgelehnt.";
        if (code == 50109) return "Discord konnte den übermittelten Meldungstext nicht als JSON lesen.";
        if (code == 40005 || code == 50045) return "Die Datei oder die gesamte Meldung überschreitet die erlaubte Uploadgröße. Bitte eine neue Abfrage mit einer kleineren Datei erstellen.";
        if (code == 50046 || code == 50110 || code == 50123) return "Discord hat die Bilddatei oder ihr Dateiformat abgelehnt. Bitte die Datei prüfen und gegebenenfalls als JPG oder PNG neu speichern.";
        if (code == 50146) return "Discord konnte den angegebenen Bildanhang in der Übertragung nicht finden.";
        if (code == 400001) return "Datei-Uploads sind für diesen Discord-Server eingeschränkt. Bitte die Servereinstellungen prüfen.";
        if (code == 520002) return "In diesem Discord-Kanal können keine Umfragen gesendet werden. Bitte einen geeigneten Kanal verwenden.";
        if (code == 520004) return "Discord hat ein Emoji in der Umfrage abgelehnt.";
        if (code == 220001) return "Für diesen Discord-Kanal muss ein Thread angegeben werden. Bitte die gespeicherte Verbindung prüfen.";
        if (code == 200000 || code == 200001) return "Discord hat die Meldung durch AutoMod blockiert. Bitte die Moderationsregeln des Servers prüfen.";
        if (code == 240000) return "Discord hat einen Link in der Meldung blockiert. Bitte die Meldung und die Serverregeln prüfen.";
        return null;
    }

    private static String statusMessage(int status) {
        if (status == 413) return "Das Bild oder die gesamte Meldung ist für diesen Discord-Kanal zu groß. Bitte eine neue Abfrage mit einer kleineren Datei erstellen.";
        if (status == 401 || status == 403 || status == 404)
            return "Der Webhook ist ungültig, gelöscht oder für diesen Kanal nicht verfügbar. Bitte die Verbindung prüfen.";
        if (status >= 300 && status < 400) return "Discord hat die Anfrage umgeleitet. Bitte den Webhook prüfen.";
        return "Discord hat die Anfrage abgelehnt. Der genaue Grund steht in der folgenden Rückmeldung, soweit Discord ihn mitgeteilt hat.";
    }

    private static void collect(Object node, String path, List<String> fields, Set<String> diagnosticCodes, int depth, int[] visited) {
        if (node == null || fields.size() >= 5 || depth > 9 || ++visited[0] > 100) return;
        if (node instanceof JSONObject) {
            JSONObject object = (JSONObject)node;
            JSONArray errors = object.optJSONArray("_errors");
            if (errors != null && errors.length() > 0) {
                Set<String> codes = new LinkedHashSet<>();
                for (int index = 0; index < Math.min(errors.length(), 4); index++) {
                    JSONObject error = errors.optJSONObject(index);
                    Object raw = error == null ? null : error.opt("code");
                    if (raw instanceof String) {
                        String code = (String)raw;
                        if (code.matches("[A-Z][A-Z0-9_]{1,47}") && !code.matches("[A-Z0-9]{24,}")) {
                            codes.add(code);
                            diagnosticCodes.add(code);
                        }
                    }
                }
                String label = path.isEmpty() ? "Anfrage" : limit(path, 100);
                if (codes.isEmpty()) fields.add(label);
                else {
                    StringBuilder detail = new StringBuilder(label).append(" [");
                    int count = 0;
                    for (String code : codes) {
                        if (count++ > 0) detail.append(", ");
                        detail.append(code);
                    }
                    fields.add(limit(detail.append(']').toString(), 170));
                }
            }
            Iterator<String> keys = object.keys();
            int inspected = 0;
            while (keys.hasNext() && inspected++ < 24 && fields.size() < 5) {
                String key = keys.next();
                if ("_errors".equals(key)) continue;
                String child;
                if (key.matches("[0-9]{1,5}")) child = path + "[" + key + "]";
                else {
                    String segment = key.matches("[a-z_]{1,32}") && !key.matches("[a-z]{24,}") ? key : "Feld";
                    child = path.isEmpty() ? segment : path + "." + segment;
                }
                collect(object.opt(key), child, fields, diagnosticCodes, depth + 1, visited);
            }
        } else if (node instanceof JSONArray) {
            JSONArray array = (JSONArray)node;
            for (int index = 0; index < Math.min(array.length(), 24) && fields.size() < 5; index++)
                collect(array.opt(index), path + "[" + index + "]", fields, diagnosticCodes, depth + 1, visited);
        }
    }

    static String safeText(String value, int maximum) { return redact(value == null ? "" : value, maximum); }

    private static String redact(String value, int maximum) {
        // Limit work before regex processing, then suppress links, secrets and markup.
        String text = value.length() > 4096 ? value.substring(0, 4096) : value;
        text = text.replaceAll("\\p{Cf}", "").replaceAll("\\p{Cntrl}", " ");
        text = text.replaceAll("(?i)<[^>]{0,512}>", "[HTML entfernt]");
        text = text.replaceAll("(?i)&lt;.{0,512}?&gt;", "[HTML entfernt]");
        text = text.replaceAll("(?i)(?:[a-z][a-z0-9+.-]{1,20}://|www\\.)[^\\s<>]+", "[Link ausgeblendet]");
        text = text.replaceAll("(?i)(?:discord(?:app)?\\.com/)?(?:api/(?:v[0-9]+/)?)?webhooks/[^\\s<>]+", "[Webhook ausgeblendet]");
        text = text.replaceAll("(?i)\\bauthorization[\\s\"']*[:=][\\s\"']*(?:bearer\\s+)?[^\\s\"',;<>]+", "[Zugangsdaten ausgeblendet]");
        text = text.replaceAll("(?i)\\b(?:token|secret|password|api[_ -]?key)(?:[\\s\"']*[:=][\\s\"']*|\\s+)[^\\s\"',;<>]+", "[Zugangsdaten ausgeblendet]");
        text = text.replaceAll("(?i)\\bbearer\\s+[^\\s,;<>]+", "[Zugangsdaten ausgeblendet]");
        text = text.replaceAll("(?i)\\bmfa\\.[a-z0-9_-]{20,}", "[Token ausgeblendet]");
        text = text.replaceAll("[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9_-]{15,}", "[Token ausgeblendet]");
        text = text.replaceAll("[A-Za-z0-9_-]{40,}", "[Token ausgeblendet]");
        text = text.replace('<', ' ').replace('>', ' ').replaceAll("\\s+", " ").trim();
        return limit(text, maximum);
    }

    private static String limit(String value, int maximum) {
        if (value.length() <= maximum) return value;
        int end = maximum - 1;
        if (end > 0 && Character.isHighSurrogate(value.charAt(end - 1))) end--;
        return value.substring(0, end) + "…";
    }
}
