using Microsoft.Extensions.Logging;

namespace Umbraco.Community.ClientTrace;

public sealed class BackofficeJavascriptError(ILogger<BackofficeJavascriptError> logger)
{
    internal void Write(JavascriptErrorReport report) => JavascriptErrorLog.Write(logger, "Backoffice", report);
}

public sealed class FrontendJavascriptError(ILogger<FrontendJavascriptError> logger)
{
    internal void Write(JavascriptErrorReport report) => JavascriptErrorLog.Write(logger, "Frontend", report);
}

internal static class JavascriptErrorLog
{
    public static void Write(ILogger logger, string surface, JavascriptErrorReport report) => logger.LogError(
        "{ClientSurface} JavaScript error: {ClientErrorType}: {ClientErrorMessage}; Event: {ClientEventType}; Page: {ClientPagePath}; Script: {ClientScriptUrl}; Script path: {ClientScriptPath}; Line: {ClientLineNumber}; Column: {ClientColumnNumber}; Stack: {ClientStackTrace}; Mapped stack: {ClientMappedStackTrace}",
        surface, report.ErrorType, report.Message, report.EventType, report.PagePath, report.ScriptUrl,
        ReportSanitizer.ScriptPath(report.ScriptUrl), report.LineNumber, report.ColumnNumber, report.StackTrace, report.MappedStackTrace);
}