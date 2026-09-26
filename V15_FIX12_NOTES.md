# V15 FIX12 — provider thinking-level type contract

Fixes TS2322 introduced by FIX11.

- `GeminiVisualProviderRequest.generation_config.thinking_level`:
  - before: `"low"`
  - after: `"low" | "medium"`
- extractor default remains `low`
- route selection remains `low`
- product semantic remains `medium`
- regression evidence added for medium provider requests

No other production behavior changed.

Offline evidence:
- syntax/transpile PASS
- required lane coverage PASS []
- architecture guards PASS []
- secret scan PASS

Fresh Windows full gate is still required before release green.
