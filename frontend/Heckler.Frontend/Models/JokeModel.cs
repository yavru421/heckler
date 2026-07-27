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

    public class LiveStageState
    {
        [JsonPropertyName("jokeId")]
        public string JokeId { get; set; } = "";
        [JsonPropertyName("performer")]
        public string Performer { get; set; } = "";
        [JsonPropertyName("text")]
        public string Text { get; set; } = "";
        [JsonPropertyName("category")]
        public string Category { get; set; } = "";
        [JsonPropertyName("hasAudio")]
        public bool HasAudio { get; set; }
        [JsonPropertyName("audioUrl")]
        public string AudioUrl { get; set; } = "";
        [JsonPropertyName("startedAt")]
        public long StartedAt { get; set; }
        [JsonPropertyName("durationMs")]
        public long DurationMs { get; set; }
        [JsonPropertyName("listenersCount")]
        public int ListenersCount { get; set; }
        [JsonPropertyName("reactions")]
        public Dictionary<string, int> Reactions { get; set; } = new();
        [JsonPropertyName("chatMessages")]
        public List<StageChatMessage> ChatMessages { get; set; } = new();
    }

    public class StageChatMessage
    {
        [JsonPropertyName("username")]
        public string Username { get; set; } = "";
        [JsonPropertyName("message")]
        public string Message { get; set; } = "";
        [JsonPropertyName("timestamp")]
        public string Timestamp { get; set; } = "";
    }

    public class PlaylistModel
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";
        [JsonPropertyName("name")]
        public string Name { get; set; } = "";
        [JsonPropertyName("description")]
        public string Description { get; set; } = "";
        [JsonPropertyName("author")]
        public string Author { get; set; } = "";
        [JsonPropertyName("category")]
        public string Category { get; set; } = "";
        [JsonPropertyName("icon")]
        public string Icon { get; set; } = "";
    }

    public class PlaylistTrackModel
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";
        [JsonPropertyName("title")]
        public string Title { get; set; } = "";
        [JsonPropertyName("fullText")]
        public string FullText { get; set; } = "";
        [JsonPropertyName("performer")]
        public string Performer { get; set; } = "";
        [JsonPropertyName("category")]
        public string Category { get; set; } = "";
        [JsonPropertyName("audioUrl")]
        public string AudioUrl { get; set; } = "";
        [JsonPropertyName("kills")]
        public int Kills { get; set; }
    }
}
