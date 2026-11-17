# ClientTrace

![ClientTrace icon](icon.png)

JavaScript error logging for Umbraco 17. Uncaught errors and unhandled promise rejections go to the site's existing logs and Log Viewer. Backoffice collection starts automatically; public website collection uses `@Html.AddClientTrace()`.

[Install, configure and use ClientTrace](docs/nuget-readme.md) · [Report an issue](https://github.com/skttl/umbraco-client-trace/issues) · [Trusted publishing setup](docs/trusted-publishing.md)

## Compatibility and repository

One NuGet package, `Umbraco.Community.ClientTrace`, targets `net10.0` with Umbraco `[17.0.0,18.0.0)`. `main` targets Umbraco 17; future older-major maintenance branches follow `vN/main`. The package and browser backoffice dependency retain the 17.0.0 compatibility floor. The development demo currently references Umbraco 17.8.2.

| Path | Purpose |
| --- | --- |
| `src/Umbraco.Community.ClientTrace/` | Razor class library, Management API, frontend endpoints and configuration schema. |
| `src/Umbraco.Community.ClientTrace/Client/` | TypeScript clients, generated API bindings, tests and Vite build. |
| `tests/Umbraco.Community.ClientTrace.Tests/` | xUnit server validation, authorization, antiforgery and logging tests with in-memory TestServer. |
| `demo/Umbraco.Community.ClientTrace.TestSite/` | Official template site with project reference and an intentional browser-error demo. |
| `docs/nuget-readme.md` | User documentation, packed as the NuGet README. |
| `scripts/` | Shared package and release verifiers. |

## Local development

Use .NET SDK 10, Node.js 22.21.1 and npm 10.9.4, plus Python 3.10 or newer for package checks. `global.json` selects the 10.0.100 SDK feature baseline with `latestFeature` roll-forward. The client requires Node >=22.17.1 and npm >=10.9.2. Hosting the installed NuGet package requires neither Node nor Python.

Run from the repository root:

```shell
cd src/Umbraco.Community.ClientTrace/Client
npm ci
npm test
npm run build
npm run test:assets
cd ../../..
dotnet restore Umbraco.Community.ClientTrace.slnx
dotnet build Umbraco.Community.ClientTrace.slnx -c Release --no-restore
dotnet test tests/Umbraco.Community.ClientTrace.Tests/Umbraco.Community.ClientTrace.Tests.csproj -c Release --no-build --no-restore
dotnet pack src/Umbraco.Community.ClientTrace/Umbraco.Community.ClientTrace.csproj -c Release --no-build --no-restore -o artifacts
python scripts/verify-package.py artifacts/Umbraco.Community.ClientTrace.17.0.0-beta.1.nupkg 17.0.0-beta.1
python scripts/test-verifiers.py
```

`npm run build` includes `npm run typecheck`. `npm run test:assets` executes the built classic bootstrap and imported production chunks with mocked browser/network primitives. It does not replace live browser testing. Generated `wwwroot` output is ignored; rebuild it before .NET build/pack. Assets are served at `/App_Plugins/ClientTrace/` without an extra nested `App_Plugins` directory.

Only the package project is packed. CI and publishing inspect the actual ZIP for metadata, framework, dependency interval, DLL, readme, icon, schema, registration target, entry points, dynamic imports and required notices. They reject demo/client source, node_modules, runtime configuration, credentials, logs and databases. Verifier self-checks exercise malformed versions and mutated archives.

The minimum Umbraco 17.0 dependency graph currently reports NuGet security advisories. Production JavaScript dependencies audit clean with `npm audit --omit=dev`; the full development dependency audit has 7 known advisories in the pinned minimum backoffice/generator toolchain. Do not mistake runtime-only auditing for a clean full audit. No blanket suppression or forced incompatible upgrades are applied. Use current supported CMS patches for deployed sites.

## Demo and API generation

The checked-in demo was generated from the official Umbraco 17.0.0 template, with this exact command:

```shell
dotnet new install Umbraco.Templates::17.0.0
dotnet new umbraco -n Umbraco.Community.ClientTrace.TestSite -o demo/Umbraco.Community.ClientTrace.TestSite --development-database-type SQLite --no-restore --no-update-check
```

Its generated startup and base settings are retained. A project reference and `IsPackable=false` were added; its CMS reference was subsequently updated to 17.8.2 after minimum-version checks. Do not regenerate over the existing demo for normal development.

```shell
dotnet run --project demo/Umbraco.Community.ClientTrace.TestSite/Umbraco.Community.ClientTrace.TestSite.csproj --no-launch-profile --urls http://localhost:5271
```

Complete the normal Umbraco installer on first use, using SQLite and a local administrator account. Keep passwords, databases, logs and media out of Git. `/clienttrace-demo` intentionally throws one uncaught Error or unhandled rejection after a random 3-6 seconds on every page load. The demo script is excluded from NuGet.

The Management API client is generated, not handwritten. With the demo running, regenerate from its actual version-specific OpenAPI document:

```shell
cd src/Umbraco.Community.ClientTrace/Client
npm run generate
```

`CLIENT_TRACE_OPENAPI_URL` can override the default `http://localhost:5271/umbraco/swagger/management/swagger.json`. The pinned generator selects only `GetClientTraceConfiguration` and `PostClientTraceReport`, including bearer security metadata. Commit generated binding changes together with contract changes. Do not run the generator during package installation or CI, where a running CMS is unnecessary.

## Releases

[Configure trusted publishing](docs/trusted-publishing.md) before a first release. CI runs on pull requests and pushes to `main`/`v17/main` with read-only permissions. Publishing accepts `v`-prefixed SemVer tags, verifies major 17, the declared compatibility interval and ancestry on `origin/main`, then builds, tests, packs and verifies that exact version before requesting a short-lived NuGet key.

The `release` environment and `NUGET_USER` secret are configured. The NuGet trust policy remains a maintainer setup step; no real OIDC publish is claimed. No permanent API key is used, and a reused NuGet version fails rather than being skipped. Build metadata does not distinguish NuGet versions for uniqueness.

## License

[MIT](LICENSE). The chosen Monitor Dot icon uses [Lucide](https://lucide.dev/); attribution is in [docs/lucide-license.txt](docs/lucide-license.txt). Runtime third-party notices ship with the browser assets in the NuGet package.
