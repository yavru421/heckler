using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.JSInterop;
using Heckler.Frontend.Models;

namespace Heckler.Frontend.Services
{
    public class IdentityService
    {
        private readonly IJSRuntime _js;
        private readonly HttpClient _http;
        private string? _cachedName;
        private string? _token;
        private PersonalizationUser? _user;
        private bool _isInitialized = false;

        public const string PersonalizationBaseUrl = "https://personalization.dondlingergc.com";

        public IdentityService(IJSRuntime js, HttpClient http)
        {
            _js = js;
            _http = http;
        }

        public PersonalizationUser? CurrentUser => _user;
        public bool IsAuthenticated => _user != null && !string.IsNullOrEmpty(_user.Id);
        public bool IsPremium => IsAuthenticated && (_user?.SubscriptionTier?.Equals("premium", StringComparison.OrdinalIgnoreCase) == true || _user?.SubscriptionTier?.Equals("vip", StringComparison.OrdinalIgnoreCase) == true);

        public async Task InitializeAsync()
        {
            if (_isInitialized) return;
            try
            {
                _token = await _js.InvokeAsync<string?>("localStorage.getItem", "dgc_token");
                _cachedName = await _js.InvokeAsync<string?>("localStorage.getItem", "heckler_username");

                if (!string.IsNullOrEmpty(_token))
                {
                    await FetchUserProfileAsync();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error initializing IdentityService: {ex.Message}");
            }
            finally
            {
                _isInitialized = true;
            }
        }

        public async Task<PersonalizationUser?> FetchUserProfileAsync()
        {
            try
            {
                var request = new HttpRequestMessage(HttpMethod.Get, $"{PersonalizationBaseUrl}/api/auth/me");
                if (!string.IsNullOrEmpty(_token))
                {
                    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
                }

                var response = await _http.SendAsync(request);
                if (response.IsSuccessStatusCode)
                {
                    var res = await response.Content.ReadFromJsonAsync<AuthMeResponse>();
                    if (res?.Success == true && res.User != null)
                    {
                        _user = res.User;
                        if (string.IsNullOrEmpty(_cachedName) && !string.IsNullOrEmpty(_user.Email))
                        {
                            await SetUsernameAsync(_user.Email.Split('@')[0]);
                        }
                        return _user;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error fetching user profile from personalization: {ex.Message}");
            }
            return null;
        }

        public async Task<(bool success, string? error)> LoginAsync(string email, string password)
        {
            try
            {
                var response = await _http.PostAsJsonAsync($"{PersonalizationBaseUrl}/api/auth/login", new { email, password });
                var res = await response.Content.ReadFromJsonAsync<AuthLoginResponse>();

                if (response.IsSuccessStatusCode && res?.Success == true && !string.IsNullOrEmpty(res.Token))
                {
                    _token = res.Token;
                    _user = res.User;
                    await _js.InvokeVoidAsync("localStorage.setItem", "dgc_token", _token);
                    if (_user != null && !string.IsNullOrEmpty(_user.Email))
                    {
                        await SetUsernameAsync(_user.Email.Split('@')[0]);
                    }
                    return (true, null);
                }
                return (false, res?.Error ?? "Login failed. Please check your credentials.");
            }
            catch (Exception ex)
            {
                return (false, ex.Message);
            }
        }

        public async Task<(bool success, string? error)> RegisterAsync(string email, string password)
        {
            try
            {
                var response = await _http.PostAsJsonAsync($"{PersonalizationBaseUrl}/api/auth/register", new { email, password });
                var res = await response.Content.ReadFromJsonAsync<AuthLoginResponse>();

                if (response.IsSuccessStatusCode && res?.Success == true && !string.IsNullOrEmpty(res.Token))
                {
                    _token = res.Token;
                    _user = new PersonalizationUser
                    {
                        Id = res.Token,
                        Email = email,
                        SubscriptionTier = "standard",
                        SubscriptionStatus = "inactive",
                        CreditBalanceCents = 1000
                    };
                    await _js.InvokeVoidAsync("localStorage.setItem", "dgc_token", _token);
                    await SetUsernameAsync(email.Split('@')[0]);
                    return (true, null);
                }
                return (false, res?.Error ?? "Registration failed.");
            }
            catch (Exception ex)
            {
                return (false, ex.Message);
            }
        }

        public async Task LogoutAsync()
        {
            try
            {
                await _http.PostAsync($"{PersonalizationBaseUrl}/api/auth/logout", null);
                await _js.InvokeVoidAsync("localStorage.removeItem", "dgc_token");
            }
            catch { }
            _token = null;
            _user = null;
        }

        public async Task<string?> GetUsernameAsync()
        {
            if (_cachedName != null) return _cachedName;
            try
            {
                _cachedName = await _js.InvokeAsync<string?>("localStorage.getItem", "heckler_username");
            }
            catch { }
            return _cachedName;
        }

        public async Task SetUsernameAsync(string name)
        {
            _cachedName = name;
            try
            {
                await _js.InvokeVoidAsync("localStorage.setItem", "heckler_username", name);
            }
            catch { }
        }
    }
}
