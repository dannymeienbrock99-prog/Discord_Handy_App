package app.modstempel.mobile;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Base64;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Origin-bound native session storage. No Discord credentials, token getter or verifier reaches JS. */
final class BackendVault implements BackendClient.SessionInvalidator {
    private static final String KEY_ALIAS = "modstempel-session-v2";
    private static final int MAX_BYTES = 64 * 1024;
    private final AtomicFile file;

    BackendVault(File target) { file = new AtomicFile(target); }

    static final class Snapshot {
        final String origin;
        final String generation;
        final JSONObject secrets;
        Snapshot(String origin, String generation, JSONObject secrets) {
            this.origin = origin; this.generation = generation; this.secrets = secrets;
        }
        JSONObject session() { return secrets.optJSONObject("session"); }
        JSONObject login() { return secrets.optJSONObject("login"); }
        String token() { JSONObject session = session(); return session == null ? "" : session.optString("token", ""); }
        String verifier() { JSONObject login = login(); return login == null ? "" : login.optString("verifier", ""); }
        String actorId() { JSONObject session = session(); JSONObject user = session == null ? null : session.optJSONObject("user"); return user == null ? "" : user.optString("id", ""); }
    }

    synchronized Snapshot snapshot() throws Exception {
        JSONObject envelope;
        try (InputStream input = file.openRead()) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (bytes.size() + count > MAX_BYTES) throw new IllegalArgumentException("Backend storage limit");
                bytes.write(buffer, 0, count);
            }
            envelope = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
        } catch (FileNotFoundException empty) { return new Snapshot("", "", new JSONObject()); }
        if (envelope.optInt("version", 0) != 2) throw new IllegalArgumentException("Unknown backend storage version");
        String origin = BackendProtocol.canonicalOrigin(BackendProtocol.string(envelope, "origin"));
        String generation = BackendProtocol.string(envelope, "generation");
        if (!generation.matches("[A-Za-z0-9_-]{16,80}")) throw new IllegalArgumentException("Invalid storage generation");
        JSONObject secrets = new JSONObject();
        if (envelope.has("ciphertext")) {
            byte[] iv = Base64.getDecoder().decode(envelope.getString("iv"));
            if (iv.length != 12) throw new IllegalArgumentException("Invalid storage IV");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, iv));
            cipher.updateAAD(aad(origin, generation));
            byte[] plaintext = cipher.doFinal(Base64.getDecoder().decode(envelope.getString("ciphertext")));
            secrets = new JSONObject(new String(plaintext, StandardCharsets.UTF_8));
        }
        return new Snapshot(origin, generation, secrets);
    }

    synchronized Snapshot configure(String value) throws Exception {
        String origin = BackendProtocol.canonicalOrigin(value);
        Snapshot previous;
        try { previous = snapshot(); }
        catch (Exception unreadable) { previous = null; }
        if (previous != null && origin.equals(previous.origin)) return previous;
        Snapshot next = new Snapshot(origin, UUID.randomUUID().toString(), new JSONObject());
        write(next);
        return next;
    }

    synchronized void saveLogin(Snapshot expected, JSONObject login) throws Exception {
        Snapshot current = requireCurrent(expected);
        current.secrets.put("login", login);
        write(current);
    }

    synchronized void saveSession(Snapshot expected, String token, JSONObject user, long expiresAt) throws Exception {
        Snapshot current = requireCurrent(expected);
        BackendProtocol.token(token);
        JSONObject safeUser = BackendProtocol.user(user);
        if (expiresAt <= 0) throw new IllegalArgumentException("Session expiry missing");
        current.secrets.put("session", BackendProtocol.object("token", token, "user", safeUser, "expiresAt", expiresAt));
        current.secrets.remove("login");
        write(current);
    }

    synchronized void refreshSession(Snapshot expected, JSONObject user, long expiresAt) throws Exception {
        Snapshot current = requireCurrent(expected);
        if (!expected.token().equals(current.token()) || current.token().isEmpty()) throw new IllegalArgumentException("Session changed");
        current.secrets.put("session", BackendProtocol.object("token", current.token(), "user", BackendProtocol.user(user), "expiresAt", expiresAt));
        write(current);
    }

    synchronized void clearLogin(Snapshot expected) throws Exception {
        Snapshot current = requireCurrent(expected);
        if (!expected.verifier().equals(current.verifier())) throw new IllegalArgumentException("Login changed");
        current.secrets.remove("login");
        write(current);
    }

    @Override public synchronized void clearSession(Snapshot expected) throws Exception {
        Snapshot current = requireCurrent(expected);
        if (!expected.token().equals(current.token())) throw new IllegalArgumentException("Session changed");
        current.secrets.remove("session");
        write(current);
    }

    synchronized void clearAuthentication(Snapshot expected) throws Exception {
        Snapshot current = requireCurrent(expected);
        current.secrets.remove("session");
        current.secrets.remove("login");
        write(current);
    }

    private Snapshot requireCurrent(Snapshot expected) throws Exception {
        Snapshot current = snapshot();
        if (expected == null || !current.origin.equals(expected.origin) || !current.generation.equals(expected.generation))
            throw new IllegalArgumentException("Die Serververbindung wurde inzwischen geändert.");
        return current;
    }

    static JSONObject publicStatus(Snapshot state, long now) {
        JSONObject result = BackendProtocol.object("ok", true, "configured", !state.origin.isEmpty(), "origin", state.origin,
            "authenticated", false, "serverReady", JSONObject.NULL);
        JSONObject session = state.session();
        try {
            if (session != null && BackendProtocol.expiry(session) > now) {
                BackendProtocol.token(BackendProtocol.string(session, "token"));
                result.put("authenticated", true);
                result.put("user", BackendProtocol.user(session.getJSONObject("user")));
                result.put("expiresAt", BackendProtocol.expiry(session));
            }
            JSONObject login = state.login();
            if (login != null && BackendProtocol.expiry(login) > now) {
                result.put("pendingLogin", BackendProtocol.object("expiresAt", BackendProtocol.expiry(login),
                    "displayCode", BackendProtocol.string(login, "displayCode"),
                    "intervalMs", BackendProtocol.integer(login, "intervalMs", 1000, 60000)));
            }
        } catch (Exception invalid) { return BackendProtocol.failure("auth", "Die gespeicherte Anmeldung ist ungültig. Bitte erneut anmelden."); }
        return BackendProtocol.publicResponse(result, state.token(), state.verifier());
    }

    private static byte[] aad(String origin, String generation) {
        return ("modstempel-session-v2\u0000" + origin + "\u0000" + generation).getBytes(StandardCharsets.UTF_8);
    }

    private SecretKey key(boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return (SecretKey)store.getKey(KEY_ALIAS, null);
        if (!create) throw new IllegalArgumentException("Session key unavailable");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }

    private void write(Snapshot snapshot) throws Exception {
        JSONObject envelope = BackendProtocol.object("version", 2, "origin", snapshot.origin, "generation", snapshot.generation);
        if (snapshot.secrets.length() > 0) {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key(true));
            cipher.updateAAD(aad(snapshot.origin, snapshot.generation));
            byte[] ciphertext = cipher.doFinal(snapshot.secrets.toString().getBytes(StandardCharsets.UTF_8));
            envelope.put("iv", Base64.getEncoder().encodeToString(cipher.getIV()));
            envelope.put("ciphertext", Base64.getEncoder().encodeToString(ciphertext));
        }
        byte[] bytes = envelope.toString().getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_BYTES) throw new IllegalArgumentException("Backend storage limit");
        FileOutputStream output = null;
        try {
            output = file.startWrite();
            output.write(bytes);
            file.finishWrite(output);
        } catch (Exception failure) {
            if (output != null) file.failWrite(output);
            throw failure;
        }
    }
}
