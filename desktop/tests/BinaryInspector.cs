using System;
using System.IO;
using System.Linq;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Security.Cryptography;
using System.Text.Json;

internal static class BinaryInspector
{
    internal static void Run(string filename,string imageFilename)
    {
        using(var input=File.OpenRead(filename)) using(var pe=new PEReader(input))
        {
            var md=pe.GetMetadataReader();var assembly=md.GetAssemblyDefinition();string target=null;
            foreach(var handle in assembly.GetCustomAttributes())
            {
                var attribute=md.GetCustomAttribute(handle);
                if(attribute.Constructor.Kind!=HandleKind.MemberReference)continue;
                var member=md.GetMemberReference((MemberReferenceHandle)attribute.Constructor);
                if(member.Parent.Kind!=HandleKind.TypeReference)continue;
                var type=md.GetTypeReference((TypeReferenceHandle)member.Parent);
                if(md.GetString(type.Name)=="TargetFrameworkAttribute") {var blob=md.GetBlobReader(attribute.Value);if(blob.ReadUInt16()==1)target=blob.ReadSerializedString();}
            }
            byte[] embedded=null;
            foreach(var handle in md.ManifestResources)
            {
                var resource=md.GetManifestResource(handle);if(md.GetString(resource.Name)!="Modstempel.Background")continue;
                var content=pe.GetSectionData(pe.PEHeaders.CorHeader.ResourcesDirectory.RelativeVirtualAddress+(int)resource.Offset).GetReader();int size=content.ReadInt32();embedded=content.ReadBytes(size);
            }
            var original=File.ReadAllBytes(imageFilename);bool imageEqual=embedded!=null&&embedded.SequenceEqual(original);
            var flags=pe.PEHeaders.CorHeader.Flags;bool anyCpu=(flags&CorFlags.ILOnly)!=0&&(flags&CorFlags.Requires32Bit)==0&&(flags&CorFlags.Prefers32Bit)==0;
            bool expected=md.GetString(assembly.Name)=="Crazy_Batto-Discord-App-Verwaltung"&&assembly.Version.ToString()=="2.2.0.0"&&target==".NETFramework,Version=v4.8"&&imageEqual&&anyCpu&&pe.PEHeaders.PEHeader.Subsystem==Subsystem.WindowsGui;
            var result=new {passed=expected,assemblyName=md.GetString(assembly.Name),version=assembly.Version.ToString(),targetFramework=target,subsystem=pe.PEHeaders.PEHeader.Subsystem.ToString(),machine=pe.PEHeaders.CoffHeader.Machine.ToString(),corFlags=flags.ToString(),anyCpu=anyCpu,authenticodePresent=pe.PEHeaders.PEHeader.CertificateTableDirectory.Size>0,embeddedBackgroundUnchanged=imageEqual,backgroundSha256=Convert.ToHexString(SHA256.HashData(original)).ToLowerInvariant(),exeSha256=Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(filename))).ToLowerInvariant(),size= new FileInfo(filename).Length};
            Console.WriteLine(JsonSerializer.Serialize(result,new JsonSerializerOptions{WriteIndented=true}));if(!expected)throw new Exception("Windows binary metadata validation failed.");
        }
    }
}
