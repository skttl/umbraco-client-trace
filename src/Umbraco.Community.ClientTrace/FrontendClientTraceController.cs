using Asp.Versioning;
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
    ClientTraceRateLimiter limiter, FrontendJavascriptError logger) : ControllerBase
{
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