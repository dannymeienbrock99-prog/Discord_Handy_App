using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32;

namespace Modstempel.Desktop
{
    internal sealed class LocalVault
    {
        private readonly string path;
        private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("Modstempel.Verwaltung.v2.1");
        internal LocalVault()
        {
            var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Modstempel", "Verwaltung");
            Directory.CreateDirectory(directory); path = Path.Combine(directory, "state.dpapi");
        }
        internal LocalState Read()
        {
            if (!File.Exists(path)) return new LocalState();
            byte[] plain = null;
            try
            {
                if (new FileInfo(path).Length > 4 * 1024 * 1024) throw new InvalidDataException();
                plain = ProtectedData.Unprotect(File.ReadAllBytes(path), Entropy, DataProtectionScope.CurrentUser);
                var state = Json.Decode<LocalState>(plain);
                if (state == null) throw new InvalidDataException();
                if (!String.IsNullOrEmpty(state.Origin)) state.Origin = Policy.Origin(state.Origin);
                if (!String.IsNullOrEmpty(state.SessionToken) && (!Policy.ValidToken(state.SessionToken) || !Policy.ValidId(state.UserId))) throw new InvalidDataException();
                if (!String.IsNullOrEmpty(state.LoginId) && (!Policy.ValidLoginId(state.LoginId) || String.IsNullOrEmpty(state.LoginVerifier) || state.LoginVerifier.Length != 43)) throw new InvalidDataException();
                return state;
            }
            finally { if (plain != null) Array.Clear(plain, 0, plain.Length); }
        }
        internal void Save(LocalState state)
        {
            byte[] plain = null; var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                plain = Json.Encode(state);
                var cipher = ProtectedData.Protect(plain, Entropy, DataProtectionScope.CurrentUser);
                using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
                { output.Write(cipher, 0, cipher.Length); output.Flush(true); }
                if (File.Exists(path)) File.Replace(temporary, path, null); else File.Move(temporary, path);
            }
            finally
            {
                if (plain != null) Array.Clear(plain, 0, plain.Length);
                if (File.Exists(temporary)) File.Delete(temporary);
            }
        }
    }
    internal static class AutoStart
    {
        private const string KeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string ValueName = "ModstempelVerwaltung";
        internal static bool Enabled
        {
            get { using (var key = Registry.CurrentUser.OpenSubKey(KeyPath, false)) return key != null && key.GetValue(ValueName) != null; }
        }
        internal static void Set(bool enabled, string executable)
        {
            using (var key = Registry.CurrentUser.CreateSubKey(KeyPath))
            {
                if (key == null) throw new IOException("Der Windows-Autostart konnte nicht gespeichert werden.");
                if (enabled) key.SetValue(ValueName, "\"" + executable + "\" --minimized", RegistryValueKind.String);
                else key.DeleteValue(ValueName, false);
            }
        }
    }
}
