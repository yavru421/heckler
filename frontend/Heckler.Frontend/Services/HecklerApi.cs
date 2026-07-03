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

        public async Task<List<JokeModel>> GetFeedAsync(string sort = "hot", int page = 0)
        {
            try
            {
                var response = await _http.GetFromJsonAsync<List<JokeModel>>($"api/jokes?sort={sort}&page={page}");
                return response ?? new List<JokeModel>();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error fetching feed: {ex.Message}");
                return new List<JokeModel>();
            }
        }

        public async Task<JokeModel?> SubmitJokeAsync(string text, string authorName, string category)
        {
            try
            {
                var response = await _http.PostAsJsonAsync("api/jokes", new { text, authorName, category });
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

        public async Task<HeckleModel?> HeckleJokeAsync(string jokeId, string text, string authorName)
        {
            try
            {
                var response = await _http.PostAsJsonAsync($"api/jokes/{jokeId}/heckle", new { text, authorName });
                if (response.IsSuccessStatusCode)
                    return await response.Content.ReadFromJsonAsync<HeckleModel>();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error heckling: {ex.Message}");
            }
            return null;
        }

        public async Task<bool> RateHeckleAsync(string heckleId, string rating)
        {
            try
            {
                var response = await _http.PostAsJsonAsync($"api/heckles/{heckleId}/rate", new { rating });
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
    }
}
