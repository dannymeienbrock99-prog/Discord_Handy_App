using System;
using System.Collections.Generic;
using System.Runtime.Serialization;

namespace Modstempel.Desktop
{
    [DataContract] public class ApiReply
    {
        [DataMember(Name = "ok")] public bool Ok;
        [DataMember(Name = "kind")] public string Kind;
        [DataMember(Name = "message")] public string Message;
        [DataMember(Name = "retryAfterMs")] public long? RetryAfterMs;
    }
    [DataContract] public sealed class DiscordUser
    {
        [DataMember(Name = "id")] public string Id;
        [DataMember(Name = "username")] public string Username;
        [DataMember(Name = "displayName")] public string DisplayName;
    }
    [DataContract] public sealed class Access
    {
        [DataMember(Name = "status")] public string Status;
        [DataMember(Name = "isOwner")] public bool IsOwner;
        [DataMember(Name = "canUseApp")] public bool CanUseApp;
        [DataMember(Name = "version")] public int Version;
    }
    [DataContract] public sealed class SessionReply : ApiReply
    {
        [DataMember(Name = "user")] public DiscordUser User;
        [DataMember(Name = "expiresAt")] public long ExpiresAt;
        [DataMember(Name = "access")] public Access Access;
    }
    [DataContract] public sealed class LoginStart : ApiReply
    {
        [DataMember(Name = "loginId")] public string LoginId;
        [DataMember(Name = "authorizePath")] public string AuthorizePath;
        [DataMember(Name = "displayCode")] public string DisplayCode;
        [DataMember(Name = "expiresAt")] public long ExpiresAt;
        [DataMember(Name = "intervalMs")] public int IntervalMs;
    }
    [DataContract] public sealed class LoginPoll : ApiReply
    {
        [DataMember(Name = "status")] public string Status;
        [DataMember(Name = "sessionToken")] public string SessionToken;
        [DataMember(Name = "user")] public DiscordUser User;
        [DataMember(Name = "expiresAt")] public long ExpiresAt;
        [DataMember(Name = "intervalMs")] public int IntervalMs;
    }
    [DataContract] public sealed class Counts
    {
        [DataMember(Name = "pending")] public int Pending;
        [DataMember(Name = "approved")] public int Approved;
        [DataMember(Name = "rejected")] public int Rejected;
        [DataMember(Name = "revoked")] public int Revoked;
    }
    [DataContract] public sealed class SummaryReply : ApiReply
    {
        [DataMember(Name = "revision")] public long Revision;
        [DataMember(Name = "pendingCount")] public int PendingCount;
        [DataMember(Name = "counts")] public Counts Counts;
        [DataMember(Name = "lastChangedAt")] public long? LastChangedAt;
        [DataMember(Name = "latestPendingAt")] public long? LatestPendingAt;
    }
    [DataContract] public sealed class Registration
    {
        [DataMember(Name = "userId")] public string UserId;
        [DataMember(Name = "user")] public DiscordUser User;
        [DataMember(Name = "status")] public string Status;
        [DataMember(Name = "version")] public int Version;
        [DataMember(Name = "note")] public string Note;
        [DataMember(Name = "reason")] public string Reason;
        [DataMember(Name = "requestedAt")] public long RequestedAt;
        [DataMember(Name = "updatedAt")] public long UpdatedAt;
        [DataMember(Name = "reviewedAt")] public long? ReviewedAt;
        [DataMember(Name = "reviewedBy")] public string ReviewedBy;
    }
    [DataContract] public sealed class ListReply : ApiReply
    {
        [DataMember(Name = "revision")] public long Revision;
        [DataMember(Name = "counts")] public Counts Counts;
        [DataMember(Name = "total")] public int Total;
        [DataMember(Name = "nextOffset")] public int? NextOffset;
        [DataMember(Name = "registrations")] public List<Registration> Registrations;
    }
    [DataContract] public sealed class DecisionReply : ApiReply
    {
        [DataMember(Name = "revision")] public long Revision;
        [DataMember(Name = "registration")] public Registration Registration;
    }
    [DataContract] public sealed class HealthReply : ApiReply
    {
        [DataMember(Name = "app")] public string App;
        [DataMember(Name = "apiVersion")] public int ApiVersion;
        [DataMember(Name = "configured")] public bool Configured;
        [DataMember(Name = "accessControl")] public bool AccessControl;
    }
    [DataContract] public sealed class ChallengeRequest { [DataMember(Name = "challenge")] public string Challenge; }
    [DataContract] public sealed class ClaimRequest
    {
        [DataMember(Name = "loginId")] public string LoginId;
        [DataMember(Name = "verifier")] public string Verifier;
    }
    [DataContract] public sealed class DecisionRequest
    {
        [DataMember(Name = "decision")] public string Decision;
        [DataMember(Name = "expectedVersion")] public int ExpectedVersion;
        [DataMember(Name = "reason")] public string Reason;
    }
    [DataContract] public sealed class EmptyRequest { }
    [DataContract] public sealed class LocalState
    {
        [DataMember] public string Origin;
        [DataMember] public string SessionToken;
        [DataMember] public string UserId;
        [DataMember] public long ExpiresAt;
        [DataMember] public string LoginId;
        [DataMember] public string LoginVerifier;
        [DataMember] public string LoginCode;
        [DataMember] public long LoginExpiresAt;
        [DataMember] public List<string> NotifiedPending;
        [DataMember] public bool TrayNoticeShown;
        [DataMember] public bool MinimizeToTray = true;
    }
}
