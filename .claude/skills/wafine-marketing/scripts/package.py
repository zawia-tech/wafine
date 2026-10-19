#!/usr/bin/env python3
"""Package this skill as a .skill file (a zip with the skill folder at its root).

Usage: package.py [OUT_DIR]      (default: current directory)

Excludes evals, caches and node_modules. Checks that the bundled brand copy
matches docs/design-system first (when run inside the repo), so a stale copy is
not shipped. Stdlib only. Install the result in Claude with the "Save skill"
button, or unzip it into a project's .claude/skills/ folder.
"""
import subprocess
import sys
import zipfile
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
NAME = SKILL.name
EXCLUDE_DIRS = {"evals", "__pycache__", "node_modules", ".git"}
EXCLUDE_SUFFIX = {".pyc", ".DS_Store"}


def main():
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd()
    out_dir.mkdir(parents=True, exist_ok=True)
    check = SKILL / "scripts" / "check_brand.py"
    r = subprocess.run([sys.executable, str(check)], capture_output=True, text=True)
    if r.returncode == 1:
        print(r.stdout.strip())
        print("Refusing to package: brand copy drifted. Run check_brand.py --sync first.")
        sys.exit(1)
    out = out_dir / f"{NAME}.skill"
    files = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(SKILL.rglob("*")):
            rel = p.relative_to(SKILL)
            if p.is_dir() or EXCLUDE_DIRS & set(rel.parts) or p.suffix in EXCLUDE_SUFFIX or p.name == ".DS_Store":
                continue
            z.write(p, Path(NAME) / rel)
            files += 1
    print(f"{out} ({files} files, {out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
