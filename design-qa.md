# Design QA — Git Integrations

## Source and implementation

- Reference: `/var/folders/x1/nj8gw6sj3tz36zt026sy8h2m0000gn/T/TemporaryItems/NSIRD_screencaptureui_zOkQPw/截屏2026-08-17 20.33.56.png`
- Merged page: `_builds/design-qa/git-integrations-merged-page.jpeg`
- Add-server form: `_builds/design-qa/git-integrations-add-server.jpeg`
- Side-by-side comparison: `_builds/design-qa/git-integrations-comparison.jpg`

The supplied reference is 3248 × 2122. The available macOS QA display captured the development app at 1160 × 720, so the comparison center-crops and normalizes the reference into the same 1160 × 720 evidence slot without changing the implementation capture.

## Verified state

- Dark theme, Global settings modal open.
- One sidebar destination named `Git Integrations`; the separate `Git stuff` and `Integrations` destinations are absent.
- Auto-fetch, GitHub, GitLab, Bitbucket, self-hosted Git, and PR/MR auto-fill settings share the merged page.
- `Gitea / Self-hosted Git` exposes `Add server` in the merged page.
- The add-server state exposes Label, HTTPS server root, Username, Password / PAT, Cancel, and disabled-until-valid Save controls.
- No credential values were entered or saved during QA.

## Visual findings

- Existing modal geometry, sidebar treatment, typography, provider cards, borders, radii, and color tokens remain consistent with the reference.
- The intended information-architecture change is clear: the merged label occupies the former pair's position and the Gitea card follows the hosted-provider credential note.
- At the smaller QA viewport, the content column scrolls and focusing the Label field brings the complete two-column Gitea form into view without clipping or horizontal overflow.
- The implementation intentionally adds the auto-fetch card above the hosted-provider cards and the Gitea card below them; these are product changes, not visual mismatches.

## Iteration history

1. Static component checks passed, but the first localhost browser path was blocked by the in-app browser.
2. A local Tauri QA bundle was built and inspected through the macOS accessibility tree and screenshots.
3. A concurrent edit restored the old Overview `Connections` entry during QA; the task-scoped `Git Integrations` route and clone-only modal were reapplied before final validation.
4. The merged page and expanded add-server form were rechecked without submitting data.

Final result: passed

---

# Design QA — Work Trees visual unification

## Source and implementation

- Source visual truth: `/var/folders/x1/nj8gw6sj3tz36zt026sy8h2m0000gn/T/TemporaryItems/NSIRD_screencaptureui_ZrO7ir/截屏2026-08-17 20.37.48.png`
- Source pixels: 3248 × 2122.
- Source CSS viewport and density: not independently available from the PNG metadata; the capture appears Retina-density, so no unverified normalization was applied.
- Intended implementation state: dark theme, Work Trees page, `zibuyu_main` selected, with Threads / Tasks, Repositories, Chat, and Context panels visible.
- Implementation screenshot: unavailable.
- Implementation viewport, CSS size, and density: unavailable because the isolated native app did not reach a capturable page state.

## Full-view comparison evidence

Blocked. The source visual opened successfully, but there is no valid rendered implementation screenshot at the same viewport and state. Code inspection and a successful production build are not substitutes for visible comparison evidence.

## Focused region comparison evidence

Blocked for the same reason. Typography, controls, repository rows, context cards, and panel headers could not be compared from a rendered implementation.

## Findings

- [P1] Rendered implementation evidence is missing.
  Location: Work Trees native desktop screen.
  Evidence: the source capture is available, but the isolated QA bundle stopped during frontend initialization before the Work Trees screen could be captured. The already-running development app was also affected by unrelated concurrent branch/stack runtime errors.
  Impact: font hierarchy, control sizing, spacing rhythm, tokens, icon alignment, copy, and responsive behavior cannot be accepted visually from code and build output alone.
  Fix: launch the updated worktree after the concurrent runtime errors are resolved, capture the same Work Trees state at the same viewport/density, combine it with the source capture, and repeat the full-view and focused-region comparison.

## Required fidelity surfaces

- Fonts and typography: implementation uses the shared 11/12/13/14/18 px hierarchy in code; rendered fidelity remains unverified.
- Spacing and layout rhythm: shared button height, radius, border, and spacing tokens are used in code; rendered fidelity remains unverified.
- Colors and visual tokens: existing GitButler surface, foreground, border, and semantic tokens are reused; rendered fidelity remains unverified.
- Image quality and asset fidelity: the page has no bespoke imagery; glyph controls were replaced with the existing icon library, but rendered alignment remains unverified.
- Copy and content: existing Work Trees copy and real repository state were preserved; wrapping and truncation remain unverified.

## Comparison history

1. Built a temporary isolated native QA route without changing the active development app used by concurrent work.
2. The first QA bundle was rebuilt with auto-updates disabled; production compilation succeeded, but runtime initialization stopped with `Cannot access 'tv' before initialization` before the target page could render.
3. The active development app separately reported unrelated concurrent branch/stack errors involving `newStack`, so it was not used as evidence or modified.
4. The temporary QA route and QA-only Tauri configuration were removed, and the normal route was restored byte-for-byte before the final production build.
5. A later capture attempt was additionally blocked because macOS was locked and automatic unlock was unavailable.

## Implementation checklist

- Resolve or finish the concurrent branch/stack runtime work.
- Unlock macOS and launch the updated desktop worktree.
- Recreate the source state and viewport.
- Capture full-view and focused typography/control regions.
- Normalize density, compare side by side, and address any P0/P1/P2 mismatch before changing this result.

Final result: blocked
