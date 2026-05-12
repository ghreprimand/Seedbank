# Theming

Seedbank's theming system lets you switch between ten named palettes from **Settings → Theme** without reloading. Theme tokens are CSS custom properties resolved at runtime, so every Tailwind utility class automatically reacts to the active theme.

---

## How it works: two-level token model

Tailwind v4 processes `@theme` blocks at build time and produces static utility classes. To support runtime switching, Seedbank uses a two-level indirection:

1. **Level 1 — semantic Tailwind tokens** (`client/src/index.css`): the `@theme` block maps Tailwind utility names to CSS `var()` references.

   ```css
   /* index.css — built at compile time */
   @theme {
     --color-paper: var(--c-paper);
     --color-sage-600: var(--c-sage-600);
     --color-ink-800: var(--c-ink-800);
     /* … */
   }
   ```

   This means `bg-paper`, `text-sage-600`, `text-ink-800`, etc. all resolve through a CSS variable chain.

2. **Level 2 — theme blocks** (`client/src/theme/themes.css`): each theme is a `:root[data-theme="<name>"]` block that sets the `--c-*` custom properties.

   ```css
   /* themes.css */
   :root[data-theme="paper"] {
     --c-paper: #f7f4ef;
     --c-sage-600: #5a7a5e;
     --c-ink-800: #2c2a26;
     /* … */
   }

   :root[data-theme="loam"] {
     --c-paper: #1e1a16;
     --c-sage-600: #7aaa7e;
     --c-ink-800: #ede8e2;   /* inverted — see Dark themes below */
     /* … */
   }
   ```

The browser resolves the chain `text-ink-800` → `var(--color-ink-800)` → `var(--c-ink-800)` → the current theme's hex value. Changing `data-theme` on `<html>` instantly re-renders the whole page with no class changes in components.

### The golden rule for new components

**Never hardcode hex colors.** Always use Tailwind token classes (`bg-paper`, `text-ink-600`, `border-sage-200`, etc.). Every token class works correctly across all six themes. A hardcoded `#2c2a26` will look correct in Paper and broken in Loam.

---

## Dark theme ink-scale inversion

Tailwind's default semantic scale reads `ink-800` as very dark, `ink-50` as very light. This direction is preserved in all four light themes.

The four dark themes (**Loam**, **Moss**, **Peat**, **Canopy**) and two mid-depth themes (**Hearth**, **Rainwash**) all invert the scale:

| Token | Light themes | Dark themes |
|-------|-------------|-------------|
| `text-ink-800` | Near-black body text | Near-white body text |
| `text-ink-400` | Mid-grey secondary text | Mid-warm-grey secondary text |
| `bg-paper` | Off-white surface | Deep earth/charcoal surface |

This means UI code written for light mode (`text-ink-800` for primary text, `bg-paper` for surfaces) continues to read as intended in dark mode without conditional classes.

---

## The ten themes

### 1. Paper (default)

The original Seedbank palette. Feels like a physical field journal.

| Role | Character |
|------|-----------|
| Surface | Off-white paper (`#f7f4ef`) |
| Action color | Sage green |
| Accent | Clay / warm amber |
| Type | Warm ink |

### 2. Parchment

Warmer and slightly more aged than Paper. Terracotta leans deeper; sage is dustier.

| Role | Character |
|------|-----------|
| Surface | Warm cream |
| Action color | Dusty sage |
| Accent | Deep terracotta |
| Type | Brown-ink |

Good for longer reading sessions where cooler Paper feels slightly sterile.

### 3. Meadow

A cooler light theme. Sage is promoted to a stronger surface accent; paper has a cooler, bluer cast.

| Role | Character |
|------|-----------|
| Surface | Cool off-white |
| Action color | Richer sage |
| Accent | Soft meadow green |
| Type | Cool dark |

### 4. Dusk

In-between — not dark, not light. Warm taupe surfaces with deep moss and amber. Reads like an evening field journal under incandescent light.

| Role | Character |
|------|-----------|
| Surface | Warm taupe |
| Action color | Deep moss |
| Accent | Amber |
| Type | Warm near-dark |

### 5. Hearth (mid-depth)

Warm clay/adobe surfaces — not as dark as Loam but not a light theme. Earthy and warm for evening reading.

| Role | Character |
|------|-----------|
| Surface | Warm clay / terracotta-brown |
| Action color | Golden ochre |
| Accent | Terracotta |
| Type | Warm near-white (`ink-800` inverted) |

### 6. Rainwash (mid-depth)

Cool sage/stone surfaces — the garden after rain. Quieter and more muted than the light themes.

| Role | Character |
|------|-----------|
| Surface | Cool sage-stone |
| Action color | Rainy sage-teal |
| Accent | Warm stone / terracotta contrast |
| Type | Cool near-white (`ink-800` inverted) |

### 7. Loam (dark)

Full dark. Deep earth-brown surfaces. Sage stays the action color; clay becomes brighter terracotta for contrast against dark backgrounds.

| Role | Character |
|------|-----------|
| Surface | Deep earth brown |
| Action color | Sage (slightly lightened) |
| Accent | Bright terracotta |
| Type | Warm near-white (`ink-800` inverted) |

### 8. Moss (dark)

Full dark, green-dominant. Charcoal-green surfaces, paler sage type, copper accents.

| Role | Character |
|------|-----------|
| Surface | Charcoal green |
| Action color | Pale sage |
| Accent | Copper / amber |
| Type | Cool near-white (`ink-800` inverted) |

### 9. Peat (dark)

The darkest warm theme. Deep black-soil umber with muted lichen (desaturated olive) action colour. Stark and focused.

| Role | Character |
|------|-----------|
| Surface | Black-soil umber |
| Action color | Muted lichen (desaturated olive) |
| Accent | Terracotta |
| Type | Warm near-white (`ink-800` inverted) |

### 10. Canopy (dark)

Forest-understory charcoal-green. Rich forest-green action color; bark and copper clay accents.

| Role | Character |
|------|-----------|
| Surface | Charcoal forest-green |
| Action color | Rich forest sage-green |
| Accent | Bark / copper |
| Type | Cool near-white (`ink-800` inverted) |

---

## Theme picker

**Settings → Theme** shows ten mini-preview cards. Each card contains an inline swatch — a tiny simulated header bar and a card — rendered with `style` attributes that directly reference the theme's CSS variables. This means the swatch colors are always accurate regardless of which theme is currently active.

- **Keyboard navigation:** arrow keys move between cards; Enter selects.
- **Match system:** a toggle below the cards enables automatic dark/light pairing — **Paper** when `prefers-color-scheme: light`, **Loam** when `prefers-color-scheme: dark`. Picking any theme manually overrides this. The system preference is watched live; if you change your OS theme while Seedbank is open, the active theme updates immediately.
- **Persistence:** the selection is saved to `PATCH /api/settings/ui` and mirrored to `localStorage` (`seedbank.ui.theme` key, JSON `{ name, matchSystem }`). The localStorage mirror is what the pre-paint bootstrap reads.

---

## No-FOUC boot behavior

The pre-paint IIFE in `client/src/main.tsx` runs synchronously before `createRoot`. It:

1. Reads `localStorage.getItem('seedbank.ui.theme')`.
2. Parses `{ name, matchSystem }`.
3. If `matchSystem` is true, resolves to `loam` or `paper` based on `prefers-color-scheme`.
4. Sets `document.documentElement.dataset.theme = name` before any React render.
5. If `matchSystem` is true, also subscribes a `change` listener on the media query for live switching.

If `localStorage` has no value, the browser falls back to the default `:root[data-theme="paper"]` selector in `themes.css`, which doubles as the base/fallback block.

After the settings store hydrates from `GET /api/settings`, the server-stored theme preference is applied (via `applyTheme()` in `themeUtils.ts`). This may produce a one-frame update if the server value differs from localStorage — the pre-paint step eliminates the more common flash from the default → user-preference transition.

---

## Authoring a custom theme (advanced)

The theme system uses standard CSS custom properties, so a custom theme can be injected at runtime via a `<style>` tag or by extending `themes.css`. There is no built-in UI for this yet; it requires a code change.

**Steps:**

1. Add a new block in `client/src/theme/themes.css`:

   ```css
   :root[data-theme="myTheme"] {
     /* Copy the full variable list from the "paper" block and adjust values. */
     --c-paper: #…;
     --c-paper-warm: #…;
     /* … all --c-* variables … */
   }
   ```

2. Add `'myTheme'` to `VALID_THEME_NAMES` in `client/src/theme/themeUtils.ts` and to the `ThemeName` union in `shared/types.ts`.

3. Add a card entry in `ThemeTab.tsx` with the matching swatch variables.

4. The server validates theme names on `PATCH /api/settings/ui`. Add `'myTheme'` to the `VALID_THEMES` list in `server/src/index.ts`.

> All ten built-in themes preserve the serif (`Lora`) + humanist sans (`Inter`) + mono (`JetBrains Mono`) font stack and the established card/badge/pill border-radius tokens. Custom themes should do the same to avoid visual inconsistency.
