# ClientTrace for Umbraco 17

ClientTrace sends uncaught JavaScript errors and unhandled promise rejections to Umbraco's existing structured logs. Backoffice collection starts after installation and restart. Public website collection is enabled by adding a Razor helper. No external error service, extra database or Node.js installation is required on the hosting server.

## Install and activate

Requires Umbraco 17 and .NET 10. The NuGet dependency interval is `[17.0.0,18.0.0)`. Use a current supported Umbraco 17 patch for deployed sites; the minimum version is a compatibility floor, not a security recommendation.

```shell
dotnet add package Umbraco.Community.ClientTrace --version 17.0.0-beta.1
```

Build and restart the site. The package registers its server components, Management API and backoffice entry point automatically. Open Umbraco's existing Log Viewer to inspect errors. No `Program.cs` changes are needed.

For the public website, add the namespace to `_ViewImports.cshtml` or the layout, then place the helper early in `<head>`, before scripts you want to monitor:

```cshtml
@using Umbraco.Community.ClientTrace
<!doctype html>
<html>
<head>
    @Html.AddClientTrace()
    <!-- Your site's scripts follow here. -->
</head>
<body>@RenderBody()</body>
</html>
```

The helper emits a synchronous external `/App_Plugins/ClientTrace/frontend.js?v=...` script, with a hash of the deployed asset and one HTML-encoded `data-client-trace` settings object. It supports PathBase and requires no executable inline script. Place it before deferred scripts too. It cannot collect errors that occur before it runs. Repeated initialization on a page does not add duplicate listeners.

The HTML contains settings and endpoint URLs, never a visitor token. On the first accepted error, the client obtains an ASP.NET Core antiforgery token from `/client-trace/token`, then posts reports to `/client-trace/reports` using the cookie and returned token header. These routes also respect PathBase. Backoffice reports use Umbraco authentication separately.

## Configuration

All configuration is optional. These are the defaults, with independent values for each section:

```json
{
  "Umbraco": {
    "Community": {
      "ClientTrace": {
        "Backoffice": {
          "Enabled": true,
          "UseSourceMaps": true,
          "ExcludedScripts": [],
          "ExcludedPaths": [],
          "ExcludeUnidentifiedScripts": false
        },
        "Frontend": {
          "Enabled": true,
          "UseSourceMaps": true,
          "ExcludedScripts": [],
          "ExcludedPaths": [],
          "ExcludeUnidentifiedScripts": false
        }
      }
    }
  }
}
```

| Setting | Behavior |
| --- | --- |
| `Enabled` | Enables that section. Frontend still requires the helper. When disabled, the helper emits nothing and the corresponding report endpoint rejects reports. |
| `UseSourceMaps` | Allows browser downloads and translation of stack frames. Failed mapping still sends the ordinary report. |
| `ExcludedScripts` | Script URLs or paths to drop before map downloads and reporting. |
| `ExcludedPaths` | Page paths on which all reports are dropped. |
| `ExcludeUnidentifiedScripts` | Drops errors without an identifiable script. By default these are kept. |

The package includes an appsettings schema and a `buildTransitive` target that registers it through Umbraco's `UmbracoJsonSchemaFiles` item. Configuration editor support requires a site build.

For example, set `Frontend:ExcludedScripts` to `["/scripts/vendor/*", "https://cdn.example.com/analytics.js"]` and `Frontend:ExcludedPaths` to `["/preview/*"]`. These rules do not affect backoffice collection.

Matching uses exact strings unless a pattern contains `*`, the only wildcard. It matches zero or more characters, including `/`; regular expressions and other glob syntax are unsupported. Paths are case-sensitive. Origins in full HTTP or HTTPS URLs are normalized by the URL parser. A script pattern beginning with `/` matches the script path; a full URL also matches the origin. Query strings and fragments are ignored.

Page exclusions use the current path at error time, including backoffice navigation without a page reload. Script identification uses the event filename, otherwise the first usable original HTTP/HTTPS or path stack frame. An unknown script is kept unless `ExcludeUnidentifiedScripts` is enabled or the page is excluded. Exclusions run in the browser; server-side `Enabled`, validation and rate limits are enforced independently.

## Finding errors in logs

Errors use level `Error` and these `SourceContext` values:

```text
Umbraco.Community.ClientTrace.BackofficeJavascriptError
Umbraco.Community.ClientTrace.FrontendJavascriptError
```

| Structured field | Meaning |
| --- | --- |
| `ClientSurface` | `Backoffice` or `Frontend`. |
| `ClientEventType` | `error` or `unhandledrejection`. |
| `ClientErrorType` | Error class, when available, such as `TypeError`. |
| `ClientErrorMessage` | Bounded browser error message or rejection description. |
| `ClientPagePath` | The page where the error happened, without query or fragment. |
| `ClientScriptUrl`, `ClientScriptPath` | Identified original script URL and path. URL credentials, query and fragment are removed. |
| `ClientLineNumber`, `ClientColumnNumber` | Original browser-reported generated position, when available. |
| `ClientStackTrace` | Raw stack with recognizable HTTP/HTTPS URLs sanitized. |
| `ClientMappedStackTrace` | Fully or partly translated stack. Unmapped frames keep their generated locations. |

Missing optional values remain null. Stack traces are structured text fields, not synthetic .NET exceptions. The site's existing Serilog destinations and filters remain in control. Server `RequestPath`, `RequestId` and `ActionName` describe the report submission; use `ClientPagePath` to find the browser page.

No arbitrary object properties, cookies, form fields, source contents or complete maps are sent. Free error messages and other unrecognized text can still contain sensitive information. Review what your own scripts put into exception messages and apply your usual log access and retention policies.

## Source maps and delivery limits

The parser and mapper load only when needed. Mapping reads a script's `sourceMappingURL`; script and map URLs must be reachable by page JavaScript under the site's CORS and CSP policies. The deployed map must match the deployed script. DevTools access alone does not prove browser JavaScript can fetch it. Maps may expose source through your asset hosting policy. ClientTrace does not upload maps or archive old builds.

Each script/map download has a 3-second timeout and a 2 MiB streamed limit. Mapping parses up to 20 frames and tries the first 5. Up to 8 script mapping results, failures or pending requests are cached in page memory. Downloads omit credentials and never include the backoffice bearer token. Missing, invalid, unavailable or partial maps keep ordinary reporting working. Set `UseSourceMaps` to `false` to avoid mapping downloads.

Each browser section accepts up to 30 distinct errors per minute, suppresses identical reports during that minute, and processes at most 4 at once. Frontend startup retains at most 4 events while downloading its collector. There is no persistent queue, offline delivery or retry loop. Token/report requests time out after 3 seconds; failed token issuance is not retried on that page. Navigation, blocked cookies, CSP, network failure or throttling can lose reports. Modern browsers with native modules, fetch and `AbortSignal.timeout` are required.

The server accepts at most 30 reports per minute per resolved remote IP and section, and 10 frontend token requests per minute per IP. Limits use fixed windows per server process, with up to 4096 tracked partitions. People behind a shared IP share the server budget. Configure the host's trusted proxy/forwarded-header handling correctly; the package does not trust arbitrary forwarding headers. Multiple instances do not share a distributed budget.

Reports are limited to 32768 UTF-8 bytes. Message and page/script URL fields allow 2048 characters, error type 128, and each raw/mapped stack 8192. Optional line and column are positive 32-bit integers. Invalid data or antiforgery returns 400, disabled reporting 404, throttling 429, and oversized requests 413. ClientTrace does not capture resource-load events, `console.error`, caught exceptions, notifications or HTTP failures unless they cause an uncaught error or rejection. It leaves browser default error handling intact.

Public reports are untrusted and can be fabricated. Antiforgery protects against browser cross-site submissions; it is not an anti-bot control. The server fixes categories, log level and fields, and never accepts a browser-supplied .NET exception.

## Links and license

[Source and local development](https://github.com/skttl/umbraco-client-trace) · [Issues](https://github.com/skttl/umbraco-client-trace/issues) · [Release setup](https://github.com/skttl/umbraco-client-trace/blob/main/docs/trusted-publishing.md)

MIT. The NuGet package includes Lucide icon attribution and runtime dependency notices for stacktrace-parser, @jridgewell/trace-mapping and its dependencies, and generated Hey API client code.
