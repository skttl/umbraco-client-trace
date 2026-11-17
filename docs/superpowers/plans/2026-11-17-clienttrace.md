# ClientTrace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify Umbraco.Community.ClientTrace for Umbraco 17, including browser error reporting, client-side sourcemaps, packaging and NuGet trusted publishing preparation.

**Architecture:** One Razor SDK package auto-registers services and Management API endpoints through Umbraco. A shared browser reporter serves the automatic backoffice extension and opt-in Razor helper, with separate authenticated and antiforgery-protected transports. Existing ILogger/Serilog handles storage and viewing.

**Tech Stack:** .NET 10; Umbraco dependency interval `[17.0.0,18.0.0)`; TypeScript/Vite; generated @hey-api/openapi-ts 0.85.0 client compatible with Umbraco 17.0; stacktrace-parser and @jridgewell/trace-mapping, both MIT. Prefer xUnit/VSTest and Vitest for behavior tests; choose concrete compatible versions during restore.

**Spec:** `docs/superpowers/specs/2026-11-17-clienttrace-design.md`.

## Global Constraints

- Work in `C:/workspaces/umbraco/packages/umbraco-client-trace`, branch `codex/implement-clienttrace`; do not commit on main, create releases/tags or publish packages.
- Repository URL: `https://github.com/skttl/umbraco-client-trace`; NuGet user `skttl`; MIT; package version starts `17.0.0-beta.1`.
- Follow `C:/Users/skttl/.codex/skills/umbraco-package-repository/SKILL.md`; preserve official demo template output, SQLite, package-project-only packing and generated API bindings.
- No reading protected configuration files, logs, credentials or databases. Generated configuration stays intact; new known non-secret config can be written as needed. Do not query databases directly. App startup for the template-generated SQLite demo is in scope of the explicitly invoked repository skill.
- One package at `src/Umbraco.Community.ClientTrace`; assets at `/App_Plugins/ClientTrace/`, not a duplicated wwwroot/App_Plugins path. Installing the NuGet package requires no Node runtime.
- Options are `Umbraco:Community:ClientTrace:{Backoffice|Frontend}` with independent `Enabled=true`, `UseSourceMaps=true`, `ExcludedScripts=[]`, `ExcludedPaths=[]`, `ExcludeUnidentifiedScripts=false`.
- Helper is `@Html.AddClientTrace()`; logger SourceContexts omit `.Services`: `Umbraco.Community.ClientTrace.BackofficeJavascriptError` and `Umbraco.Community.ClientTrace.FrontendJavascriptError`.
- Root icon.png and icon.svg are already chosen cobalt/peach/mint Monitor Dot; preserve attribution in docs/lucide-license.txt and package notices.
- Subagents do not spawn further subagents. Record tests and implementation limits in task reports. Only one implementation agent edits the checkout at a time.

## Review Focus

1. Umbraco 17.0 authentication must not depend on configureClient introduced in later 17.x; verify generated client's token callback and unauthorized rejection (tasks 1, 2, 4).
2. Client failures, hostile rejection objects and simultaneous errors must not recurse, duplicate listeners or multiply token/map requests (task 2).
3. Exclusions must be applied before sourcemap fetching and must remain independent after SPA navigation (task 2).
4. Raw resource URLs used for mapping must retain version queries internally while reported URLs omit queries/fragments (tasks 1, 2).
5. A successful project-reference build is insufficient: minimum-version NuGet installation, static assets, schema, generated chunks and helper rendering must be checked (tasks 3, 4).

## File responsibilities

- Root solution, global.json, .gitignore, LICENSE, NuGet.Config, icon files and Marketplace metadata establish repository conventions.
- Server root namespace contains ClientTraceOptions/ClientTraceBrowserOptions, JavascriptErrorReport, ClientTraceComposer, endpoint controllers, BackofficeJavascriptError, FrontendJavascriptError, validation/rate limiting and ClientTraceHtmlExtensions.
- `src/Umbraco.Community.ClientTrace/Client/` contains manifest, entrypoint, frontend bootstrap, shared reporter, exclusions, sourcemaps, API generation configuration and committed generated bindings.
- `tests/Umbraco.Community.ClientTrace.Tests/` holds server behavior tests; browser behavior tests live beside client sources.
- `demo/Umbraco.Community.ClientTrace.TestSite/` is generated using Umbraco.Templates 17.0.0, then references the package project.
- `scripts/` contains a reusable package verifier and release tag validator with assert-based self-checks.
- `.github/workflows/ci.yml` and `publish.yml` reuse the same build/test/pack/package verification requirements.
- `docs/nuget-readme.md`, root README, Marketplace README and release setup guide document actual behavior and setup.

### Task 1: Server package and template-generated demo

**Files:** root solution/build/license/ignore files; `src/Umbraco.Community.ClientTrace/*.cs`, `.csproj`, schema and buildTransitive targets; server test project; official template-generated demo.

**Interfaces:** Produce `ClientTraceOptions` at the required section with `Backoffice`/`Frontend` browser options. Produce `JavascriptErrorReport` with EventType, ErrorType, Message, PagePath, ScriptUrl, LineNumber, ColumnNumber, StackTrace, MappedStackTrace. Freeze and document real HTTP routes/operation IDs and JSON shapes in the task report before handing off to client implementation. Expose authenticated Management API configuration GET and report POST; public frontend bootstrap GET, token GET and antiforgery report POST. Helper emits only a synchronous external bootstrap-controller script URL with asp-append-version-like hash of the actual built bootstrap asset. Controller embeds safely serialized options, token-url and report-url alongside the built bootstrap and returns no-store JavaScript. No data attributes or actual antiforgery token in helper HTML. Final bootstrap code/config variable contract is frozen in task1 report and supplied by task2.

- [x] Write focused tests first for independent option defaults/binding, disabled endpoints, invalid event/oversized data, URL cleaning, helper omission/escaping/PathBase, structured logger fields and frontend antiforgery behavior. Capture RED evidence where practical.
- [x] Create one Razor SDK package with smallest required Umbraco API dependency interval, net10.0, version 17.0.0-beta.1, metadata, packed README/icon/notices/schema and StaticWebAssetBasePath App_Plugins/ClientTrace. Exclude raw Client sources and generated wwwroot from Git.
- [x] Register options, controllers and services via supported Umbraco17 composer mechanisms without requiring Program.cs edits. Add bounded server validation, resource limits and separate fixed logger classes. Do not mutate global logging or antiforgery settings.
- [x] Implement `IHtmlContent AddClientTrace(this IHtmlHelper html)` as a safely encoded external script tag pointing at the public bootstrap controller with asset-based cachebusting, without visitor tokens or separate configuration data attributes in HTML. Return no-store JavaScript from controller, containing safely serialized config and PathBase-aware token/report URLs. Empty helper output when Frontend.Enabled is false. Test cachebusting through IFileVersionProvider, disabled behavior, encoding and PathBase. Freeze the config/compiled-bootstrap contract in the report.
- [x] Generate demo with official `Umbraco.Templates::17.0.0`; inspect help before choosing supported SQLite flags. Verify initial 17.0 boot, then update checked-in demo CMS reference to current 17.8.2 to avoid recommending the old runtime with known dependency advisories. Preserve other generated project/startup/configuration and add project reference; IsPackable=false on demo/tests. Task4 still checks a separate minimum17.0 package-installed site.
- [x] Add configuration schema and correct Umbraco17 buildTransitive registration for both sections. Schema defaults and property names must match options.
- [x] Run the focused server tests to GREEN, solution build when client output permits, and template startup smoke check. Record exact template command, test command/count and any integration limits in `.superpowers/sdd/clienttrace/task-1-report.md`.
- [x] Self-review, check branch and stage only task files; commit completed work. Do not stage protected generated development configuration; use explicit safe source paths and review staged filenames.

### Task 2: Browser collector, sourcemaps and generated authenticated client

**Files:** only `src/Umbraco.Community.ClientTrace/Client/**` and any necessary package asset integration correction agreed with controller. Source API bindings must be generated, never handwritten.

**Interfaces:** Consume task1's DTO/HTTP/bootstrap contract and actual demo OpenAPI document. On Umbraco17.0, consume UMB_AUTH_CONTEXT.getOpenApiConfiguration(), then set generated client's baseUrl, credentials and async token/auth callback. Use actual package configuration response; no duplication of default values that could diverge from the server schema.

- [ ] Write Vitest RED behavior checks for error/rejection normalization, hostile/cyclic rejections, exact/wildcard exclusions, script identification, SPA paths, independent sections, unidentified scripts and URL sanitization.
- [ ] Add manifest `backofficeEntryPoint`, stable entrypoint.js under /App_Plugins/ClientTrace/, externalizing @umbraco-cms/ imports. Pin backoffice npm dependency compatible with 17.0.0. Generated output goes to ../wwwroot.
- [ ] Generate committed bindings using pinned @hey-api/openapi-ts 0.85.0 from the running demo's version-specific custom OpenAPI document. Connect auth using the minimum-version API, not newer configureClient.
- [ ] Implement authenticated backoffice listeners once, without preventDefault/console wrapping. Shared reporter filters events before mapping/sending, bounds repeated events and work, and uses current page path on every event.
- [ ] Implement a small classic external frontend bootstrap that registers listeners synchronously and loads shared reporter as needed. It must work before subsequent scripts fail and must not import Umbraco backoffice modules on the public site. Respect CSP by avoiding inline executable script. Use stable asset/chunk URLs and PathBase.
- [ ] Fetch antiforgery token only on first allowed frontend error, share concurrent token fetch, keep token in memory and POST with same-origin cookie/header. No persistent queue/retry loop. All collector-owned failures are caught and never recursively logged.
- [ ] Lazily load stacktrace-parser and @jridgewell/trace-mapping; resolve sourceMappingURL, preserve version queries during fetch, bound fetch size/time/cache and retain raw frames when mapping fails. Do not send source content or maps. Support common inline maps if the chosen library already does so without large added complexity.
- [ ] Add GREEN tests for concurrent token/map fetch, mapping from a known fixture, partial/failed/timeout mapping, UseSourceMaps=false, no fetch for exclusions, unavailable browser data, duplicate init and non-recursive failures. Test generated production assets/URLs with Vite build.
- [ ] Commit lockfile and generated bindings; record dependencies/licenses, API generation command and exact test evidence in task-2-report.md. Commit only intended client/integration files after checking branch.

### Task 3: Documentation, CI, publishing and package verification

**Files:** `.github/workflows/ci.yml`, `publish.yml`; `scripts/verify-package.*`, release validator/self-checks; root README, docs/nuget-readme.md, docs/trusted-publishing.md, Marketplace metadata/readme and third-party notices. Coordinate unavoidable csproj metadata edits with controller.

**Interfaces:** Consume completed package, client npm scripts and tests, official template command and actual asset names from tasks1/2. Both workflows run same package verifier. GitHub environment `release`, environment secret `NUGET_USER=skttl`; NuGet policy repository owner skttl, repository umbraco-client-trace, workflow filename publish.yml, environment release.

- [ ] Implement package ZIP verification for ID, supplied version, net10.0, interval [17.0.0,18.0.0), DLL, README, icon, manifest/entrypoints/chunks/schema/targets/notices and absence of demo, raw client sources, node_modules, logs, credentials and databases. Include small self-checks for failure paths.
- [ ] Validate full SemVer stable/prerelease tag with no numeric prerelease leading zero; only strip leading v. Derive expected branch main for 17; require tag version major and project package major/dependency floor to match. Verify tagged commit is ancestor of origin/main with fetched history before publishing.
- [ ] Create CI on pull requests and main/v17/main with read-only permissions, npm ci/client checks/build, .NET restore/build/tests, package-project-only pack and artifact inspection. Use official current action versions; do not enable unnecessary token permissions.
- [ ] Create tag-triggered publishing with release environment, contents:read, id-token:write, NuGet/login@v1 and a short-lived output key. Build/test/pack exact tag version and verify before login/push. Do not silently reuse existing NuGet versions.
- [ ] Validate workflows with pinned actionlint and verify downloaded executable checksum; YAML parsing alone is insufficient. Exercise release validator and package verifier locally.
- [ ] Document exact install/config/helper usage, all defaults and matching semantics, maps limitations, log field meaning, local build/demo/API generation, minimum compatibility, shared hosting/rate-limit limits and exact trusted publishing settings. Match current Marketplace schema.
- [ ] Record commands/results in task-3-report.md, check branch, commit intended files. Do not trigger publication, create tags, delete secrets or change remote default branch.

### Task 4: Installed package verification and final review

**Files:** integration fixes only if verified failures justify them; test reports in ignored work area; final validation record in docs.

**Interfaces:** Consume actual built nupkg, verifier, generated demo template and the full spec.

- [ ] Run npm ci, client tests/build, solution restore/build, server tests and package-project-only Release pack. Inspect package with the shared verifier.
- [ ] Generate a separate clean Umbraco17.0.0 site outside demo using the official template. Install the built nupkg, with no project reference. Start it, check boot and real static manifest/bootstrap/chunk URLs and schema registration.
- [ ] Verify public frontend helper, token cookie/header flow, rejected missing token and disabled options through browser or meaningful integration checks; verify authenticated backoffice collection through supported local setup when available. No direct database queries and no reading logs without permission.
- [ ] Create a full-diff review artifact and dispatch a fresh reviewer for spec and quality. One fix wave and scoped re-review handles real findings; unresolved verification limits must be stated accurately.
- [ ] Create GitHub release environment and set only NUGET_USER=skttl using authenticated tooling when available. Prepare NuGet policy through browser if accessible; otherwise give exact actionable setup and retain this as an explicit outstanding item. Never claim OIDC publishing verified without a successful authorized release.
- [ ] Update plan checkboxes and ledger, preserve local checkout/branch. No merge, push, tags or NuGet publication without further authorization. Report completed work, test results, package path and any remaining account setup.

## Execution authorization

The user explicitly requested implementation with subagents in the named checkout after approving the design and its final configuration/logger naming corrections. This plan makes that already-authorized work concrete; proceed without an additional planning approval round. Repository setup and test commands may need sandbox escalation because the target checkout is outside this chat's writable roots. Do not bypass denials.
