"""Small rejection checks for release and package boundaries; no third-party dependencies."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import subprocess
import sys
import xml.etree.ElementTree as ET

sys.dont_write_bytecode = True
from zipfile import ZipFile


def load(filename):
    spec = importlib.util.spec_from_file_location(filename, Path(__file__).with_name(filename + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


release = load('validate-release')
package = load('verify-package')
project = release.PROJECT.read_text(encoding='utf-8-sig')


def rejects(operation):
    try:
        operation()
    except (ValueError, KeyError):
        return
    raise AssertionError('Invalid input was accepted')


for tag in ['v17.0.0', 'v17.0.0-beta.1', 'v17.1.2-rc1', 'v17.1.2-alpha-1.0+build.007']:
    assert release.validate(tag, project) == (tag[1:], 'main')
for tag in ['17.0.0', 'vv17.0.0', 'v17.0', 'v017.0.0', 'v17.01.0', 'v17.0.01',
            'v17.0.0-beta.01', 'v17.0.0-01', 'v17.0.0-', 'v17.0.0-a..b',
            'v17.0.0+', 'v17.0.0\n', 'v18.0.0', 'v17.0.0;echo bad']:
    rejects(lambda: release.validate(tag, project))
rejects(lambda: release.validate('v17.0.0', project.replace('[17.0.0,18.0.0)', '[17.1.0,18.0.0)')))
rejects(lambda: release.validate('v17.0.0', project.replace('<Version>17.', '<Version>18.')))

# Use a disposable local remote to check the real fetch/ancestor guard without remote publication.
with tempfile.TemporaryDirectory() as directory:
    directory = Path(directory)
    remote = directory / 'remote.git'
    checkout = directory / 'checkout'
    def git(*args):
        return subprocess.run(['git', *args], cwd=checkout if checkout.exists() else directory,
                              check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    git('init', '--bare', str(remote))
    git('clone', str(remote), str(checkout))
    git('config', 'user.name', 'Verifier fixture')
    git('config', 'user.email', 'verifier@example.invalid')
    target = checkout / release.PROJECT
    target.parent.mkdir(parents=True)
    target.write_text(project, encoding='utf-8')
    git('add', '.')
    git('commit', '-m', 'Fixture baseline')
    git('branch', '-M', 'main')
    git('push', 'origin', 'main')
    git('tag', 'v17.0.0')
    command = [sys.executable, str(Path(__file__).with_name('validate-release.py').resolve())]
    def ancestry(tag):
        return subprocess.run(command + [tag, '--check-ancestry'], cwd=checkout,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    assert ancestry('v17.0.0').returncode == 0, 'Expected reachable tagged commit to pass'
    git('checkout', '-b', 'unmerged')
    (checkout / 'unmerged.txt').write_text('fixture', encoding='utf-8')
    git('add', '.')
    git('commit', '-m', 'Unmerged fixture')
    git('tag', 'v17.0.1')
    assert ancestry('v17.0.1').returncode != 0, 'Unmerged tag must fail ancestry'
    assert ancestry('v17.0.0').returncode != 0, 'HEAD must match the requested tag'

# Mutate an actual successful package instead of maintaining a parallel fake package fixture.
artifacts = list(Path('artifacts').glob('Umbraco.Community.ClientTrace.*.nupkg'))
assert len(artifacts) == 1, 'Pack exactly one artifact before running verifier checks'
with ZipFile(artifacts[0]) as archive:
    contents = {name: archive.read(name) for name in archive.namelist() if name != package.SCHEMA}
    # Keep schema bytes opaque. Tests need its ZIP presence, never its configuration contents.
    contents[package.SCHEMA] = b'opaque schema fixture'
nuspec = contents['Umbraco.Community.ClientTrace.nuspec'].decode('utf-8')
root = ET.fromstring(nuspec)
expected = next(node.text for node in root.iter() if node.tag.endswith('}version'))
with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'mutated.nupkg'
    def check(changes=None, omit=None, supplied=expected):
        values = contents | (changes or {})
        with ZipFile(path, 'w') as archive:
            for name, value in values.items():
                if name != omit:
                    archive.writestr(name, value)
        with contextlib.redirect_stdout(io.StringIO()):
            package.verify(path, supplied)
    check()
    for forbidden in ['demo/site.txt', 'Client/src/main.ts', 'node_modules/x.js', 'data.sqlite.db',
                      'appsettings.json', '.env', 'Logs/site.log', 'private.key', '../escape.txt',
                      'credentials.json', 'NuGet.Config']:
        rejects(lambda: check({forbidden: b'forbidden fixture'}))
    for missing in ['README.md', 'icon.png', package.SCHEMA, 'staticwebassets/frontend.js',
                    'staticwebassets/THIRD-PARTY-NOTICES.txt']:
        rejects(lambda: check(omit=missing))
    rejects(lambda: check(supplied='17.9.9'))
    rejects(lambda: check({'icon.png': b'invalid'}))
    metadata_version = expected + '+build.007'
    manifest = json.loads(contents['staticwebassets/umbraco-package.json'])
    manifest['version'] = metadata_version
    check({'Umbraco.Community.ClientTrace.nuspec': nuspec.replace(f'<version>{expected}</version>', f'<version>{metadata_version}</version>').encode(),
           'staticwebassets/umbraco-package.json': json.dumps(manifest).encode()}, supplied=metadata_version)
    rejects(lambda: check({'staticwebassets/umbraco-package.json': json.dumps(manifest).encode()}))
    rejects(lambda: check({'Umbraco.Community.ClientTrace.nuspec': nuspec.replace('[17.0.0, 18.0.0)', '[17.0.0, )').encode()}))
    chunk = next(name for name in contents if '/assets/collector-' in name and name.endswith('.js'))
    rejects(lambda: check(omit=chunk))
print('Release and package verifier rejection checks passed')
