import importlib.util
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("ruler_build", ROOT / "scripts/build.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class BundleContract(unittest.TestCase):
    def test_single_file_has_no_runtime_asset_requests_and_valid_script(self):
        html = build.standalone()
        self.assertNotIn('src="src/', html)
        self.assertNotIn('href="styles.css"', html)
        self.assertIn("connect-src 'none'", html)
        self.assertIn('href="#top"', html)
        self.assertEqual(html.count("<script>"), 1)
        script = re.search(r"<script>(.*?)</script>", html, re.DOTALL).group(1)
        style = re.search(r"<style>(.*?)</style>", html, re.DOTALL).group(1)
        self.assertIn(build.csp_hash(script), html)
        self.assertIn(build.csp_hash(style), html)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bundle.js"
            path.write_text(script)
            subprocess.run(["node", "--check", str(path)], check=True)

    def test_bundling_is_deterministic(self):
        self.assertEqual(build.standalone(), build.standalone())

    def test_missing_exports_are_not_silently_undefined(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "dep.mjs").write_text("export const real = 1;\n")
            (root / "app.mjs").write_text("import { missing } from './dep.mjs';\n")
            with self.assertRaisesRegex(ValueError, "Missing export"):
                build.bundle(root / "app.mjs", root)

    def test_path_escape_and_cycles_are_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "app.mjs").write_text("import { x } from '../outside.mjs';\n")
            with self.assertRaisesRegex(ValueError, "Only local"):
                build.bundle(root / "app.mjs", root)
            (root / "app.mjs").write_text("import { x } from './dep.mjs';\n")
            (root / "dep.mjs").write_text("import { y } from './app.mjs';\nexport const x = 1;\n")
            with self.assertRaisesRegex(ValueError, "Circular"):
                build.bundle(root / "app.mjs", root)

    def test_unsupported_syntax_fails_instead_of_broken_distribution(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "app.mjs").write_text("export default 12;\n")
            with self.assertRaisesRegex(ValueError, "Unsupported"):
                build.bundle(root / "app.mjs", root)


if __name__ == "__main__":
    unittest.main()
