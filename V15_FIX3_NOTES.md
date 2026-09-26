# V15 FIX3 — archive-safe Smoke4 code gate

Supersedes FIX2.

Real Windows evidence before this fix:
- TypeScript passed.
- Full V04 suite passed: 31/31 files, 168/168 tests.
- Smoke4 then stopped because `git diff --check` was executed inside the distributed ZIP, which intentionally has no `.git`.

FIX3:
- keeps `git diff --check` mandatory when `.git` exists;
- skips only that Git-specific check for archive exports without `.git`;
- emits `V15_DIFF_WHITESPACE_GATE=SKIPPED_ARCHIVE_NO_GIT`;
- changes no capture, runtime, semantic, Gemini, comparator, or workbook behavior.

Direct built-in Node harness:
- no `.git` -> skip/no Git call: PASS
- `.git` present -> exact `git diff --check`: PASS
- `node --check` on Smoke4/Sentinel10 runners: PASS

Fresh Windows Smoke4 and Sentinel10 are still required before release green.
