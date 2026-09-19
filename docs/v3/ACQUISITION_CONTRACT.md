# V3 Acquisition Contract — Phase 12A

## Goal

Given only a root website URL, V3 should automatically discover the best available public acquisition path without requiring the user to copy selectors, request URLs, payloads, or cURL commands.

## Capability order

1. **Static HTTP**
   - source HTML
   - canonical/base
   - menu/category links
   - JSON-LD/microdata
   - script and endpoint hints

2. **Network reconnaissance**
   - observe browser requests/responses
   - identify Fetch/XHR/product-feed candidates
   - capture method, payload shape, content type, and response structure

3. **Endpoint replay**
   - replay a qualified product-list/detail endpoint
   - learn pagination only from demonstrated request/response behavior
   - stop on empty, repeated, or no-new-product responses

4. **Rendered browser fallback**
   - use only when source/network paths are insufficient

## Router rule

A backend is selected by demonstrated capability, not by hard-coded domain identity.

Site-specific observations may be cached in a SiteProfile, but every cached route MUST be probed before reuse. A failed probe triggers rediscovery.

## Browser role

Browser automation is primarily a reconnaissance and fallback capability, not the default crawler for every page.

## Acquisition output

Every discovered URL/event MUST carry provenance:
- backend
- parent URL
- region/context when known
- request/response source when applicable
- discovery reason

Discovery itself MUST NOT classify a URL as CAMERA. Entity classification occurs after detail acquisition.
