using System.Net.Http.Json;
using Heckler.Frontend.Models;

namespace Heckler.Frontend.Services
{
    public class JokeService
    {
        private readonly HttpClient _http;

        public JokeService(HttpClient http)
        {
            _http = http;
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

        public async Task<JokeModel?> GenerateJokeAsync()
        {
            try
            {
                var response = await _http.PostAsJsonAsync("api/jokes/generate", new { });
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
    }
}
