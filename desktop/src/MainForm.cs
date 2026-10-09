using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace Modstempel.Desktop
{
    internal sealed class MainForm : Form
    {
        private static readonly Color Canvas = Color.FromArgb(16, 17, 21), Card = Color.FromArgb(27, 29, 35), Line = Color.FromArgb(49, 51, 60), Ink = Color.FromArgb(243, 244, 247), Muted = Color.FromArgb(169, 174, 187), Red = Color.FromArgb(205, 50, 63), Green = Color.FromArgb(111, 218, 169), Amber = Color.FromArgb(246, 195, 105);
        private readonly LocalVault vault;
        private LocalState state;
        private ApiClient client;
        private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
        private readonly System.Windows.Forms.Timer authTimer = new System.Windows.Forms.Timer { Interval = 3000 }, pollTimer = new System.Windows.Forms.Timer { Interval = 15000 };
        private readonly NotifyIcon tray;
        private readonly TextBox originBox, searchBox, noteBox;
        private readonly Label statusLabel, accountLabel, countsLabel, selectedLabel, detailsLabel, footerLabel;
        private readonly Button connectButton, loginButton, logoutButton, refreshButton, approveButton, rejectButton, revokeButton, cancelButton, browserButton;
        private readonly ComboBox filterBox;
        private readonly CheckBox autostartBox, closeToTrayBox;
        private readonly DataGridView grid;
        private List<Registration> rows = new List<Registration>();
        private bool busy, owner, fresh, exiting, checkboxGuard, serverReady;
        private long revision = -1, nextPollAt;
        private readonly bool startMinimized;
        private string initialError;
        private string selectedId;
        private readonly Image heroImage;
        private readonly ToolTip statusTip = new ToolTip();
        private readonly TabControl navigation;
        private readonly SiteEditor siteEditor;

        internal MainForm(bool minimized)
        {
            startMinimized = minimized;
            vault = new LocalVault();
            try { state = vault.Read(); }
            catch { state = new LocalState(); initialError = "Die lokale Anmeldung konnte nicht gelesen werden. Bitte Serveradresse erneut speichern und mit Discord anmelden."; }
            Text = "Crazy_Batto Discord App · Verwaltung"; BackColor = Canvas; ForeColor = Ink; Font = new Font("Segoe UI", 9.5f);
            AutoScaleMode = AutoScaleMode.Dpi; MinimumSize = new Size(950, 630); Size = new Size(1230, 820); StartPosition = FormStartPosition.CenterScreen;
            Icon = SystemIcons.Shield;
            var screen = Screen.PrimaryScreen.WorkingArea;
            Size = new Size(Math.Min(Width, Math.Max(950, screen.Width - 80)), Math.Min(Height, Math.Max(630, screen.Height - 70)));

            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Modstempel.Background"))
            { if (stream != null) heroImage = new Bitmap(stream); }
            var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, Padding = new Padding(0) };
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 222)); root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); Controls.Add(root);
            var hero = new HeroPanel(heroImage) { Dock = DockStyle.Fill, Margin = new Padding(0), Padding = new Padding(22, 28, 22, 20) };
            var heroTop = new TableLayoutPanel { Dock = DockStyle.Top, Height = 100, BackColor = Color.Transparent, RowCount = 3, ColumnCount = 1 };
            heroTop.Controls.Add(TextLabel("CRAZY_BATTO\nDISCORD APP", 17, FontStyle.Bold), 0, 0);
            heroTop.Controls.Add(TextLabel("DEINE FREIGABE.\nDEINE COMMUNITY.", 10, FontStyle.Bold), 0, 1);
            hero.Controls.Add(heroTop);
            var heroFoot = TextLabel("BETREIBER-VERWALTUNG\nVersion 2.2.0", 9, FontStyle.Regular); heroFoot.Dock = DockStyle.Bottom; heroFoot.Height = 46; hero.Controls.Add(heroFoot); root.Controls.Add(hero, 0, 0);

            var scrollArea = new Panel { Dock = DockStyle.Fill, AutoScroll = true, Margin = new Padding(0) };
            var main = new TableLayoutPanel { Dock = DockStyle.Top, ColumnCount = 1, RowCount = 8, Height = 750, Padding = new Padding(24, 20, 24, 12), Margin = new Padding(0) };
            navigation = new TabControl { Dock = DockStyle.Fill }; SiteUi.StyleTabs(navigation);
            var accessPage = new TabPage("Zugänge") { BackColor = Canvas }; navigation.TabPages.Add(accessPage);
            scrollArea.Controls.Add(main); accessPage.Controls.Add(scrollArea); root.Controls.Add(navigation, 1, 0);
            Action fitContent = () => { var minimumContentHeight = (int)Math.Ceiling(750 * DeviceDpi / 96.0); main.Height = Math.Max(minimumContentHeight, scrollArea.ClientSize.Height); };
            scrollArea.SizeChanged += (s, e) => fitContent(); DpiChanged += (s, e) => fitContent();
            foreach (var height in new float[] { 65, 122, 48, 38 }) main.RowStyles.Add(new RowStyle(SizeType.Absolute, height));
            main.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); main.RowStyles.Add(new RowStyle(SizeType.Absolute, 168)); main.RowStyles.Add(new RowStyle(SizeType.Absolute, 34)); main.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
            var titleArea = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2, Margin = new Padding(0) };
            titleArea.Controls.Add(TextLabel("Zugänge verwalten", 24, FontStyle.Bold), 0, 0);
            titleArea.Controls.Add(TextLabel("Du entscheidest, wer Crazy_Batto Discord App verwenden darf.", 10, FontStyle.Regular, Muted), 0, 1); main.Controls.Add(titleArea, 0, 0);

            var connection = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 3, BackColor = Card, Padding = new Padding(12, 8, 12, 8), Margin = new Padding(0, 5, 0, 8) };
            connection.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); connection.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 116)); connection.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 154));
            connection.RowStyles.Add(new RowStyle(SizeType.Absolute, 26)); connection.RowStyles.Add(new RowStyle(SizeType.Absolute, 33)); connection.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            accountLabel = TextLabel("1. Server verbinden · 2. Mit deinem Discord-Konto anmelden", 10, FontStyle.Bold); connection.Controls.Add(accountLabel, 0, 0); connection.SetColumnSpan(accountLabel, 3);
            originBox = Input(); originBox.Text = state.Origin ?? ""; originBox.AccessibleName = "HTTPS-Serveradresse"; connection.Controls.Add(originBox, 0, 1);
            connectButton = Button("Verbinden", false); connectButton.Click += async (s, e) => await Run(Connect); connection.Controls.Add(connectButton, 1, 1);
            loginButton = Button("Mit Discord anmelden", true); loginButton.Click += async (s, e) => await Run(BeginLogin); connection.Controls.Add(loginButton, 2, 1);
            var statusFlow = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 1, Margin = new Padding(0, 3, 0, 0) };
            statusFlow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); statusFlow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 115)); statusFlow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 94));
            statusLabel = TextLabel("HTTPS-Adresse deines Servers eintragen.", 9, FontStyle.Regular, Muted); statusLabel.AutoSize = false; statusLabel.Dock = DockStyle.Fill; statusLabel.AutoEllipsis = true; statusFlow.Controls.Add(statusLabel, 0, 0);
            browserButton = Button("Browser öffnen", false); browserButton.Visible = false; browserButton.Click += (s, e) => ReopenBrowser(); statusFlow.Controls.Add(browserButton, 1, 0);
            cancelButton = Button("Abbrechen", false); cancelButton.Visible = false; cancelButton.Click += async (s, e) => await Run(CancelLogin); statusFlow.Controls.Add(cancelButton, 2, 0);
            connection.Controls.Add(statusFlow, 0, 2); connection.SetColumnSpan(statusFlow, 3); main.Controls.Add(connection, 0, 1);

            var filters = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 4, RowCount = 1, Margin = new Padding(0, 6, 0, 6) };
            filters.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 183)); filters.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); filters.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 115)); filters.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 105));
            filterBox = new ComboBox { Dock = DockStyle.Fill, DropDownStyle = ComboBoxStyle.DropDownList, FlatStyle = FlatStyle.Flat, BackColor = Card, ForeColor = Ink, AccessibleName = "Status filtern" };
            filterBox.Items.AddRange(new object[] { "Offene Anfragen", "Alle Registrierungen", "Freigegeben", "Abgelehnt", "Gesperrt" }); filterBox.SelectedIndex = 0; filterBox.SelectedIndexChanged += (s, e) => RenderRows(); filters.Controls.Add(filterBox, 0, 0);
            searchBox = Input(); searchBox.AccessibleName = "Nach Name, Discord-ID oder Notiz suchen"; searchBox.TextChanged += (s, e) => RenderRows(); searchBox.HandleCreated += (s, e) => SetCueBanner(searchBox.Handle, 0x1501, IntPtr.Zero, "Name, Discord-ID oder Notiz suchen"); filters.Controls.Add(searchBox, 1, 0);
            refreshButton = Button("Aktualisieren", false); refreshButton.Click += async (s, e) => await Run(() => Refresh(true)); filters.Controls.Add(refreshButton, 2, 0);
            logoutButton = Button("Abmelden", false); logoutButton.Click += async (s, e) => await Run(Logout); filters.Controls.Add(logoutButton, 3, 0); main.Controls.Add(filters, 0, 2);
            countsLabel = TextLabel("Melde dich als Betreiber an, um Anfragen zu sehen.", 10, FontStyle.Bold, Muted); countsLabel.Dock = DockStyle.Fill; main.Controls.Add(countsLabel, 0, 3);

            grid = new DataGridView { Dock = DockStyle.Fill, BackgroundColor = Card, BorderStyle = BorderStyle.None, GridColor = Line, AllowUserToAddRows = false, AllowUserToDeleteRows = false, AllowUserToResizeRows = false, ReadOnly = true, MultiSelect = false, RowHeadersVisible = false, SelectionMode = DataGridViewSelectionMode.FullRowSelect, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, EnableHeadersVisualStyles = false, Margin = new Padding(0), AccessibleName = "Registrierungen" };
            grid.ColumnHeadersDefaultCellStyle = new DataGridViewCellStyle { BackColor = Color.FromArgb(36, 38, 45), ForeColor = Muted, Font = new Font(Font.FontFamily, 9, FontStyle.Bold), Padding = new Padding(7, 0, 0, 0) };
            grid.DefaultCellStyle = new DataGridViewCellStyle { BackColor = Card, ForeColor = Ink, SelectionBackColor = Color.FromArgb(64, 35, 43), SelectionForeColor = Ink, Padding = new Padding(7, 3, 0, 3) };
            grid.ColumnHeadersHeight = 33; grid.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing; grid.RowTemplate.Height = 48;
            grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Name", HeaderText = "DISCORD-KONTO", FillWeight = 29, SortMode = DataGridViewColumnSortMode.NotSortable, DefaultCellStyle = new DataGridViewCellStyle { WrapMode = DataGridViewTriState.True } });
            grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "DiscordId", HeaderText = "DISCORD-ID", FillWeight = 26, SortMode = DataGridViewColumnSortMode.NotSortable });
            grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Status", HeaderText = "STATUS", FillWeight = 24, SortMode = DataGridViewColumnSortMode.NotSortable });
            grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Requested", HeaderText = "ANGEFRAGT", FillWeight = 21, SortMode = DataGridViewColumnSortMode.NotSortable });
            grid.SelectionChanged += (s, e) => SelectRow(); main.Controls.Add(grid, 0, 4);

            var details = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 4, BackColor = Card, Padding = new Padding(12, 9, 12, 10), Margin = new Padding(0, 9, 0, 0) };
            details.RowStyles.Add(new RowStyle(SizeType.Absolute, 25)); details.RowStyles.Add(new RowStyle(SizeType.Absolute, 23)); details.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); details.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
            selectedLabel = TextLabel("Wähle eine Anfrage aus", 12, FontStyle.Bold); details.Controls.Add(selectedLabel, 0, 0);
            detailsLabel = TextLabel("Die bestätigte Discord-ID wird vor deiner Entscheidung angezeigt.", 9, FontStyle.Regular, Muted); details.Controls.Add(detailsLabel, 0, 1);
            noteBox = Input(); noteBox.Multiline = true; noteBox.ReadOnly = true; noteBox.TabStop = false; noteBox.ScrollBars = ScrollBars.Vertical; noteBox.BorderStyle = BorderStyle.None; noteBox.BackColor = Card; noteBox.AccessibleName = "Nachricht und bisherige Entscheidung"; details.Controls.Add(noteBox, 0, 2);
            var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false, Margin = new Padding(0, 5, 0, 0) };
            approveButton = Button("Freigeben …", true); approveButton.Width = 128; approveButton.Click += async (s, e) => await Run(() => Decide("approve"));
            rejectButton = Button("Ablehnen …", false); rejectButton.Width = 128; rejectButton.Click += async (s, e) => await Run(() => Decide("reject"));
            revokeButton = Button("Zugang sperren …", false); revokeButton.Width = 158; revokeButton.Click += async (s, e) => await Run(() => Decide("revoke"));
            actions.Controls.AddRange(new Control[] { approveButton, rejectButton, revokeButton }); details.Controls.Add(actions, 0, 3); main.Controls.Add(details, 0, 5);

            var preferences = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false, Margin = new Padding(0, 6, 0, 0) };
            autostartBox = new CheckBox { Text = "Mit Windows starten", AutoSize = true, ForeColor = Muted, Margin = new Padding(0, 4, 20, 0) };
            try { autostartBox.Checked = AutoStart.Enabled; if (autostartBox.Checked) AutoStart.Set(true, Application.ExecutablePath); } catch { autostartBox.Checked = false; }
            autostartBox.CheckedChanged += (s, e) => SetAutostart(); preferences.Controls.Add(autostartBox);
            closeToTrayBox = new CheckBox { Text = "Beim Schließen im Infobereich weiterlaufen", AutoSize = true, Checked = state.MinimizeToTray, ForeColor = Muted, Margin = new Padding(0, 4, 0, 0) };
            closeToTrayBox.CheckedChanged += (s, e) => { state.MinimizeToTray = closeToTrayBox.Checked; SavePreference(); }; preferences.Controls.Add(closeToTrayBox); main.Controls.Add(preferences, 0, 6);
            footerLabel = TextLabel("Neue Anfragen werden bei laufender App alle 15 Sekunden geprüft.", 8.7f, FontStyle.Regular, Muted); main.Controls.Add(footerLabel, 0, 7);

            siteEditor = new SiteEditor(SiteAuthError);
            var sitePage = new TabPage("Webseite") { BackColor = Canvas }; sitePage.Controls.Add(siteEditor); navigation.TabPages.Add(sitePage);
            navigation.SelectedIndexChanged += async (s, e) => { if (navigation.SelectedIndex == 1) await siteEditor.ActivatePage(); };

            var menu = new ContextMenuStrip { BackColor = Card, ForeColor = Ink };
            menu.Items.Add("Verwaltung öffnen", null, (s, e) => ShowWindow());
            menu.Items.Add("Jetzt aktualisieren", null, async (s, e) => { if (owner) await Run(() => Refresh(true)); });
            menu.Items.Add(new ToolStripSeparator()); menu.Items.Add("Beenden", null, (s, e) => { exiting = true; Close(); });
            tray = new NotifyIcon { Icon = Icon, Text = "Crazy_Batto Discord App · Verwaltung", ContextMenuStrip = menu, Visible = true };
            tray.DoubleClick += (s, e) => ShowWindow(); tray.BalloonTipClicked += (s, e) => { navigation.SelectedIndex = 0; filterBox.SelectedIndex = 0; ShowWindow(); };
            Resize += (s, e) => { if (WindowState == FormWindowState.Minimized) Hide(); };
            FormClosing += OnWindowClosing; FormClosed += (s, e) => { lifetime.Cancel(); authTimer.Stop(); pollTimer.Stop(); tray.Visible = false; tray.Dispose(); client?.Dispose(); heroImage?.Dispose(); statusTip.Dispose(); };
            authTimer.Tick += async (s, e) => { if (!busy && !String.IsNullOrEmpty(state.LoginId)) await Run(PollLogin, true); };
            pollTimer.Tick += async (s, e) => { if (!busy && owner && Policy.Now >= nextPollAt) await Run(() => Refresh(false), true); };
            Shown += async (s, e) => { if (startMinimized) Hide(); await Run(Startup); };
            UpdateButtons();
        }
        private static Label TextLabel(string text, float size, FontStyle style, Color? color = null)
        { return new Label { Text = text, Font = new Font("Segoe UI", size, style), ForeColor = color ?? Ink, BackColor = Color.Transparent, AutoSize = true, Margin = new Padding(0), Anchor = AnchorStyles.Left, AutoEllipsis = true }; }
        private static TextBox Input()
        { return new TextBox { Dock = DockStyle.Fill, BackColor = Color.FromArgb(38, 40, 48), ForeColor = Ink, BorderStyle = BorderStyle.FixedSingle, Margin = new Padding(0, 3, 8, 3), MaxLength = 500 }; }
        private static Button Button(string text, bool primary)
        { var b = new Button { Text = text, Dock = DockStyle.Fill, FlatStyle = FlatStyle.Flat, BackColor = primary ? Red : Color.FromArgb(41, 43, 52), ForeColor = Ink, Cursor = Cursors.Hand, Margin = new Padding(0, 0, 8, 0), Height = 30, Font = new Font("Segoe UI", 9, primary ? FontStyle.Bold : FontStyle.Regular), AutoEllipsis = true }; b.FlatAppearance.BorderSize = 0; return b; }
        [System.Runtime.InteropServices.DllImport("user32.dll", EntryPoint = "SendMessageW", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
        private static extern IntPtr SetCueBanner(IntPtr handle, int message, IntPtr parameter, string value);
        private bool PendingLogin { get { return !String.IsNullOrEmpty(state.LoginId); } }
        private bool HasSession { get { return Policy.ValidToken(state.SessionToken); } }
        private Registration Selected { get { return selectedId == null ? null : rows.FirstOrDefault(r => r.UserId == selectedId); } }
        private void Status(string message, Color? color = null) { statusLabel.Text = message; statusLabel.ForeColor = color ?? Muted; statusTip.SetToolTip(statusLabel, message); }
        private void ResetClient() { client?.Dispose(); client = String.IsNullOrEmpty(state.Origin) ? null : new ApiClient(state.Origin, state.SessionToken); }
        private void ClearLogin() { state.LoginId = null; state.LoginVerifier = null; state.LoginCode = null; state.LoginExpiresAt = 0; authTimer.Stop(); }
        private void ClearSession()
        { state.SessionToken = null; state.UserId = null; state.ExpiresAt = 0; owner = false; fresh = false; revision = -1; rows.Clear(); selectedId = null; pollTimer.Stop(); siteEditor?.BindContext(client, state.Origin, false); RenderRows(); countsLabel.Text = "Melde dich als Betreiber an, um Anfragen zu sehen."; tray.Text = "Crazy_Batto Discord App · Verwaltung"; }
        private void SiteAuthError(ApiException error)
        {
            fresh = false;
            if (error.Status == 401) { ClearSession(); ClearLogin(); TrySaveState(); ResetClient(); accountLabel.Text = "Bitte erneut mit deinem Discord-Konto anmelden."; }
            else { owner = false; pollTimer.Stop(); rows.Clear(); selectedId = null; siteEditor.BindContext(client, state.Origin, false); RenderRows(); countsLabel.Text = "Nur das hinterlegte Betreiberkonto kann Zugänge und Webseite verwalten."; accountLabel.Text = "Für dieses Konto ist keine Betreiber-Verwaltung verfügbar."; }
            Status(error.Message, Amber); UpdateButtons();
        }
        private async Task Run(Func<Task> work, bool background = false)
        {
            if (busy || exiting || IsDisposed) return;
            busy = true; UpdateButtons();
            try { await work(); }
            catch (OperationCanceledException) { }
            catch (ApiException error)
            {
                fresh = false;
                if (error.Kind == "auth" || error.Status == 401)
                { ClearSession(); ClearLogin(); TrySaveState(); ResetClient(); accountLabel.Text = "Bitte erneut mit deinem Discord-Konto anmelden."; }
                else if (error.Kind == "forbidden" || error.Kind == "access" || error.Status == 403)
                { owner = false; pollTimer.Stop(); rows.Clear(); selectedId = null; RenderRows(); countsLabel.Text = "Nur das hinterlegte Betreiberkonto kann Zugänge verwalten."; accountLabel.Text = "Für dieses Konto ist keine Betreiber-Verwaltung verfügbar."; }
                nextPollAt = Policy.Now + Math.Max(15000, Math.Min(10 * 60 * 1000, error.RetryAfterMs));
                if (PendingLogin && error.Kind == "rate_limited") authTimer.Interval = (int)Math.Max(3000, Math.Min(10 * 60 * 1000, error.RetryAfterMs));
                Status(error.Message, Amber);
                if (!background && error.Kind == "conflict") MessageBox.Show(this, "Diese Anfrage wurde inzwischen geändert. Bitte die aktuelle Liste neu laden und den Status prüfen.", "Anfrage geändert", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (ArgumentException error) { Status(error.Message, Amber); }
            catch (Exception)
            { fresh = false; Status("Die Aktion konnte nicht abgeschlossen werden. Bitte den lokalen Speicher prüfen und erneut aktualisieren.", Amber); }
            finally { if (!IsDisposed) { busy = false; UpdateButtons(); } }
        }
        private async Task Startup()
        {
            if (initialError != null) { Status(initialError, Amber); return; }
            if (String.IsNullOrEmpty(state.Origin)) return;
            ResetClient();
            if (HasSession && state.ExpiresAt > Policy.Now) { if (PendingLogin) { ClearLogin(); vault.Save(state); } await VerifyOwner(); return; }
            if (PendingLogin && state.LoginExpiresAt > Policy.Now) { accountLabel.Text = "Discord-Anmeldung fortsetzen · Gerätecode " + state.LoginCode; authTimer.Start(); await PollLogin(); return; }
            if (PendingLogin) { ClearLogin(); vault.Save(state); }
            if (HasSession) { ClearSession(); vault.Save(state); ResetClient(); }
            await CheckHealth();
        }
        private async Task Connect()
        {
            var next = Policy.Origin(originBox.Text);
            if (HasSession || PendingLogin) throw new ArgumentException("Bitte zuerst abmelden, bevor du die Serveradresse änderst.");
            if (state.Origin != next) { state.NotifiedPending = null; state.Origin = next; vault.Save(state); }
            originBox.Text = next; ResetClient(); await CheckHealth();
        }
        private async Task CheckHealth()
        {
            if (client == null) throw new ArgumentException("Bitte zuerst die HTTPS-Serveradresse speichern.");
            serverReady = false;
            Status("Server wird geprüft …"); var result = await client.Health(lifetime.Token);
            if (result.App != "Modstempel" || result.ApiVersion != 2) throw new ApiException("network", "Unter dieser Adresse antwortet kein passender Server für Crazy_Batto Discord App.");
            if (!result.AccessControl) throw new ApiException("unconfigured", "Dieser Server unterstützt noch keine Betreiberfreigabe. Bitte das Serverpaket 2.2 installieren.");
            if (!result.Configured) throw new ApiException("unconfigured", result.Message ?? "Der Server ist erreichbar. Die Discord-Anmeldung und das Betreiberkonto müssen dort noch eingerichtet werden.");
            serverReady = true;
            Status("Server erreichbar. Jetzt mit deinem Betreiberkonto anmelden.", Green); accountLabel.Text = "Server verbunden · Anmeldung mit Discord";
        }
        private async Task BeginLogin()
        {
            if (client == null || state.Origin != Policy.Origin(originBox.Text)) throw new ArgumentException("Bitte die Serveradresse zuerst mit „Verbinden“ speichern.");
            if (HasSession) { await VerifyOwner(); return; }
            if (!serverReady) throw new ApiException("unconfigured", "Bitte zuerst einen eingerichteten Server ab Version 2.2 verbinden.");
            var verifier = Policy.NewVerifier(); var result = await client.Start(Policy.Hash(verifier), lifetime.Token);
            var url = Policy.AuthorizeUri(state.Origin, result);
            state.LoginId = result.LoginId; state.LoginVerifier = verifier; state.LoginCode = result.DisplayCode; state.LoginExpiresAt = result.ExpiresAt;
            try { vault.Save(state); }
            catch { ClearLogin(); throw; }
            authTimer.Interval = Math.Max(3000, Math.Min(15000, result.IntervalMs)); authTimer.Start();
            accountLabel.Text = "Discord im Browser bestätigen · Gerätecode " + state.LoginCode;
            Status("Vergleiche den Gerätecode im Browser. Die Anmeldung wird automatisch übernommen.");
            Program.OpenBrowser(url);
        }
        private void ReopenBrowser()
        {
            if (!PendingLogin || busy) return;
            try { Program.OpenBrowser(Policy.AuthorizeUri(state.Origin, new LoginStart { LoginId = state.LoginId, AuthorizePath = "/oauth/start/" + state.LoginId, DisplayCode = state.LoginCode, ExpiresAt = state.LoginExpiresAt })); }
            catch (Exception error) { Status(error.Message, Amber); }
        }
        private async Task PollLogin()
        {
            if (state.LoginExpiresAt <= Policy.Now) { ClearLogin(); vault.Save(state); Status("Die Geräteanmeldung ist abgelaufen. Bitte erneut mit Discord anmelden.", Amber); return; }
            var reply = await client.Poll(new ClaimRequest { LoginId = state.LoginId, Verifier = state.LoginVerifier }, lifetime.Token);
            if (reply.Status == "pending") { authTimer.Interval = Math.Max(3000, Math.Min(15000, reply.IntervalMs)); return; }
            if (reply.Status != "authorized" || !Policy.ValidToken(reply.SessionToken) || reply.User == null || !Policy.ValidId(reply.User.Id) || reply.ExpiresAt <= Policy.Now)
                throw new ApiException("network", "Der Server hat keine gültige Anmeldung bestätigt.");
            var previous = state.UserId;
            state.SessionToken = reply.SessionToken; state.UserId = reply.User.Id; state.ExpiresAt = reply.ExpiresAt;
            if (previous != reply.User.Id) state.NotifiedPending = null;
            // Persist the one-time claim before clearing its verifier or showing a successful login.
            try { vault.Save(state); } catch { state.SessionToken = null; state.UserId = previous; state.ExpiresAt = 0; throw; }
            ClearLogin(); ResetClient(); vault.Save(state); await VerifyOwner();
        }
        private async Task CancelLogin()
        {
            var claim = new ClaimRequest { LoginId = state.LoginId, Verifier = state.LoginVerifier };
            bool acknowledged = false;
            try { await client.Cancel(claim, lifetime.Token); acknowledged = true; }
            finally { ClearLogin(); vault.Save(state); accountLabel.Text = "Discord-Anmeldung abgebrochen"; Status(acknowledged ? "Du kannst eine neue Anmeldung starten." : "Lokal abgebrochen. Die serverseitige Anmeldung läuft spätestens nach zehn Minuten ab."); }
        }
        private async Task VerifyOwner()
        {
            var session = await client.Session(lifetime.Token); Policy.ValidateOwner(session);
            if (session.User.Id != state.UserId) throw new ApiException("auth", "Die bestätigte Anmeldung gehört zu einem anderen Konto. Bitte neu anmelden.", 401);
            state.ExpiresAt = session.ExpiresAt; vault.Save(state);
            owner = true; serverReady = true; pollTimer.Start(); accountLabel.Text = "Betreiber: " + Policy.Display(session.User.DisplayName ?? session.User.Username, 60) + " · " + session.User.Id;
            await Refresh(true);
        }
        private async Task Refresh(bool force)
        {
            if (!owner) throw new ApiException("forbidden", "Bitte zuerst mit dem Betreiberkonto anmelden.", 403);
            if (state.ExpiresAt <= Policy.Now) throw new ApiException("auth", "Die Anmeldung ist abgelaufen. Bitte erneut anmelden.", 401);
            var expectedClient = client;
            if (!force)
            {
                var summary = await client.Summary(lifetime.Token);
                if (!owner || !ReferenceEquals(client, expectedClient)) return;
                if (summary.Revision < 0 || summary.Counts == null || summary.PendingCount < 0) throw new ApiException("network", "Die Anfragen konnten nicht abgeglichen werden.");
                if (summary.Revision == revision && fresh) { UpdateLastSync(); return; }
            }
            Status("Registrierungen werden abgeglichen …");
            var snapshot = await client.ReadSnapshot(lifetime.Token);
            if (!owner || !ReferenceEquals(client, expectedClient)) return;
            rows = snapshot.Rows; revision = snapshot.Revision; fresh = true;
            countsLabel.Text = snapshot.Counts.Pending + " offen    ·    " + snapshot.Counts.Approved + " freigegeben    ·    " + snapshot.Counts.Rejected + " abgelehnt    ·    " + snapshot.Counts.Revoked + " gesperrt";
            NotifyPending(); RenderRows(); UpdateLastSync();
        }
        private void UpdateLastSync()
        {
            Status("Verbunden · zuletzt geprüft um " + DateTime.Now.ToString("HH:mm:ss") + " Uhr", Green);
            footerLabel.Text = "Prüfung alle 15 Sekunden · Neue Anfragen bleiben auch bei ausgeschaltetem PC auf dem Server erhalten.";
            tray.Text = "Crazy_Batto · " + rows.Count(r => r.Status == "pending") + " offene Anfragen";
        }
        private void NotifyPending()
        {
            var newRows = Policy.NewPending(rows, state.NotifiedPending);
            if (newRows.Count > 0)
            {
                var text = newRows.Count == 1 ? Policy.Display(newRows[0].User.DisplayName ?? newRows[0].User.Username, 60) + " wartet auf deine Freigabe." : newRows.Count + " neue Registrierungen warten auf deine Freigabe.";
                tray.ShowBalloonTip(8000, "Crazy_Batto Discord App · Neue Anfrage", text + " Zum Prüfen hier klicken.", ToolTipIcon.Info);
            }
            state.NotifiedPending = rows.Where(r => r.Status == "pending").Select(Policy.Fingerprint).ToList();
            vault.Save(state);
        }
        private void RenderRows()
        {
            if (grid == null || searchBox == null || filterBox == null) return;
            var keep = selectedId; var filter = new[] { "pending", "all", "approved", "rejected", "revoked" }[Math.Max(0, filterBox.SelectedIndex)];
            grid.SuspendLayout(); grid.Rows.Clear();
            foreach (var row in rows.Where(r => Policy.Matches(r, filter, searchBox.Text)))
            {
                var i = grid.Rows.Add(Policy.Display(row.User.DisplayName ?? row.User.Username, 80) + "\n@" + Policy.Display(row.User.Username, 80), row.UserId, Policy.Status(row.Status), Policy.When(row.RequestedAt));
                grid.Rows[i].Tag = row.UserId; grid.Rows[i].Cells[2].Style.ForeColor = row.Status == "pending" ? Amber : row.Status == "approved" ? Green : Muted;
            }
            grid.ClearSelection(); selectedId = null;
            foreach (DataGridViewRow row in grid.Rows) if ((string)row.Tag == keep) { row.Selected = true; grid.CurrentCell = row.Cells[0]; selectedId = keep; break; }
            grid.ResumeLayout(); SelectRow();
            if (grid.Rows.Count == 0 && owner) { selectedLabel.Text = rows.Count == 0 ? "Noch keine Registrierungen" : "Keine passenden Anfragen"; detailsLabel.Text = "Teile die Portaladresse deines Servers, damit sich Nutzer registrieren können."; }
        }
        private void SelectRow()
        {
            if (grid == null || selectedLabel == null) return;
            selectedId = grid.SelectedRows.Count > 0 ? grid.SelectedRows[0].Tag as string : null; var row = Selected;
            if (row == null) { selectedLabel.Text = "Wähle eine Anfrage aus"; detailsLabel.Text = "Die bestätigte Discord-ID wird vor deiner Entscheidung angezeigt."; noteBox.Text = ""; }
            else
            {
                selectedLabel.Text = Policy.Display(row.User.DisplayName ?? row.User.Username, 70) + " · " + Policy.Status(row.Status);
                detailsLabel.Text = "Discord-ID: " + row.UserId + " · Angefragt: " + Policy.When(row.RequestedAt) + (row.ReviewedAt.HasValue ? " · Entscheidung: " + Policy.When(row.ReviewedAt) : "");
                noteBox.Text = "Anfrage: " + (String.IsNullOrWhiteSpace(row.Note) ? "Keine Nachricht hinterlegt." : Policy.Display(row.Note)) + (String.IsNullOrWhiteSpace(row.Reason) ? "" : "\r\nDein bisheriger Hinweis: " + Policy.Display(row.Reason));
            }
            UpdateButtons();
        }
        private async Task Decide(string action)
        {
            var row = Selected;
            if (!owner || !fresh || !Policy.CanDecide(row, action)) throw new ArgumentException("Bitte die Liste aktualisieren und eine passende Anfrage auswählen.");
            using (var dialog = new DecisionDialog(row, action))
            {
                if (dialog.ShowDialog(this) != DialogResult.OK) return;
                try
                {
                    var reply = await client.Decide(row, action, dialog.Reason, lifetime.Token);
                    Policy.ValidateRegistration(reply.Registration);
                    var target = action == "approve" ? "approved" : action == "reject" ? "rejected" : "revoked";
                    if (reply.Registration.UserId != row.UserId || reply.Registration.Status != target || reply.Registration.Version != row.Version + 1)
                        throw new ApiException("uncertain", "Die Entscheidung ist nicht eindeutig bestätigt. Bitte erst die Liste aktualisieren und den Status prüfen.");
                    fresh = false;
                    await Refresh(true);
                    Status("Entscheidung gespeichert: " + Policy.Status(reply.Registration.Status) + ".", Green);
                }
                catch (ApiException error)
                {
                    fresh = false;
                    if (error.Kind == "conflict" || error.Status == 409)
                    { await Refresh(true); Status("Die Anfrage wurde inzwischen geändert. Der aktuelle Status wurde geladen. Bitte erneut prüfen.", Amber); return; }
                    throw;
                }
            }
        }
        private async Task Logout()
        {
            if (siteEditor.HasUnsavedChanges && MessageBox.Show(this, "Deine nicht gespeicherten Website-Änderungen verwerfen und abmelden? Bereits auf dem Server gespeicherte Entwürfe und Bilder bleiben erhalten.", "Abmelden", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
            bool acknowledged = false;
            try { if (HasSession) { await client.Logout(lifetime.Token); acknowledged = true; } }
            finally
            {
                ClearSession(); ClearLogin(); vault.Save(state); ResetClient(); accountLabel.Text = "Lokal abgemeldet";
                Status(acknowledged ? "Die Server-Sitzung wurde beendet. Du kannst dich erneut anmelden." : "Lokal abgemeldet. Die serverseitige Abmeldung konnte nicht bestätigt werden.", acknowledged ? Green : Amber);
            }
        }
        private void UpdateButtons()
        {
            if (connectButton == null) return;
            originBox.ReadOnly = HasSession || PendingLogin || busy;
            connectButton.Enabled = !busy && !HasSession && !PendingLogin;
            loginButton.Enabled = !busy && client != null && !PendingLogin && !owner && (serverReady || HasSession);
            loginButton.Text = HasSession ? "Konto prüfen" : "Mit Discord anmelden";
            logoutButton.Enabled = !busy && HasSession;
            refreshButton.Enabled = !busy && owner;
            cancelButton.Visible = PendingLogin; cancelButton.Enabled = !busy;
            browserButton.Visible = PendingLogin; browserButton.Enabled = !busy;
            filterBox.Enabled = owner; searchBox.Enabled = owner;
            approveButton.Enabled = !busy && owner && fresh && Policy.CanDecide(Selected, "approve");
            rejectButton.Enabled = !busy && owner && fresh && Policy.CanDecide(Selected, "reject");
            revokeButton.Enabled = !busy && owner && fresh && Policy.CanDecide(Selected, "revoke");
            autostartBox.Enabled = !busy; closeToTrayBox.Enabled = !busy;
            siteEditor?.BindContext(client, state.Origin, owner && HasSession);
            Cursor = busy ? Cursors.AppStarting : Cursors.Default;
        }
        private void SetAutostart()
        {
            if (checkboxGuard) return;
            try { AutoStart.Set(autostartBox.Checked, Application.ExecutablePath); }
            catch { checkboxGuard = true; autostartBox.Checked = !autostartBox.Checked; checkboxGuard = false; Status("Der Windows-Autostart konnte nicht geändert werden.", Amber); }
        }
        private void SavePreference() { if (!TrySaveState()) Status("Die Einstellung konnte auf diesem PC nicht gespeichert werden.", Amber); }
        private bool TrySaveState() { try { vault.Save(state); return true; } catch { return false; } }
        private void ShowWindow() { Show(); WindowState = FormWindowState.Normal; Activate(); }
        private void OnWindowClosing(object sender, FormClosingEventArgs e)
        {
            if (!exiting && e.CloseReason == CloseReason.UserClosing && state.MinimizeToTray)
            {
                e.Cancel = true; Hide();
                if (!state.TrayNoticeShown) { tray.ShowBalloonTip(6000, "Crazy_Batto Discord App läuft weiter", "Neue Anfragen werden weiter geprüft. Über das Symbol neben der Uhr kannst du die Verwaltung öffnen oder beenden.", ToolTipIcon.Info); state.TrayNoticeShown = true; TrySaveState(); }
            }
            else
            {
                if (e.CloseReason == CloseReason.UserClosing && siteEditor.HasUnsavedChanges && MessageBox.Show(this, "Die Verwaltung beenden und nicht gespeicherte Website-Änderungen verwerfen? Bereits gespeicherte Entwürfe und hochgeladene Bilder bleiben auf dem Server.", "Verwaltung beenden", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) != DialogResult.Yes)
                { e.Cancel = true; exiting = false; return; }
                exiting = true; lifetime.Cancel();
            }
        }
    }
    internal sealed class HeroPanel : Panel
    {
        private readonly Image image;
        internal HeroPanel(Image value) { image = value; DoubleBuffered = true; }
        protected override void OnPaintBackground(PaintEventArgs e)
        {
            e.Graphics.Clear(Color.FromArgb(13, 13, 16));
            if (image != null)
            {
                var ratio = Math.Max((double)Width / image.Width, (double)Height / image.Height);
                var width = (int)Math.Ceiling(image.Width * ratio); var height = (int)Math.Ceiling(image.Height * ratio);
                e.Graphics.DrawImage(image, new Rectangle((Width - width) / 2, (Height - height) / 2, width, height));
                using (var shade = new System.Drawing.Drawing2D.LinearGradientBrush(ClientRectangle, Color.FromArgb(185, 0, 0, 0), Color.FromArgb(145, 0, 0, 0), 90f)) e.Graphics.FillRectangle(shade, ClientRectangle);
            }
        }
    }
    internal sealed class DecisionDialog : Form
    {
        private readonly TextBox reason;
        internal string Reason { get { return reason.Text; } }
        internal DecisionDialog(Registration row, string action)
        {
            var verb = action == "approve" ? "Freigabe erteilen" : action == "reject" ? "Anfrage ablehnen" : "Zugang sperren";
            Text = "Crazy_Batto Discord App · " + verb; Size = new Size(540, 415); MinimumSize = Size; MaximumSize = new Size(780, 560); FormBorderStyle = FormBorderStyle.FixedDialog; StartPosition = FormStartPosition.CenterParent; MaximizeBox = false; MinimizeBox = false; ShowInTaskbar = false; AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(22, 23, 29); ForeColor = Color.WhiteSmoke; Font = new Font("Segoe UI", 10);
            var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(24), RowCount = 6, ColumnCount = 1 };
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 55)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 54)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 24)); layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40)); Controls.Add(layout);
            layout.Controls.Add(new Label { Text = verb, Font = new Font("Segoe UI", 18, FontStyle.Bold), Dock = DockStyle.Fill }, 0, 0);
            layout.Controls.Add(new Label { Text = Policy.Display(row.User.DisplayName ?? row.User.Username, 70) + " (@" + Policy.Display(row.User.Username, 70) + ")\nDiscord-ID: " + row.UserId, Dock = DockStyle.Fill }, 0, 1);
            var effect = action == "approve" ? "Dieses Konto darf anschließend die Android-App herunterladen und Crazy_Batto Discord App verwenden." : action == "reject" ? "Dieses Konto erhält keinen Download und keinen Zugang zur App. Du kannst es später freigeben." : "Neue Downloads und die Nutzung des Servers werden für dieses Konto gesperrt. Du kannst es später wieder freigeben.";
            layout.Controls.Add(new Label { Text = effect, Dock = DockStyle.Fill, ForeColor = Color.FromArgb(196, 199, 210) }, 0, 2);
            layout.Controls.Add(new Label { Text = "Hinweis an diese Person (optional, maximal 500 Zeichen)", Dock = DockStyle.Fill, Font = new Font("Segoe UI", 9) }, 0, 3);
            reason = new TextBox { Dock = DockStyle.Fill, Multiline = true, ScrollBars = ScrollBars.Vertical, MaxLength = 500, BackColor = Color.FromArgb(38, 40, 48), ForeColor = Color.WhiteSmoke, BorderStyle = BorderStyle.FixedSingle, Margin = new Padding(0, 0, 0, 12) }; layout.Controls.Add(reason, 0, 4);
            var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
            var submit = new Button { Text = verb, Width = 190, Height = 33, DialogResult = DialogResult.OK, BackColor = Color.FromArgb(205, 50, 63), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
            var cancel = new Button { Text = "Abbrechen", Width = 108, Height = 33, DialogResult = DialogResult.Cancel, FlatStyle = FlatStyle.Flat };
            buttons.Controls.Add(submit); buttons.Controls.Add(cancel); layout.Controls.Add(buttons, 0, 5); AcceptButton = submit; CancelButton = cancel;
        }
    }
}
