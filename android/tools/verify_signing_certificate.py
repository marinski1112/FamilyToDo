#!/usr/bin/env python3
"""Check apksigner's public certificate report against the pinned SHA-256."""
import os
import re
import sys


def verify(report, expected):
    normalized = expected.replace(':', '').strip().lower()
    if not re.fullmatch(r'[0-9a-f]{64}', normalized):
        raise ValueError('Set FAMILYTODO_SIGNING_CERT_SHA256 to the fixed certificate SHA-256.')
    signers = re.findall(r'^Signer #[0-9]+ certificate SHA-256 digest: ([0-9a-fA-F]+)$', report, re.MULTILINE)
    if len(signers) != 1 or signers[0].lower() != normalized:
        raise ValueError('APK signing certificate does not match the fixed signing identity.')


if __name__ == '__main__':
    try:
        verify(sys.stdin.read(), os.environ.get('FAMILYTODO_SIGNING_CERT_SHA256', ''))
        print('Fixed signing certificate verified.')
    except ValueError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
