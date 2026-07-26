using System.Text.Json.Serialization;

namespace Heckler.Frontend.Models
{
    public class PersonalizationUser
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";

        [JsonPropertyName("email")]
        public string Email { get; set; } = "";

        [JsonPropertyName("subscription_tier")]
        public string SubscriptionTier { get; set; } = "standard";

        [JsonPropertyName("subscription_status")]
        public string SubscriptionStatus { get; set; } = "inactive";

        [JsonPropertyName("credit_balance_cents")]
        public int CreditBalanceCents { get; set; }
    }

    public class AuthMeResponse
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("user")]
        public PersonalizationUser? User { get; set; }

        [JsonPropertyName("error")]
        public string? Error { get; set; }
    }

    public class AuthLoginResponse
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("token")]
        public string? Token { get; set; }

        [JsonPropertyName("refresh_token")]
        public string? RefreshToken { get; set; }

        [JsonPropertyName("user")]
        public PersonalizationUser? User { get; set; }

        [JsonPropertyName("error")]
        public string? Error { get; set; }
    }
}
