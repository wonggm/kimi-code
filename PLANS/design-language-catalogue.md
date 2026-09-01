# Design Language Catalogue — toward a fused, evergreen language for the kimi-code web UI

Compiled 2026-09-02 from web research (sources cited inline). Fact vs. inference is flagged throughout.
Purpose: pick one of the proposed directions (§5) as the basis for the next iteration of the `apps/kimi-web` liquid-glass work.

## 1. Evolution arc, compressed

| Era | Years | Metaphor | Why it ended |
|---|---|---|---|
| Skeuomorphism | 2007–2013 | real objects (leather, wood, glass) | crutch once touch was universal |
| Flat / Metro | 2012–2014 | honest pixels, no depth | too sterile, weak affordances |
| Material Design | 2014–2021 | paper on a z-axis, elevation shadows | static palettes felt generic |
| Fluent (Acrylic/Mica) | 2017– | light, depth, motion, material, scale | Acrylic too costly per frame → Mica (opaque, wallpaper-tinted) |
| Material You / M3 | 2021– | dynamic color from wallpaper | — |
| Neumorphism | ~2020 | same-color extrusion | contrast collapsed, mid-gray only |
| Glassmorphism | 2020– | blur + 1px stroke + gradient | static, no refraction, no adaptivity |
| visionOS `glass` | 2024 | environment-sampling window material | spatial only |
| Apple Liquid Glass | 2025– | real-time refractive material with specular response | current |
| Material 3 Expressive | 2025– | spring physics as tokens, 35 shapes | current |

Through-line: each era reacts against the previous one's sterility or excess. What survives every transition: hierarchy carried by light, content foregrounded, motion that obeys physics, color as brand.

## 2. Brand catalogue

### 2.1 Apple — Liquid Glass (iOS 26 / macOS Tahoe, WWDC25)

- Real-time optical material: refraction, spherical + chromatic aberration, specular edge highlights reacting to device motion. [Documented: Apple Newsroom 2025-06-09; MacStories iOS 26 review]
- Two variants, never mixed in one control: **Regular** (default, blurs and re-luminances background) and **Clear** (highly translucent, media-rich backdrops only, 35% black dim layer recommended behind it). [Documented: Apple HIG — Materials]
- Hard rule: glass belongs to the **navigation/control layer only**, never the content layer (lists, tables, media). [Documented: Apple HIG]
- Content-aware tinting; automatic light/dark; contractual accessibility fallbacks (Reduce Transparency → more opaque, Increase Contrast → stronger edges, Reduce Motion → still).
- Engineering: standard components adopt it for free; custom via `.glassEffect`; `GlassEffectContainer` merges adjacent glass so surfaces morph as one. Refraction strength not published. [Documented: swiftprogramming.com WWDC25 notes; inferred renderer model]
- Reception: legibility critiques through the betas pushed Apple to dial back lensing and strengthen scroll-edge separation. Glass as accent, not canvas.

### 2.2 Kimi / Moonshot AI — "scientific humanism"

- Brand philosophy: rigor of technology + warmth of humanism. [Documented: kimi.com/en/resources/kimi-brand]
- Color: signature brand blue, full architecture not published (community guess #005FCC unverified).
- Type triad: **Inter** (UI), **Geist Mono** (code), **Sentient** (prose/marketing). [Documented]
- Grid: standardized base grid + expressive grid. [Documented]
- "De-coding texture" named as signature visual infrastructure (grain/noise layer, detail not published). [Inferred]
- Product UI: restrained-tech — solid panels, generous whitespace, light dividers; glass/blur used sparingly. [Inferred from product observation]

### 2.3 Huawei — HarmonyOS "One Harmonious Universe"

- Philosophy: everything returns to one (human-centered), harmony of virtual + real, adapts across devices. [Documented: Tencent Cloud deep-dive, ITHome]
- Visual style: "light skeuomorphism + modern flat" — soft physical cues (light/shadow/material) over flat layouts. Light treated as a tangible hierarchy element. [Documented]
- Material API (ArkUI): `backgroundBlurStyle` / `foregroundBlurStyle` with Thin/Regular/Thick/Ultra-Thick steps; `VisualEffect` supports point-light and streaming-light effects. Blur radius responds to state (e.g. drag). [Documented: Huawei developer docs]
- Typeface: HarmonyOS Sans; linear iconography. [Documented]
- Spring parameters not published. [Flagged]

### 2.4 Oppo — ColorOS 15/16 "Luminous"

- Philosophy: natural light and shadow articulating texture; ColorOS 16 continues the light/shadow idiom with a cleaner interface. [Documented: Oppo press releases]
- Luminous Rendering Engine: parallel animation pipeline (not a material API): +18% touch responsiveness, +40% stability, 800+ animations redesigned. Physics rebound on drag, volume, shade pull. [Documented]
- Surfaces: subtle vertical gradients, soft elevation, tightened borders — closer to flat-with-light than to translucency. [Inferred from screenshots]
- Spring constants not published. [Flagged]

## 3. Token-level comparison

| Token | Apple | Kimi | Huawei | Oppo |
|---|---|---|---|---|
| Material | real-time refractive glass | solid panels, sparse blur | blur styles + point light | gradient + soft elevation |
| Glass placement | navigation layer only | transient surfaces | cards, state-dependent | rare |
| Variants | Regular / Clear / identity | — | Thin→Ultra-Thick steps | — |
| Highlight | motion-driven specular | — | point light, streaming light | highlight rings |
| Color source | surrounding content | brand blue system | adaptive theme | light/shadow idiom |
| Motion | springs + glass morphing | unspecified | `animateTo` curves | physics rebound |
| A11y fallbacks | contractual, automatic | — | — | — |

## 4. Future signals (3–5 years)

Ages well:
1. Adaptive tint derived from content/context at render time.
2. Spring presets as named motion tokens (Google M3 Expressive, Apple `.smooth`, ColorOS rebound all converge).
3. `prefers-reduced-transparency` / `prefers-contrast` / `prefers-reduced-motion` as design constraints, with the non-glass state designed first.
4. Content-first hierarchy: chrome yields to content; glass stays off the content layer.

Likely fades:
1. Heavy refraction everywhere — Apple's own beta revisions already pulled back.
2. Static shadows/gradients on large areas.
3. Motion that cannot degrade to still.
4. Custom brand glass where the OS already supplies one — the marginal value of bespoke CSS glass is dropping; the durable value is in placement discipline and tokens, not in the effect itself.

Practical constraint for us: real refraction is a native privilege. On the web it is an approximation with a perf budget; the approximation must be cheap enough to keep (Mica's lesson: opaque tinted bases won over per-frame Acrylic).

## 5. Proposed directions

All three keep the current d1 engineering where useful: the GL refraction renderer, the SVG rim-band specular (key light azimuth 225° / elevation 55°), token-driven CSS in `style.css`, dark + light themes. They differ in *where glass is allowed* and *what carries hierarchy*.

### Direction A — "Navigation glass, solid content" (Apple-led fusion)

Thesis: glass is the uniform of the control layer; content never wears it.

- Sidebar, top band, composer, menus, dialogs = glass (Regular regime). Transcript, tables, code, settings content = solid surfaces with 1px separators.
- One regime only (Regular); no Clear variant — the web UI has no full-bleed media layer that justifies it.
- Rim specular stays, brightness keyed to pointer proximity as a motion analogue (Apple's gyroscope response translated to the desktop).
- Hierarchy by light: one key light (high-left) drives both the rim band and all elevation shadows, per Huawei/Oppo.
- Motion: three named spring presets replace cubic-bezier everywhere.
- Fuses: Apple (placement + variants + a11y contract), Huawei/Oppo (light-driven hierarchy), Kimi (type triad, blue accent).
- Future-proofing: follows the strongest documented ruleset; when the fad thins out, what remains is a normal app with good tokens.

### Direction B — "Warm instrument" (Kimi-led fusion)

Thesis: the web UI is a measuring instrument for the agent — precise, calm, warm at the edges.

- Mostly solid surfaces; glass reserved for *transient* elements (dropdowns, toasts, tooltips, command palette) — the things that float and leave.
- Brand blue reserved for the primary action and live agent state; everything else neutral. Sentient-style warmth enters through empty states and prose, not chrome.
- Subtle grain ("De-coding texture" analogue) on large solid surfaces to keep flat from going sterile.
- Refraction kept only in the composer card as the single "hero" material moment.
- Fuses: Kimi (restraint, warmth, blue discipline), Oppo (soft elevation, rebound motion), Apple (a11y contract).
- Future-proofing: least coupled to the glass trend; the most conservative option, lowest perf cost.

### Direction C — "Two-regime ambient" (forward-looking fusion)

Thesis: Direction A's placement discipline, plus the part of Material You / HarmonyOS that ages best — the material re-reads its context.

- Placement and a11y rules as in A.
- Tint is computed at render time from the content behind each surface (the GL snapshot already knows it) instead of fixed theme values: dark content deepens the tint, bright content lifts it.
- Specular intensity follows ambient theme brightness; HDR-headroom-ready (highlight can exceed diffuse white where the display allows).
- Surfaces demote themselves to Mica-like opaque-tinted when the frame budget is exceeded — the perf fallback is part of the design, not a bug.
- Fuses: Apple (placement, specular), Google (context color), Huawei (adaptive theme), Oppo (render-pipeline pragmatism), Kimi (blue, type).
- Future-proofing: adaptivity and graceful demotion are the two traits every brand is converging on; highest engineering cost of the three.

## 6. On-demand skills for the execution phase

From skills.sh (Vercel Labs' directory for the Agent Skills format; skills fetchable ephemerally, nothing installed system-wide):

| Skill | Role | Fetch |
|---|---|---|
| `anthropics/skills/frontend-design` | generative direction, anti-slop anchor | `https://skills.sh/anthropics/skills/frontend-design` (verified) |
| `vercel-labs/agent-skills/web-design-guidelines` | close-out audit (WCAG 2.2, perf, UX), `file:line` findings | `https://skills.sh/vercel-labs/agent-skills/web-design-guidelines` |
| `pbakaus/impeccable` | iteration loop: polish, critique, colorize, typeset, harden | `https://skills.sh/pbakaus/impeccable` |
| `jakubkrehel/make-interfaces-feel-better` | last-5% details: concentric radii, tabular-nums, optical alignment | `https://skills.sh/jakubkrehel/make-interfaces-feel-better` |
| `nextlevelbuilder/ui-ux-pro-max-skill` | palette/type/layout menu while tokens are unsettled | `https://skills.sh/nextlevelbuilder/ui-ux-pro-max-skill` |

Usage pattern: fetch the SKILL.md via FetchURL at the start of a design session and follow it ad hoc; or `npx skills use <owner>/<repo>@<slug>` for an ephemeral temp copy. No installation.

Already-installed skills that apply: `write-tui` (not for web), `mpl-pub`/`figmirror` (figure work only), `gen-docs` (doc sync after the change). The design work itself leans on the fetched skills above plus this repo's `apps/kimi-web/AGENTS.md` token rules and `check:style`.
