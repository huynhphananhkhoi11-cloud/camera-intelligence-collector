# V15 Architecture Design — Camera-Only Discovery → Capture → Gemini → Excel

Date: 2026-09-22  
Status: FROZEN FOR REVIEW  
Scope: camera-intelligence-collector V04/V15  
Architecture drift: NOT ALLOWED without explicit user approval

---

## 1. Goal

Build the final production flow for collecting camera product data from ecommerce websites while minimizing image/token cost and keeping Gemini as the semantic interpreter.

The system must:

1. Visually inspect the site structure first.
2. Let Gemini decide which areas/categories are relevant to CAMERA products.
3. Avoid crawling irrelevant primary-product areas such as accessories, vouchers, bags, memory cards, batteries, tripods, flashes, standalone accessory pages, and unrelated services.
4. Discover camera product URLs only from the Gemini-approved camera routes.
5. Open each camera product page with Camera Intelligence.
6. Visually compress the page into a bounded screenshot packet instead of sending the entire page.
7. Send the finished immutable packet to Gemini.
8. Immediately continue capturing the next product while Gemini interprets the previous packet.
9. Let Gemini classify the primary product and map supported visible facts into the exact 13-column workbook contract.
10. Validate structure only, preserve durable checkpoint/resume behavior, and export the finished workbook to Downloads.

---

## 2. Frozen Architectural Principle

The architecture is:

> Gemini chooses where to go → Camera Intelligence looks there → Gemini understands the product → Excel exports the result.

Responsibilities are intentionally separated.

### Browser / Camera Intelligence

Browser is a visual sensor and visual-compression engine.

It may:
- navigate;
- reveal hover menus/dropdowns;
- scroll;
- make safe interactions;
- take screenshots;
- deduplicate screenshots;
- avoid generic visual noise;
- create immutable screenshot packets;
- discover links from routes Gemini has approved.

It must NOT:
- infer ecommerce fields such as price, stock, bundle, rating, condition, or product type through local semantic rules;
- contain retailer-specific semantic branches;
- use benchmark values;
- repair Gemini output semantically.

### Gemini

Gemini is the semantic interpreter.

It may:
- understand navigation screenshots;
- decide which categories/routes are relevant to camera products;
- classify the primary product as CAMERA_PRODUCT or NON_CAMERA;
- interpret screenshots of a product page;
- map visible facts to the 13-column contract.

### Local runtime

Runtime may:
- coordinate queues;
- persist capture packets/checkpoints;
- enforce concurrency limits;
- validate JSON/schema structure;
- preserve authoritative website/url transport values;
- write Excel.

Runtime must NOT:
- rewrite semantic values to satisfy benchmarks;
- infer ecommerce meaning from page text locally.

---

## 3. End-to-End Flow

```text
SITE ROOT
   |
   v
[1] SITE RECONNAISSANCE
   - open landing/category root
   - capture initial hero
   - reveal hover/dropdown/menu states
   - capture those visual states
   |
   v
[2] GEMINI ROUTE SELECTION
   - understand site navigation visually
   - keep camera-relevant routes
   - reject irrelevant primary-product routes
   |
   v
[3] PRODUCT DISCOVERY
   - enter only approved camera routes
   - scroll listings
   - collect product URLs
   |
   v
CAMERA URL QUEUE
   |
   v
[4] CAMERA INTELLIGENCE PRODUCT CAPTURE
   - open product
   - initial hero
   - broad distributed scroll capture
   - safe interaction capture
   - smart-stop / dedupe
   - return to top
   - bounded settle
   - final hero refresh
   - freeze immutable packet
   |
   +------------------------------+
   |                              |
   v                              v
enqueue Gemini               immediately capture next URL
   |
   v
[5] GEMINI PRODUCT INTERPRETER
   - CAMERA_PRODUCT / NON_CAMERA
   - read all packet screenshots
   - map supported facts to 13 columns
   |
   v
[6] STRUCTURAL VALIDATION + DURABLE RUNTIME
   |
   v
[7] 13-COLUMN WORKBOOK
   |
   v
DOWNLOADS
```

---

## 4. Stage 1 — Site Reconnaissance

### Purpose

Understand the website's navigation structure visually before crawling.

### Input

A website root/category entry URL.

### Behavior

1. Open the page.
2. Capture the initial top viewport.
3. Discover generic interactive navigation candidates:
   - hoverable menu items;
   - dropdown triggers;
   - buttons/links that reveal navigation;
   - nested category menus.
4. Reveal candidate states safely.
5. Capture only changed visual states.
6. Create a small navigation screenshot packet.

### Important constraint

This stage does not determine camera relevance locally.

The browser reveals structure only.

---

## 5. Stage 2 — Gemini Camera Route Selection

### Purpose

Answer one semantic question:

> Which visible navigation routes should be entered if the task is to collect camera products?

### Output concept

```ts
interface CameraRouteDecision {
  readonly approvedRoutes: readonly {
    readonly label: string;
    readonly url: string;
  }[];
}
```

### Camera-relevant examples

Gemini may approve routes whose primary merchandise is:
- cameras;
- camera bodies;
- new cameras;
- used cameras;
- DSLR;
- mirrorless;
- compact cameras;
- camera kits where a camera body is the primary product.

### Non-camera examples

Gemini should reject routes whose primary merchandise is:
- standalone lenses, if outside the camera-only scope;
- batteries;
- memory cards;
- bags;
- tripods;
- flashes;
- filters;
- microphones;
- grips/cages;
- vouchers;
- unrelated services;
- generic promotional landing pages.

These are semantic examples for Gemini understanding, not browser keyword rules.

### No retailer hardcoding

No domain-specific category names or retailer-specific selectors may define semantic relevance.

---

## 6. Stage 3 — Product Discovery

### Purpose

Collect product URLs only from Gemini-approved camera routes.

### Rules

- Rendered-browser discovery remains generic.
- Scroll/listing traversal may follow pagination/infinite scroll.
- Discovery does not infer product semantics.
- URLs discovered from approved routes enter the product queue.
- Final product-level CAMERA/NON_CAMERA classification still belongs to Gemini, as a safety gate.

---

## 7. Stage 4 — Camera Intelligence Product Capture

### Purpose

Approximate “Gemini saw the whole page” within a bounded visual/token budget.

### Principle

> Capture broadly, compress visually, interpret semantically.

### Product capture sequence

```text
open product
→ initial hero
→ distributed viewport capture
→ safe interaction exploration
→ smart-stop low-value tail
→ dedupe
→ return to scrollY=0
→ bounded settle
→ final hero refresh
→ freeze packet
```

### Initial hero

Captures immediate product identity and first visible commercial state.

### Distributed scroll capture

Capture a bounded number of representative visual states across the page.

No local price/stock/spec/review semantic targeting is allowed.

### Safe interaction exploration

Reveal useful changed states without retailer-specific semantic assumptions.

### Smart stop

Generic structural heuristics may stop before low-value tail content such as:
- heavy footer coverage;
- large repeated linked-card grids.

Smart stop must not use retailer text or field semantics.

### Final hero refresh

After the page has been alive through scrolling/interactions:

1. Return to the top.
2. Allow a bounded generic settle.
3. Capture the hero again.
4. Keep the refreshed state if visually distinct or otherwise use it as the final authoritative top-state view.

This allows late-loaded UI to become visible without local code knowing what that UI means.

---

## 8. Immutable Capture Packet

Each product page must be completely captured before semantic interpretation begins for that product.

Concept:

```ts
interface FrozenProductVisualPacket {
  readonly pageUrl: string;
  readonly finalUrl: string;
  readonly website: string;
  readonly shots: readonly FrozenVisualShot[];
}
```

Requirements:
- screenshots are persisted/frozen;
- Gemini never depends on a mutable Playwright Page;
- navigating the browser to the next product cannot alter the previous packet;
- packet remains resumable/checkpointable.

---

## 9. Stage 5 — Overlapped Capture/Semantic Pipeline

### Current anti-pattern

```text
capture P1
wait Gemini P1
capture P2
wait Gemini P2
...
```

### Required pipeline

```text
CAPTURE WORKER                GEMINI WORKER

capture P1
freeze P1 ─────────────────> interpret P1
capture P2
freeze P2 ─────────────────> interpret P2
capture P3
freeze P3 ─────────────────> interpret P3
...
```

### Concurrency

Initial target:
- 1 browser capture worker;
- 1 Gemini semantic worker;
- bounded packet queue of 1–2 products.

This avoids:
- unbounded API concurrency;
- memory growth;
- provider quota bursts;
- mutable page sharing.

### Throughput goal

Total runtime should approach the slower of:
- capture throughput;
- Gemini throughput;

rather than the sum of both per product.

---

## 10. Gemini Product Classification

Before producing a row, Gemini classifies the primary product.

### CAMERA_PRODUCT

The primary item being sold is:
- a camera;
- a camera body;
- a camera kit whose primary product includes a camera body.

### NON_CAMERA

The primary item is not a camera.

Examples include:
- standalone accessory pages;
- bags;
- batteries;
- memory cards;
- tripods;
- flashes;
- filters;
- grips;
- vouchers;
- unrelated services.

For NON_CAMERA:

```json
{
  "classification": "NON_CAMERA",
  "row": null
}
```

### Important distinction

A camera product page may visibly include gifts/accessories.

Those may populate `accessoriesIncluded`.

That does NOT make the primary product NON_CAMERA.

---

## 11. Exact 13-Column Semantic Contract

Gemini remains the sole semantic interpreter for:

1. website
2. productName
3. condition
4. specs
5. rentalPricePerDay
6. rentalTerms
7. accessoriesIncluded
8. bundleIncluded
9. rating
10. reviewCount
11. stock
12. salePrice
13. url

Rules:
- use all screenshots in the frozen packet;
- identify the primary camera product;
- map visible facts by semantic meaning;
- unsupported values become null / [] as required;
- do not guess;
- preserve specific visible wording where wording itself is the requested value;
- do not use benchmark expectations;
- do not use retailer assumptions.

---

## 12. Structural Validation

Validator checks structure only.

It may verify:
- valid classification;
- row nullable contract;
- MoneyValue shape;
- enum values;
- numeric fields;
- array/string/null types;
- exact 13-field row schema.

It must not determine whether a price, stock phrase, gift, bundle, or condition is semantically correct.

---

## 13. Durable Runtime Requirements

Must preserve:
- existing provider retry/quota/backoff behavior;
- checkpoint/resume;
- deterministic item identity;
- output ordering;
- per-item status;
- crash recovery;
- one logical product semantic call per product.

Pipeline overlap must not break durable state.

A product must not be marked semantically complete until its Gemini decision is persisted.

---

## 14. Export

Final result:
- exact frozen 13-column workbook contract;
- camera products only;
- skipped NON_CAMERA primary-product pages do not become workbook rows;
- workbook written to the configured output and final user-facing copy placed in Downloads.

---

## 15. Explicit Non-Goals

V15 must NOT introduce:
- retailer-specific semantic logic;
- stock regex;
- price regex;
- category keyword filters in browser code;
- benchmark-specific expected values;
- semantic post-processing;
- per-field repair;
- evidence arrays/rawText architecture;
- multiple Gemini semantic calls per product;
- unbounded browser/Gemini concurrency;
- changes to accepted V13.2 screenshot reliability unless a regression proves necessity.

---

## 16. Acceptance Strategy

### A. Unit / contract tests

Must cover:
- navigation screenshot packet creation;
- Gemini route-selection contract;
- rejection of non-camera route decisions;
- approved camera-route handoff to discovery;
- immutable capture packet;
- final hero refresh;
- bounded capture→Gemini queue;
- browser starts N+1 while Gemini handles N;
- output ordering preserved despite overlap;
- resume/checkpoint behavior preserved;
- CAMERA_PRODUCT / NON_CAMERA semantic contract;
- exact 13-column workbook contract.

### B. Real-browser tests

Must preserve:
- V13.2 stalled-font screenshot reliability test;
- final hero refresh produces a late-state top screenshot without field-specific waiting logic.

### C. Architecture scans

Tests should forbid new runtime semantic hardcodes such as:
- retailer names in semantic/browser routing code;
- benchmark values;
- local field repair logic.

### D. Smoke4

Expected release gate:
- 4 total;
- 4 validated;
- 0 review;
- 0 errors;
- 0 comparator mismatches, subject to benchmark/live-state correctness.

If a fresh screenshot visibly shows a value different from a stale benchmark, the prompt/runtime must not be changed to fabricate the benchmark value.

### E. Sentinel10

Run only after Smoke4 is green.

Expected:
- 8 validated camera products;
- 2 skipped non-camera;
- 0 review;
- 0 errors;
- 0 comparator mismatch, subject to the same live-state rule.

---

## 17. Frozen Architecture Rule

After approval of this document:

- implementation may change internals only to realize this design;
- no stage may be removed, merged semantically, or reassigned to a different responsibility without explicit user approval;
- Camera Intelligence remains visual-only;
- Gemini remains semantic-only;
- discovery begins only from Gemini-approved camera routes;
- product packets are frozen before Gemini interpretation;
- capture and Gemini processing overlap through a bounded queue;
- workbook output remains the final terminal artifact.

Any future proposal that changes those boundaries requires a new explicit architecture decision.
