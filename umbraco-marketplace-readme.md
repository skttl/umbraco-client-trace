# ClientTrace

See uncaught JavaScript errors and unhandled promise rejections in Umbraco's existing logs and Log Viewer. ClientTrace collects backoffice errors automatically after installation. Add `@Html.AddClientTrace()` to collect errors on your public website too.

For Umbraco 17 on .NET 10. No external error service or additional database is needed. Source map translation runs in the browser when matching scripts/maps are accessible. Script and page exclusions can be configured independently for backoffice and frontend.

[Installation, configuration and examples](https://github.com/skttl/umbraco-client-trace/blob/main/docs/nuget-readme.md) include delivery limits, source map requirements and privacy considerations. [Source and development](https://github.com/skttl/umbraco-client-trace) · [Report an issue](https://github.com/skttl/umbraco-client-trace/issues).

MIT licensed, with included third-party notices.
