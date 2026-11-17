using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Api.Common.OpenApi;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;

namespace Umbraco.Community.ClientTrace;

public sealed class ClientTraceComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        builder.Services.AddOptions<ClientTraceOptions>().Bind(builder.Config.GetSection(ClientTraceOptions.SectionName));
        builder.Services.AddSingleton<ClientTraceRateLimiter>();
        builder.Services.AddSingleton<IOperationIdHandler, ClientTraceOperationIdHandler>();
        builder.Services.AddSingleton<BackofficeJavascriptError>();
        builder.Services.AddSingleton<FrontendJavascriptError>();
        builder.Services.AddControllers().AddApplicationPart(typeof(ClientTraceManagementController).Assembly);
    }
}