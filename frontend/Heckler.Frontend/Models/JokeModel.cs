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
        [JsonPropertyName("has_audio")]
        public bool HasAudio { get; set; }
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

    public class LineupModel
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";
        [JsonPropertyName("name")]
        public string Name { get; set; } = "";
        [JsonPropertyName("author_name")]
        public string AuthorName { get; set; } = "";
        [JsonPropertyName("created_at")]
        public string CreatedAt { get; set; } = "";
        [JsonPropertyName("jokes")]
        public List<JokeModel> Jokes { get; set; } = new();
    }

    public class RoomModel
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";
        [JsonPropertyName("name")]
        public string Name { get; set; } = "";
        [JsonPropertyName("current_lineup_id")]
        public string? CurrentLineupId { get; set; }
        [JsonPropertyName("current_joke_index")]
        public int CurrentJokeIndex { get; set; }
        [JsonPropertyName("joke_started_at")]
        public string? JokeStartedAt { get; set; }
        [JsonPropertyName("reactions")]
        public List<string> Reactions { get; set; } = new();
    }

    public class ComedianModel
    {
        [JsonPropertyName("username")]
        public string Username { get; set; } = "";
        [JsonPropertyName("bio")]
        public string Bio { get; set; } = "";
        [JsonPropertyName("follower_count")]
        public int FollowerCount { get; set; }
        [JsonPropertyName("jokes")]
        public List<JokeModel> Jokes { get; set; } = new();
    }

    public class AiSetResponse
    {
        [JsonPropertyName("content")]
        public string Content { get; set; } = "";
    }
}
