import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** Offline JVM checks of immutable image references, multipart bytes and fixed Discord opening links. */
public final class NativeContractTest {
    private static int checks;
    private static void equal(Object expected, Object actual, String label) {
        checks++;
        if (!expected.equals(actual)) throw new AssertionError(label);
    }
    private static void rejects(Method method, Object target, Object... values) throws Exception {
        checks++;
        try { method.invoke(target, values); throw new AssertionError("Invalid native input accepted: " + method.getName()); }
        catch (InvocationTargetException expected) {
            if (!(expected.getCause() instanceof IllegalArgumentException)) throw expected;
        }
    }

    private static Method nativeMethod(Class<?> type, String name, Class<?>... parameters) throws Exception {
        Method method = type.getDeclaredMethod(name, parameters);
        method.setAccessible(true);
        return method;
    }

    private static void accepts(Method method, Object... values) throws Exception {
        checks++;
        method.invoke(null, values);
    }

    private static void imageContracts() throws Exception {
        Class<?> type = Class.forName("app.modstempel.mobile.ImageAttachment");
        Method extension = nativeMethod(type, "extensionForReference", String.class);
        Method mime = nativeMethod(type, "mimeForExtension", String.class);
        Method reference = nativeMethod(type, "referenceFor", byte[].class, String.class);
        String hash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        byte[] fixture = "abc".getBytes(StandardCharsets.UTF_8);
        for (String ext : new String[]{"jpg", "png", "webp"}) {
            equal(ext, extension.invoke(null, hash + "." + ext), "Strict local image reference");
            equal(hash + "." + ext, reference.invoke(null, fixture, ext), "Original bytes define immutable image hash");
        }
        equal("image/jpeg", mime.invoke(null, "jpg"), "JPEG MIME matches content");
        equal("image/png", mime.invoke(null, "png"), "PNG MIME matches content");
        equal("image/webp", mime.invoke(null, "webp"), "WebP MIME matches content");
        for (String invalid : new String[]{null, "", hash, hash.toUpperCase() + ".jpg", hash + ".jpeg", hash + ".gif", hash + ".png?x=1", hash + ".png#x", "../" + hash + ".jpg", "%2e%2e/" + hash + ".png", hash + ".png/extra", "https://example.invalid/" + hash + ".png", hash.substring(1) + ".png", hash + "a.png", hash + ".PNG", hash + ".png\n"})
            rejects(extension, null, invalid);
        for (String invalid : new String[]{null, "", "jpeg", "gif", "svg", "avif", "png\r\n"}) rejects(mime, null, invalid);
        rejects(reference, null, new byte[0], "png");
        rejects(reference, null, fixture, "svg");

        Method size = nativeMethod(type, "requireSize", long.class);
        accepts(size, 1L);
        accepts(size, 8L * 1024 * 1024);
        for (long invalid : new long[]{0, -1, 8L * 1024 * 1024 + 1, Long.MAX_VALUE}) rejects(size, null, invalid);
        Method dimensions = nativeMethod(type, "requireDimensions", int.class, int.class);
        accepts(dimensions, 1, 1);
        accepts(dimensions, 8000, 4000);
        accepts(dimensions, 8192, 3906);
        accepts(dimensions, 3906, 8192);
        for (int[] invalid : new int[][]{{0, 1}, {1, 0}, {-1, 100}, {8193, 1}, {1, 8193}, {8192, 3907}, {3907, 8192}, {8192, 8192}, {Integer.MAX_VALUE, Integer.MAX_VALUE}})
            rejects(dimensions, null, invalid[0], invalid[1]);
        Method sample = nativeMethod(type, "sampleSize", int.class, int.class);
        equal(1, sample.invoke(null, 512, 512), "Small bitmap needs no downsampling for validation");
        equal(2, sample.invoke(null, 513, 400), "Sampled validation remains bounded");
        equal(16, sample.invoke(null, 8192, 3906), "Largest supported image validates using small decode");

        Method signature = nativeMethod(type, "extensionForSignature", byte[].class);
        byte[] jpeg = new byte[24]; jpeg[0] = (byte)255; jpeg[1] = (byte)216; jpeg[2] = (byte)255;
        byte[] png = new byte[24]; System.arraycopy(new byte[]{(byte)137, 80, 78, 71, 13, 10, 26, 10}, 0, png, 0, 8);
        byte[] webp = new byte[24]; System.arraycopy("RIFF".getBytes(StandardCharsets.US_ASCII), 0, webp, 0, 4); System.arraycopy("WEBP".getBytes(StandardCharsets.US_ASCII), 0, webp, 8, 4);
        equal("jpg", signature.invoke(null, (Object)jpeg), "JPEG detected from bytes");
        equal("png", signature.invoke(null, (Object)png), "PNG detected from bytes");
        equal("webp", signature.invoke(null, (Object)webp), "WebP detected from bytes");
        for (byte[] invalid : new byte[][]{null, new byte[0], new byte[24], Arrays.copyOf(png, 8), "<svg xmlns='http://www.w3.org/2000/svg'></svg>".getBytes(StandardCharsets.UTF_8), "GIF89a12345678901234567890123456789".getBytes(StandardCharsets.US_ASCII)})
            rejects(signature, null, (Object)invalid);
        Method read = nativeMethod(type, "readBounded", InputStream.class);
        equal(true, Arrays.equals(fixture, (byte[])read.invoke(null, new ByteArrayInputStream(fixture))), "Imported bytes preserved exactly");
        equal(8 * 1024 * 1024, ((byte[])read.invoke(null, new ByteArrayInputStream(new byte[8 * 1024 * 1024]))).length, "8 MiB boundary accepted by actual read");
        rejects(read, null, new ByteArrayInputStream(new byte[0]));
        rejects(read, null, new ByteArrayInputStream(new byte[8 * 1024 * 1024 + 1]));

        Method prefix = nativeMethod(type, "multipartPrefix", String.class, byte[].class, String.class, String.class);
        Method suffix = nativeMethod(type, "multipartSuffix", String.class);
        Method write = nativeMethod(type, "writeMultipart", OutputStream.class, byte[].class, byte[].class, byte[].class);
        String boundary = "Modstempel_0123456789abcdef";
        byte[] payload = "{\"content\":\"Grüße\",\"allowed_mentions\":{\"parse\":[]}}".getBytes(StandardCharsets.UTF_8);
        byte[] pre = (byte[])prefix.invoke(null, boundary, payload, "Modstempel-Bild.png", "image/png");
        byte[] post = (byte[])suffix.invoke(null, boundary);
        byte[] binary = new byte[]{0, (byte)255, 13, 10, 34, (byte)128, 1};
        ByteArrayOutputStream actual = new ByteArrayOutputStream();
        write.invoke(null, actual, pre, binary, post);
        equal(pre.length + binary.length + post.length, actual.size(), "Multipart length matches fixed-length streaming");
        equal(true, Arrays.equals(binary, Arrays.copyOfRange(actual.toByteArray(), pre.length, pre.length + binary.length)), "Multipart image bytes are binary-exact");
        String expectedPrefix = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"operation\"\r\nContent-Type: application/json; charset=utf-8\r\n\r\n"
            + new String(payload, StandardCharsets.UTF_8) + "\r\n--" + boundary
            + "\r\nContent-Disposition: form-data; name=\"image\"; filename=\"Modstempel-Bild.png\"\r\nContent-Type: image/png\r\n\r\n";
        equal(expectedPrefix, new String(pre, StandardCharsets.UTF_8), "Backend multipart field names, UTF-8 JSON and headers");
        equal("\r\n--" + boundary + "--\r\n", new String(post, StandardCharsets.UTF_8), "Multipart terminates boundary correctly");
        for (String invalid : new String[]{null, "", "bad\r\nInjected: yes", "spaces not allowed"}) {
            rejects(prefix, null, invalid, payload, "Modstempel-Bild.png", "image/png");
            rejects(suffix, null, invalid);
        }
        for (String invalid : new String[]{null, "", "image.png", "Modstempel-Bild.png\r\nInjected: yes", "../Modstempel-Bild.png"})
            rejects(prefix, null, boundary, payload, invalid, "image/png");
        rejects(prefix, null, boundary, payload, "Modstempel-Bild.png", "text/html");
        rejects(prefix, null, boundary, payload, "Modstempel-Bild.jpg", "image/png");
        rejects(prefix, null, boundary, new byte[16 * 1024 + 1], "Modstempel-Bild.png", "image/png");
    }

    public static void main(String[] args) throws Exception {
        Class<?> activity = Class.forName("app.modstempel.mobile.MainActivity");
        Method openLink = nativeMethod(activity, "discordMessageUrl", String.class, String.class, String.class);
        Method openEvent = nativeMethod(activity, "discordEventUrl", String.class, String.class);
        String guild = "123456789012345678", channel = "234567890123456789", message = "987654321098765432";
        equal("https://discord.com/channels/" + guild + "/" + channel + "/" + message,
            openLink.invoke(null, guild, channel, message), "Fixed external message URL");
        equal("https://discord.com/events/" + guild + "/" + message,
            openEvent.invoke(null, guild, message), "Fixed external scheduled-event URL");
        for (String invalid : new String[]{null, "", "@me", "1234567890123456", "123456789012345678901", "../123456789012345678", "123456789012345678?x=1", " 123456789012345678", "123456789012345678\n", "12345678901234567x", "https://example.invalid"}) {
            rejects(openLink, null, invalid, channel, message);
            rejects(openLink, null, guild, invalid, message);
            rejects(openLink, null, guild, channel, invalid);
            rejects(openEvent, null, invalid, message);
            rejects(openEvent, null, guild, invalid);
        }
        imageContracts();
        System.out.println("Native image/link contract: " + checks + " assertions passed. No network requests.");
    }
}
