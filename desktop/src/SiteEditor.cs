using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace Modstempel.Desktop
{
    internal sealed class SiteEditor : UserControl
    {
        private readonly SiteEditState edit = new SiteEditState();
        private readonly Action<ApiException> authError;
        private readonly Label status, version, aboutImageName, galleryInfo, appInfo;
        private readonly TextBox heroTitle, heroText, aboutTitle, aboutText, aboutAlt, setupTitle, setupText;
        private readonly PictureBox aboutPicture, galleryPicture, appPicture;
        private readonly Button load, save, publish, library, open;
        private readonly TabControl sections;
        private readonly DataGridView components, socials;
        private readonly ListBox galleryList, appsList;
        private readonly Dictionary<PictureBox,int> pictureVersions = new Dictionary<PictureBox,int>();
        private List<SiteGalleryItem> gallery = new List<SiteGalleryItem>();
        private List<SiteApp> apps = new List<SiteApp>();
        private string aboutImageId, origin;
        private ApiClient api;
        private CancellationTokenSource context = new CancellationTokenSource();
        private bool owner, busy, filling, disposed;
        private int generation;
        private Form activeImageDialog, activeContentDialog;
        internal bool HasUnsavedChanges { get { return edit.Dirty; } }

        internal SiteEditor(Action<ApiException> onAuthError)
        {
            authError = onAuthError; Dock = DockStyle.Fill; BackColor = SiteUi.Canvas; ForeColor = SiteUi.Ink; Font = new Font("Segoe UI",10);
            var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 5, Padding = new Padding(20,16,20,12) };
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute,67)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute,85)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute,67)); layout.RowStyles.Add(new RowStyle(SizeType.Percent,100)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute,32)); Controls.Add(layout);
            var title = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, ColumnCount = 1 };
            title.Controls.Add(SiteUi.Label("Deine Webseite gestalten",23,true),0,0); title.Controls.Add(SiteUi.Label("Eigene Bilder zuerst hochladen. Texte und weitere Apps kannst du später ergänzen.",9.5f),0,1); layout.Controls.Add(title,0,0);
            var actions = SiteUi.Actions(); load = SiteUi.Button("Serverstand laden",false,165); save = SiteUi.Button("Entwurf speichern",true,163); publish = SiteUi.Button("Gespeicherten Entwurf veröffentlichen",false,285); library = SiteUi.Button("Bilder verwalten …",false,167); open = SiteUi.Button("Öffentliche Webseite öffnen",false,238);
            actions.Controls.AddRange(new Control[] {load,save,publish,library,open}); layout.Controls.Add(actions,0,1);
            status = SiteUi.Label("Melde dich im Reiter „Zugänge“ mit deinem Betreiberkonto an.",9.5f); status.AutoSize = false; status.Dock = DockStyle.Fill; layout.Controls.Add(status,0,2);
            sections = new TabControl { Dock = DockStyle.Fill }; SiteUi.StyleTabs(sections); layout.Controls.Add(sections,0,3);
            version = SiteUi.Label("Noch kein Website-Stand geladen.",9); version.Dock = DockStyle.Fill; layout.Controls.Add(version,0,4);
            var aboutTab = Page("Start / Über mich"); var about = SiteUi.Fields(aboutTab);
            heroTitle = SiteUi.Input(100); heroText = SiteUi.Input(500,true); aboutTitle = SiteUi.Input(100); aboutText = SiteUi.Input(5000,true); aboutAlt = SiteUi.Input(300);
            SiteUi.FieldRow(about,"Hauptüberschrift",heroTitle); SiteUi.FieldRow(about,"Kurze Einführung (optional)",heroText,94);
            SiteUi.FieldRow(about,"Überschrift Über mich (optional)",aboutTitle); SiteUi.FieldRow(about,"Über mich – Text für später (optional)",aboutText,190);
            aboutPicture = SiteUi.Picture(); SiteUi.Row(about,aboutPicture,210); aboutImageName = SiteUi.Label("Kein Bild zugeordnet.",9); SiteUi.Row(about,aboutImageName,42);
            var aboutActions = SiteUi.Actions(); var aboutChoose = SiteUi.Button("Eigenes Bild auswählen …",true,230); var aboutRemove = SiteUi.Button("Bildzuordnung entfernen",false,217); aboutActions.Controls.AddRange(new Control[] {aboutChoose,aboutRemove}); SiteUi.Row(about,aboutActions,48);
            SiteUi.FieldRow(about,"Bildbeschreibung für Barrierefreiheit (optional)",aboutAlt);
            var setupTab = Page("Setup"); var setup = SiteUi.Fields(setupTab); setupTitle = SiteUi.Input(100); setupText = SiteUi.Input(5000,true);
            SiteUi.FieldRow(setup,"Setup-Überschrift (optional)",setupTitle); SiteUi.FieldRow(setup,"Setup-Text für später (optional)",setupText,136);
            SiteUi.Row(setup,SiteUi.Label("Setup-Komponenten · bis zu 24 Einträge",11,true),33);
            components = EditableGrid(new[] {"Komponente", "Modell / Information"},new[] {80,300}); SiteUi.Row(setup,components,225);
            var componentActions = SiteUi.Actions(); var deleteComponent = SiteUi.Button("Gewählte Zeile entfernen",false,225); componentActions.Controls.Add(deleteComponent); SiteUi.Row(setup,componentActions,45);
            SiteUi.Row(setup,SiteUi.Label("Setup-Bilder · bis zu 12 Bilder",11,true),33);
            galleryList = ContentList(); SiteUi.Row(setup,galleryList,155); galleryPicture = SiteUi.Picture(); SiteUi.Row(setup,galleryPicture,205); galleryInfo = SiteUi.Label("Noch kein Setup-Bild ausgewählt.",9); SiteUi.Row(setup,galleryInfo,44);
            var galleryActions = SiteUi.Actions(); AddAction(galleryActions,"Bild hinzufügen …",true,()=>EditGallery(true)); AddAction(galleryActions,"Bearbeiten …",false,()=>EditGallery(false),135); AddAction(galleryActions,"Entfernen",false,RemoveGallery,110); AddAction(galleryActions,"Nach oben",false,()=>MoveGallery(-1),110); AddAction(galleryActions,"Nach unten",false,()=>MoveGallery(1),115); SiteUi.Row(setup,galleryActions,90);
            var appsTab = Page("Meine Apps"); var appFields = SiteUi.Fields(appsTab); SiteUi.Row(appFields,SiteUi.Label("Bis zu 8 App-Karten mit eigenen Bildern und optionalem Link.",10),36);
            appsList = ContentList(); SiteUi.Row(appFields,appsList,205); appPicture = SiteUi.Picture(); SiteUi.Row(appFields,appPicture,230); appInfo = SiteUi.Label("Noch keine App-Karte ausgewählt.",9); SiteUi.Row(appFields,appInfo,85);
            var appActions = SiteUi.Actions(); AddAction(appActions,"App hinzufügen …",true,()=>EditApp(true)); AddAction(appActions,"Bearbeiten …",false,()=>EditApp(false),135); AddAction(appActions,"Entfernen",false,RemoveApp,110); AddAction(appActions,"Nach oben",false,()=>MoveApp(-1),110); AddAction(appActions,"Nach unten",false,()=>MoveApp(1),115); SiteUi.Row(appFields,appActions,90);
            var linksTab = Page("Links"); var linkFields = SiteUi.Fields(linksTab); SiteUi.Row(linkFields,SiteUi.Label("Deine Social-Media- und Projektlinks (optional, bis zu 12).\nNur HTTPS-Adressen oder /portal für die Registrierung.",10),65);
            socials = EditableGrid(new[] {"Name des Links", "HTTPS-Adresse"},new[] {80,1000}); SiteUi.Row(linkFields,socials,350); var socialActions = SiteUi.Actions(); var deleteSocial = SiteUi.Button("Gewählte Zeile entfernen",false,225); socialActions.Controls.Add(deleteSocial); SiteUi.Row(linkFields,socialActions,45);
            load.Click += async (s,e) => await LoadRequested(); save.Click += async (s,e) => await Work(Save); publish.Click += async (s,e) => await Work(Publish);
            library.Click += (s,e) => PickImage(FindForm(),null,false);
            open.Click += (s,e) => { try { if (origin != null) Program.OpenBrowser(new Uri(Policy.Origin(origin) + "/")); } catch (Exception error) { Message(error.Message,true); } };
            aboutChoose.Click += (s,e) => { var image = PickImage(FindForm(),aboutImageId,true); if (image == null) return; aboutImageId = image.Id; Changed(); ShowImage(aboutPicture,aboutImageName,aboutImageId); };
            aboutRemove.Click += (s,e) => { if (aboutImageId == null) return; aboutImageId = null; Changed(); ShowImage(aboutPicture,aboutImageName,null); };
            deleteComponent.Click += (s,e) => RemoveGridRow(components); deleteSocial.Click += (s,e) => RemoveGridRow(socials);
            galleryList.SelectedIndexChanged += (s,e) => { if (filling) return; var i = galleryList.SelectedIndex; ShowImage(galleryPicture,galleryInfo,i >= 0 ? gallery[i].ImageId : null); };
            appsList.SelectedIndexChanged += (s,e) => { if (filling) return; var i = appsList.SelectedIndex; ShowImage(appPicture,appInfo,i >= 0 ? apps[i].ImageId : null,i >= 0 ? apps[i].Name + "\n" + Policy.Display(apps[i].Description,180) : null); };
            galleryList.DoubleClick += (s,e) => EditGallery(false); appsList.DoubleClick += (s,e) => EditApp(false);
            foreach (var box in new[] {heroTitle,heroText,aboutTitle,aboutText,aboutAlt,setupTitle,setupText}) box.TextChanged += (s,e) => Changed();
            foreach (var grid in new[] {components,socials}) { grid.CellValueChanged += (s,e) => Changed(); grid.UserDeletedRow += (s,e) => Changed(); grid.CurrentCellDirtyStateChanged += (s,e) => { if (grid.IsCurrentCellDirty) Changed(); }; }
            UpdateActions();
        }
        private TabPage Page(string label) { var tab = new TabPage(label) { BackColor = SiteUi.Canvas, ForeColor = SiteUi.Ink }; sections.TabPages.Add(tab); return tab; }
        private static ListBox ContentList() { return new ListBox { Dock = DockStyle.Fill, IntegralHeight = false, BackColor = SiteUi.Card, ForeColor = SiteUi.Ink, BorderStyle = BorderStyle.FixedSingle, HorizontalScrollbar = true }; }
        private static DataGridView EditableGrid(string[] headings, int[] limits)
        {
            var grid = new DataGridView { Dock = DockStyle.Fill, BackgroundColor = SiteUi.Card, BorderStyle = BorderStyle.FixedSingle, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, MultiSelect = false, AllowUserToResizeRows = false, AllowUserToAddRows = true, AllowUserToDeleteRows = true, RowHeadersWidth = 28, EnableHeadersVisualStyles = false, EditMode = DataGridViewEditMode.EditOnEnter };
            grid.ColumnHeadersDefaultCellStyle.BackColor = SiteUi.Field; grid.ColumnHeadersDefaultCellStyle.ForeColor = SiteUi.Ink; grid.DefaultCellStyle.BackColor = SiteUi.Card; grid.DefaultCellStyle.ForeColor = SiteUi.Ink; grid.DefaultCellStyle.SelectionBackColor = Color.FromArgb(64,35,43); grid.DefaultCellStyle.SelectionForeColor = SiteUi.Ink; grid.RowTemplate.Height = 32;
            for (int i=0;i<headings.Length;i++) grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = headings[i], MaxInputLength = limits[i], SortMode = DataGridViewColumnSortMode.NotSortable, FillWeight = i == 0 ? 34 : 66 }); return grid;
        }
        private void AddAction(FlowLayoutPanel panel,string label,bool primary,Action work,int width=170)
        { var button = SiteUi.Button(label,primary,width); button.Click += (s,e) => { try { if (!busy && owner && edit.Saved != null) work(); } catch (Exception error) { Message(error.Message,true); } }; panel.Controls.Add(button); }
        internal void BindContext(ApiClient value,string host,bool allowed)
        {
            if (ReferenceEquals(value,api) && host == origin && allowed == owner) return;
            generation++; context.Cancel(); context.Dispose(); context = new CancellationTokenSource();
            activeImageDialog?.Close(); activeContentDialog?.Close(); api = value; origin = host; owner = allowed; busy = false;
            edit.Clear(); ClearFields(); Message(allowed ? "Lade den aktuellen Website-Stand. Eigene Bilder und Texte bearbeitest du danach hier." : "Melde dich im Reiter „Zugänge“ mit deinem Betreiberkonto an."); UpdateActions();
        }
        internal async Task ActivatePage() { if (owner && edit.Saved == null && !busy) await Work(LoadFresh); }
        private void Changed()
        { if (filling) return; edit.Changed(); if (edit.Dirty) Message("Nicht gespeicherte Änderungen. Deine öffentliche Webseite bleibt auf der veröffentlichten Fassung."); UpdateActions(); }
        private void Message(string value,bool warning=false) { status.Text = value; status.ForeColor = warning ? SiteUi.Amber : SiteUi.Muted; }
        private void UpdateActions()
        {
            load.Enabled = owner && !busy; library.Enabled = owner && !busy && edit.Saved != null; open.Enabled = origin != null;
            save.Enabled = owner && !busy && edit.Saved != null && edit.Dirty && !edit.NeedsRefresh;
            publish.Enabled = owner && !busy && edit.Saved != null && !edit.Dirty && !edit.NeedsRefresh;
            sections.Enabled = owner && !busy && edit.Saved != null;
            version.Text = edit.Saved == null ? "Noch kein Website-Stand geladen." : "Entwurf: Stand " + edit.Saved.Version + (edit.Dirty ? " · lokal geändert" : " · gespeichert") + "    |    Öffentlich: Stand " + edit.Saved.PublishedVersion + " · " + (edit.Saved.PublishedAt.HasValue ? Policy.When(edit.Saved.PublishedAt) : "Anfangsfassung") + (edit.NeedsRefresh ? " · Serverstand prüfen" : "");
        }
        private async Task Work(Func<Task> work)
        {
            if (!owner || api == null || busy || disposed) return; int epoch = generation; busy = true; UpdateActions();
            try { await work(); }
            catch (OperationCanceledException) { }
            catch (ApiException error)
            {
                if (epoch != generation || disposed) return;
                if (error.Status == 401 || error.Status == 403) { authError(error); return; }
                if (error.Kind == "conflict" || error.Kind == "uncertain" || error.Status == 409)
                {
                    edit.Uncertain(); Message(error.Message + " Deine Eingaben bleiben stehen. „Serverstand laden“ fragt vor dem Verwerfen nach.",true);
                    try { var remote = await api.Site(context.Token); if (epoch == generation && !disposed) { edit.Observe(remote); Message("Der Server steht jetzt auf Version " + remote.Version + ". Deine Eingaben wurden nicht überschrieben. Prüfe oder kopiere sie, bevor du den Serverstand lädst.",true); } }
                    catch (ApiException refreshError) { if (epoch == generation && (refreshError.Status == 401 || refreshError.Status == 403)) authError(refreshError); }
                    catch (OperationCanceledException) { }
                    catch (Exception) { if (epoch == generation && !disposed) Message("Der aktuelle Serverstand konnte noch nicht gelesen werden. Deine Eingaben bleiben erhalten; bitte später „Serverstand laden“ wählen.",true); }
                }
                else Message(error.Message,true);
            }
            catch (ArgumentException error) { if (epoch == generation && !disposed) Message(error.Message,true); }
            catch (Exception) { if (epoch == generation && !disposed) Message("Die Website-Aktion konnte nicht abgeschlossen werden. Deine Eingaben bleiben erhalten.",true); }
            finally { if (epoch == generation && !disposed) { busy = false; UpdateActions(); } }
        }
        private async Task LoadRequested()
        {
            if (!owner || busy) return;
            if (edit.Dirty && MessageBox.Show(FindForm(),"Deine nicht gespeicherten Website-Änderungen verwerfen und den aktuellen Entwurf vom Server laden? Du kannst vorher abbrechen und deine Texte kopieren.","Serverstand laden",MessageBoxButtons.YesNo,MessageBoxIcon.Question,MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
            await Work(LoadFresh);
        }
        private async Task LoadFresh()
        {
            var current = api; var token = context.Token; int epoch = generation; Message("Gespeicherter Website-Stand wird geladen …");
            var value = await current.Site(token); if (epoch != generation || disposed || token.IsCancellationRequested) return;
            edit.Load(value,true); FillFields(); Message("Gespeicherten Entwurf geladen. Bildupload und Entwurf speichern ändern die öffentliche Fassung noch nicht.");
        }
        private SiteContent Collect()
        {
            components.EndEdit(); socials.EndEdit();
            return new SiteContent { HeroTitle = heroTitle.Text, HeroText = heroText.Text, About = new SiteAbout { Title = aboutTitle.Text, Text = aboutText.Text, ImageId = aboutImageId, ImageAlt = aboutAlt.Text },
                Setup = new SiteSetup { Title = setupTitle.Text, Text = setupText.Text, Components = GridValues(components).Select(v=>new SiteComponent {Label=v[0],Value=v[1]}).ToList(), Images = Json.Decode<List<SiteGalleryItem>>(Json.Encode(gallery)) },
                Apps = Json.Decode<List<SiteApp>>(Json.Encode(apps)), SocialLinks = GridValues(socials).Select(v=>new SiteLink {Label=v[0],Url=v[1]}).ToList() };
        }
        private static List<string[]> GridValues(DataGridView grid)
        {
            var result = new List<string[]>();
            foreach (DataGridViewRow row in grid.Rows) if (!row.IsNewRow) { var a = Convert.ToString(row.Cells[0].Value) ?? ""; var b = Convert.ToString(row.Cells[1].Value) ?? ""; if (!String.IsNullOrWhiteSpace(a) || !String.IsNullOrWhiteSpace(b)) result.Add(new[] {a,b}); }
            return result;
        }
        private async Task Save()
        {
            if (edit.Saved == null || !edit.Dirty || edit.NeedsRefresh) return;
            var content = SitePolicy.Normalize(Collect(),edit.Saved.Images); var expected = edit.Saved.Version; var token = context.Token; int epoch = generation;
            Message("Entwurf wird gespeichert …"); var value = await api.SaveSite(expected,content,edit.Saved.Images,token);
            if (epoch != generation || disposed || token.IsCancellationRequested) return;
            edit.SavedReply(value,expected,content); FillFields(); Message("Entwurf vom Server bestätigt: Stand " + value.Version + ". Die öffentliche Webseite ist weiterhin Stand " + value.PublishedVersion + ".");
        }
        private async Task Publish()
        {
            if (edit.Saved == null || edit.Dirty || edit.NeedsRefresh) return;
            var expected = edit.Saved.Version;
            if (MessageBox.Show(FindForm(),"Den bereits gespeicherten Entwurf (Stand " + expected + ") jetzt auf deiner öffentlichen Webseite veröffentlichen? Alle zugeordneten Bilder und Texte dieser Fassung werden sichtbar.","Gespeicherten Entwurf veröffentlichen",MessageBoxButtons.YesNo,MessageBoxIcon.Question,MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
            var token = context.Token; int epoch = generation; Message("Gespeicherter Entwurf wird veröffentlicht …");
            var value = await api.PublishSite(expected,edit.Saved.Draft,token); if (epoch != generation || disposed || token.IsCancellationRequested) return;
            edit.PublishedReply(value,expected); FillFields(); Message("Veröffentlichung vom Server bestätigt: Stand " + value.PublishedVersion + " · " + Policy.When(value.PublishedAt) + ".");
        }
        private void FillFields()
        {
            if (edit.Saved == null) return; filling = true;
            var c = edit.Saved.Draft; heroTitle.Text = c.HeroTitle; heroText.Text = c.HeroText; aboutTitle.Text = c.About.Title; aboutText.Text = c.About.Text; aboutAlt.Text = c.About.ImageAlt; aboutImageId = c.About.ImageId; setupTitle.Text = c.Setup.Title; setupText.Text = c.Setup.Text;
            components.Rows.Clear(); foreach (var item in c.Setup.Components) components.Rows.Add(item.Label,item.Value);
            socials.Rows.Clear(); foreach (var item in c.SocialLinks) socials.Rows.Add(item.Label,item.Url);
            gallery = Json.Decode<List<SiteGalleryItem>>(Json.Encode(c.Setup.Images)); apps = Json.Decode<List<SiteApp>>(Json.Encode(c.Apps));
            FillLists(); filling = false; ShowImage(aboutPicture,aboutImageName,aboutImageId); ShowImage(galleryPicture,galleryInfo,null); ShowImage(appPicture,appInfo,null); UpdateActions();
        }
        private void ClearFields()
        {
            filling = true; foreach (var box in new[] {heroTitle,heroText,aboutTitle,aboutText,aboutAlt,setupTitle,setupText}) box.Clear(); components.Rows.Clear(); socials.Rows.Clear(); gallery.Clear(); apps.Clear(); galleryList.Items.Clear(); appsList.Items.Clear(); aboutImageId = null;
            foreach (var p in new[] {aboutPicture,galleryPicture,appPicture}) { pictureVersions[p] = pictureVersions.ContainsKey(p) ? pictureVersions[p] + 1 : 1; SiteUi.SetPicture(p,null); }
            aboutImageName.Text = "Kein Bild zugeordnet."; galleryInfo.Text = "Kein Setup-Bild ausgewählt."; appInfo.Text = "Keine App-Karte ausgewählt."; filling = false;
        }
        private string ImageName(string id) { var image = edit.Saved == null ? null : edit.Saved.Images.FirstOrDefault(i=>i.Id==id); return image == null ? "Kein Bild zugeordnet" : Policy.Display(image.Filename,120); }
        private void FillLists(int gallerySelected = -1,int appSelected = -1)
        {
            bool wasFilling = filling; filling = true; galleryList.Items.Clear(); for (int i=0;i<gallery.Count;i++) galleryList.Items.Add((i+1) + ". " + (String.IsNullOrWhiteSpace(gallery[i].Caption) ? ImageName(gallery[i].ImageId) : Policy.Display(gallery[i].Caption,120)));
            appsList.Items.Clear(); for (int i=0;i<apps.Count;i++) appsList.Items.Add((i+1) + ". " + apps[i].Name);
            galleryList.SelectedIndex = gallerySelected >= 0 && gallerySelected < gallery.Count ? gallerySelected : -1; appsList.SelectedIndex = appSelected >= 0 && appSelected < apps.Count ? appSelected : -1; filling = wasFilling;
        }
        private void RemoveGridRow(DataGridView grid) { if (grid.CurrentRow != null && !grid.CurrentRow.IsNewRow) { grid.Rows.Remove(grid.CurrentRow); Changed(); } }
        private void EditGallery(bool add)
        {
            int index = galleryList.SelectedIndex; if (!add && index < 0) return; if (add && gallery.Count >= 12) { Message("Es sind höchstens 12 Setup-Bilder möglich.",true); return; }
            var item = add ? new SiteGalleryItem {Alt="",Caption=""} : Json.Decode<SiteGalleryItem>(Json.Encode(gallery[index]));
            using (var dialog = new SiteItemDialog(item,null,PickImage,ShowImage))
            {
                activeContentDialog = dialog; var accepted = dialog.ShowDialog(FindForm()) == DialogResult.OK; activeContentDialog = null;
                if (!accepted || !owner || edit.Saved == null) return; if (add) { gallery.Add(dialog.Gallery); index = gallery.Count-1; } else gallery[index] = dialog.Gallery;
                FillLists(index,appsList.SelectedIndex); Changed(); ShowImage(galleryPicture,galleryInfo,gallery[index].ImageId);
            }
        }
        private void EditApp(bool add)
        {
            int index = appsList.SelectedIndex; if (!add && index < 0) return; if (add && apps.Count >= 8) { Message("Es sind höchstens 8 App-Karten möglich.",true); return; }
            var item = add ? new SiteApp {Id="app-" + Guid.NewGuid().ToString("N"),Name="",Description="",ImageAlt="",ButtonLabel="",Url=null} : Json.Decode<SiteApp>(Json.Encode(apps[index]));
            using (var dialog = new SiteItemDialog(null,item,PickImage,ShowImage))
            {
                activeContentDialog = dialog; var accepted = dialog.ShowDialog(FindForm()) == DialogResult.OK; activeContentDialog = null;
                if (!accepted || !owner || edit.Saved == null) return; if (add) { apps.Add(dialog.App); index = apps.Count-1; } else apps[index] = dialog.App;
                FillLists(galleryList.SelectedIndex,index); Changed(); ShowImage(appPicture,appInfo,apps[index].ImageId,apps[index].Name);
            }
        }
        private void RemoveGallery() { int i=galleryList.SelectedIndex; if (i<0) return; gallery.RemoveAt(i); FillLists(); Changed(); ShowImage(galleryPicture,galleryInfo,null); }
        private void RemoveApp() { int i=appsList.SelectedIndex; if (i<0) return; apps.RemoveAt(i); FillLists(); Changed(); ShowImage(appPicture,appInfo,null); }
        private void MoveGallery(int by) { int i=galleryList.SelectedIndex,j=i+by; if (i<0||j<0||j>=gallery.Count) return; var item=gallery[i]; gallery.RemoveAt(i); gallery.Insert(j,item); FillLists(j,appsList.SelectedIndex); Changed(); }
        private void MoveApp(int by) { int i=appsList.SelectedIndex,j=i+by; if (i<0||j<0||j>=apps.Count) return; var item=apps[i]; apps.RemoveAt(i); apps.Insert(j,item); FillLists(galleryList.SelectedIndex,j); Changed(); }
        private SiteImage PickImage(IWin32Window parent,string current,bool selectionMode)
        {
            if (!owner || api == null || busy || edit.Saved == null) return null;
            var used = SitePolicy.References(edit.Saved.Draft); used.UnionWith(SitePolicy.References(edit.Saved.Published)); used.UnionWith(SitePolicy.References(Collect())); if (SitePolicy.ValidImageId(current)) used.Add(current); int epoch = generation;
            using (var dialog = new SiteImagePicker(api,edit.Saved.Images,edit.Saved.Quota,current,selectionMode,used,context.Token,
                value => { if (epoch == generation && edit.Saved != null) { edit.Saved.Images = value.Images; edit.Saved.Quota = value.Quota; } },
                value => { if (epoch == generation) { edit.Observe(value); UpdateActions(); } },
                error => { if (epoch == generation) authError(error); }))
            {
                activeImageDialog = dialog; var accepted = dialog.ShowDialog(parent) == DialogResult.OK; activeImageDialog = null;
                if (epoch != generation || !owner || !accepted) return null; return dialog.SelectedImage;
            }
        }
        private async void ShowImage(PictureBox picture,Label label,string imageId,string extra=null)
        {
            if (disposed || picture.IsDisposed) return;
            if (!pictureVersions.ContainsKey(picture)) picture.Disposed += (s,e) => pictureVersions.Remove(picture);
            int request = pictureVersions.ContainsKey(picture) ? pictureVersions[picture]+1 : 1; pictureVersions[picture]=request;
            int epoch=generation; var token=context.Token; SiteUi.SetPicture(picture,null);
            var image=edit.Saved == null ? null : edit.Saved.Images.FirstOrDefault(i=>i.Id==imageId);
            label.Text = (extra == null ? "" : extra + "\n") + (image == null ? "Kein Bild zugeordnet." : image.ToString());
            if (image == null || !owner || api == null) return;
            try
            {
                var bytes=await api.SiteImageBytes(image,token); var preview=await Task.Run(()=>ImagePreview.Decode(bytes),token);
                if (!disposed && !picture.IsDisposed && epoch==generation && pictureVersions[picture]==request && !token.IsCancellationRequested) SiteUi.SetPicture(picture,preview.Png);
            }
            catch (OperationCanceledException) { }
            catch (ApiException error) { if (!disposed && !picture.IsDisposed && epoch==generation && pictureVersions[picture]==request) { label.Text=ImageName(imageId) + " · Vorschau: " + error.Message; if (error.Status==401||error.Status==403) authError(error); } }
            catch (Exception) { if (!disposed && !picture.IsDisposed && epoch==generation && pictureVersions[picture]==request) label.Text=ImageName(imageId) + " · Lokale Vorschau nicht verfügbar; Bildzuordnung bleibt erhalten."; }
        }
        protected override void Dispose(bool disposing)
        { if (disposing && !disposed) { disposed=true; context.Cancel(); context.Dispose(); foreach (var p in new[] {aboutPicture,galleryPicture,appPicture}) if (p != null) SiteUi.SetPicture(p,null); } base.Dispose(disposing); }
    }
    internal sealed class SiteItemDialog : Form
    {
        internal SiteGalleryItem Gallery {get;private set;}
        internal SiteApp App {get;private set;}
        private string imageId;
        internal SiteItemDialog(SiteGalleryItem gallery,SiteApp app,Func<IWin32Window,string,bool,SiteImage> pick,Action<PictureBox,Label,string,string> preview)
        {
            bool isApp=app!=null; Gallery=gallery; App=app; imageId=isApp?app.ImageId:gallery.ImageId;
            Text="Crazy_Batto Discord App · " + (isApp?"App-Karte":"Setup-Bild"); Size=new Size(690,820); MinimumSize=new Size(620,620); SiteUi.Theme(this);
            var shell=new TableLayoutPanel {Dock=DockStyle.Fill,ColumnCount=1,RowCount=2}; shell.RowStyles.Add(new RowStyle(SizeType.Percent,100)); shell.RowStyles.Add(new RowStyle(SizeType.Absolute,58)); Controls.Add(shell);
            var area=new Panel {Dock=DockStyle.Fill}; shell.Controls.Add(area,0,0); var fields=SiteUi.Fields(area);
            SiteUi.Row(fields,SiteUi.Label(isApp?"App-Karte bearbeiten":"Setup-Bild bearbeiten",21,true),45);
            TextBox name=null,description=null,url=null,button=null;
            if (isApp)
            {
                name=SiteUi.Input(100); name.Text=app.Name; description=SiteUi.Input(3000,true); description.Text=app.Description; url=SiteUi.Input(1000); url.Text=app.Url??""; button=SiteUi.Input(60); button.Text=app.ButtonLabel;
                SiteUi.FieldRow(fields,"Name der App",name); SiteUi.FieldRow(fields,"Informationen (kann zunächst leer bleiben)",description,155);
            }
            var picture=SiteUi.Picture(); var imageLabel=SiteUi.Label("",9); SiteUi.Row(fields,picture,230); SiteUi.Row(fields,imageLabel,55);
            var actions=SiteUi.Actions(); var choose=SiteUi.Button("Bild auswählen / hochladen …",true,270); var clear=SiteUi.Button("Bild entfernen",false,155); clear.Visible=isApp; actions.Controls.AddRange(new Control[]{choose,clear}); SiteUi.Row(fields,actions,48);
            var alt=SiteUi.Input(300); alt.Text=isApp?app.ImageAlt:gallery.Alt; SiteUi.FieldRow(fields,"Bildbeschreibung für Barrierefreiheit (optional)",alt);
            TextBox caption=null;
            if (isApp) { SiteUi.FieldRow(fields,"Link (optional, HTTPS oder /portal)",url); SiteUi.FieldRow(fields,"Text der Link-Schaltfläche (optional)",button); }
            else { caption=SiteUi.Input(500,true); caption.Text=gallery.Caption; SiteUi.FieldRow(fields,"Bildunterschrift (optional, später ergänzbar)",caption,110); }
            SiteUi.Row(fields,SiteUi.Label("„Übernehmen“ ändert deinen lokalen Entwurf. Erst speichern und anschließend veröffentlichen macht die Änderung öffentlich.",9),65);
            var bottom=new FlowLayoutPanel {Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,Padding=new Padding(12,6,12,6)}; var accept=SiteUi.Button("Übernehmen",true,140); var cancel=SiteUi.Button("Abbrechen",false,120); cancel.DialogResult=DialogResult.Cancel; bottom.Controls.AddRange(new Control[]{accept,cancel}); shell.Controls.Add(bottom,0,1); CancelButton=cancel;
            choose.Click+=(s,e)=>{var image=pick(this,imageId,true); if(image==null)return; imageId=image.Id; preview(picture,imageLabel,imageId,null);}; clear.Click+=(s,e)=>{imageId=null;preview(picture,imageLabel,null,null);};
            accept.Click+=(s,e)=>
            {
                try
                {
                    if(isApp)
                    { if(String.IsNullOrWhiteSpace(name.Text))throw new ArgumentException("Bitte einen Namen für diese App-Karte eingeben."); App.Name=name.Text.Trim(); App.Description=description.Text.Trim(); App.ImageId=imageId; App.ImageAlt=alt.Text.Trim(); App.Url=SitePolicy.Link(url.Text); App.ButtonLabel=button.Text.Trim(); }
                    else
                    { if(!SitePolicy.ValidImageId(imageId))throw new ArgumentException("Bitte ein Bild für die Setup-Galerie auswählen."); Gallery.ImageId=imageId;Gallery.Alt=alt.Text.Trim();Gallery.Caption=caption.Text.Trim(); }
                    DialogResult=DialogResult.OK;Close();
                }
                catch(ArgumentException error){MessageBox.Show(this,error.Message,"Angaben prüfen",MessageBoxButtons.OK,MessageBoxIcon.Information);}
            };
            Shown+=(s,e)=>preview(picture,imageLabel,imageId,null); FormClosed+=(s,e)=>SiteUi.SetPicture(picture,null);
        }
    }
}
