using System;
using System.Diagnostics;
using System.Linq;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace Modstempel.Desktop
{
    internal static class Program
    {
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)] private static extern int SetCurrentProcessExplicitAppUserModelID(string value);
        [STAThread] private static void Main(string[] args)
        {
            Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
            ServicePointManager.SecurityProtocol = SecurityProtocolType.SystemDefault;
            try { SetCurrentProcessExplicitAppUserModelID("Modstempel.Verwaltung"); } catch { }
            bool created;
            using (var mutex = new Mutex(true, @"Local\ModstempelVerwaltung2_1", out created))
            {
                if (!created) { MessageBox.Show("Die Verwaltung läuft bereits. Öffne sie über das Symbol im Windows-Infobereich neben der Uhr.", "Crazy_Batto Discord App", MessageBoxButtons.OK, MessageBoxIcon.Information); return; }
                try { Application.Run(new MainForm(args.Contains("--minimized"))); }
                catch (Exception) { MessageBox.Show("Die Verwaltung konnte nicht gestartet werden. Bitte die EXE erneut öffnen. Deine Freigaben bleiben auf dem Server gespeichert.", "Crazy_Batto Discord App", MessageBoxButtons.OK, MessageBoxIcon.Error); }
                finally { mutex.ReleaseMutex(); }
            }
        }
        internal static void OpenBrowser(Uri url)
        {
            if (url == null || url.Scheme != "https") throw new ArgumentException("Die Browseradresse ist ungültig.");
            try { Process.Start(new ProcessStartInfo(url.AbsoluteUri) { UseShellExecute = true }); }
            catch { throw new ApiException("browser", "Der Standardbrowser konnte nicht geöffnet werden. Prüfe bitte deine Windows-Standardeinstellungen und versuche es erneut."); }
        }
    }
}
