namespace Umbraco.Community.ClientTrace;

public sealed class ClientTraceOptions
{
    public const string SectionName = "Umbraco:Community:ClientTrace";
    public BrowserTraceOptions Backoffice { get; set; } = new();
    public BrowserTraceOptions Frontend { get; set; } = new();
}

public sealed class BrowserTraceOptions
{
    public bool Enabled { get; set; } = true;
    public bool UseSourceMaps { get; set; } = true;
    public string[] ExcludedScripts { get; set; } = [];
    public string[] ExcludedPaths { get; set; } = [];
    public bool ExcludeUnidentifiedScripts { get; set; }
}