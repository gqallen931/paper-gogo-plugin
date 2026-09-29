"""Cross-check Paper-gogo-v2 and paper-gogo-plugin for encoding, links and consistency."""
import os, re, hashlib, sys

PAPER = r"D:\Skills\Paper-gogo-v2"
PLUG = r"D:\Skills\paper-gogo-plugin"
BUNDLE = os.path.join(PLUG, "workflow")

problems = []

def read(p):
    with open(p, "rb") as f:
        return f.read().decode("utf-8")

TEXT_EXT = {".md", ".py", ".json", ".jsonl", ".toml", ".yaml", ".yml", ".txt",
            ".sh", ".mjs", ".js", ".ts", ".cfg", ".ini", ".bib", ".ris", ".nbib",
            ".svg", ".tex", ".cff", ""}

# 1. UTF-8 validity across both trees (text files only; PNG/PDF are binary)
for root, label in ((PAPER, "Paper-gogo-v2"), (PLUG, "paper-gogo-plugin")):
    n = skipped = bad = 0
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d not in ("node_modules", ".git", "__pycache__")]
        for f in fn:
            p = os.path.join(dp, f)
            if os.path.splitext(f)[1].lower() not in TEXT_EXT:
                skipped += 1
                continue
            n += 1
            try:
                open(p, "rb").read().decode("utf-8")
            except Exception as e:
                bad += 1
                problems.append(f"NOT UTF-8: {p} ({e})")
    print(f"{label}: {n} text files checked, {bad} invalid UTF-8 ({skipped} binary files skipped)")

# 2. skills count consistency
def skills(root):
    out = []
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d not in ("node_modules", ".git", "__pycache__")]
        if "SKILL.md" in fn and os.path.abspath(dp) != os.path.abspath(root):
            out.append(dp)
    return out

paper_skills = skills(PAPER)
bundle_skills = skills(BUNDLE)
print(f"\nPaper-gogo-v2 skills      : {len(paper_skills)}")
print(f"plugin workflow/ skills   : {len(bundle_skills)}")
if len(paper_skills) != len(bundle_skills):
    problems.append(f"skill count differs: paper={len(paper_skills)} plugin={len(bundle_skills)}")

# 3. workflow integrity hashes must match in both copies
expect = {
    "paper-workflow-v5.md": "E0D5462B50D6BFEE115A9D6C67E30F83A84EA31831F097E55DB9DEDC2476AA9D",
    "paper-workflow-v6.md": "D82371E10E54663769DBF6866119572379F4FA8FE90CA64C8FFA4B84FEF023FC",
}
print("\nworkflow integrity:")
for f, want in expect.items():
    for root, label in ((PAPER, "paper"), (BUNDLE, "plugin")):
        got = hashlib.sha256(open(os.path.join(root, f), "rb").read()).hexdigest().upper()
        ok = got == want
        print(f"  {label:7} {f:24} {'OK' if ok else 'FAIL'}")
        if not ok:
            problems.append(f"hash mismatch {label}/{f}")

# 4. relative markdown links resolve. Links to per-project artifact paths that a
#    *user project* would create (docs/, results/, logs/, cache/) are documented
#    conventions, not files in this repo, so they are reported separately.
ARTIFACT_PREFIXES = ("docs/", "results/", "logs/", "cache/", ".understand-anything/")

# Upstream files kept verbatim for provenance. Their links point at files that
# exist in their own source repository, not in this vendored copy, so they are
# excluded from the link check by design.
UPSTREAM_FILES = ("README.upstream.md",)

print("\nlink check:")
for root, label in ((PAPER, "Paper-gogo-v2"), (PLUG, "paper-gogo-plugin")):
    checked = broken = conventional = upstream = 0
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d not in ("node_modules", ".git", "__pycache__")]
        for f in fn:
            if not f.endswith(".md"):
                continue
            p = os.path.join(dp, f)
            if f in UPSTREAM_FILES:
                upstream += 1
                continue
            try:
                text = read(p)
            except Exception:
                continue
            # strip fenced code blocks so examples are not treated as links
            text = re.sub(r"```.*?```", "", text, flags=re.S)
            for m in re.finditer(r"\]\(([^)\s]+)\)", text):
                t = m.group(1)
                if t.startswith(("http", "#", "mailto:")):
                    continue
                t = t.split("#")[0]
                if not t:
                    continue
                # placeholder targets inside templates, e.g. [x](url), [x](path)
                if re.fullmatch(r"[a-z]+", t):
                    continue
                checked += 1
                if t.startswith(ARTIFACT_PREFIXES):
                    conventional += 1
                    continue
                target = os.path.normpath(os.path.join(dp, t.replace("/", os.sep)))
                if not os.path.exists(target):
                    broken += 1
                    problems.append(f"broken link in {os.path.relpath(p, root)}: {t}")
    print(f"  {label}: {checked} relative links ({conventional} documented artifact paths), "
          f"{broken} broken, {upstream} upstream file(s) skipped")

# 5. the extras notices referenced from both places must exist
for p in (
    os.path.join(PAPER, "extra-skills", "THIRD_PARTY_NOTICES.extras.md"),
    os.path.join(PAPER, "SKILLS_INDEX.md"),
    os.path.join(BUNDLE, "extras", "THIRD_PARTY_NOTICES.extras.md"),
    os.path.join(BUNDLE, "SKILLS_INDEX.md"),
):
    if not os.path.exists(p):
        problems.append(f"missing required file: {p}")
print("\nrequired notices/index files: " + ("all present" if not problems else "see problems"))

print("\n" + "=" * 60)
if problems:
    print(f"{len(problems)} PROBLEM(S):")
    for x in problems[:40]:
        print("  -", x)
    sys.exit(1)
print("ALL CONSISTENCY CHECKS PASSED")
