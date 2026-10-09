using System;
using System.Collections.Generic;
using System.Runtime.Serialization;

namespace Modstempel.Desktop
{
    [DataContract] public sealed class SiteContent
    {
        [DataMember(Name = "heroTitle")] public string HeroTitle;
        [DataMember(Name = "heroText")] public string HeroText;
        [DataMember(Name = "about")] public SiteAbout About;
        [DataMember(Name = "setup")] public SiteSetup Setup;
        [DataMember(Name = "apps")] public List<SiteApp> Apps;
        [DataMember(Name = "socialLinks")] public List<SiteLink> SocialLinks;
    }
    [DataContract] public sealed class SiteAbout
    {
        [DataMember(Name = "title")] public string Title;
        [DataMember(Name = "text")] public string Text;
        [DataMember(Name = "imageId")] public string ImageId;
        [DataMember(Name = "imageAlt")] public string ImageAlt;
    }
    [DataContract] public sealed class SiteSetup
    {
        [DataMember(Name = "title")] public string Title;
        [DataMember(Name = "text")] public string Text;
        [DataMember(Name = "components")] public List<SiteComponent> Components;
        [DataMember(Name = "images")] public List<SiteGalleryItem> Images;
    }
    [DataContract] public sealed class SiteComponent
    {
        [DataMember(Name = "label")] public string Label;
        [DataMember(Name = "value")] public string Value;
    }
    [DataContract] public sealed class SiteGalleryItem
    {
        [DataMember(Name = "imageId")] public string ImageId;
        [DataMember(Name = "alt")] public string Alt;
        [DataMember(Name = "caption")] public string Caption;
    }
    [DataContract] public sealed class SiteApp
    {
        [DataMember(Name = "id")] public string Id;
        [DataMember(Name = "name")] public string Name;
        [DataMember(Name = "description")] public string Description;
        [DataMember(Name = "imageId")] public string ImageId;
        [DataMember(Name = "imageAlt")] public string ImageAlt;
        [DataMember(Name = "url")] public string Url;
        [DataMember(Name = "buttonLabel")] public string ButtonLabel;
    }
    [DataContract] public sealed class SiteLink
    {
        [DataMember(Name = "label")] public string Label;
        [DataMember(Name = "url")] public string Url;
    }
    [DataContract] public sealed class SiteImage
    {
        [DataMember(Name = "id")] public string Id;
        [DataMember(Name = "url")] public string Url;
        [DataMember(Name = "mimeType")] public string MimeType;
        [DataMember(Name = "width")] public int Width;
        [DataMember(Name = "height")] public int Height;
        [DataMember(Name = "size")] public long Size;
        [DataMember(Name = "filename")] public string Filename;
        [DataMember(Name = "builtIn")] public bool BuiltIn;
        public override string ToString() { return Policy.Display(Filename, 120) + " · " + Width + " × " + Height; }
    }
    [DataContract] public sealed class SiteQuota
    {
        [DataMember(Name = "usedBytes")] public long UsedBytes;
        [DataMember(Name = "maxBytes")] public long MaxBytes;
        [DataMember(Name = "maxImageBytes")] public long MaxImageBytes;
        [DataMember(Name = "maxImages")] public int MaxImages;
    }
    [DataContract] public sealed class SiteReply : ApiReply
    {
        [DataMember(Name = "version")] public long Version;
        [DataMember(Name = "publishedVersion")] public long PublishedVersion;
        [DataMember(Name = "publishedAt")] public long? PublishedAt;
        [DataMember(Name = "updatedAt")] public long? UpdatedAt;
        [DataMember(Name = "draft")] public SiteContent Draft;
        [DataMember(Name = "published")] public SiteContent Published;
        [DataMember(Name = "images")] public List<SiteImage> Images;
        [DataMember(Name = "quota")] public SiteQuota Quota;
    }
    [DataContract] public sealed class SiteImagesReply : ApiReply
    {
        [DataMember(Name = "image")] public SiteImage Image;
        [DataMember(Name = "images")] public List<SiteImage> Images;
        [DataMember(Name = "quota")] public SiteQuota Quota;
    }
    [DataContract] public sealed class SiteSaveRequest
    {
        [DataMember(Name = "expectedVersion")] public long ExpectedVersion;
        [DataMember(Name = "content")] public SiteContent Content;
    }
    [DataContract] public sealed class SitePublishRequest
    {
        [DataMember(Name = "expectedVersion")] public long ExpectedVersion;
    }
    [DataContract] public sealed class SiteUploadRequest
    {
        [DataMember(Name = "filename")] public string Filename;
        [DataMember(Name = "mimeType")] public string MimeType;
        [DataMember(Name = "dataBase64")] public string DataBase64;
    }
}
