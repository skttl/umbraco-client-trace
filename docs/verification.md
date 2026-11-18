# ClientTrace verification

Verified locally on 17 and 18 November 2026. Package: `Umbraco.Community.ClientTrace` version `17.0.0-beta.1`. Source checkout: `C:/workspaces/umbraco/packages/umbraco-client-trace`, branch `codex/implement-clienttrace`.

## Status

The implementation, package layout and release tooling passed local checks and independent task reviews. A final whole-implementation review found no confirmed Critical or Important source defects. Live browser acceptance now passes for frontend and authenticated backoffice errors and rejected promises, including mapped fixture stacks, installed-package delivery and PathBase. Actual publishing remains unverified. Remaining limits are listed below; this is not a blanket release-readiness claim.

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

The subsequent live checks below also verified actual HTTP delivery from this installed package. No Node installation is needed by a consuming site.

## Review fixes verified

- Bootstrap delivery was removed from the token issuance limiter; the final architecture serves frontend JavaScript statically and has no bootstrap controller.
- Parenthesized URLs no longer leave query/hash tails in client or server stack reports. Userinfo is also removed; frame coordinates are retained.
- Pending backoffice events are discarded across logout, unload and re-login; lifecycle changes abort pending API calls.
- Inspection of a real NuGet archive found and corrected the schema and MSBuild target package paths. The schema is at the archive root and the target is directly under buildTransitive.

## Live CMS and browser acceptance

On 18 November the user explicitly authorized running both named local sites against their own SQLite test databases and reading only their ClientTrace test events. The checked-in CMS 17.8.2 demo and separate PackageReference-only CMS 17.0.0 site started successfully. The minimum site used supported unattended installation with process-only disposable test credentials. No direct database queries or protected runtime configuration reads were used. Both local testsite processes were stopped after browser acceptance completed.

| Check | Observed result |
|---|---|
| Installed-package assets | Manifest, six JavaScript entries/chunks and six maps returned200 with correct MIME on 17.0.0 at root and `/clienttrace-test`. The same13 URLs passed on the17.8.2 demo. Maps were served as `text/plain`; JavaScript as `text/javascript`. |
| Helper and PathBase | `/clienttrace-demo` rendered the synchronous helper and expected `data-client-trace` options. Actual HTTP frontend.js SHA256 base64url matched helper `v=m3nh1DllBCjITeyTKwr4wB9NNWlUrezSvHv95fxlZ_E`. Prefixed asset, token, report and asset-base URLs contained `/clienttrace-test` correctly. |
| Real antiforgery | Missing-token report400, token issuance200 with no-store, same-cookie/supplied-header report204. Passed on demo and installed site, including the prefixed route. Actual token/cookie values were never printed or saved. |
| Management authorization | Anonymous configuration requests401 at root and prefixed routes. Actual authenticated browser reports204. |
| Authenticated backoffice browser | Real uncaught Error and unhandled rejection produced `BackofficeJavascriptError` events with raw and mapped stacks pointing to `backoffice-acceptance.ts`. First pair at08:38:38.9395542Z and08:38:40.3627037Z; repeated pair also passed. |
| Frontend browser and PathBase | Real uncaught Error and unhandled rejection under HTTPS `/clienttrace-test/clienttrace-demo` produced `FrontendJavascriptError` events with raw and mapped stacks pointing to `frontend-acceptance.ts`, at08:46:44.3101561Z and08:46:45.7385552Z. |
| Demo without matching map | The checked-in17.8.2 random demo produced an actual browser unhandled rejection with raw stack and no mapped stack, preserving the report when its script had no linked map. |
| Real Umbraco map availability | Both17.0.0 and17.8.2 exposed `packages/core/entry-point.js` and its linked version3 map through actual backoffice HTTP URLs. The17.8.2 map included mappings and sourcesContent for `src/packages/core/entry-point.ts`. Several app scripts had no linked map and adjacent map URLs404. |
| Actual Log Viewer | The authenticated Umbraco Log Viewer filtered `StartsWith(SourceContext,'Umbraco.Community.ClientTrace.')` displayed frontend and backoffice error/rejection records and mapped stacks. Expanded backoffice event details were inspected. Full categories were `Umbraco.Community.ClientTrace.BackofficeJavascriptError` and `Umbraco.Community.ClientTrace.FrontendJavascriptError`. |

Browser fixtures and diagnostics live only in the ignored temporary consuming site. The package was not modified for these checks. An initial evidence scan incorrectly mixed local and UTC DateTime values and excluded valid events; the marker-only rescan confirmed all records above. That evidence-filter error is resolved and was not a product defect.

Earlier Task1 checks additionally verified real Management Swagger/operation IDs and oversized-body rejection. Local tests and the live results cover different layers; neither is substituted for the other.

## Remaining acceptance limits

A browser exception thrown inside an Umbraco-owned module has not been mapped end to end. Matching real Umbraco maps were fetched successfully, while end-to-end browser mapping used controlled TypeScript fixtures. Interactive editor autocomplete from the installed schema was not checked; schema packaging, registration and copy were verified separately.

Live browser exclusion combinations and disabled-surface scenarios were not exercised in this run; their local tests remain the evidence for those cases. Publishing and GitHub-hosted CI are also unverified.

## Dependency and compatibility limits

The package dependency floor remains `[17.0.0,18.0.0)` and compilation/installation against 17.0.0 was verified. That historical runtime and some transitives have known advisories. Use a current supported 17.x patch for deployment; the checked-in demo references 17.8.2.

The updated demo is a deliberate development choice. It could conceal minimum-version regressions if used alone, which is why the separate 17.0.0 installed-package check is retained. Runtime browser acceptance at that floor now passes for the cases above.

Public reports can be fabricated. Antiforgery does not establish that an error really happened. URL cleaning and bounded fields do not guarantee that arbitrary free-text errors contain no sensitive data. Early startup, navigation, network failure and blocked cookies can lose reports. Source maps require accessible matching resources. Server rate budgets are per process and resolved remote IP; shared IPs share those budgets.

## Publishing state

GitHub environment `release` and its `NUGET_USER=skttl` secret were created and verified. The workflow uses `contents: read`, `id-token: write` and `NuGet/login@v1`; no permanent NuGet API key was created.

The user elected to create the NuGet trust policy personally. Exact fields are in [trusted publishing setup](trusted-publishing.md): owner `skttl`, repository `umbraco-client-trace`, workflow filename `publish.yml`, environment `release`.

No code was pushed, tag created, GitHub release created or package published. Actual OIDC login/publication has not been exercised. The NuGet package ID returned no public versions during the registry check; that does not reserve ownership.
