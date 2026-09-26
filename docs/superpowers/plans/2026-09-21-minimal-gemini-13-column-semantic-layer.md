# Minimal Gemini 13-Column Semantic Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and `superpowers:test-driven-development`.

**Goal:** Replace the accumulated semantic prompt with a dedicated minimal prompt module and keep Gemini responsible for matching screenshot information to the 13 workbook columns.

**Architecture:** Add `simpleSemantic13Prompt.ts`, wire the extractor to it with one AST-safe source transformation, keep structural normalization/schema/runtime/workbook behavior unchanged, retire obsolete prompt-micro-rule tests, then gate live quota with Smoke4 before Sentinel10.

**Spec:** `docs/superpowers/specs/2026-09-21-minimal-gemini-13-column-semantic-layer-design.md`

## Global Constraints

- One Gemini call per product.
- Gemini owns semantic interpretation.
- Code owns structure, provenance, authoritative URL/website, durability, and serialization.
- No retailer-specific semantic rule.
- No DOM semantic extraction.
- No OCR preprocessing.
- No second semantic call.
- No local semantic repair.
- Do not weaken benchmark expectations.
- No force push.

## Tasks

### Task 1 — Prompt module TDD

Create a failing test for `buildSimpleSemantic13Prompt`, run RED, create the module, run GREEN.

The prompt contains only:

- classification;
- the 13 Vietnamese workbook columns mapped to JSON keys;
- “read all screenshots and match visible information by meaning”;
- “visible → fill, not visible → null/[]”;
- minimal JSON-shape requirements;
- short evidence for traceability.

### Task 2 — Extractor integration TDD

Create a failing integration test proving the extractor still sends the old prompt.

Use TypeScript AST positions to:

- add an import for `buildSimpleSemantic13Prompt`;
- replace the local `promptText(...)` function with a wrapper calling the new module.

Do not string-patch local formatting or line numbers.

Run integration GREEN.

### Task 3 — Retire superseded prompt-string tests

Remove only tests whose purpose is enforcing the old prompt micro-rules. Keep schema, workbook, model, provider, runtime, durability, and normalization tests.

Run targeted suite, TypeScript, then full `npm test`.

No Gemini live call unless full local suite is green.

### Task 4 — Commit local implementation

Install approved spec and plan into repo, stage only intended source/tests/docs, run diff checks, then commit.

### Task 5 — Smoke4

Fresh run of S01/S07/S08/S10.

Require:

- validated = 4
- review = 0
- errors = 0
- comparator mismatches = 0

Stop before Sentinel10 on any failure.

### Task 6 — Sentinel10

Fresh run of all ten.

Require:

- validated = 8
- skippedNonCamera = 2
- review = 0
- errors = 0
- comparator mismatches = 0

### Task 7 — Release verification

Run:

- `npm test`
- `npm run check`
- `npm run build --if-present`
- `git diff --check`
- staged secret scan
- architecture hardcode scan

Commit remaining intended changes if any.

Push `integration/v3-vision-first` without force.

Fetch remote and require local SHA == remote SHA and clean `git status`.
