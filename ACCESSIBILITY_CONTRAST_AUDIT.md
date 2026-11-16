# Clubset Accessibility Contrast Audit

**Status:** calculated from source oklch token values (WCAG relative-luminance method).  
**Not yet verified in a real browser** — see "Verification basis" below.  
**Brand constraint:** purple identity preserved; no new colors introduced — existing tokens were adjusted in lightness/alpha only.

## Method

- Colors are defined in `src/styles.css` using `oklch(L C H [/ alpha])`.
- Relative luminance computed per WCAG 2.1: oklch → oklab → linear sRGB → `L = 0.2126·R + 0.7152·G + 0.0722·B`.
- Contrast ratio = `(Lighter + 0.05) / (Darker + 0.05)`.
- Alpha values composited over their background before measuring (e.g. `--ring`, dark `--border`/`--input`).
- Thresholds: **4.5:1** for normal text; **3:1** for large text and non-text UI components (borders, input boundaries, focus rings).
- Note: a few light-theme tokens (`--background` at `oklch(0.96 …)`) sit slightly outside the sRGB gamut; the browser will gamut-clamp on render, so borderline results (see Primary button text) should be confirmed in-browser.

## Light theme (:root)

| Pairing | Foreground on background | Ratio | Threshold | Status | Change |
|---|---|---|---|---|---|
| Body text on page background | `--foreground` on `--background` | 17.29 | 4.5 | PASS | none |
| Body text on card | `--card-foreground` on `--card` | 19.41 | 4.5 | PASS | none |
| Muted text on background | `--muted-foreground` on `--background` | 5.04 | 4.5 | PASS | none |
| Muted text on muted surface | `--muted-foreground` on `--muted` | 4.67 | 4.5 | PASS | none |
| **Border vs background** | `--border` on `--background` | 1.28 → **3.57** | 3.0 | FAIL → PASS | `--border` 0.88 → 0.60 |
| **Input boundary vs background** | `--input` on `--background` | 1.09 → **3.57** | 3.0 | FAIL → PASS | `--input` 0.93 → 0.60 |
| Primary button text | `--primary-foreground` on `--primary` | 4.52 | 4.5 | PASS (borderline) | none |
| Primary button hover text | white on `--primary` at 90% over bg | 4.52 | 4.5 | PASS | none |
| Destructive button text | `--destructive-foreground` on `--destructive` | 4.96 | 4.5 | PASS | none |
| **Focus ring vs background** | `--ring` on `--background` | 1.44 → **3.18** | 3.0 | FAIL → PASS | `--ring` alpha 0.4 → 0.9 |
| Secondary button text | `--secondary-foreground` on `--secondary` | 13.54 | 4.5 | PASS | none |
| Ghost button default | `--foreground` on `--background` | 17.29 | 4.5 | PASS | none |
| Ghost button hover | `--accent-foreground` on `--accent` | 11.35 | 4.5 | PASS | none |

### Light theme — residual / edge case
- **Border on `--accent` surface** (`oklch(0.86 0.05 250)`): 2.66 with `--border` 0.60 (below 3.0). Even 0.58 yields only 2.89. The accent surface is a saturated light-purple hover/state color; fully closing this gap would require a much darker border that harms the light-theme visual direction. Left as a documented known limitation (see report).

## Dark theme (.dark)

| Pairing | Foreground on background | Ratio | Threshold | Status | Change |
|---|---|---|---|---|---|
| Body text on background | `--foreground` on `--background` | 22.03 | 4.5 | PASS | none |
| Body text on card | `--card-foreground` on `--card` | 19.04 | 4.5 | PASS | none |
| Muted text on background | `--muted-foreground` on `--background` | 8.79 | 4.5 | PASS | none |
| Muted text on muted surface | `--muted-foreground` on `--muted` | 6.07 | 4.5 | PASS | none |
| Border vs background | `--border` (10% white) on `--background` | 3.21 | 3.0 | PASS | none |
| Input boundary vs background | `--input` (15% white) on `--background` | 4.31 | 3.0 | PASS | none |
| Primary button text | `--primary-foreground` on `--primary` | 16.20 | 4.5 | PASS | none |
| **Destructive button text** | `--destructive-foreground` on `--destructive` | 2.83 → **4.71** | 4.5 | FAIL → PASS | `--destructive` 0.704 → 0.58 |
| Focus ring vs background | `--ring` on `--background` | 4.69 | 3.0 | PASS | none |
| Secondary button text | `--secondary-foreground` on `--secondary` | 15.22 | 4.5 | PASS | none |

## Token changes made (`src/styles.css`)

| Token | Before | After | Reason |
|---|---|---|---|
| `--border` (light) | `oklch(0.88 0.008 245)` | `oklch(0.60 0.008 245)` | borders failed 3:1 on light bg (1.28) |
| `--input` (light) | `oklch(0.93 0.008 242)` | `oklch(0.60 0.008 242)` | input boundaries failed 3:1 on light bg (1.09) |
| `--ring` (light) | `oklch(0.55 0.14 258 / 0.4)` | `oklch(0.55 0.14 258 / 0.9)` | focus ring failed 3:1 on light bg (1.44) |
| `--destructive` (dark) | `oklch(0.704 0.191 22.216)` | `oklch(0.58 0.191 22.216)` | destructive text failed 4.5:1 in dark (2.83) |

No new colors introduced; only existing-token lightness/alpha adjusted. Brand purple (`--primary`) unchanged.

## Verification basis

- **Calculated from source values** (this file): every pairing above was computed from the committed `oklch` token values. After the token changes, every tested pairing passes its threshold (0 failures), except the documented light-theme border-on-accent edge case.
- **Not verified in a real browser**: no browser automation driver is installed (Chrome is present but no Playwright/Cypress/WebDriver), and authenticated routes require a Supabase session with no credentials available. Ratios should be confirmed in-browser (DevTools color picker + contrast checker) before claiming WCAG conformance. Pay particular attention to the borderline light primary-button text (4.52) and any out-of-gamut rendering.

## Disabled / interactive states

- Disabled controls (`opacity-50`, `pointer-events-none`) are exempt from WCAG contrast minimums because they are not interactive; they are styled consistently and not relied upon for information.
- Focus indicators use `focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`, now meeting 3:1 in both themes.
- Hover states for primary/destructive/ghost buttons remain above threshold (listed above).
