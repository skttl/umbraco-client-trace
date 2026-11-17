"""Validate release tags, the package contract and the remote release ancestry."""
import argparse
import os
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

PROJECT = Path('src/Umbraco.Community.ClientTrace/Umbraco.Community.ClientTrace.csproj')
SEMVER = re.compile(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?\Z')


def version(value):
    match = SEMVER.fullmatch(value)
    if not match or any(part.isdigit() and len(part) > 1 and part[0] == '0'
                        for part in (match[4] or '').split('.')):
        raise ValueError('Expected a complete SemVer version without numeric leading zeroes')
    return match


def validate(tag, project):
    if not tag.startswith('v'):
        raise ValueError('Release tags must start with v')
    release = tag[1:]
    major = version(release)[1]
    root = ET.fromstring(project)
    if major != '17' or version(root.findtext('.//Version', ''))[1] != major:
        raise ValueError('Tag and project must target package major 17')
    dependencies = root.findall('.//PackageReference')
    umbraco = [item for item in dependencies if item.get('Include', '').startswith('Umbraco.Cms.')]
    if not umbraco or any(item.get('Version') != '[17.0.0,18.0.0)' for item in umbraco):
        raise ValueError('Umbraco dependencies must declare [17.0.0,18.0.0)')
    return release, 'main'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('tag')
    parser.add_argument('--check-ancestry', action='store_true')
    args = parser.parse_args()
    release, branch = validate(args.tag, PROJECT.read_text(encoding='utf-8-sig'))
    if args.check_ancestry:
        subprocess.run(['git', 'fetch', '--no-tags', 'origin',
                        f'+refs/heads/{branch}:refs/remotes/origin/{branch}'], check=True)
        tag_commit = subprocess.check_output(['git', 'rev-parse', f'refs/tags/{args.tag}^{{commit}}'], text=True).strip()
        head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
        if head != tag_commit:
            raise ValueError('Checkout must be the exact tagged commit')
        subprocess.run(['git', 'merge-base', '--is-ancestor', tag_commit, f'origin/{branch}'], check=True)
    if output := os.environ.get('GITHUB_OUTPUT'):
        with open(output, 'a', encoding='utf-8') as stream:
            stream.write(f'version={release}\nbranch={branch}\n')
    print(f'Validated {release} for {branch}')


if __name__ == '__main__':
    main()
