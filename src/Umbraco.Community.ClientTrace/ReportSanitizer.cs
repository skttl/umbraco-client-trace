using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;

namespace Umbraco.Community.ClientTrace;

internal static partial class ReportSanitizer
{
    public static bool TryPrepare(JavascriptErrorReport report, out JavascriptErrorReport prepared)
    {
        prepared = report;
        if (!Validator.TryValidateObject(report, new ValidationContext(report), null, true)) return false;
        var page = CleanUrl(report.PagePath);
        var script = string.IsNullOrEmpty(report.ScriptUrl) ? null : CleanUrl(report.ScriptUrl);
        if (page is null || (report.ScriptUrl is { Length: > 0 } && script is null)) return false;
        prepared = report with
        {
            PagePath = ScriptPath(page)!, ScriptUrl = script,
            StackTrace = CleanStack(report.StackTrace), MappedStackTrace = CleanStack(report.MappedStackTrace)
        };
        return true;
    }

    private static string? CleanUrl(string value)
    {
        var cut = value.IndexOfAny(['?', '#']);
        var clean = cut < 0 ? value : value[..cut];
        if (clean.StartsWith('/') && !clean.StartsWith("//")) return clean;
        return Uri.TryCreate(clean, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https"
            ? new UriBuilder(uri) { UserName="", Password="" }.Uri.GetLeftPart(UriPartial.Path) : null;
    }

    public static string? ScriptPath(string? value) => value is null ? null :
        Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" ? uri.AbsolutePath : value;

    private static string? CleanStack(string? value) => value is null ? null : StackUrl().Replace(value, match =>
    {
        var position = Position().Match(match.Value);
        var url = position.Success ? match.Value[..position.Index] : match.Value;
        return (CleanUrl(url) ?? url) + position.Value;
    });

    [GeneratedRegex("https?://[^\\s<>\"']+", RegexOptions.NonBacktracking)]
    private static partial Regex StackUrl();
    [GeneratedRegex(@":\d+(?::\d+)?\)*$|\)+$", RegexOptions.NonBacktracking)]
    private static partial Regex Position();
}