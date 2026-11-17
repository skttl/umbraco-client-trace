using System.ComponentModel.DataAnnotations;

namespace Umbraco.Community.ClientTrace;

public sealed record JavascriptErrorReport
{
    [Required, RegularExpression("^(error|unhandledrejection)$")]
    public required string EventType { get; init; }
    [StringLength(128)]
    public string? ErrorType { get; init; }
    [Required(AllowEmptyStrings = true), StringLength(2048)]
    public required string Message { get; init; }
    [Required, StringLength(2048)]
    public required string PagePath { get; init; }
    [StringLength(2048)]
    public string? ScriptUrl { get; init; }
    [Range(1, int.MaxValue)]
    public int? LineNumber { get; init; }
    [Range(1, int.MaxValue)]
    public int? ColumnNumber { get; init; }
    [StringLength(8192)]
    public string? StackTrace { get; init; }
    [StringLength(8192)]
    public string? MappedStackTrace { get; init; }
}