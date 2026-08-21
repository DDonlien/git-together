# Design QA — AI provider settings

Date: 2026-08-17 (UTC+8)

## Evidence

- Reference: `/Users/taobe/.codex/visualizations/2026/08/17/01a00fb3-7660-7541-8004-d57ff0f6370f/ai-provider-reference.png` (3248 × 2122).
- OpenAI API implementation: `/Users/taobe/.codex/visualizations/2026/08/17/01a00fb3-7660-7541-8004-d57ff0f6370f/ai-openai-api-qa.jpeg` (1160 × 720).
- OpenAI Subscription implementation: `/Users/taobe/.codex/visualizations/2026/08/17/01a00fb3-7660-7541-8004-d57ff0f6370f/ai-openai-subscription-qa.jpeg` (1160 × 720).
- OpenCode Go API implementation: `/Users/taobe/.codex/visualizations/2026/08/17/01a00fb3-7660-7541-8004-d57ff0f6370f/ai-opencode-go-qa.jpeg` (1160 × 720).
- Runtime: packaged Tauri debug bundle, macOS dark appearance, Global Settings → AI Options.

## Comparison history

### Pass 1

The reference and the restored OpenAI API screenshot were opened together in one comparison input. The app window is smaller than the reference capture, so the comparison was normalized to the settings modal, provider cards, expanded form, typography, spacing, borders, and theme tokens rather than the surrounding workspace scale.

- The existing OpenAI form keeps the reference hierarchy and controls after its label changes to **OpenAI API**.
- **OpenAI Subscription** and **OpenCode Go API** use the same CardGroup, radio, input, select, button, spacing, border, and dark-theme patterns as the reference screen.
- The extra provider rows and the GitButler navigation item are intentional product changes, not fidelity defects.
- No focused crop was needed: labels and primary controls were readable in the full 1160 × 720 runtime screenshots.
- P0: none.
- P1: none.
- P2: none.

## Interaction checks

- Switched from OpenAI API to OpenAI Subscription and confirmed the browser-sign-in CTA is shown without an API-key field.
- Switched to OpenCode Go API and confirmed the masked key field, disabled empty-save action, and dynamically discovered **GPT 5.6 Luna** model.
- Did not start OAuth or enter credentials during QA.
- Restored OpenAI API as the selected provider and confirmed its existing key mode, model, and custom endpoint controls remained intact.

## Final result

passed
