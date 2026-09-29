"""
Sync the plugin's bundled workflow into the Paper-gogo-v2 package layout.

The plugin is the build source of truth for the bundled workflow content: it
carries `workflow/` (documents + skills/ + extras/). This script mirrors that
content into the package, applying the layout differences:

    plugin workflow/skills/<group>/  ->  package <group>/
    plugin workflow/extras/          ->  package extra-skills/
    plugin workflow/SKILLS_INDEX.md  ->  package SKILLS_INDEX.md
                                         (regenerated with --layout=package so
                                          its links resolve there)

Files that the package owns and the plugin merely vendors are NEVER overwritten:
README.md (package-specific), V2_RELEASE_NOTES.md, PACKAGE_MANIFEST.md,
THIRD_PARTY_NOTICES.md, PUBLIC_REPO_SETUP.md, .gitignore, .git/.

    python scripts/sync-to-package.py [--check]

`--check` reports drift without writing and exits non-zero on drift.
"""

import argparse
import filecmp
import os
import shutil
import subprocess
import sys

PLUGIN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUNDLE = os.path.join(PLUGIN, "workflow")
PACKAGE = r"D:\Skills\Paper-gogo-v2"

# Skill groups live under workflow/skills/<group> in the plugin and at the
# package root in Paper-gogo-v2.
SKILL_GROUPS = [
    "nature-skills",
    "code-understanding",
    "architecture-engineering",
    "world-model-method",
    "paper-framework-figure-studio-pro",
    "karpathy-guidelines",
    "python-expert",
]

# Bundle files that are safe to mirror into the package root.
SHARED_ROOT_FILES = ["SKILL.md", "paper-workflow-v6.md", "paper-workflow-v5.md"]

# Package-owned files the plugin only carries a copy of. Reported, never written.
PACKAGE_OWNED = [
    "README.md",
    "V2_RELEASE_NOTES.md",
    "PACKAGE_MANIFEST.md",
    "THIRD_PARTY_NOTICES.md",
    "PUBLIC_REPO_SETUP.md",
]

SHARED_DIRS = ["references", "code_assets"]

# Media assets are deliberately stripped from the plugin's bundled copy to keep
# it small (the package keeps them). They are out of scope for drift, and a
# mirror must never delete them from the package.
MEDIA_EXT = {".png", ".jpg", ".jpeg", ".gif", ".pdf", ".zip", ".pptx", ".mp4"}


def difftree(a, b, ignore_media=True):
    """
    Compare two trees. Returns (missing_in_b, extra_in_b, differing, skipped_media).

    Media files are reported separately in `skipped_media` rather than as drift,
    because the plugin's bundled copy strips them on purpose while the package
    keeps them.
    """
    cmp = filecmp.dircmp(a, b)
    only_a, only_b, diff, skipped = [], [], [], 0

    def is_media(rel):
        return os.path.splitext(rel)[1].lower() in MEDIA_EXT

    def count_files(p):
        n = 0
        for _, _, files in os.walk(p):
            n += len(files)
        return n

    def walk(d):
        nonlocal skipped
        for name in d.left_only:
            rel = os.path.relpath(os.path.join(d.left, name), a)
            if ignore_media and is_media(rel):
                full = os.path.join(d.left, name)
                skipped += count_files(full) if os.path.isdir(full) else 1
            else:
                only_a.append(rel)
        for name in d.right_only:
            rel = os.path.relpath(os.path.join(d.right, name), b)
            if ignore_media and is_media(rel):
                full = os.path.join(d.right, name)
                skipped += count_files(full) if os.path.isdir(full) else 1
            else:
                only_b.append(rel)
        for name in d.diff_files:
            rel = os.path.relpath(os.path.join(d.left, name), a)
            if ignore_media and is_media(rel):
                skipped += 1
            else:
                diff.append(rel)
        for sub in d.subdirs.values():
            walk(sub)

    walk(cmp)
    return sorted(only_a), sorted(only_b), sorted(diff), skipped


def sync_tree(src, dst):
    """
    Copy files present in `src` into `dst`, updating changed files and removing
    files that src no longer has. Media files already in dst are preserved,
    because the bundle strips them on purpose.
    """
    os.makedirs(dst, exist_ok=True)
    for name in os.listdir(src):
        s, d = os.path.join(src, name), os.path.join(dst, name)
        if os.path.isdir(s):
            sync_tree(s, d)
        else:
            if not os.path.exists(d) or not filecmp.cmp(s, d, shallow=False):
                shutil.copy2(s, d)

    # remove dst files that the bundle no longer carries (ignoring media)
    for name in os.listdir(dst):
        s, d = os.path.join(src, name), os.path.join(dst, name)
        if os.path.isdir(d) and not os.path.isdir(s):
            shutil.rmtree(d)
        elif os.path.isfile(d) and not os.path.exists(s):
            if os.path.splitext(name)[1].lower() not in MEDIA_EXT:
                os.remove(d)


def mirror(src, dst):
    """Replace dst with src, but never delete media files from dst."""
    if not os.path.isdir(dst):
        shutil.copytree(src, dst)
        return
    sync_tree(src, dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report drift, do not write")
    args = ap.parse_args()

    if not os.path.isdir(BUNDLE):
        sys.exit(f"bundled workflow not found: {BUNDLE}")
    if not os.path.isdir(PACKAGE):
        sys.exit(f"package not found: {PACKAGE}")

    rows = []      # (kind, name, state, drifted)
    def add(kind, name, state, drifted):
        rows.append((kind, name, state, drifted))

    # 1. shared root documents
    for rel in SHARED_ROOT_FILES:
        src, dst = os.path.join(BUNDLE, rel), os.path.join(PACKAGE, rel)
        if not os.path.exists(src):
            continue
        same = os.path.exists(dst) and filecmp.cmp(src, dst, shallow=False)
        add("file", rel, "up to date" if same else "needs update", not same)
        if not same and not args.check:
            shutil.copy2(src, dst)

    # 2. skill groups: bundle skills/<group> -> package <group>
    for group in SKILL_GROUPS:
        src = os.path.join(BUNDLE, "skills", group)
        dst = os.path.join(PACKAGE, group)
        if not os.path.isdir(src):
            add("skill group", group, "not in bundle", False)
            continue
        if not os.path.isdir(dst):
            add("skill group", group, "missing in package", True)
            if not args.check:
                shutil.copytree(src, dst)
            continue
        only_a, only_b, diff, skipped = difftree(src, dst)
        drifted = bool(only_a or diff)
        state = "in sync" if not (only_a or only_b or diff) else (
            f"{len(only_a)} missing, {len(diff)} differing"
            + (f", {len(only_b)} package-only extra" if only_b else ""))
        if skipped:
            state += f" ({skipped} media file(s) kept by package)"
        add("skill group", group, state, drifted)
        if drifted and not args.check:
            mirror(src, dst)

    # 3. shared subdirectories
    for rel in SHARED_DIRS:
        src, dst = os.path.join(BUNDLE, rel), os.path.join(PACKAGE, rel)
        if not os.path.isdir(src):
            continue
        if not os.path.isdir(dst):
            add("dir", rel, "missing in package", True)
            if not args.check:
                shutil.copytree(src, dst)
            continue
        only_a, only_b, diff, skipped = difftree(src, dst)
        drifted = bool(only_a or diff)
        state = "in sync" if not (only_a or only_b or diff) else (
            f"{len(only_a)} missing, {len(diff)} differing"
            + (f", {len(only_b)} package-only extra" if only_b else ""))
        if skipped:
            state += f" ({skipped} media file(s) kept by package)"
        add("dir", rel, state, drifted)
        if drifted and not args.check:
            mirror(src, dst)

    # 4. extras -> extra-skills
    src_ex, dst_ex = os.path.join(BUNDLE, "extras"), os.path.join(PACKAGE, "extra-skills")
    if os.path.isdir(src_ex):
        if not os.path.isdir(dst_ex):
            add("dir", "extra-skills", "missing in package", True)
            if not args.check:
                shutil.copytree(src_ex, dst_ex)
        else:
            only_a, only_b, diff, skipped = difftree(src_ex, dst_ex)
            drifted = bool(only_a or diff)
            state = "in sync" if not (only_a or only_b or diff) else (
                f"{len(only_a)} missing, {len(diff)} differing"
                + (f", {len(only_b)} package-only extra" if only_b else ""))
            if skipped:
                state += f" ({skipped} media file(s) kept by package)"
            add("dir", "extra-skills", state, drifted)
            if drifted and not args.check:
                mirror(src_ex, dst_ex)

    # 5. package-owned documents: report whether the vendored copy matches, never write
    for rel in PACKAGE_OWNED:
        src, dst = os.path.join(BUNDLE, rel), os.path.join(PACKAGE, rel)
        if not os.path.exists(src) or not os.path.exists(dst):
            continue
        same = filecmp.cmp(src, dst, shallow=False)
        add("package-owned", rel, "matches vendored copy" if same else "differs (package version kept)", False)

    # 6. index, regenerated per layout
    if not args.check:
        subprocess.run(["node", os.path.join(PLUGIN, "scripts", "build-skills-index.mjs"), "--layout=package"],
                       check=True, cwd=PLUGIN)
        shutil.copy2(os.path.join(BUNDLE, "SKILLS_INDEX.md"), os.path.join(PACKAGE, "SKILLS_INDEX.md"))
        subprocess.run(["node", os.path.join(PLUGIN, "scripts", "build-skills-index.mjs")],
                       check=True, cwd=PLUGIN)
        add("index", "SKILLS_INDEX.md", "regenerated for both layouts", False)
    else:
        add("index", "SKILLS_INDEX.md",
            "present" if os.path.exists(os.path.join(PACKAGE, "SKILLS_INDEX.md")) else "missing in package",
            not os.path.exists(os.path.join(PACKAGE, "SKILLS_INDEX.md")))

    print(("DRIFT REPORT" if args.check else "SYNC REPORT"))
    print(f"  source: {BUNDLE}")
    print(f"  target: {PACKAGE}\n")
    width = max(len(n) for _, n, _, _ in rows) + 2
    for kind, name, state, _ in rows:
        print(f"  {kind:<14} {name:<{width}} {state}")

    drifted = [r for r in rows if r[3]]
    if args.check:
        if drifted:
            print(f"\n{len(drifted)} item(s) drifted. Run without --check to sync.")
            sys.exit(1)
        print("\nNo drift: package matches the bundled workflow.")
    else:
        print("\nSync complete. Run scripts/check-consistency.py to verify.")


if __name__ == "__main__":
    main()
