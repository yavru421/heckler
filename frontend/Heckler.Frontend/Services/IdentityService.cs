using Microsoft.JSInterop;

namespace Heckler.Frontend.Services
{
    public class IdentityService
    {
        private readonly IJSRuntime _js;
        private string? _cachedName;

        public IdentityService(IJSRuntime js)
        {
            _js = js;
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
