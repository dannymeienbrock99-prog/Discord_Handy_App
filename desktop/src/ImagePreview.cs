using System;
using System.IO;
using SkiaSharp;

namespace Modstempel.Desktop
{
    public sealed class PreviewData
    {
        public int Width, Height;
        public string MimeType;
        public byte[] Png;
    }
    public static class ImagePreview
    {
        // Decode only for a bounded local preview. Upload callers keep the original bytes.
        public static PreviewData Decode(byte[] bytes)
        {
            var mime = SitePolicy.ImageMime(bytes);
            using (var data = SKData.CreateCopy(bytes))
            using (var codec = SKCodec.Create(data))
            {
                if (codec == null) throw new ArgumentException("Das Bild konnte nicht gelesen werden. Bitte eine intakte JPG-, PNG- oder WebP-Datei auswählen.");
                int width = codec.Info.Width, height = codec.Info.Height;
                if (width < 1 || height < 1 || (long)width * height > SitePolicy.PixelLimit)
                    throw new ArgumentException("Das Bild darf höchstens 32 Millionen Pixel haben. Bitte eine kleinere Bilddatei auswählen.");
                var format = codec.EncodedFormat;
                if (format != SKEncodedImageFormat.Jpeg && format != SKEncodedImageFormat.Png && format != SKEncodedImageFormat.Webp)
                    throw new ArgumentException("Erlaubt sind ausschließlich JPG, PNG und WebP.");
                var info = new SKImageInfo(width, height, SKColorType.Bgra8888, SKAlphaType.Premul);
                using (var bitmap = new SKBitmap(info))
                {
                    var result = codec.GetPixels(info, bitmap.GetPixels());
                    if (result != SKCodecResult.Success) throw new ArgumentException("Die Bilddatei ist beschädigt oder unvollständig. Bitte ein anderes Bild auswählen.");
                    int orientation = (int)codec.EncodedOrigin;
                    bool swap = orientation >= 5 && orientation <= 8;
                    int orientedWidth = swap ? height : width, orientedHeight = swap ? width : height;
                    float scale = Math.Min(1f, 1000f / Math.Max(orientedWidth, orientedHeight));
                    int thumbWidth = Math.Max(1, (int)Math.Round(orientedWidth * scale)), thumbHeight = Math.Max(1, (int)Math.Round(orientedHeight * scale));
                    using (var thumb = new SKBitmap(thumbWidth, thumbHeight, SKColorType.Bgra8888, SKAlphaType.Premul))
                    using (var canvas = new SKCanvas(thumb))
                    {
                        canvas.Clear(SKColors.Transparent); canvas.Scale(scale);
                        // EXIF orientation is applied to the preview, never to the uploaded file.
                        switch (orientation)
                        {
                            case 2: canvas.Translate(width, 0); canvas.Scale(-1, 1); break;
                            case 3: canvas.Translate(width, height); canvas.RotateDegrees(180); break;
                            case 4: canvas.Translate(0, height); canvas.Scale(1, -1); break;
                            case 5: canvas.RotateDegrees(90); canvas.Scale(1, -1); break;
                            case 6: canvas.Translate(height, 0); canvas.RotateDegrees(90); break;
                            case 7: canvas.Translate(height, width); canvas.RotateDegrees(90); canvas.Scale(-1, 1); break;
                            case 8: canvas.Translate(0, width); canvas.RotateDegrees(-90); break;
                        }
                        canvas.DrawBitmap(bitmap, 0, 0, new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.None)); canvas.Flush();
                        using (var image = SKImage.FromBitmap(thumb))
                        using (var png = image.Encode(SKEncodedImageFormat.Png, 100))
                            return new PreviewData { Width = orientedWidth, Height = orientedHeight, MimeType = mime, Png = png.ToArray() };
                    }
                }
            }
        }
    }
}
