# Tailwind CSS 3.4.19 → 4.3.3 — design-locked prep

**Status:** prep only. This branch does **not** bump `tailwindcss`, does **not** replace Dependabot PR #116, and must **not** be fast-forwarded to `main`.

| | |
|---|---|
| Tracking | [#134](https://github.com/reubinoff/Clockinoff/issues/134) |
| Dependabot tip this plan replaces, later | [#116](https://github.com/reubinoff/Clockinoff/pull/116) (`tailwindcss` 3.4.19 → 4.3.3) |
| Base this plan was written against | `70134ded589973160287e0345a7e53e465497315` (`chore(deps): bump zod from 3.25.76 to 4.6.5`) |
| Ship lane that must clear first | #113 LOCK. Nothing from this prep lands while a product tip is mid-gates. |
| Who runs L+D | Dana, on the **ship tip after it lands**, in light and dark. Not this prep branch. |

The coding-bot ship tip (after #113 is clear) implements the edits below in one commit, closes the Dependabot major by superseding #116, and references `Fixes #134` only when that ship tip is the one merged to `main`. This prep commit uses `Refs #134`.

No `/docs` page changes belong in the ship tip unless a visual delta escapes the locks below. The migration is an implementation swap of the same Quiet Pulse UI.

---

## 1. Inventory (Tailwind 3, as of `70134de`)

### Packages (`package.json` ranges, lockfile resolved)

| Package | Range | Resolved in `package-lock.json` | Role |
|---|---|---|---|
| `tailwindcss` | `^3.4.15` (dev) | **3.4.19** | Build |
| `postcss` | `^8.4.49` (dev) | **8.5.28** | Next CSS pipeline. Nested copy `8.5.23` under `next`. |
| `autoprefixer` | `^10.4.20` (dev) | **10.6.1** | PostCSS plugin after Tailwind |

No Tailwind plugins. `tailwind.config.ts` sets `plugins: []`. The comment in `src/app/globals.css` about `@tailwindcss/typography` is historical: docs prose is hand-rolled under `.docs-prose`. Do not add `@tailwindcss/typography`.

### Config files

- `tailwind.config.ts` — `content: ["./src/**/*.{ts,tsx}"]`. Theme **extend** only (defaults stay). No `safelist`, no `darkMode` key (theme is `html[data-theme]`, not the `dark:` variant).
- `postcss.config.mjs` — `tailwindcss: {}` then `autoprefixer: {}`.
- `next.config.mjs` — no Tailwind-specific key. Production build is `next build --webpack` (`package.json` `"build"`).
- Entry CSS: `src/app/globals.css` lines 1–3:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Theme tokens that must survive (from `tailwind.config.ts`)

**Colors** (all `var(--color-*)`, flipped by `html[data-theme]` in `globals.css`):

`accent`, `accent-hover`, `accent-fg`, `accent-soft`, `accent-ring`, `surface`, `canvas`, `canvas-2`, `ink`, `ink-2`, `muted`, `border`, `border-strong`, `danger`, `danger-soft`, `success`, `success-soft`.

**Shadows:** `card`, `card-lg`, `sheet` → utilities `shadow-card`, `shadow-card-lg`, `shadow-sheet`, values `var(--shadow-*)`.

**Font families:** `sans` = InterVariable, Inter, Geist, system-ui, -apple-system, Segoe UI, Roboto, sans-serif. `mono` = ui-monospace, SFMono-Regular, Menlo, Consolas, Liberation Mono, monospace.

**Font sizes** (size + line-height, plus letter-spacing / font-weight where set):

| Utility | Size | Extras |
|---|---|---|
| `text-display` | `clamp(1.75rem, 1.4rem + 1.5vw, 2.25rem)` | lh 1.15, tracking -0.02em, weight 600 |
| `text-title` | `clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem)` | lh 1.25, weight 600 |
| `text-title-sm` | `1.125rem` | lh 1.3, weight 600 |
| `text-body` | `0.9375rem` | lh 1.5 |
| `text-body-sm` | `0.875rem` | lh 1.45 |
| `text-label` | `0.75rem` | lh 1.3, tracking 0.02em, weight 500 |
| `text-meta` | `0.75rem` | lh 1.3 |
| `text-timer-lg` | `clamp(1.75rem, 1.5rem + 1vw, 2.5rem)` | lh 1, weight 500 |
| `text-timer-md` | `1.25rem` | lh 1, weight 500 |

**Radius keys in the JS config that no class uses:** `rounded-radius-sm|md|lg|xl` (`8/12/16/20px`) appear only in `tailwind.config.ts`. Drop them. Do not invent utilities. `borderRadius.2xl: "1rem"` matches both the v3 and v4.3.3 default (`--radius-2xl: 1rem`).

### Class-rename inventory (this repo only)

Searched `src/**/*.{ts,tsx,css}`.

| v3 → v4 rename | Present? | Ship action |
|---|---|---|
| `shadow-sm` → `shadow-xs`, bare `shadow` → `shadow-sm` | No default scale utilities. Only `shadow-card`, `shadow-card-lg`, `shadow-none`, and one arbitrary `shadow-[0_-1px_2px_rgba(17,24,39,0.04)]` (`src/app/app/layout.tsx`). | Leave class names. |
| `bg-gradient-*` → `bg-linear-*` | No | None |
| `flex-shrink-*` / `flex-grow-*` | No utility classes. One raw `flex-shrink: 0` declaration in `globals.css`. | Leave the declaration. |
| `overflow-ellipsis`, `decoration-slice` / `decoration-clone` | No | None |
| `rounded-sm` → `rounded-xs` | No `rounded-sm`. Bare `rounded` compiles to `0.25rem` in v4.3.3 (`--radius: 0.25rem`), same as v3. `rounded-md` 0.375rem, `rounded-lg` 0.5rem, `rounded-xl` 0.75rem, `rounded-2xl` 1rem match. | Do not rename radius classes. |
| `outline-none` behavior | **Yes.** v4 `outline-none` is `outline-style: none` only. v3's forced-colors outline moved to `outline-hidden`. | **Rename every `outline-none` to `outline-hidden`.** |
| bare `ring` (3px → 1px) | No bare `ring` utility. Focus uses `ring-2` plus `ring-accent-ring`. | Leave `ring-2`. |

`outline-none` call sites to rename in the ship tip:

- `src/app/globals.css` — every `@apply` / class string (8 occurrences on the lines that contain the token)
- `src/components/LibraryTabs.tsx`
- `src/components/HeaderUserMenu.tsx`
- `src/components/AppearanceSelect.tsx` (both branches)

### Other utilities that stay, with a visual check

- `space-y-*` and `space-x-2` are used widely (auth forms, entries, projects, sheets). v4 changes the child selector. Do not rewrite them to `gap` in the ship tip.
- `divide-y divide-border` — `src/components/reports/ReportsSummary.tsx`.
- Opacity modifiers that must keep working: `border-accent/25`, `border-danger/20`, `bg-canvas-2/80`, `supports-[backdrop-filter]:bg-canvas-2/70`.
- `placeholder:text-muted` on `.input`.
- `hover:bg-border` (Header user menu) — color token `border`, not a width utility.

### Pipeline choice (locked)

Use **`@tailwindcss/postcss`**. Do **not** add `@tailwindcss/cli` or `@tailwindcss/vite`.

`next build --webpack` compiles CSS through PostCSS. A CLI watch step would be a second pipeline. Vitest does not need the Vite Tailwind plugin. v4's Lightning CSS handles prefixing, so **drop `autoprefixer`** from `postcss.config.mjs` and from `devDependencies` (avoids double prefixes). Keep `postcss` (already 8.5.x; v4.3.2 fixed `@tailwindcss/postcss` types against newer PostCSS patches).

Pin both Tailwind packages to **exact `4.3.3`** so the ship tip matches #116's target, not a floating `^4`.

---

## 2. Design locks (do not reopen on the ship tip)

1. **CSS-first config. Delete `tailwind.config.ts`.** Do not leave a permanent `@config` bridge. One source of truth: `src/app/globals.css`.
2. **Keep the runtime variable names** `--color-*` and `--shadow-*` on `:root` / `html[data-theme="light"]` / `html[data-theme="dark"]`. Do not rename them and do not move the hex/rgba palette into `@theme`. Dark mode is a `data-theme` flip, not `dark:`.
3. **Register those tokens with `@theme inline` whose values are the same `var(--…)`**. A throwaway compile of `tailwindcss@4.3.3` + `@tailwindcss/postcss@4.3.3` (not committed, not installed in this repo) showed:
   - `@theme inline` still **emits** `--color-accent: var(--color-accent)` (and the same for shadows) inside `@layer theme` on `:root, :host`.
   - `@layer base` comes later in the layer order (`theme, base, components, utilities`), so the existing palette declarations **replace** the self-reference. Computed colors stay the Quiet Pulse hex/rgba values.
   - Utilities emit `background-color: var(--color-canvas)` (and siblings). Opacity modifiers emit `color-mix(in oklab, var(--color-accent) 25%, transparent)` with a solid `var()` fallback. That is the required shape for `border-accent/25`, `border-danger/20`, `bg-canvas-2/80`, and the backdrop-filter variant.
   - `shadow-card` emits `--tw-shadow: var(--shadow-card)`, so the base-layer shadow (including the dark twin) still drives `box-shadow`.
   - `text-display` emits font-size, line-height, letter-spacing, **and** font-weight from `--text-display--font-weight`. Same pattern for the other custom sizes.
   - `placeholder:text-muted` emits `&::placeholder { color: var(--color-muted); }`, which overrides Preflight's 50% `currentcolor` mix.
   - `:focus-visible` `@apply outline-hidden` keeps the forced-colors `outline: 2px solid transparent`.
4. **If the self-reference is not overridden, every token paints as invalid.** The ship tip must not delete or reorder the `@layer base` palette above the import. The import stays first; the palette stays in `@layer base` after it.
5. **Font stack stays the v3 stack, including `system-ui`.** v4.3.3's default `--font-sans` drops `system-ui` / `ui-sans-serif` for CJK on Windows. Clockinoff's stack is InterVariable first and is intentional. Do not adopt the v4 default sans.
6. **Uncolored borders use `--color-border`, not Tailwind `gray-200` and not `currentColor`.** v4 Preflight sets `border: 0 solid` with no gray-200 color, so a bare `border` / `border-t` would become the text color. Almost every border in `src/` already pairs a color utility (`border-border`, `border-border-strong`, `border-accent`, `border-transparent`, `border-danger/20`). The running timer dock sets `border-top-color` in `.timer-dock-running`. Still add this base rule so a missed width utility matches chrome, and so explicit color utilities (utilities layer) keep winning:

```css
@layer base {
  *,
  ::after,
  ::before,
  ::backdrop,
  ::file-selector-button {
    border-color: var(--color-border);
  }
}
```

7. **`@source` is manual.** Disable automatic detection so `docs/`, `tests/`, and repo-root markdown are not scanned. From `src/app/globals.css`, scan the same set as today: `src/**/*.{ts,tsx}`.
8. **No new plugins, no class rewrites** of `space-*` / `divide-*` / radius / shadow names. The only class edit is `outline-none` → `outline-hidden`.
9. **`@apply` failure mode is a build error** (`Cannot apply unknown utility class`). Every custom utility used in `globals.css` (`bg-canvas`, `text-body`, `shadow-card`, `ring-accent-ring`, `border-border`, …) must exist in `@theme` before the `@apply` lines. That is the compile gate.

---

## 3. Exact file edits for the ship tip

### 3.1 `package.json` devDependencies

- Set `"tailwindcss": "4.3.3"`.
- Add `"@tailwindcss/postcss": "4.3.3"`.
- Remove `autoprefixer`.
- Leave `postcss` on `^8.4.49` (lockfile already 8.5.28).
- Regenerate `package-lock.json` with `npm install`. Do not hand-edit the lockfile.

### 3.2 `postcss.config.mjs` (replace)

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

### 3.3 Delete `tailwind.config.ts`

### 3.4 `src/app/globals.css`

Replace the three `@tailwind` lines with the block below. Leave the existing `@layer base` palette, motion tokens, component classes, and `.docs-prose` in place. Update the comment that points at `tailwind.config.ts` so it points at this `@theme inline` block. Rename `outline-none` → `outline-hidden` inside this file.

```css
@import "tailwindcss" source(none);
@source "../**/*.{ts,tsx}";

/* Quiet Pulse tokens. Values stay on html[data-theme] below.
   @theme inline only publishes the utility names. */
@theme inline {
  --color-accent: var(--color-accent);
  --color-accent-hover: var(--color-accent-hover);
  --color-accent-fg: var(--color-accent-fg);
  --color-accent-soft: var(--color-accent-soft);
  --color-accent-ring: var(--color-accent-ring);
  --color-surface: var(--color-surface);
  --color-canvas: var(--color-canvas);
  --color-canvas-2: var(--color-canvas-2);
  --color-ink: var(--color-ink);
  --color-ink-2: var(--color-ink-2);
  --color-muted: var(--color-muted);
  --color-border: var(--color-border);
  --color-border-strong: var(--color-border-strong);
  --color-danger: var(--color-danger);
  --color-danger-soft: var(--color-danger-soft);
  --color-success: var(--color-success);
  --color-success-soft: var(--color-success-soft);
  --shadow-card: var(--shadow-card);
  --shadow-card-lg: var(--shadow-card-lg);
  --shadow-sheet: var(--shadow-sheet);
}

@theme {
  --font-sans: InterVariable, Inter, Geist, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;

  --text-display: clamp(1.75rem, 1.4rem + 1.5vw, 2.25rem);
  --text-display--line-height: 1.15;
  --text-display--letter-spacing: -0.02em;
  --text-display--font-weight: 600;

  --text-title: clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem);
  --text-title--line-height: 1.25;
  --text-title--font-weight: 600;

  --text-title-sm: 1.125rem;
  --text-title-sm--line-height: 1.3;
  --text-title-sm--font-weight: 600;

  --text-body: 0.9375rem;
  --text-body--line-height: 1.5;

  --text-body-sm: 0.875rem;
  --text-body-sm--line-height: 1.45;

  --text-label: 0.75rem;
  --text-label--line-height: 1.3;
  --text-label--letter-spacing: 0.02em;
  --text-label--font-weight: 500;

  --text-meta: 0.75rem;
  --text-meta--line-height: 1.3;

  --text-timer-lg: clamp(1.75rem, 1.5rem + 1vw, 2.5rem);
  --text-timer-lg--line-height: 1;
  --text-timer-lg--font-weight: 500;

  --text-timer-md: 1.25rem;
  --text-timer-md--line-height: 1;
  --text-timer-md--font-weight: 500;

  /* Lock v3 config. Same length as the v4.3.3 default. */
  --radius-2xl: 1rem;
}
```

Inside the existing `@layer base`, immediately after the palette (or at the top of that layer), add the border-color rule from lock 6.

`@source "../**/*.{ts,tsx}"` is relative to `src/app/globals.css` and matches today's `content` glob. Do not widen it.

### 3.5 Class rename only

`outline-none` → `outline-hidden` in the four files listed in §1. No other class renames.

### 3.6 Files that stay untouched

- `src/app/global-error.tsx` inline CSS (own `--bg` / `--surface` / `--ink` variables, not Tailwind).
- `public/unavailable.html`.
- User docs under `/docs`.
- `next.config.mjs`, CI workflows, coverage gate.

---

## 4. Why this branch does not contain the bump

A fixture compile proved the CSS shape. It did **not** prove `next build --webpack` of this app, so the dependency was not changed here. A half-applied lockfile on a draft would look like a shippable tip while #113 is the ship lane. The coding bot applies §3 only after #113 LOCK, then runs §5 before asking Dana for L+D.

---

## 5. Verify checklist (ship tip, before Dana)

Run from a clean install after the §3 edits. Do not treat a green unit-test run with coverage disabled as the coverage gate.

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test` (full Vitest run; coverage is enforced by the next command, not by a filtered run)
- [ ] `npm run test:coverage` (≥90% lines / statements / functions and ≥80% branches on `src/server` + `src/lib`)
- [ ] `npm run build` (`next build --webpack`) — fails the tip if any `@apply` utility is unknown or PostCSS cannot load `@tailwindcss/postcss`
- [ ] Built CSS contains `color-mix(in oklab, var(--color-accent)` for the `/25` accent border, and does **not** leave `--color-accent: var(--color-accent)` as the winning declaration on `html[data-theme="light|dark"]` (base layer palette must override `@layer theme`)
- [ ] Visual smoke, light then dark (`data-theme` on `<html>`), desktop width and a ~390px width:
  - [ ] `/login` and `/register` (AuthShell card, Google button, fields, placeholder color = muted not 50% ink, error banner `border-danger/20`, timezone menu)
  - [ ] App shell (`/app`): header, user menu, bottom tabs, timer dock idle and running (accent top border), manual sheet
  - [ ] Today list: rows, sticky week band (`backdrop-blur` / `bg-canvas-2/80`), checkbox, bulk bar, empty state
  - [ ] One stacked form (`space-y-*`) and the reports project list (`divide-y divide-border`) if those routes are cheap to open
- [ ] Focus rings: Tab to a button, an input, and a nav item. Ring is 2px accent. In a forced-colors / high-contrast check, `outline-hidden` still draws the transparent outline (do not ship `outline-none`).
- [ ] **Dana L+D is not this prep.** After the ship tip is on `main` (or on the release candidate Dana reviews), Dana signs off light and dark on the pages above. Prep does not request that pass.

Playwright nightly (`npm run test:e2e`) is additive. Run it if the dev server and Postgres are available; a miss does not replace the visual smoke above.

---

## 6. Out of scope

- Merging or closing #116 from this branch.
- Fast-forward to `main`.
- Any product change riding along with the CSS bump.
- Adopting v4 default font stack, default `gray-200` border restore, `dark:` variants, or `@tailwindcss/typography`.
