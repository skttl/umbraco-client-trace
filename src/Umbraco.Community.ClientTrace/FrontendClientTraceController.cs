using System.Text.Json;
using Asp.Versioning;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Umbraco.Community.ClientTrace;

[ApiController, ApiVersionNeutral, AllowAnonymous, ApiExplorerSettings(IgnoreApi = true)]
[Route("client-trace")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class FrontendClientTraceController(
    IOptionsMonitor<ClientTraceOptions> options, IAntiforgery antiforgery,
    ClientTraceRateLimiter limiter, FrontendJavascriptError logger, IWebHostEnvironment environment) : ControllerBase
{
    [HttpGet("client.js")]
    public async Task<IActionResult> Script()
    {
        if (!options.CurrentValue.Frontend.Enabled) return NotFound();
        var file = environment.WebRootFileProvider.GetFileInfo("App_Plugins/ClientTrace/frontend.js");
        if (!file.Exists) return NotFound();
        using var reader = new StreamReader(file.CreateReadStream());
        var bootstrap = new
        {
            Options = options.CurrentValue.Frontend,
            TokenUrl = HttpContext.Request.PathBase + "/client-trace/token",
            ReportUrl = HttpContext.Request.PathBase + "/client-trace/reports",
            AssetBaseUrl = HttpContext.Request.PathBase + "/App_Plugins/ClientTrace/"
        };
        var settings = JsonSerializer.Serialize(bootstrap, JsonSerializerOptions.Web);
        return Content("(function(clientTraceBootstrap){\n" + await reader.ReadToEndAsync() + "\n})(" + settings + ");", "application/javascript; charset=utf-8");
    }
    [HttpGet("token")]
    public IActionResult Token()
    {
        if (!options.CurrentValue.Frontend.Enabled) return NotFound();
        if (!limiter.TryAcquire("frontend:" + HttpContext.Connection.RemoteIpAddress, true)) return StatusCode(StatusCodes.Status429TooManyRequests);
        var tokens = antiforgery.GetAndStoreTokens(HttpContext);
        return Ok(new { tokens.RequestToken, tokens.HeaderName });
    }

    [HttpPost("reports"), RequestSizeLimit(32768)]
    public async Task<IActionResult> Report([FromBody] JavascriptErrorReport report)
    {
        if (!options.CurrentValue.Frontend.Enabled) return NotFound();
        if (!limiter.TryAcquire("frontend:" + HttpContext.Connection.RemoteIpAddress, false)) return StatusCode(StatusCodes.Status429TooManyRequests);
        try { await antiforgery.ValidateRequestAsync(HttpContext); }
        catch (AntiforgeryValidationException) { return BadRequest(); }
        if (!ReportSanitizer.TryPrepare(report, out var prepared)) return BadRequest();
        logger.Write(prepared);
        return NoContent();
    }
}