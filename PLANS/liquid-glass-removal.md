# Liquid glass removal — rollback record

Date: 2026-09-18. Scope: `apps/kimi-web` (the browser UI).

## What this is

The liquid glass material was deleted on this date. This file is the record of what went, and the recipe to bring it back. If a future request is "put the liquid glass back" or "restore the glass toggle", start here.

## Why it went

The material (translucent tinted faces over a blurred backdrop, an SVG refraction lens on Chromium, a WebGL snapshot fallback elsewhere, a frame-budget watchdog and an ambient measurement engine) was designed against the pre-revamp shell. The upstream port changed the chrome's shape, and the material was patched repeatedly afterwards to keep up. The user dropped it and asked for an opaque material, to be chosen from a catalogue of candidates rather than picked for them.

## Rollback point

Branch `liquid-glass-base` points at commit `0a654db95` — the last commit before the removal.

    git branch --list 'liquid*'          # confirm the branch still exists
    git checkout liquid-glass-base -- apps/kimi-web/src apps/kimi-web/scripts/check-style.mjs

That restores the deleted files, the glass CSS blocks in `style.css` and the style guard's exemption list in one go. There is no `git revert` here: the removal was made in the working tree, uncommitted, so the old state is recovered by path from the branch rather than by reverting a commit.

If the branch is gone (a fork resync rebases and can drop refs), find the files in history by path:

    git log --all --oneline -- apps/kimi-web/src/lib/glass | head
    git log --all --diff-filter=D --oneline -- apps/kimi-web/src/components/ui/GlassDefs.vue

One caveat: the last refinements to the glass system (the right panel's glass face, the seam hairline between the sidebar and the panel, and the `--lg-lens` inheritance reset) were made in the working tree on this date and never committed. The branch therefore restores the glass system as of `0a654db95`, without those refinements. The session transcript for 2026-09-18 describes them.

## Deleted files

- `apps/kimi-web/src/lib/glass/ambient.ts` (378 lines) and `ambient.test.ts` (261)
- `apps/kimi-web/src/lib/glass/detect.ts` (117) and `detect.test.ts` (122)
- `apps/kimi-web/src/lib/glass/gl-renderer.ts` (1298)
- `apps/kimi-web/src/lib/glass/snapshot.ts` (392)
- `apps/kimi-web/src/components/ui/GlassDefs.vue` (84) — the SVG lens filter definitions
- `apps/kimi-web/src/composables/useGlassRefraction.ts` — the per-surface registration composable

## Changed files

- `src/style.css` — 878 lines of glass rules removed (the `--lg-*` gate block and its light/system-light re-tunes, the three tier parameter rules, the shared consuming rule, the opaque/demoted regime, the lens `@supports` block and the `--lg-lens` reset, the WebGL cooperation hooks, the reduced-transparency and prefers-contrast overrides, the scrim utility, the interactive hover lift, the sidebar/header/panel/composer/settings per-surface parameter blocks, and the dialog/sheet raster stagger). The two non-glass blocks that lived inside that region were kept: the spring-preset collapse under `prefers-reduced-motion` and the wide-mode rules.
- Every component that carried an `lg-` class or called `useGlassRefraction`: `App.vue`, `Sidebar.vue`, `SessionRow.vue`, `ServerAuthDialog.vue`, `components/chat/**`, `components/ui/**`, `components/dialogs/BottomSheet.vue`, `components/media/MediaPreview.vue`.
- The toggle plumbing: `lib/storage.ts` (the `kimi-web.liquid-glass` key), `composables/client/useAppearance.ts` (`loadLiquidGlass`, `applyLiquidGlass`, the ref, its watcher, `setLiquidGlass`, the `data-liquid-glass` write), `composables/useKimiWebClient.ts` (the re-exports), `components/settings/SettingsDialog.vue` (the prop, the emit, the settings row), `i18n/locales/{en,zh}/settings.ts` (`settings.liquidGlass`, `settings.liquidGlassHint`).
- `views/DesignSystemView.vue` — the glass documentation replaced by the opaque surface material spec.
- `views/BenchView.vue`, `src/bench/{types,scenarios,fixtures}.ts` — the `setGlass` hook removed and the glass × theme matrix collapsed to a theme sweep.
- `scripts/check-style.mjs` — the `no-glassmorphism` exemption narrowed from `lg-glass|lg-frost|liquidGlass` to the two that survive: `frost` and `--p-menu-backdrop`.
- `webdiff/capture.mjs`, `webdiff/measure-alignment.mjs` — the glass storage seed and the `data-liquid-glass` read removed.

## Semantics a restore must also bring back

- The toggle's storage key `kimi-web.liquid-glass`, its `liquidGlass` / `setLiquidGlass` members on `useAppearance()`, their re-export through `useKimiWebClient()`, the Switch row in `SettingsDialog.vue`, and the two i18n keys in both locales.
- The root attribute `html[data-liquid-glass]` (written by the appearance composable) and the two attributes the engine wrote: `data-glass-regime` (latched by the frame-budget watchdog) and `data-glass-engine="webgl"`.
- The engine entry points: `ensureGlassEngine()` (mounted in `App.vue`), `useGlassRefraction(el, options)` (19 call sites across sidebar, composer, dock, panels, dialogs, menus, tooltips, toasts), and `<GlassDefs />` (mounted in `App.vue` and `BenchView.vue`).

## What survived, on purpose

- `--p-menu-backdrop` (`blur(24px) saturate(1.8)`) in `src/style.css`: upstream's own frosted-menu material, used by its menus, dock work panel and workbar pills. It is not part of the liquid glass system: the material turns it off on the surfaces it glasses, and leaves it alone elsewhere.
- The `.frost` variant of the `ui/TopBar.vue` primitive, which no screen mounts.

## Temporary scaffolding from this date — since removed

`src/debug/surface-candidates.css`, `src/debug/SurfacePreviewBar.vue`, the import in `src/main.ts`, and one `<SurfacePreviewBar />` line in `src/App.vue` were the candidate catalogue for the replacement material, switched by `?catalogue=surface`. That round is over: the material was decided the same day and folded into `src/style.css` as Apple's Liquid Glass, the Regular variant. See feature 14 in the merge-upstream skill and §02 "Surface material" in `views/DesignSystemView.vue` for the current spec.
