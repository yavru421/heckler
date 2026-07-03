using System.Text.Json.Serialization;

namespace Heckler.Frontend.Models
{
    public class JokeModel
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";
        [JsonPropertyName("text")]
        public string Text { get; set; } = "";
        [JsonPropertyName("category")]
        public string Category { get; set; } = "observational";
        [JsonPropertyName("author_name")]
        public string AuthorName { get; set; } = "";
        [JsonPropertyName("kills")]
        public int Kills { get; set; }
        [JsonPropertyName("bombs")]
        public int Bombs { get; set; }
        [JsonPropertyName("created_at")]
        public string CreatedAt { get; set; } = "";
        [JsonPropertyName("topHeckle")]
        public HeckleModel? TopHeckle { get; set; }
    }

    public class HeckleModel
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";
        [JsonPropertyName("joke_id")]
        public string JokeId { get; set; } = "";
        [JsonPropertyName("text")]
        public string Text { get; set; } = "";
        [JsonPropertyName("author_name")]
        public string AuthorName { get; set; } = "";
        [JsonPropertyName("kills")]
        public int Kills { get; set; }
        [JsonPropertyName("bombs")]
        public int Bombs { get; set; }
    }
}
