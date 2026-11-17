using Asp.Versioning;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;

namespace Umbraco.Community.ClientTrace;

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = "ClientTrace")]
[VersionedApiBackOfficeRoute("client-trace")]
public sealed class ClientTraceManagementController(
    IOptionsMonitor<ClientTraceOptions> options, ClientTraceRateLimiter limiter,
    BackofficeJavascriptError logger) : ManagementApiControllerBase
{
    [HttpGet("configuration", Name = "GetClientTraceConfiguration")]
    [ProducesResponseType<BrowserTraceOptions>(StatusCodes.Status200OK)]
    public IActionResult Configuration() => Ok(options.CurrentValue.Backoffice);

    [HttpPost("reports", Name = "PostClientTraceReport"), RequestSizeLimit(32768)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public IActionResult Report([FromBody] JavascriptErrorReport report)
    {
        if (!options.CurrentValue.Backoffice.Enabled) return NotFound();
        if (!limiter.TryAcquire("backoffice:" + HttpContext.Connection.RemoteIpAddress, false)) return StatusCode(StatusCodes.Status429TooManyRequests);
        if (!ReportSanitizer.TryPrepare(report, out var prepared)) return BadRequest();
        logger.Write(prepared);
        return NoContent();
    }
}