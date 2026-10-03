import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


setup = load('setup_fixed_signing')
verify = load('verify_signing_certificate')


class FixedSigningTest(unittest.TestCase):
    def test_reuses_existing_key_and_rejects_wrong_password(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'test-only.jks'
            password = 'ci-only-disposable-password'
            _, first = setup.ensure_key(path, password)
            original = path.read_bytes()
            _, second = setup.ensure_key(path, password)
            self.assertEqual(first, second)
            self.assertEqual(original, path.read_bytes())
            with self.assertRaises(RuntimeError):
                setup.ensure_key(path, 'wrong-ci-password')
            self.assertEqual(original, path.read_bytes())
            if os.name != 'nt':
                self.assertEqual(0o600, path.stat().st_mode & 0o777)

    def test_refuses_key_in_repository(self):
        path = Path(__file__).resolve().parents[2] / 'must-not-create.jks'
        with self.assertRaises(RuntimeError):
            setup.ensure_key(path, 'ci-only-disposable-password')
        self.assertFalse(path.exists())

    def test_refuses_existing_github_signing_identity(self):
        response = subprocess.CompletedProcess([], 0, '[{"name":"FAMILYTODO_KEYSTORE_B64"}]', '')
        with patch.object(setup.shutil, 'which', return_value='/fake/gh'), patch.object(setup.subprocess, 'run', return_value=response) as call:
            with self.assertRaises(RuntimeError):
                setup.require_empty_github_secrets('marinski1112/FamilyToDo')
            self.assertEqual(call.call_args.args[0][1:3], ['secret', 'list'])

    def test_pin_rejects_wrong_missing_or_multiple_signers(self):
        fingerprint = 'a1' * 32
        report = 'Signer #1 certificate SHA-256 digest: ' + fingerprint
        verify.verify(report, ':'.join(fingerprint[i:i+2] for i in range(0,64,2)).upper())
        for expected in ['', 'invalid', 'b2'*32]:
            with self.assertRaises(ValueError):
                verify.verify(report, expected)
        with self.assertRaises(ValueError):
            verify.verify(report + '\nSigner #2 certificate SHA-256 digest: ' + fingerprint, fingerprint)


if __name__ == '__main__':
    unittest.main()
