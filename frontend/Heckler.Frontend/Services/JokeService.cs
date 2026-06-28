using System.Net.Http.Json;
using Heckler.Frontend.Models;

namespace Heckler.Frontend.Services
{
    public class JokeService
    {
        private readonly HttpClient _http;
        private readonly string _sessionId;

        public JokeService(HttpClient http)
        {
            _http = http;
            _sessionId = Guid.NewGuid().ToString();
        }

        public async Task<List<JokeModel>> GetActiveJokesAsync()
        {
            try
            {
                var response = await _http.GetFromJsonAsync<List<JokeModel>>("api/setlist");
                return response ?? new List<JokeModel>();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error fetching setlist: {ex.Message}");
                return new List<JokeModel>();
            }
        }

        public async Task<bool> RateJokeAsync(string jokeId, string rating)
        {
            try
            {
                var response = await _http.PostAsJsonAsync($"api/setlists/global-setlist/rate", new { jokeId, rating });
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error rating joke: {ex.Message}");
                return false;
            }
        }

        public async Task<JokeModel?> GenerateJokeAsync(string type, string? hecklePrompt = null)
        {
            try
            {
                var response = await _http.PostAsJsonAsync("api/jokes/generate", new { type, hecklePrompt, sessionId = _sessionId });
                if (response.IsSuccessStatusCode)
                {
                    return await response.Content.ReadFromJsonAsync<JokeModel>();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error generating joke: {ex.Message}");
            }
            return null;
        }
        public async Task<bool> RateRoutineAsync(int rating, string comment)
        {
            try
            {
                var response = await _http.PostAsJsonAsync("api/routines/rate", new { rating, comment });
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error rating routine: {ex.Message}");
                return false;
            }
        }
    }
}
