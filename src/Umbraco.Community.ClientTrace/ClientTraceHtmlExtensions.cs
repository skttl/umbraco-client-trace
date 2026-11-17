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
        var asset = versions.AddFileVersionToPath(context.Request.PathBase, context.Request.PathBase + "/App_Plugins/ClientTrace/frontend.js");
        var query = asset.IndexOf('?');
        var script = new TagBuilder("script");
        script.Attributes["src"] = context.Request.PathBase + "/client-trace/client.js" + (query < 0 ? "" : asset[query..]);
        return script;
    }
}
