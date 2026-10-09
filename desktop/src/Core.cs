using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.Serialization.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Modstempel.Desktop
{
    public static class Json
    {
        public static byte[] Encode<T>(T value)
        {
            using (var stream = new MemoryStream()) { new DataContractJsonSerializer(typeof(T)).WriteObject(stream, value); return stream.ToArray(); }
        }
        public static T Decode<T>(byte[] bytes)
        {
            using (var stream = new MemoryStream(bytes, false)) return (T)new DataContractJsonSerializer(typeof(T)).ReadObject(stream);
        }
    }
    public static class Policy
    {
        public static long Now { get { return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(); } }
        public static bool ValidId(string value) { return value != null && Regex.IsMatch(value, "^[0-9]{17,20}$"); }
        public static bool ValidToken(string value) { return value != null && Regex.IsMatch(value, "^[A-Za-z0-9_-]{32,128}$"); }
        public static bool ValidLoginId(string value) { return value != null && Regex.IsMatch(value, "^[A-Za-z0-9_-]{16,128}$"); }
        public static string Origin(string raw)
        {
            var text = (raw ?? "").Trim(); Uri uri;
            if (text.Length > 300 || !Regex.IsMatch(text, "^https://[^/?#\\\\]+/?$", RegexOptions.IgnoreCase) || text.IndexOf('\\') >= 0 || text.Any(Char.IsWhiteSpace) || text.Any(Char.IsControl) ||
                !Uri.TryCreate(text, UriKind.Absolute, out uri) || uri.Scheme != "https" || uri.Port != 443 ||
                !String.IsNullOrEmpty(uri.UserInfo) || !String.IsNullOrEmpty(uri.Query) || !String.IsNullOrEmpty(uri.Fragment) ||
                uri.AbsolutePath != "/" || String.IsNullOrEmpty(uri.IdnHost) || uri.HostNameType == UriHostNameType.Unknown)
                throw new ArgumentException("Bitte die HTTPS-Serveradresse ohne zusätzlichen Pfad eingeben, z. B. https://modstempel.deine-domain.de.");
            return uri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
        }
        public static string NewVerifier()
        {
            var bytes = new byte[32]; using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes);
            return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        }
        public static string Hash(string value)
        {
            using (var sha = SHA256.Create()) return String.Concat(sha.ComputeHash(Encoding.UTF8.GetBytes(value)).Select(b => b.ToString("x2", CultureInfo.InvariantCulture)));
        }
        public static Uri AuthorizeUri(string origin, LoginStart login)
        {
            if (login == null || !ValidLoginId(login.LoginId) || login.AuthorizePath != "/oauth/start/" + login.LoginId ||
                String.IsNullOrEmpty(login.DisplayCode) || !Regex.IsMatch(login.DisplayCode, "^[A-Z0-9]{4}-[A-Z0-9]{4}$") ||
                login.ExpiresAt <= Now || login.ExpiresAt > Now + 11 * 60 * 1000)
                throw new ApiException("network", "Der Server hat keine gültige Geräteanmeldung geliefert.");
            return new Uri(Origin(origin) + login.AuthorizePath, UriKind.Absolute);
        }
        public static void ValidateOwner(SessionReply session)
        {
            if (session == null || session.User == null || !ValidId(session.User.Id) || session.ExpiresAt <= Now)
                throw new ApiException("auth", "Die Anmeldung ist nicht mehr gültig. Bitte neu mit Discord anmelden.", 401);
            if (session.Access == null || !session.Access.IsOwner || !session.Access.CanUseApp || session.Access.Status != "approved")
                throw new ApiException("forbidden", "Dieses Discord-Konto ist nicht als Betreiber freigegeben. Melde dich mit deinem Betreiberkonto an.", 403);
        }
        public static void ValidateRegistration(Registration row)
        {
            if (row == null || !ValidId(row.UserId) || row.User == null || row.User.Id != row.UserId || row.Version < 1 ||
                !new[] { "pending", "approved", "rejected", "revoked" }.Contains(row.Status) ||
                row.RequestedAt <= 0 || row.UpdatedAt <= 0)
                throw new ApiException("network", "Der Server hat eine unvollständige Anfrage geliefert. Bitte später aktualisieren.");
        }
        public static bool CanDecide(Registration row, string decision)
        {
            if (row == null) return false;
            return decision == "approve" && new[] { "pending", "rejected", "revoked" }.Contains(row.Status) ||
                   decision == "reject" && row.Status == "pending" || decision == "revoke" && row.Status == "approved";
        }
        public static DecisionRequest Decision(Registration row, string decision, string reason)
        {
            ValidateRegistration(row);
            if (!CanDecide(row, decision)) throw new ArgumentException("Diese Entscheidung passt nicht zum aktuellen Status.");
            reason = (reason ?? "").Trim();
            if (reason.Length > 500) throw new ArgumentException("Der Hinweis darf höchstens 500 Zeichen enthalten.");
            return new DecisionRequest { Decision = decision, ExpectedVersion = row.Version, Reason = reason };
        }
        public static string Display(string value, int length = 500)
        {
            var text = new string((value ?? "").Where(c => !Char.IsControl(c) || c == '\n' || c == '\r' || c == '\t').ToArray());
            return text.Length <= length ? text : text.Substring(0, length);
        }
        public static string Status(string status)
        {
            switch (status) { case "pending": return "Wartet auf Freigabe"; case "approved": return "Freigegeben"; case "rejected": return "Abgelehnt"; case "revoked": return "Gesperrt"; default: return "Unbekannt"; }
        }
        public static string When(long? value)
        {
            if (!value.HasValue || value.Value <= 0) return "—";
            try { return DateTimeOffset.FromUnixTimeMilliseconds(value.Value).LocalDateTime.ToString("dd.MM.yyyy HH:mm", CultureInfo.GetCultureInfo("de-DE")); }
            catch (ArgumentOutOfRangeException) { return "—"; }
        }
        public static string Fingerprint(Registration row) { return row.UserId + ":" + row.Version.ToString(CultureInfo.InvariantCulture); }
        public static List<Registration> NewPending(IEnumerable<Registration> rows, IEnumerable<string> seen)
        {
            var known = new HashSet<string>(seen ?? new string[0], StringComparer.Ordinal);
            return rows.Where(r => r.Status == "pending" && !known.Contains(Fingerprint(r))).ToList();
        }
        public static bool Matches(Registration row, string filter, string search)
        {
            if (filter != "all" && row.Status != filter) return false;
            var query = (search ?? "").Trim();
            if (query.Length == 0) return true;
            var text = (row.User.DisplayName ?? "") + " " + (row.User.Username ?? "") + " " + row.UserId + " " + (row.Note ?? "");
            return text.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0;
        }
    }
    public sealed class ApiException : Exception
    {
        public readonly string Kind; public readonly int Status; public readonly long RetryAfterMs;
        public ApiException(string kind, string message, int status = 0, long retryAfterMs = 0) : base(Policy.Display(message)) { Kind = kind; Status = status; RetryAfterMs = retryAfterMs; }
    }
}
