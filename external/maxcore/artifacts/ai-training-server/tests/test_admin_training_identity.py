import ast
import hashlib
import os
import secrets
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class AdminTrainingIdentityTests(unittest.TestCase):
    def test_only_owner_admin_credential_grants_owner_training_identity(self):
        tree = ast.parse((ROOT / "server.py").read_text())
        node = next(
            item for item in tree.body
            if isinstance(item, ast.FunctionDef) and item.name == "verify_api_key"
        )
        node.decorator_list = []
        namespace = {
            "os": os, "secrets": secrets, "hashlib": hashlib,
            "Header": lambda _: None, "Request": object,
            "ADMIN_KEY_ENV": "owner-admin-key",
            "AI_TRAINING_KEY_PROD": "training-service-key",
            "AI_SERVER_KEY": "generation-service-key",
        }
        exec(compile(ast.Module(body=[node], type_ignores=[]),
                     str(ROOT / "server.py"), "exec"), namespace)
        authenticate = namespace["verify_api_key"]

        owner = authenticate(x_admin_key="owner-admin-key")
        self.assertEqual(owner["id"], "env-admin")
        self.assertEqual(owner["principal"], "owner-admin")
        self.assertTrue(owner["owner_admin_authenticated"])

        for service_key in ("training-service-key", "generation-service-key"):
            service = authenticate(authorization=f"Bearer {service_key}")
            self.assertEqual(service["id"], "env-admin")
            self.assertEqual(service["principal"], "service")
            self.assertFalse(service["owner_admin_authenticated"])


if __name__ == "__main__":
    unittest.main()
