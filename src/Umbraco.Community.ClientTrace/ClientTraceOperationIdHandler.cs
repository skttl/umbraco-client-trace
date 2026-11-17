using Asp.Versioning;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Api.Common.OpenApi;

namespace Umbraco.Community.ClientTrace;

public sealed class ClientTraceOperationIdHandler(IOptions<ApiVersioningOptions> options) : OperationIdHandler(options)
{
    protected override bool CanHandle(ApiDescription description, ControllerActionDescriptor descriptor)
        => descriptor.ControllerTypeInfo.AsType() == typeof(ClientTraceManagementController);
}
