# V3 Observation Contract — Phase 12A

## Observation-first model

A field value is stored as an observation, not as “the truth”.

Required properties:
- product identity
- field name
- raw value
- optional normalized value
- source kind
- source URL
- locator/path/context when available

Examples of source kinds:
- VISIBLE_TEXT
- JSON_LD
- MICRODATA
- XHR
- API
- DOM
- META
- ATTRIBUTE

## Preservation rule

All unique observations are preserved.

Exact duplicate evidence may be collapsed only when field, raw value, source kind, source URL, and locator are equivalent.

## No winner rule

V3 MUST NOT expose a generic resolver that chooses one observation as authoritative merely because of source priority.

A downstream user may later clean or reconcile the exported data.

## Missing data

No evidence => null/blank.

The collector MUST NOT infer a missing product field from an unrelated nearby value.

## Conflict behavior

Different values for the same field are valid raw observations.

Conflict detection may add audit flags, but MUST NOT delete evidence or block export of a confirmed camera.
