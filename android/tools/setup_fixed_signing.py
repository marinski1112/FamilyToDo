#!/usr/bin/env python3
"""Create an owner-held Android signing key; optionally configure empty GitHub signing secrets."""
import argparse
import base64
import getpass
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

SECRET_NAMES = (
    'FAMILYTODO_KEYSTORE_B64', 'FAMILYTODO_STORE_PASSWORD',
    'FAMILYTODO_KEY_ALIAS', 'FAMILYTODO_KEY_PASSWORD',
    'FAMILYTODO_SIGNING_CERT_SHA256',
)
ALIAS = 'familytodo-internal'


def find_keytool():
    java_home = os.environ.get('JAVA_HOME')
    if java_home:
        candidate = Path(java_home) / 'bin' / ('keytool.exe' if os.name == 'nt' else 'keytool')
        if candidate.is_file():
            return str(candidate)
    executable = shutil.which('keytool')
    if not executable:
        raise RuntimeError('Install JDK 17 and set JAVA_HOME before running this script.')
    return executable


def keytool(args, password, key_password=None):
    env = os.environ.copy()
    env['FAMILYTODO_SETUP_PASSWORD'] = password
    env['FAMILYTODO_SETUP_KEY_PASSWORD'] = password if key_password is None else key_password
    result = subprocess.run(
        [find_keytool(), '-J-Duser.language=en', '-J-Duser.country=US', *args],
        env=env, text=True, capture_output=True,
    )
    if result.returncode:
        # Raw command output is deliberately withheld, including in errors.
        raise RuntimeError('keytool failed. Check the keystore path, alias and password.')
    return result.stdout


def certificate(path, password, alias=ALIAS):
    output = keytool(['-list', '-v', '-keystore', str(path), '-alias', alias,
                      '-storepass:env', 'FAMILYTODO_SETUP_PASSWORD'], password)
    values = {}
    for label in ('SHA1', 'SHA256'):
        match = re.search(r'\b' + label + r':\s*([A-Fa-f0-9:]+)', output)
        expected = 40 if label == 'SHA1' else 64
        if not match or len(match.group(1).replace(':', '')) != expected:
            raise RuntimeError('Could not read the signing certificate fingerprint.')
        values[label] = match.group(1).upper()
    return values


def ensure_key(path, password, alias=ALIAS):
    path = path.expanduser()
    if path.is_symlink() or path.exists() and not path.is_file():
        raise RuntimeError('The keystore must be a regular owner-held file.')
    path = path.resolve()
    repository = Path(__file__).resolve().parents[2]
    if path.is_relative_to(repository):
        raise RuntimeError('Keep the signing key outside the Git repository.')
    if not path.exists():
        if len(password) < 12:
            raise RuntimeError('Use a password of at least 12 characters.')
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        previous = os.umask(0o077)
        try:
            keytool(['-genkeypair', '-noprompt', '-keystore', str(path), '-storetype', 'JKS',
                     '-alias', alias, '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000',
                     '-dname', 'CN=FamilyToDo Internal',
                     '-storepass:env', 'FAMILYTODO_SETUP_PASSWORD',
                     '-keypass:env', 'FAMILYTODO_SETUP_PASSWORD'], password)
        finally:
            os.umask(previous)
        if os.name != 'nt':
            path.chmod(0o600)
    return path, certificate(path, password, alias)


def require_empty_github_secrets(repository):
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
        raise RuntimeError('Use a repository name in owner/name form.')
    if not shutil.which('gh'):
        raise RuntimeError('Install GitHub CLI and run gh auth login first.')
    result = subprocess.run(['gh', 'secret', 'list', '--repo', repository, '--json', 'name'],
                            text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError('Could not inspect GitHub signing secrets. Check GitHub CLI login and repository access.')
    configured = {entry['name'] for entry in json.loads(result.stdout)} & set(SECRET_NAMES)
    if configured:
        raise RuntimeError('Signing secrets already exist; refusing to replace the signing identity. '
                           'Use the existing keystore, or finish a partial setup manually with that same key.')


def configure_github(repository, path, password, key_password, alias, fingerprints):
    # The caller checks for existing secrets before key generation and again before any write.
    require_empty_github_secrets(repository)
    values = {
        'FAMILYTODO_KEYSTORE_B64': base64.b64encode(path.read_bytes()),
        'FAMILYTODO_STORE_PASSWORD': password.encode(),
        'FAMILYTODO_KEY_ALIAS': alias.encode(),
        'FAMILYTODO_KEY_PASSWORD': key_password.encode(),
        'FAMILYTODO_SIGNING_CERT_SHA256': fingerprints['SHA256'].replace(':', '').lower().encode(),
    }
    for name, value in values.items():
        result = subprocess.run(['gh', 'secret', 'set', name, '--repo', repository],
                                input=value, capture_output=True)
        if result.returncode:
            raise RuntimeError('GitHub secret setup stopped at ' + name + '. Keep this keystore; '
                               'do not generate a replacement key. Finish the remaining entries with the same key.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--keystore', type=Path,
                        default=Path.home() / '.familytodo-signing' / 'familytodo-internal.jks')
    parser.add_argument('--alias', default=ALIAS)
    parser.add_argument('--repository', default='marinski1112/FamilyToDo')
    parser.add_argument('--configure-github-secrets', action='store_true',
                        help='Configure only an empty signing-secret set, using GitHub CLI stdin.')
    args = parser.parse_args()
    if args.configure_github_secrets:
        require_empty_github_secrets(args.repository)
    new = not args.keystore.expanduser().exists()
    password = getpass.getpass('Keystore password (not echoed): ')
    if new and password != getpass.getpass('Confirm keystore password: '):
        raise RuntimeError('Passwords do not match; no key was created.')
    path, fingerprints = ensure_key(args.keystore, password, args.alias)
    key_password = password if new else getpass.getpass('Key password (Enter to use keystore password): ') or password
    keytool(['-certreq', '-keystore', str(path), '-alias', args.alias,
             '-storepass:env', 'FAMILYTODO_SETUP_PASSWORD',
             '-keypass:env', 'FAMILYTODO_SETUP_KEY_PASSWORD'], password, key_password)
    if args.configure_github_secrets:
        configure_github(args.repository, path, password, key_password, args.alias, fingerprints)
        print('GitHub signing secrets configured.')
    print('Keep a private backup of the keystore and retain its password in your password manager.')
    print('Keystore:', path)
    print('Android package: jp.marinski.familytodo')
    print('OAuth SHA-1:', fingerprints['SHA1'])
    print('Signing SHA-256:', fingerprints['SHA256'])


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
