using System.Net;
using System.Net.Http.Json;
using System.Reflection;
using System.Text;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Primitives;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ApplicationParts;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.AspNetCore.Mvc.ViewFeatures;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace Umbraco.Community.ClientTrace.Tests;

public class ServerTests
{
    private static JavascriptErrorReport Valid() => new() { EventType="error", Message="broken", PagePath="/page" };

    [Fact]
    public void DefaultsAndBindingAreIndependent()
    {
        var options=new ClientTraceOptions();
        Assert.True(options.Backoffice.Enabled && options.Frontend.Enabled);
        Assert.True(options.Backoffice.UseSourceMaps && options.Frontend.UseSourceMaps);
        Assert.False(options.Backoffice.ExcludeUnidentifiedScripts || options.Frontend.ExcludeUnidentifiedScripts);
        Assert.Empty(options.Backoffice.ExcludedPaths); Assert.Empty(options.Frontend.ExcludedScripts);
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
            [$"{ClientTraceOptions.SectionName}:Frontend:Enabled"]="false",
            [$"{ClientTraceOptions.SectionName}:Frontend:ExcludedScripts:0"]="/private.js"
        }).Build().GetSection(ClientTraceOptions.SectionName).Bind(options);
        Assert.False(options.Frontend.Enabled); Assert.True(options.Backoffice.Enabled);
        Assert.Equal("/private.js",Assert.Single(options.Frontend.ExcludedScripts)); Assert.Empty(options.Backoffice.ExcludedScripts);
    }

    [Theory]
    [InlineData("console",false)] [InlineData("error",true)] [InlineData("unhandledrejection",true)]
    public void OnlySupportedEventsAreAccepted(string eventType,bool accepted)
    {
        var report=Valid() with { EventType=eventType };
        Assert.Equal(accepted,ReportSanitizer.TryPrepare(report,out _));
    }

    [Fact]
    public void TextAndPositionLimitsAreEnforced()
    {
        Assert.True(ReportSanitizer.TryPrepare(Valid() with { Message=new string('x',2048), StackTrace=new string('x',8192), LineNumber=1 },out _));
        Assert.False(ReportSanitizer.TryPrepare(Valid() with { Message=new string('x',2049) },out _));
        Assert.False(ReportSanitizer.TryPrepare(Valid() with { StackTrace=new string('x',8193) },out _));
        Assert.False(ReportSanitizer.TryPrepare(Valid() with { LineNumber=0 },out _));
        Assert.False(ReportSanitizer.TryPrepare(Valid() with { Message=null! },out _));
    }

    [Fact]
    public void UrlsAreCleanedIncludingStackFrames()
    {
        Assert.True(ReportSanitizer.TryPrepare(Valid() with {
            PagePath="https://example.test/path?private=1#frag", ScriptUrl="https://example.test/app.js?v=1#frag",
            StackTrace="at f (https://example.test/app.js?v=1:10:20)",
            MappedStackTrace="at f (https://example.test/source.ts?private=1:2:3)"
        },out var report));
        Assert.Equal("/path",report.PagePath); Assert.Equal("https://example.test/app.js",report.ScriptUrl);
        Assert.Equal("at f (https://example.test/app.js:10:20)",report.StackTrace);
        Assert.Equal("at f (https://example.test/source.ts:2:3)",report.MappedStackTrace);
        Assert.False(ReportSanitizer.TryPrepare(Valid() with { ScriptUrl="javascript:alert(1)" },out _));
    }

    [Fact]
    public void HelperOmitsDisabledAndVersionsExternalScriptWithPathBase()
    {
        var settings=new ClientTraceOptions();
        settings.Frontend.ExcludedScripts=["</script><script>alert('x')</script>"];
        var services=new ServiceCollection().AddSingleton<IFileVersionProvider>(new AssetVersions()).AddSingleton<IOptionsMonitor<ClientTraceOptions>>(new FixedOptions(settings)).BuildServiceProvider();
        var context=new DefaultHttpContext { RequestServices=services }; context.Request.PathBase="/sub";
        var html=DispatchProxy.Create<IHtmlHelper,HtmlProxy>();
        ((HtmlProxy)(object)html).Context=new ViewContext { HttpContext=context };
        using var writer=new StringWriter(); html.AddClientTrace().WriteTo(writer,HtmlEncoder.Default);
        var result=writer.ToString();
        Assert.Equal("<script src=\"/sub/client-trace/client.js?v=asset123\"></script>",result);
        Assert.DoesNotContain("</script><script>",result); Assert.DoesNotContain(" async",result); Assert.DoesNotContain(" defer",result);
        Assert.DoesNotContain("requestToken",result);
        settings.Frontend.Enabled=false;
        using var disabled=new StringWriter(); html.AddClientTrace().WriteTo(disabled,HtmlEncoder.Default);
        Assert.Equal("",disabled.ToString());
    }

    [Fact]
    public void LoggerUsesFixedFieldsAndErrorLevel()
    {
        var logger=new RecordingLogger<FrontendJavascriptError>();
        new FrontendJavascriptError(logger).Write(Valid() with { ScriptUrl="https://example.test/app.js",LineNumber=7,ColumnNumber=9 });
        Assert.Equal(LogLevel.Error,logger.Level);
        Assert.Equal("error",logger.Values["ClientEventType"]); Assert.Equal("broken",logger.Values["ClientErrorMessage"]);
        Assert.Equal("/page",logger.Values["ClientPagePath"]); Assert.Equal("/app.js",logger.Values["ClientScriptPath"]);
        Assert.Equal(7,logger.Values["ClientLineNumber"]); Assert.Equal(9,logger.Values["ClientColumnNumber"]);
        Assert.Contains("ClientMappedStackTrace",logger.Values.Keys);
        Assert.Equal("Umbraco.Community.ClientTrace.BackofficeJavascriptError",typeof(BackofficeJavascriptError).FullName);
        Assert.Equal("Umbraco.Community.ClientTrace.FrontendJavascriptError",typeof(FrontendJavascriptError).FullName);
    }

    [Fact]
    public void LimiterBoundsEachSurfaceAndTokenBudget()
    {
        var limiter=new ClientTraceRateLimiter();
        for(var n=0;n<10;n++) Assert.True(limiter.TryAcquire("same",true));
        Assert.False(limiter.TryAcquire("same",true));
        for(var n=0;n<30;n++) Assert.True(limiter.TryAcquire("same",false));
        Assert.False(limiter.TryAcquire("same",false));
        Assert.True(limiter.TryAcquire("other",false));
    }

    [Fact]
    public async Task FrontendRequiresRealAntiforgeryAndDisablesBothEndpoints()
    {
        var settings=new ClientTraceOptions();
        await using var server=await Host(settings);
        using var client=server.GetTestClient();
        Assert.Equal(HttpStatusCode.BadRequest,(await client.PostAsJsonAsync("/client-trace/reports",Valid())).StatusCode);
        var tokenResponse=await client.GetAsync("/client-trace/token");
        Assert.Equal(HttpStatusCode.OK,tokenResponse.StatusCode);
        Assert.Contains("no-store",tokenResponse.Headers.CacheControl!.ToString());
        var token=await tokenResponse.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Add("Cookie",tokenResponse.Headers.GetValues("Set-Cookie").First().Split(';')[0]);
        client.DefaultRequestHeaders.Add(token.GetProperty("headerName").GetString()!,token.GetProperty("requestToken").GetString());
        Assert.Equal(HttpStatusCode.NoContent,(await client.PostAsJsonAsync("/client-trace/reports",Valid())).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await client.PostAsJsonAsync("/client-trace/reports",Valid() with { EventType="console" })).StatusCode);
        settings.Frontend.Enabled=false;
        Assert.Equal(HttpStatusCode.NotFound,(await client.GetAsync("/client-trace/token")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await client.PostAsJsonAsync("/client-trace/reports",Valid())).StatusCode);
    }

    [Fact]
    public void ManagementHonorsDisabledSettingAndHasBackofficeAuthorization()
    {
        var settings=new ClientTraceOptions(); settings.Backoffice.Enabled=false;
        var controller=new ClientTraceManagementController(new FixedOptions(settings),new ClientTraceRateLimiter(),new BackofficeJavascriptError(new RecordingLogger<BackofficeJavascriptError>()));
        Assert.IsType<NotFoundResult>(controller.Report(Valid()));
        var configuration=Assert.IsType<OkObjectResult>(controller.Configuration());
        Assert.False(Assert.IsType<BrowserTraceOptions>(configuration.Value).Enabled);
        var policies=typeof(ClientTraceManagementController).GetCustomAttributes<Microsoft.AspNetCore.Authorization.AuthorizeAttribute>(true);
        Assert.Contains(policies,policy=>policy.Policy=="BackOfficeAccess");
        settings.Backoffice.Enabled=true;
        controller.ControllerContext=new ControllerContext { HttpContext=new DefaultHttpContext() };
        Assert.IsType<NoContentResult>(controller.Report(Valid()));
        Assert.IsType<BadRequestResult>(controller.Report(Valid() with { EventType="console" }));
    }

    [Theory]
    [InlineData("ErrorType",128)] [InlineData("Message",2048)] [InlineData("PagePath",2048)]
    [InlineData("ScriptUrl",2048)] [InlineData("StackTrace",8192)] [InlineData("MappedStackTrace",8192)]
    public void EveryTextFieldHonorsItsExactLimit(string field,int maximum)
    {
        var report=Valid();
        var property=typeof(JavascriptErrorReport).GetProperty(field)!;
        var prefix=field is "PagePath" or "ScriptUrl" ? "/" : "";
        property.SetValue(report,prefix+new string('x',maximum-prefix.Length));
        Assert.True(ReportSanitizer.TryPrepare(report,out _));
        property.SetValue(report,prefix+new string('x',maximum+1-prefix.Length));
        Assert.False(ReportSanitizer.TryPrepare(report,out _));
    }

    [Fact]
    public void LimiterRejectsAdditionalPartitionsAtCapacity()
    {
        var limiter=new ClientTraceRateLimiter();
        for(var n=0;n<4096;n++) Assert.True(limiter.TryAcquire(n.ToString(),false));
        Assert.False(limiter.TryAcquire("overflow",false));
        Assert.True(limiter.TryAcquire("0",false));
    }

    [Fact]
    public async Task FrontendRejectsInvalidTokenAndThrottlesIssuance()
    {
        await using var app=await Host(new ClientTraceOptions()); using var client=app.GetTestClient();
        client.DefaultRequestHeaders.Add("RequestVerificationToken","invalid");
        Assert.Equal(HttpStatusCode.BadRequest,(await client.PostAsJsonAsync("/client-trace/reports",Valid())).StatusCode);
        for(var n=0;n<10;n++) Assert.Equal(HttpStatusCode.OK,(await client.GetAsync("/client-trace/token")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests,(await client.GetAsync("/client-trace/token")).StatusCode);
    }
    [Fact]
    public async Task BootstrapContainsFreshSafeSettingsAndPathBaseWithoutVisitorTokens()
    {
        var settings=new ClientTraceOptions(); settings.Frontend.ExcludedScripts=["</script><script>private</script>"];
        await using var app=await Host(settings); using var client=app.GetTestClient();
        var response=await client.GetAsync("/sub/client-trace/client.js?v=old");
        Assert.Equal(HttpStatusCode.OK,response.StatusCode);
        Assert.Equal("application/javascript",response.Content.Headers.ContentType!.MediaType);
        Assert.Contains("no-store",response.Headers.CacheControl!.ToString());
        var source=await response.Content.ReadAsStringAsync();
        Assert.Contains("function(clientTraceBootstrap)",source);
        Assert.Contains("\"tokenUrl\":\"/sub/client-trace/token\"",source);
        Assert.Contains("\"reportUrl\":\"/sub/client-trace/reports\"",source);
        Assert.Contains("\"assetBaseUrl\":\"/sub/App_Plugins/ClientTrace/\"",source);
        Assert.DoesNotContain("</script>",source); Assert.Contains("\\u003C",source);
        Assert.DoesNotContain("requestToken",source); Assert.False(response.Headers.Contains("Set-Cookie"));
        settings.Frontend.UseSourceMaps=false;
        Assert.Contains("\"useSourceMaps\":false",await client.GetStringAsync("/sub/client-trace/client.js?v=old"));
        settings.Frontend.Enabled=false;
        Assert.Equal(HttpStatusCode.NotFound,(await client.GetAsync("/sub/client-trace/client.js")).StatusCode);
    }
    private static async Task<WebApplication> Host(ClientTraceOptions options)
    {
        var builder=WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Environment.WebRootFileProvider=new BootstrapFiles();
        builder.Services.AddLogging(); builder.Services.AddAntiforgery();
        builder.Services.AddSingleton<IOptionsMonitor<ClientTraceOptions>>(new FixedOptions(options));
        builder.Services.AddSingleton<ClientTraceRateLimiter>(); builder.Services.AddSingleton<FrontendJavascriptError>();
        builder.Services.AddControllers().AddApplicationPart(typeof(FrontendClientTraceController).Assembly).ConfigureApplicationPartManager(manager=>manager.FeatureProviders.Add(new FrontendOnly()));
        var app=builder.Build(); app.UsePathBase("/sub"); app.MapControllers(); await app.StartAsync(); return app;
    }
    private class AssetVersions:IFileVersionProvider
    {
        public string AddFileVersionToPath(PathString pathBase,string path)
        {
            Assert.Equal("/sub",pathBase.Value); Assert.Equal("/sub/App_Plugins/ClientTrace/frontend.js",path);
            return path+"?v=asset123";
        }
    }
    private class BootstrapFiles:IFileProvider
    {
        public IFileInfo GetFileInfo(string path)=>path=="App_Plugins/ClientTrace/frontend.js" ? new BootstrapFile() : new NotFoundFileInfo(path);
        public IDirectoryContents GetDirectoryContents(string subpath)=>NotFoundDirectoryContents.Singleton;
        public IChangeToken Watch(string filter)=>NullChangeToken.Singleton;
    }
    private class BootstrapFile:IFileInfo
    {
        public bool Exists=>true; public long Length=>43; public string? PhysicalPath=>null; public string Name=>"frontend.js";
        public DateTimeOffset LastModified=>DateTimeOffset.UnixEpoch; public bool IsDirectory=>false;
        public Stream CreateReadStream()=>new MemoryStream(Encoding.UTF8.GetBytes("window.testBootstrap=clientTraceBootstrap;"));
    }
    public class HtmlProxy:DispatchProxy
    {
        public ViewContext Context { get; set; }=null!;
        protected override object? Invoke(MethodInfo? targetMethod,object?[]? args) => targetMethod!.Name=="get_ViewContext" ? Context : throw new NotSupportedException();
    }
    private class FrontendOnly:IApplicationFeatureProvider<ControllerFeature>
    {
        public void PopulateFeature(IEnumerable<ApplicationPart> parts,ControllerFeature feature)
        { foreach(var controller in feature.Controllers.Where(x=>x.AsType()!=typeof(FrontendClientTraceController)).ToArray()) feature.Controllers.Remove(controller); }
    }
    private class FixedOptions(ClientTraceOptions value):IOptionsMonitor<ClientTraceOptions>
    { public ClientTraceOptions CurrentValue=>value; public ClientTraceOptions Get(string? name)=>value; public IDisposable? OnChange(Action<ClientTraceOptions,string?> listener)=>null; }
    private class RecordingLogger<T>:ILogger<T>
    {
        public LogLevel Level; public Dictionary<string,object?> Values=[];
        public IDisposable? BeginScope<TState>(TState state) where TState:notnull=>null;
        public bool IsEnabled(LogLevel logLevel)=>true;
        public void Log<TState>(LogLevel logLevel,EventId eventId,TState state,Exception? exception,Func<TState,Exception?,string> formatter)
        { Level=logLevel; Values=((IEnumerable<KeyValuePair<string,object?>>)(object)state!).ToDictionary(x=>x.Key,x=>x.Value); }
    }
}
