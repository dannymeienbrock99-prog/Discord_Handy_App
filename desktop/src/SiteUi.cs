using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace Modstempel.Desktop
{
    internal static class SiteUi
    {
        internal static readonly Color Canvas = Color.FromArgb(16,17,21), Card = Color.FromArgb(27,29,35), Field = Color.FromArgb(38,40,48), Ink = Color.FromArgb(243,244,247), Muted = Color.FromArgb(169,174,187), Red = Color.FromArgb(205,50,63), Amber = Color.FromArgb(246,195,105), Green = Color.FromArgb(111,218,169);
        internal static Label Label(string text, float size = 10, bool bold = false)
        { return new Label { Text = text, AutoSize = true, ForeColor = Ink, Font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular), Margin = new Padding(0,6,8,6), MaximumSize = new Size(1300,0) }; }
        internal static TextBox Input(int length, bool multiline = false, int height = 34)
        { return new TextBox { Dock = DockStyle.Fill, ForeColor = Ink, BackColor = Field, BorderStyle = BorderStyle.FixedSingle, Multiline = multiline, ScrollBars = multiline ? ScrollBars.Vertical : ScrollBars.None, AcceptsReturn = multiline, MaxLength = length, Height = height, Margin = new Padding(0,4,0,8) }; }
        internal static Button Button(string text, bool primary = false, int width = 170)
        { var b = new Button { Text = text, AutoSize = false, Width = width, Height = 34, ForeColor = Ink, BackColor = primary ? Red : Field, FlatStyle = FlatStyle.Flat, Margin = new Padding(0,3,8,3), Cursor = Cursors.Hand }; b.FlatAppearance.BorderSize = 0; return b; }
        internal static FlowLayoutPanel Actions() { return new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, WrapContents = true, Margin = new Padding(0) }; }
        internal static TableLayoutPanel Fields(Control parent)
        {
            var scroll = new Panel { Dock = DockStyle.Fill, AutoScroll = true, BackColor = Canvas, Padding = new Padding(16) }; parent.Controls.Add(scroll);
            var table = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 1, Margin = new Padding(0), Padding = new Padding(0,0,0,20) };
            table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100)); scroll.Controls.Add(table); return table;
        }
        internal static void Row(TableLayoutPanel table, Control control, int height)
        { var n = table.RowCount++; table.RowStyles.Add(new RowStyle(SizeType.Absolute,height)); control.Dock = DockStyle.Fill; table.Controls.Add(control,0,n); }
        internal static void FieldRow(TableLayoutPanel table, string label, Control field, int height = 36)
        { Row(table, Label(label,9.5f,true),28); Row(table,field,height); }
        internal static PictureBox Picture(int height = 190)
        { return new PictureBox { Dock = DockStyle.Fill, Height = height, BackColor = Card, SizeMode = PictureBoxSizeMode.Zoom, BorderStyle = BorderStyle.FixedSingle, AccessibleName = "Bildvorschau" }; }
        internal static void SetPicture(PictureBox box, byte[] png)
        {
            Image next = null;
            if (png != null) using (var memory = new MemoryStream(png, false)) using (var image = Image.FromStream(memory)) next = new Bitmap(image);
            var previous = box.Image; box.Image = next; if (previous != null) previous.Dispose();
        }
        internal static void Theme(Form form)
        { form.BackColor = Canvas; form.ForeColor = Ink; form.Font = new Font("Segoe UI",10); form.AutoScaleMode = AutoScaleMode.Dpi; form.StartPosition = FormStartPosition.CenterParent; form.ShowInTaskbar = false; form.MinimizeBox = false; }
        internal static void StyleTabs(TabControl tabs)
        {
            tabs.DrawMode = TabDrawMode.OwnerDrawFixed; tabs.ItemSize = new Size(145,34); tabs.SizeMode = TabSizeMode.Fixed; tabs.Padding = new Point(12,6);
            tabs.DrawItem += (sender,e) => { var selected = e.Index == tabs.SelectedIndex; using (var brush = new SolidBrush(selected ? Field : Canvas)) e.Graphics.FillRectangle(brush,e.Bounds); TextRenderer.DrawText(e.Graphics,tabs.TabPages[e.Index].Text,tabs.Font,e.Bounds,selected ? Ink : Muted,TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter); };
        }
    }
}
