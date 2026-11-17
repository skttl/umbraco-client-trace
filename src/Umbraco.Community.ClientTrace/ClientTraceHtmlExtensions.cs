using System.Text.Json;
using Microsoft.AspNetCore.Html;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.AspNetCore.Mvc.ViewFeatures;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Umbraco.Community.ClientTrace;

public static class ClientTraceHtmlExtensions
{
    public static IHtmlContent AddClientTrace(this IHtmlHelper html)
    {
        var context = html.ViewContext.HttpContext;
        if (!context.RequestServices.GetRequiredService<IOptionsMonitor<ClientTraceOptions>>().CurrentValue.Frontend.Enabled) return HtmlString.Empty;
        var versions = context.RequestServices.GetRequiredService<IFileVersionProvider>();
        var script = new TagBuilder("script");
        script.Attributes["src"] = versions.AddFileVersionToPath(context.Request.PathBase, context.Request.PathBase + "/App_Plugins/ClientTrace/frontend.js");
        script.Attributes["data-client-trace"] = JsonSerializer.Serialize(new
        {
            Options = context.RequestServices.GetRequiredService<IOptionsMonitor<ClientTraceOptions>>().CurrentValue.Frontend,
            TokenUrl = context.Request.PathBase + "/client-trace/token",
            ReportUrl = context.Request.PathBase + "/client-trace/reports",
            AssetBaseUrl = context.Request.PathBase + "/App_Plugins/ClientTrace/"
        }, JsonSerializerOptions.Web);
        return script;
    }
}
