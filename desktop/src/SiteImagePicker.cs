using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace Modstempel.Desktop
{
    internal sealed class SiteImagePicker : Form
    {
        private readonly ApiClient api;
        private readonly CancellationTokenSource scope;
        private readonly Action<SiteImagesReply> imagesChanged;
        private readonly Action<SiteReply> observed;
        private readonly Action<ApiException> authError;
        private readonly HashSet<string> referenced;
        private readonly ListBox list;
        private readonly PictureBox picture;
        private readonly Label status, caption, quotaLabel;
        private readonly Button choose, upload, use, remove, refresh;
        private List<SiteImage> images;
        private SiteQuota quota;
        private byte[] pendingBytes;
        private string pendingFilename;
        private bool busy, filling;
        private int generation;
        internal SiteImage SelectedImage { get; private set; }
        private SiteImage Selected { get { return list.SelectedItem as SiteImage; } }

        internal SiteImagePicker(ApiClient client, List<SiteImage> existing, SiteQuota currentQuota, string selectedId, bool selectionMode, HashSet<string> used,
            CancellationToken cancel, Action<SiteImagesReply> changed, Action<SiteReply> onObserved, Action<ApiException> onAuthError)
        {
            api = client; images = existing.ToList(); quota = currentQuota; referenced = used; imagesChanged = changed; observed = onObserved; authError = onAuthError;
            scope = CancellationTokenSource.CreateLinkedTokenSource(cancel);
            Text = "Crazy_Batto Discord App · Bilder"; Size = new Size(900,720); MinimumSize = new Size(730,580); SiteUi.Theme(this);
            var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(20), ColumnCount = 1, RowCount = 6 };
            foreach (var height in new float[] {40,47}) layout.RowStyles.Add(new RowStyle(SizeType.Absolute,height));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));
            foreach (var height in new float[] {60,65,44}) layout.RowStyles.Add(new RowStyle(SizeType.Absolute,height)); Controls.Add(layout);
            layout.Controls.Add(SiteUi.Label(selectionMode ? "Ein Bild auswählen oder hochladen" : "Deine Bildbibliothek",20,true),0,0);
            layout.Controls.Add(SiteUi.Label("JPG, PNG oder WebP · höchstens 4 MiB pro Bild und 32 Millionen Pixel.\nUploads bleiben privat, bis du sie zuordnest, speicherst und veröffentlichst.",9.5f),0,1);
            var body = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, Margin = new Padding(0,10,0,0) };
            body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,40)); body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,60)); layout.Controls.Add(body,0,2);
            list = new ListBox { Dock = DockStyle.Fill, BackColor = SiteUi.Card, ForeColor = SiteUi.Ink, IntegralHeight = false, HorizontalScrollbar = true, BorderStyle = BorderStyle.FixedSingle, Margin = new Padding(0,0,14,0), AccessibleName = "Vorhandene Website-Bilder" };
            body.Controls.Add(list,0,0);
            var preview = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, ColumnCount = 1 }; preview.RowStyles.Add(new RowStyle(SizeType.Percent,100)); preview.RowStyles.Add(new RowStyle(SizeType.Absolute,66));
            picture = SiteUi.Picture(); preview.Controls.Add(picture,0,0); caption = SiteUi.Label("Wähle ein vorhandenes Bild oder eine Datei auf deinem PC.",9); caption.Dock = DockStyle.Fill; caption.AutoSize = false; preview.Controls.Add(caption,0,1); body.Controls.Add(preview,1,0);
            var buttons = SiteUi.Actions(); choose = SiteUi.Button("Datei auswählen …",true,158); upload = SiteUi.Button("Ausgewählte Datei hochladen",true,232); remove = SiteUi.Button("Bild löschen …",false,143); refresh = SiteUi.Button("Liste neu laden",false,145);
            buttons.Controls.AddRange(new Control[] {choose,upload,remove,refresh}); layout.Controls.Add(buttons,0,3);
            status = SiteUi.Label("Noch keine Änderung an der öffentlichen Webseite.",9.5f); status.Dock = DockStyle.Fill; status.AutoSize = false; layout.Controls.Add(status,0,4);
            var bottom = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 1 }; bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100)); bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,195)); bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,105));
            quotaLabel = SiteUi.Label("",9); bottom.Controls.Add(quotaLabel,0,0);
            use = SiteUi.Button("Dieses Bild verwenden",true,185); use.Visible = selectionMode; bottom.Controls.Add(use,1,0);
            var close = SiteUi.Button(selectionMode ? "Abbrechen" : "Schließen",false,102); close.DialogResult = DialogResult.Cancel; bottom.Controls.Add(close,2,0); layout.Controls.Add(bottom,0,5); CancelButton = close;
            list.SelectedIndexChanged += async (s,e) => { if (filling) return; pendingBytes = null; pendingFilename = null; await PreviewSelected(); };
            choose.Click += async (s,e) => await ChooseFile(); upload.Click += async (s,e) => await Work(Upload); remove.Click += async (s,e) => await Work(Remove); refresh.Click += async (s,e) => await Work(RefreshImages);
            use.Click += (s,e) => { if (!busy && Selected != null && pendingBytes == null) { SelectedImage = Selected; DialogResult = DialogResult.OK; Close(); } };
            FormClosing += (s,e) => { generation++; scope.Cancel(); };
            FormClosed += (s,e) => { SiteUi.SetPicture(picture,null); scope.Dispose(); };
            Fill(selectedId); Shown += async (s,e) => await PreviewSelected(); UpdateActions();
        }
        private void Message(string message, bool warning = false) { status.Text = message; status.ForeColor = warning ? SiteUi.Amber : SiteUi.Muted; }
        private void Fill(string id)
        {
            filling = true; list.Items.Clear(); foreach (var image in images) list.Items.Add(image);
            list.SelectedItem = images.FirstOrDefault(i => i.Id == id); filling = false;
            quotaLabel.Text = Math.Round(quota.UsedBytes / 1048576.0,1) + " / " + Math.Round(quota.MaxBytes / 1048576.0) + " MiB belegt";
            UpdateActions();
        }
        private void UpdateActions()
        {
            var selected = Selected;
            choose.Enabled = !busy; list.Enabled = !busy; upload.Enabled = !busy && pendingBytes != null; refresh.Enabled = !busy;
            use.Enabled = !busy && selected != null && pendingBytes == null;
            remove.Enabled = !busy && pendingBytes == null && selected != null && !selected.BuiltIn && !referenced.Contains(selected.Id);
        }
        private async Task Work(Func<Task> work)
        {
            if (busy || IsDisposed || scope.IsCancellationRequested) return; busy = true; UpdateActions();
            try { await work(); }
            catch (OperationCanceledException) { }
            catch (ApiException error) { if (!IsDisposed) { Message(error.Message,true); if (error.Status == 401 || error.Status == 403) authError(error); } }
            catch (ArgumentException error) { if (!IsDisposed) Message(error.Message,true); }
            catch (Exception) { if (!IsDisposed) Message("Die Aktion konnte nicht abgeschlossen werden. Deine bisherige Bildzuordnung wurde nicht geändert.",true); }
            finally { if (!IsDisposed) { busy = false; UpdateActions(); } }
        }
        private async Task ChooseFile()
        {
            if (busy) return;
            using (var dialog = new OpenFileDialog { Title = "Eigenes Bild auswählen", Filter = "Bilder (*.jpg;*.jpeg;*.png;*.webp)|*.jpg;*.jpeg;*.png;*.webp", CheckFileExists = true, Multiselect = false, RestoreDirectory = true })
            {
                if (dialog.ShowDialog(this) != DialogResult.OK) return;
                await Work(async () =>
                {
                    byte[] bytes;
                    using (var input = new FileStream(dialog.FileName,FileMode.Open,FileAccess.Read,FileShare.Read))
                    {
                        if (input.Length < 1 || input.Length > SitePolicy.ImageLimit) throw new ArgumentException("Das Bild ist größer als 4 MiB oder leer. Bitte eine passende Datei auswählen.");
                        using (var output = new MemoryStream()) { input.CopyTo(output); bytes = output.ToArray(); }
                    }
                    SitePolicy.ImageMime(bytes);
                    var rendered = await Task.Run(() => ImagePreview.Decode(bytes),scope.Token);
                    if (scope.IsCancellationRequested || IsDisposed) return;
                    generation++; filling = true; list.ClearSelected(); filling = false;
                    pendingBytes = bytes; pendingFilename = Path.GetFileName(dialog.FileName);
                    SiteUi.SetPicture(picture,rendered.Png); caption.Text = Policy.Display(pendingFilename,180) + "\n" + rendered.Width + " × " + rendered.Height + " px · " + Math.Round(bytes.Length / 1048576.0,2) + " MiB · noch nicht hochgeladen";
                    Message("Vorschau der ausgewählten Datei. Mit „Ausgewählte Datei hochladen“ wird das Original privat auf deinen Server geladen.");
                });
            }
        }
        private async Task PreviewSelected()
        {
            int current = ++generation; var image = Selected; SiteUi.SetPicture(picture,null); UpdateActions();
            if (image == null) { caption.Text = "Kein Bild ausgewählt."; return; }
            caption.Text = image + "\n" + (image.BuiltIn ? "Mitgeliefertes Bild" : referenced.Contains(image.Id) ? "In einer Fassung zugeordnet – deshalb nicht löschbar" : "Derzeit nicht zugeordnet");
            try
            {
                var bytes = await api.SiteImageBytes(image,scope.Token); var rendered = await Task.Run(() => ImagePreview.Decode(bytes),scope.Token);
                if (!IsDisposed && current == generation && !scope.IsCancellationRequested) SiteUi.SetPicture(picture,rendered.Png);
            }
            catch (OperationCanceledException) { }
            catch (ApiException error) { if (!IsDisposed && current == generation) { Message("Vorschau: " + error.Message,true); if (error.Status == 401 || error.Status == 403) authError(error); } }
            catch (Exception) { if (!IsDisposed && current == generation) Message("Für dieses Bild konnte keine lokale Vorschau geladen werden. Die gespeicherte Datei und Zuordnung bleiben erhalten.",true); }
        }
        private async Task Upload()
        {
            if (pendingBytes == null) return; var original = pendingBytes;
            Message("Originalbild wird privat hochgeladen …");
            var value = await api.UploadSiteImage(original,pendingFilename,scope.Token);
            if (IsDisposed || scope.IsCancellationRequested) return;
            images = value.Images; quota = value.Quota; imagesChanged(value); pendingBytes = null; pendingFilename = null;
            Fill(value.Image.Id); Message("Upload bestätigt. Das Bild liegt privat in deiner Bibliothek. Wähle „Dieses Bild verwenden“, um es dem geöffneten Bereich zuzuordnen.");
            await PreviewSelected();
        }
        private async Task Remove()
        {
            var selected = Selected; if (selected == null || selected.BuiltIn || referenced.Contains(selected.Id)) return;
            if (MessageBox.Show(this,"„" + Policy.Display(selected.Filename,120) + "“ aus der Bildbibliothek löschen? Es ist in keiner hier geladenen Fassung zugeordnet.","Bild löschen",MessageBoxButtons.YesNo,MessageBoxIcon.Question,MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
            var value = await api.DeleteSiteImage(selected.Id,scope.Token);
            if (IsDisposed || scope.IsCancellationRequested) return;
            images = value.Images; quota = value.Quota; imagesChanged(value); Fill(null); SiteUi.SetPicture(picture,null); caption.Text = "Bild gelöscht."; Message("Der Server hat das Löschen bestätigt.");
        }
        private async Task RefreshImages()
        {
            var selected = Selected == null ? null : Selected.Id;
            var value = await api.Site(scope.Token); if (IsDisposed || scope.IsCancellationRequested) return;
            images = value.Images; quota = value.Quota; observed(value); imagesChanged(new SiteImagesReply { Ok = true, Images = images, Quota = quota });
            pendingBytes = null; pendingFilename = null; Fill(selected); Message("Aktuelle Bildbibliothek geladen. Deine Texte wurden nicht überschrieben."); await PreviewSelected();
        }
    }
}
