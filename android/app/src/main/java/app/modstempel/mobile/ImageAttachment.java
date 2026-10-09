package app.modstempel.mobile;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;

/** One immutable, validated original image. No URI, original filename or image data is put in JSON. */
final class ImageAttachment {
    static final int MAX_BYTES = 8 * 1024 * 1024;
    static final int MAX_DIMENSION = 8192;
    static final long MAX_PIXELS = 32000000L;
    final byte[] bytes;
    final String reference;
    final String filename;
    final String mime;
    final int width;
    final int height;

    private ImageAttachment(byte[] bytes, String extension, int width, int height) {
        this.bytes = bytes;
        this.reference = referenceFor(bytes, extension);
        this.filename = "Modstempel-Bild." + extension;
        this.mime = mimeForExtension(extension);
        this.width = width;
        this.height = height;
    }

    static ImageAttachment inspect(byte[] bytes) {
        requireSize(bytes == null ? 0 : bytes.length);
        String extension = extensionForSignature(bytes);
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        requireDimensions(bounds.outWidth, bounds.outHeight);
        if (!mimeForExtension(extension).equals(bounds.outMimeType))
            throw new IllegalArgumentException("Das Bildformat konnte nicht bestätigt werden. Bitte JPG, PNG oder WebP wählen.");

        // A bounded sampled decode also rejects broken image data without allocating a full camera image.
        BitmapFactory.Options sample = new BitmapFactory.Options();
        sample.inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight);
        sample.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, sample);
        if (decoded == null) throw new IllegalArgumentException("Das Bild konnte nicht gelesen werden. Bitte eine andere Datei wählen.");
        decoded.recycle();
        return new ImageAttachment(bytes, extension, bounds.outWidth, bounds.outHeight);
    }

    static int sampleSize(int width, int height) {
        requireDimensions(width, height);
        int sample = 1;
        while (Math.max(width, height) / sample > 512) sample *= 2;
        return sample;
    }

    static void requireSize(long size) {
        if (size < 1) throw new IllegalArgumentException("Die Bilddatei ist leer.");
        if (size > MAX_BYTES) throw new IllegalArgumentException("Das Bild ist zu groß. Bitte eine Datei mit höchstens 8 MiB wählen.");
    }

    static void requireDimensions(int width, int height) {
        if (width < 1 || height < 1)
            throw new IllegalArgumentException("Das Bild konnte nicht gelesen werden. Bitte JPG, PNG oder WebP wählen.");
        if (width > MAX_DIMENSION || height > MAX_DIMENSION || (long)width * height > MAX_PIXELS)
            throw new IllegalArgumentException("Die Bildauflösung ist zu groß. Erlaubt sind höchstens 8.192 Pixel je Seite und 32 Megapixel.");
    }

    static String extensionForSignature(byte[] bytes) {
        if (bytes != null && bytes.length >= 24) {
            if ((bytes[0] & 255) == 255 && (bytes[1] & 255) == 216 && (bytes[2] & 255) == 255) return "jpg";
            if ((bytes[0] & 255) == 137 && bytes[1] == 80 && bytes[2] == 78 && bytes[3] == 71
                && bytes[4] == 13 && bytes[5] == 10 && bytes[6] == 26 && bytes[7] == 10) return "png";
            if (bytes[0] == 82 && bytes[1] == 73 && bytes[2] == 70 && bytes[3] == 70
                && bytes[8] == 87 && bytes[9] == 69 && bytes[10] == 66 && bytes[11] == 80) return "webp";
        }
        throw new IllegalArgumentException("Dieses Dateiformat wird nicht unterstützt. Bitte JPG, PNG oder WebP wählen.");
    }

    static String extensionForReference(String reference) {
        if (reference == null || !reference.matches("[0-9a-f]{64}\\.(jpg|png|webp)"))
            throw new IllegalArgumentException("Die gespeicherte Bildreferenz ist ungültig.");
        return reference.substring(65);
    }

    static String mimeForExtension(String extension) {
        if ("jpg".equals(extension)) return "image/jpeg";
        if ("png".equals(extension)) return "image/png";
        if ("webp".equals(extension)) return "image/webp";
        throw new IllegalArgumentException("Unbekanntes Bildformat.");
    }

    static String referenceFor(byte[] bytes, String extension) {
        mimeForExtension(extension);
        requireSize(bytes == null ? 0 : bytes.length);
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder hex = new StringBuilder(69);
            for (byte item : digest) hex.append(String.format(Locale.ROOT, "%02x", item & 255));
            return hex.append('.').append(extension).toString();
        } catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    static byte[] readBounded(InputStream input) throws IOException {
        if (input == null) throw new IOException("Image unavailable");
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[16384];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (count == 0) continue;
            requireSize((long)output.size() + count);
            output.write(buffer, 0, count);
        }
        requireSize(output.size());
        return output.toByteArray();
    }

    private static void requireBoundary(String boundary) {
        if (boundary == null || !boundary.matches("[A-Za-z0-9_-]{1,80}")) throw new IllegalArgumentException();
    }

    static byte[] multipartPrefix(String boundary, byte[] payload, String filename, String mime) {
        requireBoundary(boundary);
        if (payload == null || payload.length > 16 * 1024 || filename == null
            || !filename.matches("Modstempel-Bild\\.(jpg|png|webp)")) throw new IllegalArgumentException();
        if (!mimeForExtension(filename.substring("Modstempel-Bild.".length())).equals(mime)) throw new IllegalArgumentException();
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try {
            output.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"operation\"\r\n"
                + "Content-Type: application/json; charset=utf-8\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            output.write(payload);
            output.write(("\r\n--" + boundary + "\r\nContent-Disposition: form-data; name=\"image\"; filename=\""
                + filename + "\"\r\nContent-Type: " + mime + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        } catch (IOException impossible) { throw new IllegalStateException(impossible); }
        return output.toByteArray();
    }

    static byte[] multipartSuffix(String boundary) {
        requireBoundary(boundary);
        return ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8);
    }

    static void writeMultipart(OutputStream output, byte[] prefix, byte[] bytes, byte[] suffix) throws IOException {
        output.write(prefix);
        for (int offset = 0; offset < bytes.length; offset += 16384)
            output.write(bytes, offset, Math.min(16384, bytes.length - offset));
        output.write(suffix);
    }
}
