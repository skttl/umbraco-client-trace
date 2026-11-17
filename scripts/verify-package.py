"""Inspect the actual NuGet ZIP without extracting or loading package code."""
import argparse
import json
import posixpath
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from zipfile import ZipFile

PACKAGE = 'Umbraco.Community.ClientTrace'
SCHEMA = f'appsettings-schema.{PACKAGE}.json'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def verify(package, expected_version):
    with ZipFile(package) as archive:
        names = archive.namelist()
        files = set(names)
        require(len(names) == len(files), 'Duplicate ZIP entries')
        for name in names:
            lower = name.lower()
            require(not name.startswith(('/', '\\')) and '\\' not in name
                    and '..' not in name.split('/') and ':' not in name, f'Unsafe path: {name}')
            # The public package schema is intentional; runtime configuration is not.
            forbidden = re.search(r'(^|/)(demo|client|node_modules|logs|media)(/|$)|'
                                  r'(^|/)(\.env(?:\..*)?|nuget\.config|web(?:\.[^/]*)?\.config|'
                                  r'appsettings[^/]*\.json|app(?:\.[^/]*)?\.config|\.npmrc|\.git-credentials)$|'
                                  r'password|secret|credential|apikey|connectionstring|token|'
                                  r'\.(log|db|sqlite|sdf|mdf|ldf|bak|bacpac|dacpac|pem|key|pfx|p12|cer|ppk|'
                                  r'publishsettings|pubxml|user|suo|config|env|ts|tsx|jsx|cs|cshtml|razor|vb|scss|vue|svelte)$|(^|/)id_(rsa|ed25519)', lower)
            require(name == SCHEMA or not forbidden, f'Forbidden package content: {name}')
        nuspecs = [name for name in names if name.endswith('.nuspec')]
        require(nuspecs == [f'{PACKAGE}.nuspec'], 'Expected exactly the package nuspec')
        root = ET.fromstring(archive.read(nuspecs[0]))
        ns = {'n': root.tag.split('}')[0][1:]}
        metadata = root.find('n:metadata', ns)
        def field(key):
            return metadata.findtext(f'n:{key}', namespaces=ns)
        require(field('id') == PACKAGE, 'Wrong package ID')
        require(field('version') == expected_version, 'Wrong package version')
        require(field('readme') == 'README.md' and field('icon') == 'icon.png', 'Wrong README/icon metadata')
        license_node = metadata.find('n:license', ns)
        require(license_node is not None and license_node.get('type') == 'expression'
                and license_node.text == 'MIT', 'Expected MIT package license')
        groups = metadata.findall('n:dependencies/n:group', ns)
        require(len(groups) == 1 and groups[0].get('targetFramework') == 'net10.0', 'Wrong dependency TFM')
        dependencies = groups[0].findall('n:dependency', ns)
        umbraco = [node for node in dependencies if node.get('id', '').startswith('Umbraco.Cms.')]
        require(bool(umbraco) and all(node.get('version') == '[17.0.0, 18.0.0)' for node in umbraco),
                'Wrong Umbraco compatibility interval')
        required = [f'lib/net10.0/{PACKAGE}.dll', 'README.md', 'icon.png', SCHEMA,
                    f'buildTransitive/{PACKAGE}.targets', 'THIRD-PARTY-NOTICES/LUCIDE-LICENSE.txt',
                    'staticwebassets/umbraco-package.json', 'staticwebassets/frontend.js',
                    'staticwebassets/entrypoint.js', 'staticwebassets/THIRD-PARTY-NOTICES.txt']
        for name in required:
            require(name in files and archive.getinfo(name).file_size > 0, f'Missing/empty: {name}')
        require(archive.read(required[0])[:2] == b'MZ', 'Invalid DLL')
        require(archive.read('icon.png').startswith(b'\x89PNG\r\n\x1a\n'), 'Invalid PNG icon')
        require({name for name in names if name.startswith('lib/')} == {required[0]}, 'Unexpected libraries/TFMs')
        target = ET.fromstring(archive.read(f'buildTransitive/{PACKAGE}.targets'))
        require(any(SCHEMA in node.get('Include', '') for node in target.iter('UmbracoJsonSchemaFiles')),
                'Schema is not registered with UmbracoJsonSchemaFiles')
        # Inspect the registered schema's presence/size only; do not read protected appsettings files.
        manifest = json.loads(archive.read('staticwebassets/umbraco-package.json'))
        require(manifest.get('name') == 'ClientTrace', 'Wrong manifest name')
        require(manifest.get('version') == expected_version, 'Wrong manifest version')
        require(any(item.get('type') == 'backofficeEntryPoint' and
                    item.get('js') == '/App_Plugins/ClientTrace/entrypoint.js'
                    for item in manifest.get('extensions', [])), 'Missing backoffice entrypoint')
        notices = archive.read('staticwebassets/THIRD-PARTY-NOTICES.txt').decode('utf-8')
        for dependency in ['stacktrace-parser', 'trace-mapping', 'resolve-uri', 'sourcemap-codec', 'Hey API']:
            require(dependency.lower() in notices.lower(), f'Missing runtime license: {dependency}')
        scripts = [name for name in names if name.startswith('staticwebassets/') and name.endswith('.js')]
        for pattern in ['collector-', 'sourcemaps-', 'stack-trace-parser.esm-']:
            require(any('/assets/' + pattern in name for name in scripts), f'Missing lazy chunk: {pattern}')
        for name in scripts:
            require(name + '.map' in files, f'Missing diagnostic source map: {name}')
            source = archive.read(name).decode('utf-8')
            # shortcut: checks Vite's quoted chunk paths; extend if the build starts computing other paths.
            references = re.findall(r'''["']((?:\./|\.\./|assets/)[^"']+\.js)["']''', source)
            for reference in references:
                resolved = posixpath.normpath(posixpath.join(posixpath.dirname(name), reference))
                require(resolved in files, f'Missing imported chunk: {resolved}')
        frontend = archive.read('staticwebassets/frontend.js').decode('utf-8')
        require('dataset.clientTrace' in frontend and 'assets/collector-' in frontend,
                'Missing static helper bootstrap/lazy collector')
        require(not any('App_Plugins/' in name for name in names), 'Duplicated static asset base path')
        print(f'Verified {PACKAGE} {expected_version}: {len(files)} entries, {len(scripts)} JavaScript assets')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    parser.add_argument('version')
    args = parser.parse_args()
    verify(args.package, args.version)
