using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Heckler.Frontend;
using Heckler.Frontend.Services;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

var baseAddress = builder.HostEnvironment.BaseAddress;
if (baseAddress.Contains("localhost") || baseAddress.Contains("127.0.0.1"))
{
    baseAddress = "http://localhost:8787/";
}
else
{
    baseAddress = "https://backend.dondlingergeneralcontracting.workers.dev/";
}

builder.Services.AddScoped(sp => new HttpClient { BaseAddress = new Uri(baseAddress) });
builder.Services.AddScoped<HecklerApi>();
builder.Services.AddScoped<IdentityService>();

await builder.Build().RunAsync();
