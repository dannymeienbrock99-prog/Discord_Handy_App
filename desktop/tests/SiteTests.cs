using System;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Modstempel.Desktop;
using SkiaSharp;

internal static class SiteTests
{
    private const string Host="https://site.example";
    private static readonly string Token=new string('z',64);
    private static int count;
    private static void Check(bool value,string label) { count++;if(!value)throw new Exception("FAIL: site "+label); }
    private static void Throws(Action action,string label) { bool failed=false;try{action();}catch{failed=true;}Check(failed,label); }
    private static async Task Fails(Func<Task> action,string kind,string label)
    { try{await action();}catch(ApiException error){Check(error.Kind==kind,label+" kind "+error.Kind);return;}throw new Exception("FAIL: site "+label+" did not fail"); }
    private static SiteContent Content() {return new SiteContent{HeroTitle="Crazy_Batto Discord App",HeroText="",About=new SiteAbout{Title="",Text="",ImageId=null,ImageAlt=""},Setup=new SiteSetup{Title="",Text="",Components=new List<SiteComponent>(),Images=new List<SiteGalleryItem>()},Apps=new List<SiteApp>(),SocialLinks=new List<SiteLink>()};}
    private static SiteQuota Quota() {return new SiteQuota{UsedBytes=0,MaxBytes=104857600,MaxImageBytes=SitePolicy.ImageLimit,MaxImages=100};}
    private static SiteReply Snapshot(long version=1,SiteContent draft=null) {return new SiteReply{Ok=true,Version=version,PublishedVersion=1,PublishedAt=null,UpdatedAt=null,Draft=draft??Content(),Published=Content(),Images=new List<SiteImage>(),Quota=Quota()};}
    private static SiteImage Meta(byte[] bytes,string mime="image/png") {return new SiteImage{Id=SitePolicy.ImageId(bytes),MimeType=mime,Url="/v2/admin/site/images/"+SitePolicy.ImageId(bytes),Filename="test.png",Width=13,Height=7,Size=bytes.Length,BuiltIn=false};}
    private static HttpResponseMessage JsonResponse<T>(T value,HttpStatusCode status=HttpStatusCode.OK){return new HttpResponseMessage(status){Content=new ByteArrayContent(Json.Encode(value))};}
    private static HttpResponseMessage Binary(byte[] bytes,string mime="image/png"){var response=new HttpResponseMessage(HttpStatusCode.OK){Content=new ByteArrayContent(bytes)};response.Content.Headers.ContentType=new System.Net.Http.Headers.MediaTypeHeaderValue(mime);return response;}
    internal static async Task<int> Run()
    {
        var empty=Content();var parsed=SitePolicy.Normalize(empty,new SiteImage[0]);Check(parsed.About.Text==""&&parsed.Setup.Images.Count==0&&parsed.Apps.Count==0,"empty profile, setup and app placeholders accepted");
        Check(SitePolicy.Link(" https://EXAMPLE.com ")=="https://example.com/","HTTPS URL normalized like server");
        Check(SitePolicy.Link("/portal")=="/portal"&&SitePolicy.Link("")==null,"optional link and portal link");
        foreach(var bad in new[]{"javascript:alert(1)","http://example.com/","https://u:p@example.com/","//example.com/","/portal?q=1","https://example.com:8443/","https://example.com/\n"+"x","https://example.com\\x"})Throws(()=>SitePolicy.Link(bad),"unsafe/unbound URL rejected");
        var c=Content();c.HeroTitle="";Throws(()=>SitePolicy.Normalize(c,new SiteImage[0]),"brand heading remains required");
        c=Content();c.About.Text=new string('x',5001);Throws(()=>SitePolicy.Normalize(c,new SiteImage[0]),"about text limit");
        c=Content();c.Setup.Components.Add(new SiteComponent{Label="GPU",Value=""});Throws(()=>SitePolicy.Normalize(c,new SiteImage[0]),"incomplete component cannot silently disappear");
        c=Content();c.Setup.Images.Add(new SiteGalleryItem{ImageId="img_"+new string('a',64),Alt="",Caption=""});Throws(()=>SitePolicy.Normalize(c,new SiteImage[0]),"unknown gallery assignment rejected");
        c=Content();c.Apps.Add(new SiteApp{Id="app-1",Name="App",Description="",ImageAlt="",ButtonLabel=""});c.Apps.Add(c.Apps[0]);Throws(()=>SitePolicy.Normalize(c,new SiteImage[0]),"duplicate app IDs rejected");
        c=Content();c.About.Text=new string('界',5000);c.Setup.Text=new string('界',5000);for(int i=0;i<8;i++)c.Apps.Add(new SiteApp{Id="app-"+i,Name="App",Description=new string('界',3000),ImageAlt="",ButtonLabel=""});Throws(()=>SitePolicy.Normalize(c,new SiteImage[0]),"combined UTF8 body capped before network");
        var state=new SiteEditState();var first=Snapshot();state.Load(first);state.Changed();var remote=Snapshot(2);remote.Draft.HeroText="other PC";state.Observe(remote);
        Check(ReferenceEquals(state.Saved,first)&&state.Dirty&&state.NeedsRefresh&&state.Observed.Version==2,"conflict preserves edited base and records remote separately");
        Throws(()=>state.Load(remote),"dirty draft cannot be overwritten without confirmation");
        state.Load(remote,true);Check(!state.Dirty&&!state.NeedsRefresh&&state.Saved.Version==2,"explicit reload clears stale state");
        state.Changed();Throws(()=>state.PublishedReply(Snapshot(3),2),"unsaved local draft cannot be published");state.Clear();Check(state.Saved==null&&state.Observed==null&&!state.Dirty&&!state.NeedsRefresh,"logout clears all owner website state");
        var incomplete=Snapshot();incomplete.Draft.About.Text=null;Throws(()=>SitePolicy.ValidateSnapshot(incomplete),"missing response text cannot silently become empty content");
        state.Load(Snapshot());state.Changed();var unexpectedPublish=Snapshot(2);unexpectedPublish.PublishedVersion=2;unexpectedPublish.PublishedAt=Policy.Now;Throws(()=>state.SavedReply(unexpectedPublish,1,Content()),"save cannot silently acknowledge changed public version");Check(state.Dirty&&state.Saved.Version==1,"unexpected publication preserves local edit state");
        await ApiTests();await PreviewTests();Console.WriteLine("PASS: "+count+" website/editor/image assertions.");return count;
    }
    private static async Task ApiTests()
    {
        var stub=new Stub(async request=>{Check(request.RequestUri.AbsoluteUri==Host+"/v2/admin/site"&&request.Method==HttpMethod.Post,"save fixed same-origin endpoint");Check(request.Headers.Authorization.Parameter==Token,"save bearer scoped to configured origin");var body=Json.Decode<SiteSaveRequest>(await request.Content.ReadAsByteArrayAsync());Check(body.ExpectedVersion==4&&body.Content.HeroText=="new text","save exact requested version and trimmed draft");return JsonResponse(Snapshot(5,body.Content));});
        using(var api=new ApiClient(Host,Token,stub)){var content=Content();content.HeroText="  new text  ";var result=await api.SaveSite(4,content,new SiteImage[0],CancellationToken.None);Check(result.Version==5,"save accepts confirmed expected revision");}Check(stub.Calls==1,"save sent once");
        stub=new Stub(request=>Task.FromResult(JsonResponse(Snapshot(99))));using(var api=new ApiClient(Host,Token,stub))await Fails(async()=>await api.SaveSite(1,Content(),new SiteImage[0],CancellationToken.None),"uncertain","unexpected save revision cannot report success");
        stub=new Stub(request=>Task.FromResult(JsonResponse(Snapshot(2))));using(var api=new ApiClient(Host,Token,stub)){var content=Content();content.HeroText="wanted";await Fails(async()=>await api.SaveSite(1,content,new SiteImage[0],CancellationToken.None),"uncertain","wrong acknowledged content cannot report success");}
        stub=new Stub(request=>Task.FromResult(JsonResponse(new ApiReply{Ok=false,Kind="conflict",Message="Changed"},HttpStatusCode.Conflict)));using(var api=new ApiClient(Host,Token,stub))await Fails(async()=>await api.SaveSite(1,Content(),new SiteImage[0],CancellationToken.None),"conflict","409 remains explicit conflict");Check(stub.Calls==1,"conflict does not overwrite or retry");
        stub=new Stub(async request=>{Check(request.RequestUri.AbsolutePath=="/v2/admin/site/publish","publish endpoint");var text=System.Text.Encoding.UTF8.GetString(await request.Content.ReadAsByteArrayAsync());Check(text=="{\"expectedVersion\":4}","publish sends only saved version, no unsaved content");var result=Snapshot(5);result.PublishedVersion=5;result.PublishedAt=Policy.Now;result.UpdatedAt=result.PublishedAt;return JsonResponse(result);});using(var api=new ApiClient(Host,Token,stub))await api.PublishSite(4,Content(),CancellationToken.None);Check(stub.Calls==1,"publish once");
        stub=new Stub(request=>Task.FromResult(JsonResponse(new ApiReply{Ok=true})));using(var api=new ApiClient(Host,Token,stub))await Fails(async()=>await api.Site(CancellationToken.None),"network","ok-only response is not a usable website snapshot");
        stub=new Stub(request=>{throw new HttpRequestException("offline");});using(var api=new ApiClient(Host,Token,stub))await Fails(async()=>await api.PublishSite(1,Content(),CancellationToken.None),"uncertain","lost publish ack uncertain");Check(stub.Calls==1,"lost publish ack never repeats");
        foreach(var status in new[]{HttpStatusCode.Unauthorized,HttpStatusCode.Forbidden}){stub=new Stub(request=>Task.FromResult(JsonResponse(new ApiReply{Ok=false,Kind=status==HttpStatusCode.Unauthorized?"auth":"forbidden",Message="No"},status)));using(var api=new ApiClient(Host,Token,stub))await Fails(async()=>await api.Site(CancellationToken.None),status==HttpStatusCode.Unauthorized?"auth":"forbidden","owner denial stays visible");}
        var bytes=Encode(SKEncodedImageFormat.Png);var image=Meta(bytes);
        stub=new Stub(async request=>{Check(request.RequestUri.AbsolutePath=="/v2/admin/site/images"&&request.Headers.Authorization.Parameter==Token,"image upload same-origin owner endpoint");var sent=Json.Decode<SiteUploadRequest>(await request.Content.ReadAsByteArrayAsync());Check(Convert.FromBase64String(sent.DataBase64).SequenceEqual(bytes),"original uploaded bytes unchanged");Check(sent.MimeType=="image/png"&&sent.Filename=="test.png","upload format derives from bytes and only basename");return JsonResponse(new SiteImagesReply{Ok=true,Image=image,Images=new List<SiteImage>{image},Quota=Quota()});});using(var api=new ApiClient(Host,Token,stub))await api.UploadSiteImage(bytes,"test.png",CancellationToken.None);
        var wrong=Meta(bytes);wrong.Id="img_"+new string('f',64);wrong.Url="/v2/admin/site/images/"+wrong.Id;stub=new Stub(request=>Task.FromResult(JsonResponse(new SiteImagesReply{Ok=true,Image=wrong,Images=new List<SiteImage>{wrong},Quota=Quota()})));using(var api=new ApiClient(Host,Token,stub))await Fails(async()=>await api.UploadSiteImage(bytes,"test.png",CancellationToken.None),"uncertain","upload ack digest must match exact original");
        stub=new Stub(request=>Task.FromResult(Binary(bytes)));using(var api=new ApiClient(Host,null,stub)){await Fails(async()=>await api.Site(CancellationToken.None),"auth","no anonymous site admin GET");await Fails(async()=>await api.SiteImageBytes(image,CancellationToken.None),"auth","no anonymous draft image GET");}Check(stub.Calls==0,"missing login never reaches website endpoints");
        stub=new Stub(request=>{Check(request.RequestUri.GetLeftPart(UriPartial.Authority)==Host&&request.Headers.Authorization.Parameter==Token,"image preview bearer never leaves server");Check(request.RequestUri.AbsolutePath=="/v2/admin/site/images/"+image.Id,"preview ignores arbitrary metadata URL");return Task.FromResult(Binary(bytes));});image.Url="https://outside.example/test.png";using(var api=new ApiClient(Host,Token,stub)){var actual=await api.SiteImageBytes(image,CancellationToken.None);Check(actual.SequenceEqual(bytes),"authenticated bytes verified before preview");}image.Url="/v2/admin/site/images/"+image.Id;
        var larger=new byte[3*1024*1024];Array.Copy(bytes,larger,bytes.Length);var largerMeta=Meta(larger);stub=new Stub(request=>Task.FromResult(Binary(larger)));using(var api=new ApiClient(Host,Token,stub)){var actual=await api.SiteImageBytes(largerMeta,CancellationToken.None);Check(actual.Length==larger.Length,"image transport permits more than JSON 2MiB cap up to image limit");}
        stub=new Stub(request=>Task.FromResult(Binary(new byte[SitePolicy.ImageLimit+1])));using(var api=new ApiClient(Host,Token,stub))await Fails(async()=>await api.SiteImageBytes(image,CancellationToken.None),"network","oversized image response blocked");
        stub=new Stub(request=>Task.FromResult(Binary(bytes,"text/html")));using(var api=new ApiClient(Host,Token,stub))await Fails(async()=>await api.SiteImageBytes(image,CancellationToken.None),"network","HTML cannot be treated as draft image");
        stub=new Stub(request=>Task.FromResult(new HttpResponseMessage(HttpStatusCode.Redirect){Headers={Location=new Uri("https://outside.example")},Content=new StringContent("")}));using(var api=new ApiClient(Host,Token,stub))await Fails(async()=>await api.SiteImageBytes(image,CancellationToken.None),"network","image redirect rejected");Check(stub.Calls==1,"image redirect never follows bearer");
        stub=new Stub(request=>Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK){Content=new StreamContent(new StalledBody())}));using(var api=new ApiClient(Host,Token,stub,TimeSpan.FromMilliseconds(60)))await Fails(async()=>await api.SiteImageBytes(image,CancellationToken.None),"network","image deadline includes body stream");
        stub=new Stub(request=>Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK){Content=new StreamContent(new StalledBody())}));using(var api=new ApiClient(Host,Token,stub,TimeSpan.FromMilliseconds(60)))await Fails(async()=>await api.SaveSite(1,Content(),new SiteImage[0],CancellationToken.None),"uncertain","save body deadline keeps ambiguous state");Check(stub.Calls==1,"save timeout sends once");
        stub=new Stub(request=>Task.FromResult(JsonResponse(new SiteImagesReply{Ok=true,Images=new List<SiteImage>{image},Quota=Quota()})));using(var api=new ApiClient(Host,Token,stub))await Fails(async()=>await api.DeleteSiteImage(image.Id,CancellationToken.None),"uncertain","delete cannot report success while image remains");
        var copied=Json.Decode<SiteImage>(Json.Encode(image));copied.Url="https://outside.example/";Throws(()=>SitePolicy.ValidateImages(new List<SiteImage>{copied},Quota()),"untrusted external metadata URL rejected in snapshots");
        Throws(()=>SitePolicy.Upload(new byte[SitePolicy.ImageLimit+1],"image.png"),"oversized file rejected before upload serialization");Throws(()=>SitePolicy.ImagePath("../secrets"),"image id cannot traverse endpoints");
    }
    private static byte[] Encode(SKEncodedImageFormat format,int w=13,int h=7)
    {using(var bitmap=new SKBitmap(w,h)){using(var canvas=new SKCanvas(bitmap)){canvas.Clear(new SKColor(170,32,55));}using(var image=SKImage.FromBitmap(bitmap))using(var bytes=image.Encode(format,95))return bytes.ToArray();}}
    private static Task PreviewTests()
    {
        foreach(var format in new[]{SKEncodedImageFormat.Png,SKEncodedImageFormat.Jpeg,SKEncodedImageFormat.Webp})
        {var bytes=Encode(format);var copy=bytes.ToArray();var preview=ImagePreview.Decode(bytes);Check(preview.Width==13&&preview.Height==7&&SitePolicy.ImageMime(preview.Png)=="image/png",format+" real native decoder preview");Check(bytes.SequenceEqual(copy),format+" preview leaves original untouched");}
        var scaled=ImagePreview.Decode(Encode(SKEncodedImageFormat.Png,1500,500));using(var bitmap=SKBitmap.Decode(scaled.Png))Check(bitmap.Width==1000&&bitmap.Height==333,"preview pixel output bounded");
        var jpeg=Encode(SKEncodedImageFormat.Jpeg);byte[] exif={0xff,0xe1,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0};var oriented=jpeg.Take(2).Concat(exif).Concat(jpeg.Skip(2)).ToArray();var rotated=ImagePreview.Decode(oriented);Check(rotated.Width==7&&rotated.Height==13,"JPEG EXIF orientation 6 matches portrait preview");
        Throws(()=>ImagePreview.Decode(new byte[]{137,80,78,71,13,10,26,10}),"corrupt PNG rejected without treating signature as valid picture");
        Throws(()=>ImagePreview.Decode(new byte[]{255,216,255,217}),"corrupt JPEG rejected");
        var oversized=Encode(SKEncodedImageFormat.Png);oversized[16]=0;oversized[17]=0;oversized[18]=0x1f;oversized[19]=0x41;oversized[20]=0;oversized[21]=0;oversized[22]=0x0f;oversized[23]=0xa0;Throws(()=>ImagePreview.Decode(oversized),"over-32MP header rejected before full bitmap use");
        return Task.CompletedTask;
    }
    private sealed class Stub:HttpMessageHandler
    {public int Calls;private readonly Func<HttpRequestMessage,Task<HttpResponseMessage>> reply;internal Stub(Func<HttpRequestMessage,Task<HttpResponseMessage>> callback){reply=callback;}protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken cancel){Calls++;return reply(request);}}
    private sealed class StalledBody:Stream
    {public override bool CanRead{get{return true;}}public override bool CanSeek{get{return false;}}public override bool CanWrite{get{return false;}}public override long Length{get{throw new NotSupportedException();}}public override long Position{get{throw new NotSupportedException();}set{throw new NotSupportedException();}}public override async Task<int> ReadAsync(byte[] buffer,int offset,int count,CancellationToken cancel){await Task.Delay(Timeout.Infinite,cancel);return 0;}public override int Read(byte[]b,int o,int c){throw new NotSupportedException();}public override void Flush(){}public override long Seek(long o,SeekOrigin s){throw new NotSupportedException();}public override void SetLength(long l){throw new NotSupportedException();}public override void Write(byte[]b,int o,int c){throw new NotSupportedException();}}
}
