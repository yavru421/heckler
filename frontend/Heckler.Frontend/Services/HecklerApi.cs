using System.Net.Http.Json;
using Heckler.Frontend.Models;

namespace Heckler.Frontend.Services
{
    public class HecklerApi
    {
        private readonly HttpClient _http;

        public HecklerApi(HttpClient http)
        {
            _http = http;
        }

        public async Task<List<JokeModel>> GetFeedAsync(string sort = "hot", int page = 0, string? category = null)
        {
            try
            {
                var url = $"api/jokes?sort={sort}&page={page}";
                if (!string.IsNullOrEmpty(category)) url += $"&category={Uri.EscapeDataString(category)}";
                
                var response = await _http.GetFromJsonAsync<List<JokeModel>>(url);
                return response ?? new List<JokeModel>();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error fetching feed: {ex.Message}");
                return new List<JokeModel>();
            }
        }

        public async Task<JokeModel?> SubmitJokeAsync(string text, string authorName, string category, string? audioBase64 = null)
        {
            try
            {
                var response = await _http.PostAsJsonAsync("api/jokes", new { text, authorName, category, audioBase64 });
                if (response.IsSuccessStatusCode)
                    return await response.Content.ReadFromJsonAsync<JokeModel>();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error submitting joke: {ex.Message}");
            }
            return null;
        }

        public async Task<bool> RateJokeAsync(string jokeId, string rating)
        {
            try
            {
                var response = await _http.PostAsJsonAsync($"api/jokes/{jokeId}/rate", new { rating });
                return response.IsSuccessStatusCode;
            }
            catch { return false; }
        }

        public async Task<List<JokeModel>> GetWallOfShameAsync()
        {
            try
            {
                var response = await _http.GetFromJsonAsync<List<JokeModel>>("api/jokes/shame");
                return response ?? new List<JokeModel>();
            }
            catch { return new List<JokeModel>(); }
        }

        public async Task<List<JokeModel>> GetHallOfFameAsync()
        {
            try
            {
                var response = await _http.GetFromJsonAsync<List<JokeModel>>("api/jokes/fame");
                return response ?? new List<JokeModel>();
            }
            catch { return new List<JokeModel>(); }
        }

        // --- LINEUPS (Playlists) ---
        public async Task<List<LineupModel>> GetLineupsAsync()
        {
            try
            {
                var response = await _http.GetFromJsonAsync<List<LineupModel>>("api/lineups");
                return response ?? new List<LineupModel>();
            }
            catch { return new List<LineupModel>(); }
        }

        public async Task<LineupModel?> GetLineupByIdAsync(string id)
        {
            try
            {
                return await _http.GetFromJsonAsync<LineupModel>($"api/lineups/{id}");
            }
            catch { return null; }
        }

        public async Task<LineupModel?> CreateLineupAsync(string name, string authorName, List<string> jokeIds)
        {
            try
            {
                var response = await _http.PostAsJsonAsync("api/lineups", new { name, authorName, jokeIds });
                if (response.IsSuccessStatusCode)
                    return await response.Content.ReadFromJsonAsync<LineupModel>();
            }
            catch { }
            return null;
        }

        // --- CO-LISTENING ROOMS ---
        public async Task<List<RoomModel>> GetRoomsAsync()
        {
            try
            {
                var response = await _http.GetFromJsonAsync<List<RoomModel>>("api/rooms");
                return response ?? new List<RoomModel>();
            }
            catch { return new List<RoomModel>(); }
        }

        public async Task<RoomModel?> CreateRoomAsync(string name, string? lineupId)
        {
            try
            {
                var response = await _http.PostAsJsonAsync("api/rooms", new { name, lineupId });
                if (response.IsSuccessStatusCode)
                    return await response.Content.ReadFromJsonAsync<RoomModel>();
            }
            catch { }
            return null;
        }

        public async Task<RoomModel?> PollRoomAsync(string id)
        {
            try
            {
                return await _http.GetFromJsonAsync<RoomModel>($"api/rooms/{id}/poll");
            }
            catch { return null; }
        }

        public async Task<bool> ReactRoomAsync(string roomId, string reactionType)
        {
            try
            {
                var response = await _http.PostAsJsonAsync($"api/rooms/{roomId}/react", new { reactionType });
                return response.IsSuccessStatusCode;
            }
            catch { return false; }
        }

        public async Task<bool> NextRoomTrackAsync(string roomId, int index)
        {
            try
            {
                var response = await _http.PostAsJsonAsync($"api/rooms/{roomId}/next", new { index });
                return response.IsSuccessStatusCode;
            }
            catch { return false; }
        }

        // --- COMEDIANS ---
        public async Task<ComedianModel?> GetComedianProfileAsync(string username)
        {
            try
            {
                return await _http.GetFromJsonAsync<ComedianModel>($"api/comedians/{username}");
            }
            catch { return null; }
        }

        public async Task<bool> FollowComedianAsync(string username, string followerName)
        {
            try
            {
                var response = await _http.PostAsJsonAsync($"api/comedians/{username}/follow", new { followerName });
                if (response.IsSuccessStatusCode)
                {
                    var res = await response.Content.ReadFromJsonAsync<Dictionary<string, bool>>();
                    return res != null && res.ContainsKey("followed") && res["followed"];
                }
            }
            catch { }
            return false;
        }

        // --- AI COMEDY GENERATOR ---
        public async Task<string> GenerateAiSetAsync(string theme)
        {
            try
            {
                var response = await _http.PostAsJsonAsync("api/club/generate-set", new { theme });
                if (response.IsSuccessStatusCode)
                {
                    var res = await response.Content.ReadFromJsonAsync<AiSetResponse>();
                    return res?.Content ?? "The mic is dead tonight...";
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("AI Generation error: " + ex.Message);
            }
            return "The mic is dead tonight...";
        }
    }
}
