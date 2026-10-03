#!/usr/bin/env python3
"""Bundle this app's small ES-module graph into one dependency-free HTML file.

Supports the named imports and declaration exports used by this project.
Unsupported syntax, missing exports, cycles and paths outside source fail the build.
This is a project packager, not a general JavaScript compiler.
"""
import argparse
import base64
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "source"
IMPORT = re.compile(r"^import\s+\{([^}]+)\}\s+from\s+['\"]([^'\"]+)['\"];\s*$", re.MULTILINE)
EXPORT = re.compile(r"^export\s+(?:(async)\s+)?(function|class|const)\s+([A-Za-z_$][\w$]*)", re.MULTILINE)
IDENTIFIER = re.compile(r"^[A-Za-z_$][\w$]*$")


def bundle(entry, source_root=SOURCE):
    source_root = source_root.resolve()
    modules = []
    loaded = {}
    visiting = set()

    def visit(path):
        path = path.resolve()
        if not path.is_relative_to(source_root) or path.suffix != ".mjs":
            raise ValueError(f"Module outside source or wrong extension: {path.name}")
        if path in visiting:
            raise ValueError(f"Circular import: {path.name}")
        if path in loaded:
            return loaded[path]
        visiting.add(path)
        text = path.read_text(encoding="utf-8")
        bindings = []
        for match in IMPORT.finditer(text):
            dependency = match.group(2)
            if not dependency.startswith("./"):
                raise ValueError(f"Only local imports are supported: {dependency}")
            module, exported = visit(path.parent / dependency)
            names = [name.strip() for name in match.group(1).split(",") if name.strip()]
            if not names or any(not IDENTIFIER.fullmatch(name) for name in names):
                raise ValueError(f"Unsupported named import in {path.name}")
            missing = set(names) - set(exported)
            if missing:
                raise ValueError(f"Missing export in {dependency}: {', '.join(sorted(missing))}")
            bindings.append(f"const {{ {', '.join(names)} }} = {module};")
        text = IMPORT.sub("", text)
        exports = [match.group(3) for match in EXPORT.finditer(text)]
        if len(set(exports)) != len(exports):
            raise ValueError(f"Duplicate export in {path.name}")
        text = EXPORT.sub(lambda m: ("async " if m.group(1) else "") + m.group(2) + " " + m.group(3), text)
        if re.search(r"^\s*(import|export)\b", text, re.MULTILINE):
            raise ValueError(f"Unsupported module syntax in {path.name}")
        module = f"__ruler_module_{len(modules)}"
        modules.append(f"// {path.relative_to(source_root).as_posix()}\nconst {module} = (() => {{\n" + "\n".join(bindings) + "\n" + text + f"\nreturn Object.freeze({{ {', '.join(exports)} }});\n}})();")
        visiting.remove(path)
        loaded[path] = (module, exports)
        return module, exports

    visit(entry)
    return "(() => {\n'use strict';\n" + "\n\n".join(modules) + "\n})();\n"


def csp_hash(text):
    return "sha256-" + base64.b64encode(hashlib.sha256(text.encode("utf-8")).digest()).decode("ascii")


def standalone(source_root=SOURCE):
    html = (source_root / "index.html").read_text(encoding="utf-8")
    css = (source_root / "styles.css").read_text(encoding="utf-8")
    script = bundle(source_root / "src/app.mjs", source_root)
    if "</style" in css.lower() or "</script" in script.lower():
        raise ValueError("A source contains an HTML raw-text closing tag; review it before embedding")
    policy = ("default-src 'none'; "
              f"script-src '{csp_hash(script)}'; style-src '{csp_hash(css)}'; "
              "img-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'")
    marker = '<meta name="viewport" content="width=device-width, initial-scale=1">'
    if html.count(marker) != 1:
        raise ValueError("Expected one viewport meta tag")
    html = html.replace(marker, marker + f'\n  <meta http-equiv="Content-Security-Policy" content="{policy}">\n  <meta name="referrer" content="no-referrer">')
    style = '<link rel="stylesheet" href="styles.css">'
    entry = '<script type="module" src="src/app.mjs"></script>'
    if html.count(style) != 1 or html.count(entry) != 1:
        raise ValueError("Expected one stylesheet and module entry")
    html = html.replace(style, f"<style>{css}</style>").replace(entry, f"<script>{script}</script>")
    html = html.replace('href="./"', 'href="#top"').replace('<body>', '<body id="top">')
    return html


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "index.html")
    parser.add_argument("--check", action="store_true", help="Fail if committed HTML differs from source")
    args = parser.parse_args()
    result = standalone()
    if args.check:
        if not args.output.is_file() or args.output.read_text(encoding="utf-8") != result:
            raise SystemExit("Generated HTML is stale. Run python3 scripts/build.py and commit index.html.")
        print("Generated HTML matches source.")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(result, encoding="utf-8", newline="\n")
        print(f"Built {args.output.name}: {len(result.encode('utf-8')):,} bytes, one HTML file.")
