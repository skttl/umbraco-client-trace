# ClientTrace verification

Verified locally on 17 November 2026. Package: `Umbraco.Community.ClientTrace` version `17.0.0-beta.1`. Source checkout: `C:/workspaces/umbraco/packages/umbraco-client-trace`, branch `codex/implement-clienttrace`.

## Status

The implementation, package layout and release tooling passed local checks and independent task reviews. A final whole-implementation review found no confirmed Critical or Important source defects. Live CMS/browser acceptance and actual publishing are not verified. This package is prepared for review and those remaining checks, not claimed release-ready.

## Local checks

| Check | Evidence |
|---|---|
| Client tests | `npm test -- --reporter=dot`: 38 passed, 0 failed, four test files. |
| Server tests | `dotnet test tests/Umbraco.Community.ClientTrace.Tests/Umbraco.Community.ClientTrace.Tests.csproj -c Release --no-build --no-restore --verbosity quiet`: Passed 23, Failed 0, Skipped 0. |
| TypeScript and production build | `npm run build` passed, including type checking and both Vite outputs. |
| Actual production asset execution | `npm run test:assets` passed classic synchronous initialization, duplicate prevention, early error capture, actual hashed collector loading, PathBase, token/report flow, sanitization, retained exports and chunk references in a Node VM with browser/network primitives. This is not a real browser run. |
| Solution build | Release solution restore/build succeeded with zero errors. There were 48 warning instances from known historical dependency advisories, not 48 distinct vulnerabilities. |
| NuGet pack | Package project alone packed successfully. |
| Archive validation | `scripts/verify-package.py` passed the actual archive: 29 entries, six JavaScript assets, DLL/net10.0, version, dependency interval, README/icon, manifest, chunks/maps, notices, schema and target. |
| Rejection and release checks | `scripts/test-verifiers.py` passed positive and negative SemVer/package cases and temporary local Git ancestry cases. |
| Workflows | Checksum-verified actionlint 1.7.7 passed both workflow files. GitHub-hosted jobs have not been run. |
| Production npm dependency audit | `npm audit --omit=dev`: zero vulnerabilities. Full development audit retains seven advisories in pinned minimum backoffice/generator tooling. |

Final parent checks ran on source commit `cb4d9bb`; later changes only record documentation/progress. Source-quality review covered the whole implementation through `396938b`.

## Clean installed-package check

A second site was generated using the official `Umbraco.Templates::17.0.0` template and SQLite development option. It references CMS 17.0.0 and net10.0. It is separate from the checked-in demo and installs the local `.nupkg` through a PackageReference, without any ProjectReference.

The clean site restored from local artifacts and nuget.org through a newly authored credential-free test feed file and a separate package cache. It built with zero errors and 30 warning instances from the historical minimum CMS dependency graph.

Evaluated MSBuild items showed exactly one `appsettings-schema.Umbraco.Community.ClientTrace` registration from the installed buildTransitive target. The schema was copied to the consuming project root, 2005 bytes. Only file metadata and registration were checked; protected schema/configuration contents were not read for this acceptance check.

The installed static-web-asset build manifest contains 14 ClientTrace assets under `App_Plugins/ClientTrace`, including six JavaScript files, source maps, the Umbraco manifest and runtime notices. The final artifact DLL has the same SHA256 as the assembly in the separately installed package:

```text
25EFD7B2C850B779A48992B4F78E5D5EF52C844F0B1D80880E9F5650FC99C9DA
```

This demonstrates installation/build/schema and asset registration, not actual HTTP delivery. No Node installation is needed by a consuming site.

## Review fixes verified

- Bootstrap delivery was removed from the token issuance limiter; the final architecture serves frontend JavaScript statically and has no bootstrap controller.
- Parenthesized URLs no longer leave query/hash tails in client or server stack reports. Userinfo is also removed; frame coordinates are retained.
- Pending backoffice events are discarded across logout, unload and re-login; lifecycle changes abort pending API calls.
- Inspection of a real NuGet archive found and corrected the schema and MSBuild target package paths. The schema is at the archive root and the target is directly under buildTransitive.

## Remaining acceptance work

Application startup against the two generated local SQLite test databases and reading only ClientTrace test logs await explicit user permission. Automatic approval review rejected the demo restart under the no-database rule; no retry or indirect startup followed that rejection. Apps are currently stopped.

After permission, verify:

1. Startup of the PackageReference-only CMS 17.0.0 site.
2. Actual helper file hash and HTTP delivery/MIME of the manifest, bootstrap and hashed chunks, including a PathBase installation.
3. Demo uncaught errors and unhandled rejections through a real browser, plus actual authenticated backoffice reporting.
4. Representative Umbraco sourcemaps fetched and mapped in that browser; exclusions and fallback behavior.
5. Resulting structured fields and SourceContexts in the actual Log Viewer, and editor use of the installed schema.

Earlier Task1 live checks did prove CMS 17.0.0 and 17.8.2 startup, real management Swagger/operation IDs, anonymous Management rejection and oversized-body rejection. They preceded the final static client integration and are not substituted for the remaining checks above.

## Dependency and compatibility limits

The package dependency floor remains `[17.0.0,18.0.0)` and compilation/installation against 17.0.0 was verified. That historical runtime and some transitives have known advisories. Use a current supported 17.x patch for deployment; the checked-in demo references 17.8.2.

The updated demo is a deliberate development choice. It could conceal minimum-version regressions if used alone, which is why the separate 17.0.0 installed-package check is retained. Runtime acceptance at that floor is still pending.

Public reports can be fabricated. Antiforgery does not establish that an error really happened. URL cleaning and bounded fields do not guarantee that arbitrary free-text errors contain no sensitive data. Early startup, navigation, network failure and blocked cookies can lose reports. Source maps require accessible matching resources. Server rate budgets are per process and resolved remote IP; shared IPs share those budgets.

## Publishing state

GitHub environment `release` and its `NUGET_USER=skttl` secret were created and verified. The workflow uses `contents: read`, `id-token: write` and `NuGet/login@v1`; no permanent NuGet API key was created.

The user elected to create the NuGet trust policy personally. Exact fields are in [trusted publishing setup](trusted-publishing.md): owner `skttl`, repository `umbraco-client-trace`, workflow filename `publish.yml`, environment `release`.

No code was pushed, tag created, GitHub release created or package published. Actual OIDC login/publication has not been exercised. The NuGet package ID returned no public versions during the registry check; that does not reserve ownership.
