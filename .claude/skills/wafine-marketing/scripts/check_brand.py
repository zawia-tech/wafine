#!/usr/bin/env python3
"""Check that the design-system copy inside this skill still matches the repo.

The skill ships assets/design-system/ (tokens.json, brand-book.md, logos) so it works
when packaged away from the repo. This script compares those files with
docs/design-system/ and exits 1 on any drift. Run it after a brand change, and
re-copy with --sync to bring the skill up to date.

Usage: check_brand.py [--sync]
"""
import argparse
import filecmp
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
REPO = SKILL.parent.parent.parent  # .claude/skills/<skill> -> repo root
SRC = REPO / "docs" / "design-system"
DST = SKILL / "assets" / "design-system"
PAIRS = [
    (SRC / "tokens.json", DST / "tokens.json"),
    (SRC / "README.md", DST / "brand-book.md"),
    (SRC / "INDEX.md", DST / "INDEX.md"),
    # app icons are not copied: the owner keeps the lettered icon unshipped until the Inkscape polish
    (SRC / "assets" / "Logos" / "wafine-mark.svg", DST / "assets" / "Logos" / "wafine-mark.svg"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sync", action="store_true", help="copy repo files over the skill copy")
    a = ap.parse_args()
    if not SRC.is_dir():
        print(f"ERROR: {SRC} not found; run this from a checkout of the repo")
        sys.exit(2)
    drift = []
    for src, dst in PAIRS:
        if not src.exists():
            print(f"ERROR: missing in repo: {src.relative_to(REPO)}")
            drift.append(dst)
            continue
        if not dst.exists() or not filecmp.cmp(src, dst, shallow=False):
            drift.append(dst)
            if a.sync:
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(src, dst)
                print(f"synced: {dst.relative_to(SKILL)}")
            else:
                print(f"DRIFT: {dst.relative_to(SKILL)} differs from {src.relative_to(REPO)}")
    if not drift:
        print("OK: skill brand copy matches docs/design-system")
        sys.exit(0)
    sys.exit(0 if a.sync else 1)


if __name__ == "__main__":
    main()
