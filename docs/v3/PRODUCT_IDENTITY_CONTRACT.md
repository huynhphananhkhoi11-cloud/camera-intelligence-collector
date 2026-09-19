# V3 Product Identity Contract — Phase 12A

## Why identity is separate from URL

A URL is an acquisition locator, not automatically a product identity.

The same product may be observed through:
- canonical URL;
- pagination/query variants;
- tracking parameters;
- alternate category routes;
- API payload URLs.

Conversely, two URLs that merely look similar MUST NOT be merged without identity evidence.

## Identity signals

Preferred demonstrated signals:
1. canonical product URL;
2. structured Product @id / stable product identifier;
3. stable SKU scoped to the same merchant/site;
4. requested URL only as a fallback identity signal.

## Critical rule

Do **not** globally strip `?p=`, `?page=`, or arbitrary query parameters to force deduplication.

Example:
- `/canon-eos-r50-new`
- `/canon-eos-r50-new?p=2`

They collapse only when page evidence shows the same canonical/structured product identity.

## Merge behavior

Multiple acquisition records sharing the same product identity become one product record containing the union of their observations and provenance.

Identity logic MUST be deterministic and auditable.
