# NuGet trusted publishing

`publish.yml` uses GitHub OIDC through `NuGet/login@v1`. The job has `contents: read` and `id-token: write`, runs in the GitHub `release` environment, and obtains a short-lived API key only after build, tests, pack and ZIP verification pass. No permanent NuGet API key is stored.

## One-time settings

The repository is [skttl/umbraco-client-trace](https://github.com/skttl/umbraco-client-trace). Its `release` environment and environment secret `NUGET_USER=skttl` have been configured. The value is the NuGet profile name, not an email address. Environment reviewers may be added according to the maintainer's release policy.

The maintainer must create the NuGet policy themselves at [nuget.org trusted publishing](https://www.nuget.org/account/trustedpublishing), with these exact values:

| Policy field | Value |
| --- | --- |
| Repository owner | `skttl` |
| Repository | `umbraco-client-trace` |
| Workflow file | `publish.yml` |
| Environment | `release` |
| NuGet account/profile | `skttl` |

Use the filename only, without `.github/workflows/`. Renaming the file or environment requires updating the policy. Select a policy owner with rights to publish `Umbraco.Community.ClientTrace`. For a new package, allow the required new-package publication scope. A private repository policy may initially be active for only 7 days and becomes permanent after a successful publish. These rules are described in [Microsoft's trusted publishing documentation](https://learn.microsoft.com/en-us/nuget/nuget-org/trusted-publishing).

The policy and a live OIDC publication have not been verified by this repository's initial implementation. No release, tag or package has been published as part of setup.

## Release checks

Before the first publish, run the package-project-only command from the root:

```shell
dotnet pack src/Umbraco.Community.ClientTrace/Umbraco.Community.ClientTrace.csproj -c Release -o artifacts
python scripts/verify-package.py artifacts/Umbraco.Community.ClientTrace.17.0.0-beta.1.nupkg 17.0.0-beta.1
python scripts/test-verifiers.py
```

Build browser assets first as shown in the [development README](../README.md). Also install the resulting package in a separate clean template-generated minimum-version site and verify registration, startup, asset paths and schema support. A project reference alone does not check NuGet installation.

After policy setup and normal release approval, release tags use full SemVer such as `v17.0.0`, `v17.0.0-beta.1` or `v17.0.0-rc1`. The validator strips only the initial `v`, rejects incomplete versions and numeric prerelease identifiers with leading zeroes, and requires package/project major 17 with Umbraco `[17.0.0,18.0.0)`. Valid SemVer build metadata is accepted, but NuGet ignores it when identifying a version. Never reuse a normalized published version.

Checkout fetches complete history. The validator fetches `origin/main`, checks that HEAD is the exact tagged commit, and uses `git merge-base --is-ancestor` to require that commit to be on the expected release branch. The repository must have an integrated remote `main` before release. No arbitrary version branch input bypasses this check.

Publishing runs `npm ci`, synchronizes the private npm package and Umbraco manifest to the tag version without scripts or Git tags, then runs the client tests/build/production asset checks. It restores, builds, tests and packs .NET with that same version. The shared verifier checks the produced package, including manifest version, and the rejection self-checks run before login. Only that verified artifact is uploaded/pushed. `--skip-duplicate` is deliberately absent; version reuse must fail visibly.

Workflows use current official action versions verified during implementation. CI also executes actionlint 1.7.7 after checking the official Linux archive's pinned SHA256. A successful local actionlint check establishes workflow syntax, not that GitHub permissions, NuGet policy or real publication work end to end.
