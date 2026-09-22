<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { ICON_GROUPS } from '../lib/icons';
import Icon from '../components/ui/Icon.vue';

const emit = defineEmits<{ close: [] }>();

function close(): void {
  emit('close');
}

let io: IntersectionObserver | null = null;

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close();
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  // Highlight the side-nav entry for the section currently in view while scrolling.
  const links = Array.prototype.slice.call(
    document.querySelectorAll<HTMLAnchorElement>('#nav a[href^="#"]'),
  );
  const map = new Map<Element, HTMLAnchorElement>();
  links.forEach((a) => {
    const href = a.getAttribute('href');
    if (!href) return;
    const el = document.getElementById(href.slice(1));
    if (el) map.set(el, a);
  });
  let current: HTMLAnchorElement | null = null;
  io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          if (current) current.classList.remove('active');
          current = map.get(e.target) ?? null;
          if (current) current.classList.add('active');
        }
      });
    },
    { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
  );
  map.forEach((_a, el) => io!.observe(el));
  if (links.length) links[0].classList.add('active');
});

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
  if (io) {
    io.disconnect();
    io = null;
  }
});
</script>

<template>
  <div class="ds-page">
    <div class="ds-topbar">
      <button class="ds-back" type="button" @click="close">← Back</button>
      <span class="ds-topbar-title">Design system</span>
    </div>
    <div class="layout">
      <!-- ===================== Side navigation ===================== -->
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">K</div>
          <div class="brand-name">Kimi Web</div>
        </div>
        <div class="brand-sub">Design System · v1.0</div>

        <div class="nav-group">Navigate</div>
        <nav class="nav" id="nav">
          <a href="#overview"><span class="num">00</span>Overview</a>
          <a href="#principles"><span class="num">01</span>Design Principles</a>
          <a href="#tokens"><span class="num">02</span>Design Tokens</a>
          <a href="#primitives"><span class="num">03</span>Primitives</a>
          <a href="#chat"><span class="num">04</span>Chat Interface</a>
          <a href="#themes"><span class="num">05</span>Theming</a>
          <a href="#rules"><span class="num">06</span>Style Rules</a>
          <a href="#shell"><span class="num">07</span>App Shell &amp; Sidebar</a>
          <a href="#a11y"><span class="num">08</span>Accessibility</a>
        </nav>

        <div class="nav-group">Companion output</div>
        <nav class="nav">
          <a href="#tokens"><span class="num">↗</span>Token list</a>
          <a href="#primitives"><span class="num">↗</span>Component API</a>
          <a href="#rules"><span class="num">↗</span>Style rules</a>
        </nav>
      </aside>

      <!-- ===================== Main content ===================== -->
      <main class="content">
        <div class="content-inner">

          <!-- ===== Hero ===== -->
          <section id="overview">
            <div class="hero">
              <span class="eyebrow">● Design System · v1.0</span>
              <h1>Kimi Web <span class="grad">Design System</span></h1>
              <p class="lead">
                This document defines the visual language and component specification for Kimi Web — design tokens, component primitives, the chat interface, theming, and style rules.
                All UI work is grounded in it: unified, restrained, token-driven, and themeable.
              </p>
              <div class="hero-meta">
                <span class="meta-chip"><span class="dot"></span> Scope <b>apps/kimi-web</b></span>
                <span class="meta-chip">Component primitives</span>
                <span class="meta-chip">Theme <b>1 set · 4 customizable colors</b></span>
                <span class="meta-chip">Light / dark mode</span>
              </div>
            </div>

            <div class="callout info">
              <span class="ico">i</span>
              <div>
                <b>This spec is the single reference when changing the web UI.</b> Before adding or modifying a component, style, layout, or theme, read this document first;
                color, font, radius, spacing, shadow, z-index, and motion always use the §02 tokens, components reuse the §03 primitives, and the §06 style rules are followed.
              </div>
            </div>
          </section>

          <!-- ===== 01 Design Principles ===== -->
          <section id="principles">
            <div class="sec-head">
              <span class="sec-num">01</span>
              <h2 class="sec-title">Design Principles</h2>
            </div>
            <p class="sec-desc">
              Every UI decision traces back to the following principles. Kimi Web is a local Agent tool for developers: quick scanning, long stretches of staring, often in the dark — the design serves the task, and is restrained, clinical, and density-first.
            </p>

            <ul class="clean check">
              <li><b>Consistency</b> —— The same semantics use the same component. The primary button, dialog, input, and badge should each have exactly "one" correct way to be written across the entire site.</li>
              <li><b>Hierarchy</b> —— Build a clear hierarchy through size, weight, color, and whitespace; emphasize through "restraint" rather than "bolder and bigger".</li>
              <li><b>Proximity</b> —— Group related elements, leave whitespace between unrelated ones. A card's padding, line spacing, and group spacing all come from the same spacing scale.</li>
              <li><b>Feedback</b> —— hover / active / focus / loading / success / error all have visible states, and the state language is unified.</li>
              <li><b>Breathing room</b> —— Control density with the spacing scale rather than arbitrary pixels; prefer restrained whitespace over cramming controls together.</li>
              <li><b>Accessibility (A11y)</b> —— Text contrast ≥ 4.5:1, visible focus rings, touch targets ≥ 32px, and states that don't rely on color alone.</li>
              <li><b>Reduction</b> —— The number of colors, radii, shadow levels, and type sizes all converge to a finite set of tokens; delete stray values.</li>
            </ul>

            <div class="callout good">
              <span class="ico">✓</span>
              <div>
                <b>Brand tone (the do-not list)</b>: calm, clinical, never exaggerated. <span class="pill red" style="margin:0 4px">Reject</span> purple gradients, glassmorphism, glowing shadows, AI purple / blue glows, endlessly looping fussy micro-animations, "Boost your productivity"-style marketing copy, and using emoji as icons — <b>the moon phases 🌑…🌘 are the sole exception</b>, used only in the "waiting for the Agent to respond" chat state, as a brand signature. These are all common tells of AI-generated interfaces (an "AI tell"), deliberately avoided.
              </div>
            </div>

            <div class="callout info"><span class="ico">i</span><div>
              <b>Declare design intent first (Design Read)</b>: before adding a component / page, write one sentence describing its scenario, audience, and tone (for example, "a lightweight tool card embedded in a conversation, for developers, calm and restrained"), then build. If the intent isn't clear, ask one question first rather than defaulting to the nearest existing style.
            </div></div>
          </section>


          <!-- ===== 02 Design Tokens ===== -->
          <section id="tokens">
            <div class="sec-head">
              <span class="sec-num">02</span>
              <h2 class="sec-title">Design Tokens</h2>
            </div>
            <p class="sec-desc">
              Collapse every visual decision into tokens. <b>Color tokens keep the existing short names and fill out the semantics</b> (lowering migration cost),
              while <b>spacing, z-index, motion, and font-weight</b> fill in the scales that are currently missing. Every token has: name, light value, dark value, and usage.
            </p>

            <div class="callout info"><span class="ico">i</span><div>
              <b>Naming convention</b>: <code>--&lt;category&gt;-&lt;role&gt;-&lt;state&gt;</code>. For example <code>--color-text-muted</code>, <code>--radius-md</code>, <code>--space-4</code>.
              To reduce churn, the existing short names (<code>--bg</code> / <code>--ink</code> / <code>--line</code> / <code>--blue</code> …) are kept as <b>compatibility aliases</b> for one release cycle.
            </div></div>

            <h3 class="sub">Color</h3>
            <p>Semantic-first, in three layers: <b>background / text / border</b> + <b>accent</b> + <b>status colors</b>. All colors are defined in light / dark pairs, with contrast ≥ 4.5:1.</p>
            <div class="callout info"><span class="ico">i</span><div>The table below shows the <b>derived semantic tokens</b>. The <b>neutrals and the accent</b> are derived from the 4 color seeds in §05 — for example <code>--color-accent</code> comes from <code>--accent-primary</code>, and <code>--color-bg</code> comes from the current light / dark surface. The <b>semantic status colors</b> (success / warning / danger / info) are independent palettes paired with the seeds, one set each for light / dark; they are not auto-derived from the seeds. Day-to-day reskinning usually only needs the 4 seeds, with the status colors fine-tuned as needed.</div></div>
            <div class="palette">
              <div class="color-card"><div class="color-chip" style="background:#ffffff"></div><div class="color-meta"><div class="cn">bg</div><div class="cv">#ffffff / #0d1117</div></div></div>
              <div class="color-card"><div class="color-chip" style="background:#fafbfc"></div><div class="color-meta"><div class="cn">surface</div><div class="cv">#fafbfc / #161b22</div></div></div>
              <div class="color-card"><div class="color-chip" style="background:#f3f5f8"></div><div class="color-meta"><div class="cn">surface-sunken</div><div class="cv">#f3f5f8 / #0d1117</div></div></div>
              <div class="color-card"><div class="color-chip" style="background:#eceff3"></div><div class="color-meta"><div class="cn">selected</div><div class="cv">#eceff3 / #2d333b</div></div></div>
              <div class="color-card"><div class="color-chip" style="background:#14171c"></div><div class="color-meta"><div class="cn">fg</div><div class="cv">#14171c / #e8eaed</div></div></div>
              <div class="color-card"><div class="color-chip" style="background:#6b7280"></div><div class="color-meta"><div class="cn">fg-muted</div><div class="cv">#6b7280 / #9aa0a8</div></div></div>
              <div class="color-card"><div class="color-chip" style="background:#e7eaee"></div><div class="color-meta"><div class="cn">line</div><div class="cv">#e7eaee / #2d333b</div></div></div>
              <div class="color-card"><div class="color-chip" style="background:#1783ff"></div><div class="color-meta"><div class="cn">accent (KMBlue)</div><div class="cv">#1783ff / #58a6ff</div></div></div>
              <div class="color-card"><div class="color-chip" style="background:#e8f3ff"></div><div class="color-meta"><div class="cn">accent-soft</div><div class="cv">#e8f3ff / rgba(88,166,255,.14)</div></div></div>
            </div>
            <table class="dt">
              <thead><tr><th>Token</th><th>Light</th><th>Dark</th><th>Usage</th></tr></thead>
              <tbody>
                <tr><td class="tk">--color-bg</td><td class="val"><span class="swatch" style="background:#fff"></span>#ffffff</td><td class="val"><span class="swatch" style="background:#0d1117"></span>#0d1117</td><td>Page background</td></tr>
                <tr><td class="tk">--color-surface</td><td class="val"><span class="swatch" style="background:#fafbfc"></span>#fafbfc</td><td class="val"><span class="swatch" style="background:#161b22"></span>#161b22</td><td>Panel / sidebar / card head</td></tr>
                <tr><td class="tk">--color-surface-raised</td><td class="val"><span class="swatch" style="background:#fff"></span>#ffffff</td><td class="val"><span class="swatch" style="background:#1c2128"></span>#1c2128</td><td>Raised card / dialog / input</td></tr>
                <tr><td class="tk">--color-text</td><td class="val"><span class="swatch" style="background:#14171c"></span>#14171c</td><td class="val"><span class="swatch" style="background:#e8eaed"></span>#e8eaed</td><td>Body text / headings</td></tr>
                <tr><td class="tk">--color-text-muted</td><td class="val"><span class="swatch" style="background:#6b7280"></span>#6b7280</td><td class="val"><span class="swatch" style="background:#9aa0a8"></span>#9aa0a8</td><td>Secondary text / placeholder</td></tr>
                <tr><td class="tk">--color-line</td><td class="val"><span class="swatch" style="background:#e7eaee"></span>#e7eaee</td><td class="val"><span class="swatch" style="background:#2d333b"></span>#2d333b</td><td>Divider / card border</td></tr>
                <tr><td class="tk">--color-selected</td><td class="val"><span class="swatch" style="background:#00000014"></span>#00000014</td><td class="val"><span class="swatch" style="background:#ffffff14"></span>#ffffff14</td><td>Neutral selected fill (sidebar rows, list pickers) — translucent, never accent-tinted</td></tr>
                <tr><td class="tk">--color-selected-hover</td><td class="val"><span class="swatch" style="background:#00000014"></span>#00000014</td><td class="val"><span class="swatch" style="background:#ffffff24"></span>#ffffff24</td><td>Pressed-button hover fill (code-block header toggles) — upstream <code>rgba(0, 0, 0, .08)</code> light / <code>rgba(255, 255, 255, .14)</code> dark</td></tr>
                <tr><td class="tk">--color-hover</td><td class="val"><span class="swatch" style="background:#0000000d"></span>#0000000d</td><td class="val"><span class="swatch" style="background:#ffffff0d"></span>#ffffff0d</td><td>Row hover wash — lighter than the selected fill (hover &lt; selected); translucent, sits on any surface</td></tr>
                <tr><td class="tk">--color-media-alpha-bg-1</td><td class="val"><span class="swatch" style="background:#858585"></span>≈#858585</td><td class="val"><span class="swatch" style="background:#676b72"></span>≈#676b72</td><td>Checkerboard square A of the <code>&lt;img&gt;</code> alpha canvas — color-mix of <code>--color-bg</code>/<code>--color-text</code> (52/48); applied via <code>--media-alpha-canvas</code> (16px period)</td></tr>
                <tr><td class="tk">--color-media-alpha-bg-2</td><td class="val"><span class="swatch" style="background:#6b6b6b"></span>≈#6b6b6b</td><td class="val"><span class="swatch" style="background:#7a7e85"></span>≈#7a7e85</td><td>Checkerboard square B (42/58) — both squares stay ≥3:1 against white and black; opaque images cover the canvas</td></tr>
                <tr><td class="tk">--color-sidebar-bg</td><td class="val"><span class="swatch" style="background:#fbfaf9"></span>#fbfaf9</td><td class="val"><span class="swatch" style="background:#181817"></span>#181817</td><td>Sidebar surface — one step off <code>--color-bg</code> so the session column reads as its own plane</td></tr>
                <tr><td class="tk">--color-accent</td><td class="val"><span class="swatch" style="background:#1783ff"></span>#1783ff</td><td class="val"><span class="swatch" style="background:#58a6ff"></span>#58a6ff</td><td>Primary action / link / focus</td></tr>
                <tr><td class="tk">--color-success</td><td class="val"><span class="swatch" style="background:#0e7a38"></span>#0e7a38</td><td class="val"><span class="swatch" style="background:#3fb950"></span>#3fb950</td><td>Success / pass</td></tr>
                <tr><td class="tk">--color-warning</td><td class="val"><span class="swatch" style="background:#a9610a"></span>#a9610a</td><td class="val"><span class="swatch" style="background:#d29922"></span>#d29922</td><td>Warning / pending</td></tr>
                <tr><td class="tk">--color-danger</td><td class="val"><span class="swatch" style="background:#c0392b"></span>#c0392b</td><td class="val"><span class="swatch" style="background:#f85149"></span>#f85149</td><td>Danger / error / abort</td></tr>
              </tbody>
            </table>

            <h4 class="mini">Surface usage</h4>
            <p>The four surface layers each have a role — choose by "raised layer / default flat layer / sunken layer / page background", and avoid treating <code>--p-surface-raised</code> as a universal background.</p>
            <table class="dt">
              <thead><tr><th>Token</th><th>Light</th><th>Dark</th><th>Usage</th></tr></thead>
              <tbody>
                <tr><td class="tk">--p-surface-raised</td><td class="val"><span class="swatch" style="background:#fff"></span>#ffffff</td><td class="val"><span class="swatch" style="background:#1c2128"></span>#1c2128</td><td>Raised card / dialog / input (raised layer)</td></tr>
                <tr><td class="tk">--p-surface</td><td class="val"><span class="swatch" style="background:#fafbfc"></span>#fafbfc</td><td class="val"><span class="swatch" style="background:#161b22"></span>#161b22</td><td>Panel / sidebar / card head (default flat layer)</td></tr>
                <tr><td class="tk">--p-surface-sunken</td><td class="val"><span class="swatch" style="background:#f3f5f8"></span>#f3f5f8</td><td class="val"><span class="swatch" style="background:#0d1117"></span>#0d1117</td><td>Code block / inline input / recessed area (sunken layer)</td></tr>
                <tr><td class="tk">--p-bg</td><td class="val"><span class="swatch" style="background:#fff"></span>#ffffff</td><td class="val"><span class="swatch" style="background:#0d1117"></span>#0d1117</td><td>Page background</td></tr>
              </tbody>
            </table>

            <h4 class="mini">Focus ring</h4>
            <p>All focusable controls (button, input, link, menu item, switch, checkbox) use the focus-ring token uniformly; do not hand-write a <code>box-shadow</code> focus ring.</p>
            <table class="dt">
              <thead><tr><th>Token</th><th>Value</th><th>Usage</th></tr></thead>
              <tbody>
                <tr><td class="tk">--p-focus-ring</td><td class="val">0 0 0 3px var(--p-accent-soft)</td><td>Default focus ring (link, menu item, switch, checkbox)</td></tr>
                <tr><td class="tk">--p-focus-ring-strong</td><td class="val">0 0 0 3px var(--p-accent-soft), 0 0 0 1px var(--p-accent)</td><td>Strong focus ring (button, primary action)</td></tr>
              </tbody>
            </table>

            <h4 class="mini">Text selection</h4>
            <p>The text-selection color uses <code>--p-selection</code> uniformly (light <code>rgba(23,131,255,.18)</code> / dark <code>rgba(88,166,255,.32)</code>), applied by the global <code>::selection</code> rule; do not set a separate highlight background.</p>

            <h4 class="mini">Disabled state</h4>
            <p>All disabled controls use <code>opacity:.5</code> + <code>cursor:not-allowed</code> uniformly; do not separately grey out or recolor.</p>

            <h3 class="sub">Font families</h3>
            <p>Kimi Web uses two font families: <b>--font-ui</b> (UI and body, Inter first) and <b>--font-mono</b> (code and monospace). Components always reference the variables; do not hard-code font names.</p>

            <h4 class="mini">--font-ui · UI &amp; body (Inter first)</h4>
            <p>Body and UI use self-hosted Inter as the primary face. CJK and platform system UI fonts sit late in the fallback chain so Latin glyphs resolve to Inter while Chinese text can fall through to native CJK fonts:</p>
            <div class="code"><div class="code-bar"><span class="d"></span><span class="d"></span><span class="d"></span><span class="fn">--font-ui</span></div><pre>--font-ui: "Inter Variable", "Inter", "Helvetica Neue", Arial,
      "PingFang SC", "Microsoft YaHei", "Noto Sans SC",
      -apple-system, BlinkMacSystemFont, "Segoe UI",
      Roboto, Ubuntu, sans-serif,
      "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji";</pre></div>
            <ul class="clean">
              <li>Inter first: self-hosted Latin UI and body text, loaded through the optical-size normal and italic variable faces.</li>
              <li>Western fallbacks next: Helvetica Neue / Arial for environments where Inter cannot load.</li>
              <li>CJK and system UI fallbacks late: PingFang SC / Microsoft YaHei / Noto Sans SC, then platform UI fonts and emoji fonts.</li>
            </ul>

            <h4 class="mini">--font-mono · Code &amp; monospace</h4>
            <p>Code, tool names, line numbers, diffs, etc. use JetBrains Mono (a self-hosted variable font), falling back to the system monospace:</p>
            <div class="code"><div class="code-bar"><span class="d"></span><span class="d"></span><span class="d"></span><span class="fn">--font-mono</span></div><pre>--font-mono: "JetBrains Mono Variable", "JetBrains Mono",
      ui-monospace, "SF Mono", Menlo, Consolas, monospace;</pre></div>

            <h4 class="mini">Loading strategy</h4>
            <table class="dt">
              <thead><tr><th>Font</th><th>Source</th><th>Bundled</th><th>Usage</th></tr></thead>
              <tbody>
                <tr><td class="tk">JetBrains Mono</td><td class="val">@fontsource-variable/jetbrains-mono</td><td class="val">✓ self-hosted</td><td>monospace / code (--font-mono)</td></tr>
                <tr><td class="tk">Inter</td><td class="val">@fontsource-variable/inter/opsz.css + opsz-italic.css</td><td class="val">✓ self-hosted</td><td>UI / body / display (--font-ui, --font-display), wght 100-900, opsz 14-32, normal + italic</td></tr>
                <tr><td class="tk">System UI / CJK fonts</td><td class="val">operating system</td><td class="val">—</td><td>late fallback for UI / body, not bundled</td></tr>
              </tbody>
            </table>
            <div class="callout good"><span class="ico">✓</span><div>
              Self-hosted Inter / JetBrains Mono: no external network requests, no FOUT, works offline; system fonts are not bundled, consistent with the local-first approach.
            </div></div>

            <h4 class="mini">Usage rules</h4>
            <ul class="clean check">
              <li>Components always use <code>var(--font-ui)</code> / <code>var(--font-mono)</code>; do not hard-code font names like <code>'Inter'</code> / <code>'JetBrains Mono'</code>.</li>
              <li>Body / UI use <code>--font-ui</code> (Inter first); code / monospace use <code>--font-mono</code> (JetBrains Mono).</li>
              <li>Inter is loaded from the complete optical-size variable faces, including normal and italic styles; <code>font-optical-sizing: auto</code> is enabled globally.</li>
              <li>CJK and platform system UI fonts stay late in the <code>--font-ui</code> fallback chain, after Inter and Western fallbacks.</li>
            </ul>

            <h3 class="sub">Type scale &amp; weight</h3>
            <p>The user font-size preference writes <code>--base-ui-font-size</code>, and every derived step rides <code>--ui-shift</code> (its distance from 14px), the way upstream couples its scale to <code>--base-font</code>. Compact UI chrome and the sidebar follow it through <code>--ui-font-size</code>; chat reading surfaces use <code>--content-font-size</code>, which is the same size as that base — upstream's prose token is its base, not a step above it.</p>
            <p>The product type tokens define component defaults and scale with the preference: <b>UI controls / buttons / forms</b> use <code>--text-base</code> (14px at the default preference); <b>reading body — including chat Markdown, message bubbles, etc.</b> uses <code>--content-font-size</code>; the <b>sidebar session list</b> follows the same size while keeping list density.
            Drop stray <code>font-weight: 650 / 750</code>; converge on two weights, 400 / 500 (regular / emphasis).</p>
            <div class="panel panel-pad" style="margin:16px 0">
              <div class="type-row"><div class="type-sample" style="font-size:22px;font-weight:500">Page Title</div><div class="type-meta">--text-2xl · 22 / 500</div></div>
              <div class="type-row"><div class="type-sample" style="font-size:18px;font-weight:500">Section Title</div><div class="type-meta">--text-xl · 18 / 500</div></div>
              <div class="type-row"><div class="type-sample" style="font-size:16px;font-weight:400">Chat body / card title</div><div class="type-meta">--text-lg · 16 / 400</div></div>
              <div class="type-row"><div class="type-sample" style="font-size:14px;font-weight:500">UI control / button / form</div><div class="type-meta">--text-base · 14 / 500</div></div>
              <div class="type-row"><div class="type-sample" style="font-size:13px">Helper text / table</div><div class="type-meta">--text-sm · 13 / 400</div></div>
              <div class="type-row"><div class="type-sample" style="font-size:12px">Badge / timestamp / line number</div><div class="type-meta">--text-xs · 12 / 500</div></div>
            </div>
            <table class="dt">
              <thead><tr><th>Token</th><th>Value</th><th>Usage</th></tr></thead>
              <tbody>
                <tr><td class="tk">--font-ui</td><td class="val">"Inter Variable", "Inter", "Helvetica Neue", Arial…</td><td>UI &amp; body (Inter first)</td></tr>
                <tr><td class="tk">--font-mono</td><td class="val">JetBrains Mono…</td><td>code, tool names, line numbers, diffs</td></tr>
                <tr><td class="tk">--base-ui-font-size</td><td class="val">14px user preference</td><td>root setting that drives UI, reading body, and sidebar font sizes</td></tr>
                <tr><td class="tk">--content-font-size</td><td class="val">var(--base-ui-font-size)</td><td>chat Markdown, message bubbles, composer</td></tr>
                <tr><td class="tk">--ui-shift</td><td class="val">calc(--base-ui-font-size − 14px)</td><td>distance every derived type step rides</td></tr>
                <tr><td class="tk">--leading-tight/normal/relaxed</td><td class="val">1.25 / 1.5 / 1.7</td><td>headings / UI / long text</td></tr>
                <tr><td class="tk">--weight-regular/caption/medium</td><td class="val">400 / 450 / 500</td><td>body / captions and menu descriptions / emphasis</td></tr>
              </tbody>
            </table>

            <h4 class="mini">Icon size</h4>
            <p>Icons use three size tokens uniformly. The global <code>.p-ic</code> default is 16px (<code>--p-ic-md</code>); components pick as needed, and random pixel sizes are forbidden.</p>
            <table class="dt">
              <thead><tr><th>Token</th><th>Value</th><th>Usage</th></tr></thead>
              <tbody>
                <tr><td class="tk">--p-ic-sm</td><td class="val">14px</td><td>small button, badge, menu item, inline link icon</td></tr>
                <tr><td class="tk">--p-ic-md</td><td class="val">16px</td><td>default (button, icon button, toolbar)</td></tr>
                <tr><td class="tk">--p-ic-lg</td><td class="val">20px</td><td>Toast status icon, empty-state illustration</td></tr>
              </tbody>
            </table>

            <h4 class="mini">Icon</h4>
            <p>Icons always come from the centralized registry <code>lib/icons.ts</code>: in templates use the <code>&lt;Icon name size /&gt;</code> component (<code>components/ui/Icon.vue</code>); for <code>v-html</code> contexts (such as a tool glyph) use <code>iconSvg(name, size)</code>. <b>Do not hand-write <code>&lt;svg&gt;</code></b> — the <code>scripts/check-style.mjs</code> <code>icon-from-registry</code> rule flags stray SVGs. Icons come from <a href="https://remixicon.com/">Remix Icon</a> (Apache-2.0), uniformly in a fill style (<code>fill="currentColor"</code>, 24×24 source grid), with color following the text; size uses the three tokens below. The registry is bundled on demand by <a href="https://github.com/unplugin/unplugin-icons">unplugin-icons</a> at build time from <code>@iconify-json/ri</code> — only icons imported in <code>lib/icons.ts</code> end up in the production bundle, fully offline and tree-shaken. <b>The whole site uses only this one icon family</b>; do not mix in other icon libraries, and <b>never hand-write SVG paths</b>. When an icon is missing, add it to the registry — two static <code>~icons/ri/*</code> imports (component + <code>?raw</code> string) plus one entry in <code>ICONS</code> in <code>lib/icons.ts</code>; the import names (e.g. <code>RiFolderOpenLine</code> / <code>RawFolderOpenLine</code>) show the <code>ri:</code> icon id. Do not draw it in a component.</p>

            <h4 class="mini">Size scale</h4>
            <div class="icon-sizes">
              <div class="sz"><svg class="p-ic" style="width:14px;height:14px" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z"/></svg>sm · 14</div>
              <div class="sz"><svg class="p-ic" style="width:16px;height:16px" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z"/></svg>md · 16</div>
              <div class="sz"><svg class="p-ic" style="width:20px;height:20px" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z"/></svg>lg · 20</div>
            </div>

            <h4 class="mini">Icon library</h4>
            <p>Currently registered icons, grouped by purpose. The display order and grouping are defined by <code>ICON_GROUPS</code> in <code>lib/icons.ts</code> (a hand-maintained array covering the same icon names), and this catalog is rendered directly from that array so the registry and the document never drift.</p>
            <div class="icon-grid">
              <template v-for="[label, names] in ICON_GROUPS" :key="label">
                <div class="icon-group-label">{{ label }}</div>
                <div v-for="name in names" :key="name" class="icon-cell">
                  <Icon :name="name" />
                  <span class="ic-name">{{ name }}</span>
                </div>
              </template>
            </div>

            <p>Do not use emoji as functional icons (the sole exception is the moon phases 🌑…🌘, used only in the "waiting for the Agent to respond" chat state). The Kimi brand marks — the 32×22 eye logo in the sidebar brand row, the wordmark on the loading screen and on the new-session landing (<code>chat/Wordmark.vue</code>), and the peeking-face mascot beside the new-session workspace chip (<code>chat/MascotPeek.vue</code>) — are brand assets and are not part of this icon system.</p>
            <p>A few <b>special graphics</b> are not in the registry; each has a dedicated component maintained in one place, and must not be copied by hand: <code>&lt;ContextRing :pct /&gt;</code> (the Composer context progress ring, data-driven), <code>&lt;AuthStateIcon kind /&gt;</code> (the success / expired / error colored illustrations in the login flow), <code>&lt;Spinner /&gt;</code> (loading state). Status dots (such as in the Provider list) always use CSS dots (<code>border-radius:50%</code>), not SVG. The <code>scripts/check-style.mjs</code> <code>icon-from-registry</code> rule exempts the above and the brand marks; all other hand-written <code>&lt;svg&gt;</code> is flagged.</p>

            <h3 class="sub">Spacing</h3>
            <p>A 4px base grid. All spacing, gaps, and padding inside and outside components come from this scale — no arbitrary pixels.</p>
            <div class="panel panel-pad" style="margin:16px 0">
              <div class="space-row"><div class="space-bar" style="width:4px"></div><div class="space-meta">--space-1 · 4</div><div class="space-use">icon gap, badge padding</div></div>
              <div class="space-row"><div class="space-bar" style="width:8px"></div><div class="space-meta">--space-2 · 8</div><div class="space-use">control gap, small padding</div></div>
              <div class="space-row"><div class="space-bar" style="width:12px"></div><div class="space-meta">--space-3 · 12</div><div class="space-use">button padding, form-item gap</div></div>
              <div class="space-row"><div class="space-bar" style="width:16px"></div><div class="space-meta">--space-4 · 16</div><div class="space-use">card padding, grid gap</div></div>
              <div class="space-row"><div class="space-bar" style="width:20px"></div><div class="space-meta">--space-5 · 20</div><div class="space-use">dialog padding</div></div>
              <div class="space-row"><div class="space-bar" style="width:24px"></div><div class="space-meta">--space-6 · 24</div><div class="space-use">section gap</div></div>
              <div class="space-row"><div class="space-bar" style="width:32px"></div><div class="space-meta">--space-8 · 32</div><div class="space-use">large section gap</div></div>
            </div>

            <h4 class="mini">Dense list (sidebar / file tree)</h4>
            <p>High-density navigation lists like the sidebar share one rhythm, all on the 4px grid: <b>in-row vertical padding</b> <code>--space-1</code> (4px), <b>no margin between rows</b> (the hover pill provides the separation); <b>section gap</b> (between logo / search / action buttons / group title / list) uniformly <code>--space-2</code> (8px); <b>between groups</b> <code>--space-2</code>; the brand header is slightly looser at the top (<code>--space-3</code>). When building similar lists, reuse this scale — do not hand-write 1/6/7/10px.</p>

            <h3 class="sub">Radius</h3>
            <p>Merge the existing 14 values <b>into the nearest</b> of 7 scale steps. Rule: the component type determines the radius, not the author's feel.</p>
            <div class="radius-grid">
              <div class="radius-item"><div class="radius-box" style="border-radius:4px"></div><span class="rl">xs · 4</span></div>
              <div class="radius-item"><div class="radius-box" style="border-radius:6px"></div><span class="rl">sm · 6</span></div>
              <div class="radius-item"><div class="radius-box" style="border-radius:8px"></div><span class="rl">md · 8</span></div>
              <div class="radius-item"><div class="radius-box" style="border-radius:12px"></div><span class="rl">lg · 12</span></div>
              <div class="radius-item"><div class="radius-box" style="border-radius:16px"></div><span class="rl">xl · 16</span></div>
              <div class="radius-item"><div class="radius-box" style="border-radius:20px"></div><span class="rl">2xl · 20</span></div>
              <div class="radius-item"><div class="radius-box" style="border-radius:999px"></div><span class="rl">full · 999</span></div>
            </div>
            <table class="dt">
              <thead><tr><th>Token</th><th>Value</th><th>Usage</th><th>Merged from</th></tr></thead>
              <tbody>
                <tr><td class="tk">--radius-xs</td><td class="val">4px</td><td>small badge, inline tag</td><td class="val">2/3/4px →</td></tr>
                <tr><td class="tk">--radius-sm</td><td class="val">6px</td><td>small button, icon button, menu item</td><td class="val">5/6px →</td></tr>
                <tr><td class="tk">--radius-md</td><td class="val">8px</td><td>button, input, badge, card</td><td class="val">7/8/9px →</td></tr>
                <tr><td class="tk">--radius-lg</td><td class="val">12px</td><td>dropdown panel</td><td class="val">10/12px →</td></tr>
                <tr><td class="tk">--radius-xl</td><td class="val">16px</td><td>dialog, bottom Sheet</td><td class="val">14/16px →</td></tr>
                <tr><td class="tk">--radius-2xl</td><td class="val">20px</td><td>accent container / large panel</td><td class="val">20px</td></tr>
                <tr><td class="tk">--radius-full</td><td class="val">999px</td><td>pill badge, avatar, send button</td><td class="val">999px / 50%</td></tr>
                <tr><td class="tk">--radius-dropdown-row</td><td class="val">7.5px</td><td>permission-menu row corner (inside the dropdown panel)</td><td class="val">lg − 4 − 0.5 →</td></tr>
              </tbody>
            </table>

            <h3 class="sub">Elevation &amp; z-index</h3>
            <p>Shadows express only "elevation", never decoration (no colored glow). z-index is unified into a scale, eradicating <code>9999</code>-style one-upping.</p>
            <div class="panel panel-pad" style="margin:16px 0">
              <div class="radius-grid" style="align-items:stretch">
                <div class="radius-item"><div class="radius-box" style="border:none;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.05),0 1px 3px rgba(16,24,40,.06)"></div><span class="rl">sm · dropdown menu / sticky</span></div>
                <div class="radius-item"><div class="radius-box" style="border:none;background:#fff;box-shadow:0 4px 12px rgba(16,24,40,.07),0 2px 4px rgba(16,24,40,.05)"></div><span class="rl">md · Toast</span></div>
                <div class="radius-item"><div class="radius-box" style="border:none;background:#fff;box-shadow:0 12px 32px rgba(16,24,40,.12),0 4px 10px rgba(16,24,40,.08)"></div><span class="rl">lg · overlay (reserved)</span></div>
                <div class="radius-item"><div class="radius-box" style="border:none;background:#fff;box-shadow:0 24px 64px rgba(16,24,40,.18),0 8px 20px rgba(16,24,40,.10)"></div><span class="rl">xl · dialog</span></div>
              </div>
            </div>
            <table class="dt">
              <thead><tr><th>Z-index Token</th><th>Value</th><th>Usage</th></tr></thead>
              <tbody>
                <tr><td class="tk">--z-base</td><td class="val">0</td><td>normal flow</td></tr>
                <tr><td class="tk">--z-sticky</td><td class="val">100</td><td>sticky header / sidebar</td></tr>
                <tr><td class="tk">--z-dropdown</td><td class="val">200</td><td>dropdown menu</td></tr>
                <tr><td class="tk">--z-overlay</td><td class="val">300</td><td>overlay / bottom Sheet</td></tr>
                <tr><td class="tk">--z-modal</td><td class="val">400</td><td>dialog</td></tr>
                <tr><td class="tk">--z-tooltip</td><td class="val">650</td><td>tooltip / mention tip (above toast)</td></tr>
                <tr><td class="tk">--z-toast</td><td class="val">600</td><td>toast</td></tr>
                <tr><td class="tk">--z-max</td><td class="val">9999</td><td>reserved: only this tier for extreme fallback</td></tr>
              </tbody>
            </table>

            <h3 class="sub">Motion</h3>
            <table class="dt">
              <thead><tr><th>Token</th><th>Value</th><th>Usage</th></tr></thead>
              <tbody>
                <tr><td class="tk">--ease-out</td><td class="val">cubic-bezier(0.16, 1, 0.3, 1)</td><td>enter, hover, expand</td></tr>
                <tr><td class="tk">--ease-in-out</td><td class="val">cubic-bezier(0.4, 0, 0.2, 1)</td><td>panel width, layout changes</td></tr>
                <tr><td class="tk">--duration-fast</td><td class="val">120ms</td><td>press, focus</td></tr>
                <tr><td class="tk">--duration-base</td><td class="val">160ms</td><td>hover, show/hide</td></tr>
                <tr><td class="tk">--duration-slow</td><td class="val">260ms</td><td>dialog, Sheet, layout</td></tr>
                <tr><td class="tk">--spring-responsive</td><td class="val">linear(…) ≈5% overshoot · cubic-bezier(0.22, 1, 0.36, 1)</td><td>floating-surface control feedback — pill hover lift, popover / menu reveal, toast slide (<code>--duration-spring-responsive</code> 200ms)</td></tr>
                <tr><td class="tk">--spring-gentle</td><td class="val">linear(…) ≈1% overshoot · cubic-bezier(0.16, 1, 0.3, 1)</td><td>large-travel surfaces — sheet slide-up, dialog scrim fade, toast stack reflow (<code>--duration-spring-gentle</code> 420ms)</td></tr>
                <tr><td class="tk">--spring-confident</td><td class="val">linear(…) ≈10% overshoot · cubic-bezier(0.34, 1.4, 0.5, 1)</td><td>the decisive short entrance — dialog card (<code>--duration-spring-confident</code> 320ms)</td></tr>
              </tbody>
            </table>
            <div class="callout info"><span class="ico">i</span><div>
              The three <b>named spring presets</b> are the motion vocabulary for <b>floating surfaces only</b> — menus, toasts, the composer, dialogs and sheets. Everything else keeps <code>--ease-*</code> + <code>--duration-*</code>; do not rewrite app-wide transitions to springs. Each preset ships the <code>cubic-bezier</code> value above and upgrades to the sampled <code>linear()</code> curve inside <code>@supports (transition-timing-function: linear(0, 1))</code>, so an engine without <code>linear()</code> gets the approximation rather than nothing. <code>prefers-reduced-motion: reduce</code> collapses all three to a still curve in <code>style.css</code>; components never check the media feature themselves.
            </div></div>

            <h3 class="sub">Surface material</h3>
            <p>
              The app carries one material: <b>Liquid Glass</b>, Apple's <b>Regular</b> variant. It is declared once in <code>style.css</code>, gated on <code>html[data-liquid-glass="on"]</code>, and applied to the <b>control layer only</b> (Apple's split, followed exactly: the material belongs to the controls the reader operates, never to the content). The chat header's row <i>is</i> the pill under the gate: a fixed <code>--radius-full</code> capsule, 36px tall and inset 12px from the column's edges, carrying <code>blur(18px)</code> at all times, in either theme, and the material's own 3px rim band in light. Light paints the reference capsule there: the face is <code>--lg-head-face</code>, a neutral white lift that runs stronger at the head than at the foot with no hue of its own — its colour is the backdrop's, which is why the reference capsule reads blue over a sky and green over foliage — both stops translucent, and the edge is <code>--lg-head-shadow</code>, a bright white lip, a bright ring just inside the perimeter and a soft drop shadow, so <code>--lg-head-fill</code> and <code>--lg-head-border</code> read transparent in light and paint only in dark, where the bar keeps DeepSeek's own surface: a 9.5% white fill rather than their 25%, so that it settles into the low sixties over this lighter ground, and their 6% white hairline. Dark edges that bar the light theme's way as well, through <code>--lg-head-shadow</code>'s <code>inset 0 1px 0</code>: a 30% white lip at the head over a 45% black drop shadow, with the fill, the hairline and the blur left alone. Its top edge is the floating panel's top edge: both read the same 8px inset, so the two boxes start on the same line. Its shape and its surface do not depend on the scroll, so the header reads the same at both ends of the transcript as in its middle. The floating sidebar and the floating right panel are the two panels that keep the reference collection's dark-glass recipe: each carrier sits inset from the window edges, on the panel fill (<code>--lg-face-panel</code> at <code>--lg-tint-panel</code>, 45% in both themes) with the one-pixel top rim (<code>--lg-rim-top</code>) and its own wider drop shadow (<code>--lg-float-shadow</code>), over the plain blur and the band-limited bezel lens. Its face is the panel's own rather than the app's neutral raised surface, and in light it is upstream's own left-panel tone divided back out of the 45% mix, a cool <code>#f9fbfc</code>. Dark takes upstream's own tone instead: a black face at the same 45%, which reads 13 at mid height, matching the upstream build's flat <code>rgb(13,13,13)</code> sidebar. The 90% white rim for the light theme is the app's own, since the collection has no light-mode glass recipe at all. The composer card carries the material at rest and opens further on focus: the material's blur, the band-limited bezel lens, a <code>--lg-tint-card</code> face (74% in light, 92% in dark), the rim pair in dark and the foot shade at rest, over its own shadow plus the wider <code>--lg-card-shadow</code> it adds in light, and a thinner <code>--lg-tint-card-focus</code> face (62% in light, 74% in dark) while the caret is in the box, with its own hairline and shadow staying in place. The outline card runs its own pair rather than the menus' shared tier: it opens over live text as they do, but it carries a list of titles rather than a menu to click through, and the defocus behind it is the point, so it paints the menus' own face in light (<code>--lg-toc-fill</code> resolves to the same <code>--lg-face-menu</code> / <code>--lg-tint-dense</code> mix) and 72% black in dark, under a wider blur (<code>--lg-toc-blur</code>, <code>blur(30px) saturate(140%)</code>) and takes the refract lens inside the lens block. The five menus and popovers that float above content with it run the denser face, 95% dark and 88% light, built from <code>--lg-face-menu</code> (<code>var(--color-surface-raised)</code>, which is upstream's own menu tone): they take the tint from it and their blur from their own rules or from the lens block. The composer's <code>+</code> menu is not among them, because it spans the composer card rather than floating over the transcript: it keeps the dock work panel's own frosted ink (<code>--color-menu-bg-frost</code> over <code>--p-menu-backdrop</code>), which the dense face used to override. Every page-level control that highlights on hover becomes glass while it is hovered, with one exception: the session row keeps its own wash, because it is a wash on a panel that already carries the material rather than a second pane of it. The dock's workbar chips carry the material's blur, rim and shadow over the transparent dock strip, with upstream's own wash as their fill, and the composer's Send and Stop discs take the material's blur, a 1px catch-coloured border for the lip, the shade ring just inside it and a translucent fill in their own hue, with no lens and with a disabled Send left flat on purpose. The modal layer (dialogs, sheets and toasts) keeps its own opaque surface and takes only the material's shadow; the tooltip is not part of it, because it paints an inverted surface and takes only the drop shadow; the settings pane is the one modal surface that is glass, over a scrim that blurs the page behind it. The edge is a graded rim, never an outline: <code>--lg-rim-top</code> for the top line and <code>--lg-rim-catch</code> for the rest of the perimeter, at almost the top line's own strength in light and at about three fifths of the top line in dark, standing above the reference collection's third because that ratio left the light edge barely visible on a white ground, and because the same proportion reads smaller over a dark face than over a light one: dark's pair sits at 0.34 and 0.2 for that reason. The rim pair reads on the surfaces with nothing passing behind them, so the edge is where their material has to show: the sidebar carrier, the composer card, the dock chips, and the composer's Send and Stop discs. The surfaces whose face is light and which had no contour of their own in light — the sidebar carrier, the composer card's foot line, the outline card, the dock chips and the two discs — carry <code>--lg-rim-shade</code> as a third inset ring, because a white catch has nothing to read against on a near-white page; the discs joined that list when they lost their lens, since a 32px neutral Stop with two white rims and no lens has no edge at all on a white card. The header pill takes neither in either theme: it is the reference capsule, edged by <code>--lg-head-shadow</code> instead, a 30% white lip over a drop shadow in dark as well as in light, and in dark it is the one surface that still carries DeepSeek's uniform 1px border. The band-limited bezel family is wired to the floating sidebar and the composer card, and its 3px variant to the header's bar and the mobile top bar. What the material samples is a graded ground (<code>--lg-ground</code> on <code>#app</code>, with <code>.app</code>, <code>.con</code>, <code>.chat-dock</code> and the right panel <code>.global-preview:not(.mobile)</code> made transparent so one field runs under the whole window), not a flat <code>--bg</code>: one tone behind a 264px column gave a tone plus a rim rather than glass over a surface. The right panel used to paint <code>--color-bg</code>, which upstream can afford because its page is that one tone everywhere; here the conversation column sits on the graded field, so an opaque panel drew a seam down its own left edge, and the panel now floats on the sidebar's own carrier, so the graded field reads through both panels alike. The mobile overlay keeps its own surface: there the panel covers the window, and nothing may read through it. The ground carries no hue, only a light wash in from the top left and a shade in at the bottom right. Messages, code blocks, cards and the transcript stay opaque. The one surface that blurs the transcript is the header's own bar, across the 36px band it floats over: it keeps its material at every scroll position by request, so content passes under that blur at the top of the transcript too. Nothing else does.
            </p>
            <table class="dt">
              <thead><tr><th>Surface</th><th>Treatment</th><th>Why</th></tr></thead>
              <tbody>
                <tr><td class="tk">The chat header <code>.chat-header</code> (desktop)</td><td class="val">row: a fixed <code>--radius-full</code> capsule, 36px tall and inset 12px per side, carrying the reference capsule's neutral lifted face and shadow in light, DeepSeek's fill + hairline with the light theme's head lip and a drop shadow of its own in dark, and <code>blur(18px)</code> in both, with the bar's own 3px rim band in light, at every scroll position</td><td>The bar follows DeepSeek's top bar and its surface, and theirs is not a gesture: a plain <code>window</code> scroll listener sets their scrolled class on <code>window.scrollY &gt; 80</code>, called once on mount, with no debounce and no hysteresis. Their class fills the bar, with <code>hsla(0,0%,100%,.25)</code> in dark and <code>hsla(0,0%,100%,.45)</code> in light, over <code>--ds-blur-glass: 12px</code> and a 1px border at <code>hsla(0,0%,100%,.06)</code> dark / <code>rgba(0,0,0,.1)</code> light, fading over a <code>0.3s ease</code> on background, border and blur. It also narrows the bar: <code>max-width</code> goes <code>1280px</code> to <code>980px</code> (<code>1180px</code> at 1560px and up) while <code>padding-left</code> / <code>padding-right</code> go 0 to 16px and 6px, on a spring at stiffness 180 and damping 28. Two deliberate departures from the reference. Their bar paints nothing at <code>scrollY</code> 0, while ours keeps its material at every scroll position, so the header reads the same at both ends of the transcript as in its middle. And their bar changes shape as it fills, while ours is a fixed pill: the shape does not depend on the scroll at all, so nothing about the row moves while the reader reads. The row and the pill are one element: ours is the row itself, so the row's box carries the surface rather than a pseudo-element. The gate rule sets <code>position: absolute</code>, <code>top: var(--lg-head-inset)</code> (8px), <code>left</code> / <code>right: var(--lg-head-inline)</code> (12px), <code>height: var(--lg-head-height)</code> (36px), <code>z-index: var(--z-sticky)</code>, <code>padding: 0 var(--space-4)</code>, <code>border: 1px solid var(--lg-head-border)</code>, <code>border-radius: var(--radius-full)</code>, <code>background-image: var(--lg-head-face)</code>, <code>background-origin: border-box</code>, <code>background-color: var(--lg-head-fill)</code>, <code>backdrop-filter: var(--lg-head-blur)</code> at rest and <code>var(--lg-head-filter)</code> where the lens renders, <code>box-shadow: var(--lg-head-shadow)</code>. The row therefore drops out of flow, hangs 8px below the column's top, and always carries the surface. That offset is the floating panel's own: the panel's carrier reads the same token as its inset, so the pill's top edge and the panel's top edge are one line. The two visible lines sit 1px apart, because the pill's line sits on its box edge — its own <code>border</code> in dark, with <code>--lg-head-shadow</code>'s head lip one pixel inside it, and <code>--lg-head-shadow</code>'s 1px ring in light — while the panel paints its highlight <code>inset 0 1px 0</code>, one pixel inside its box.  The App.vue rules that pad left while the sidebar is collapsed and right while the right panel is closed still win on specificity, because they are unscoped and outrank the gate rule. Its surface is DeepSeek's own in dark only: a 9.5% white fill and their 6% white hairline, over <code>blur(18px)</code>, with the light theme's head lip and a drop shadow of its own. Light paints the reference capsule instead. Its face is <code>--lg-head-face</code>, a neutral white lift — 34% white at the head, 16% at the foot, both stops translucent, so the transcript still shows through — and it carries no hue of its own: its colour is the backdrop's, which is why the reference capsule reads blue over a sky and green over foliage. The pair is anchored on the reference material's own sample colour, Huawei's <code>materialColor: '#4DFFFFFF'</code> (30% white over a transparent background), and it is thin rather than opaque for the reason their FAQ gives for the material's refraction: a thicker, less transparent style is their documented way to remove both the transparency and the refraction. Measured over the built bar at a scroll where the transcript passes under it, ablating the face moves the bar 0.69 of a level on average and 3 at its strongest pixel, where the 80% / 52% pair before it moved the same bar 1.92 on average and 8.3 at the strongest and flattened whatever passed underneath to one tone. Its edge is <code>--lg-head-shadow</code>: the <code>inset 0 1px 0</code> lip at 255 above the face, the <code>inset 0 0 0 1px</code> ring now white at 60% just inside the perimeter, and the drop shadow whose foot profile runs <code>246, 247, 248, 249, 250, 250, 251, 252, 252, 253</code> from the bar's foot into the page with no step and no dark line. The ring is bright rather than dark on purpose: the 8% black rule it replaces drew a 235 line across the bar's foot where the page reads 253. The bar's chain is the plain <code>--lg-head-blur</code> where the lens does not render and <code>--lg-head-filter</code> where it does: light takes <code>blur(18px) saturate(140%) url(#lg-bezel-bar)</code>, the band-limited family's 3px variant, the tightest of the three: the 36px capsule would fit the panels' 6px band, but the bar keeps the narrowest setting, whose 6px floor leaves it a 30px unlit middle and bends up to 3px of what passes under its head and foot; dark takes the plain <code>blur(18px)</code>. The blur departs from their stylesheet in both themes: it runs the material's own 18px rather than their <code>--ds-blur-glass</code> 12px. The light fill's old descent from their 45% to 38% and the light hairline's rise from their 10% are gone with the tokens themselves: both read transparent in light, and only dark paints them. The dark fill departs too. This ground is a graded field that runs lighter at the top left than their page, so their own 25% over it rendered a bar about 17 levels brighter than theirs (measured at the same window size, theirs renders <code>74,81,91</code> while 25% rendered <code>91,94,97</code>), and the pill read as a lighter object than the one it copies. At 19% it rendered <code>78,81,84</code>, the level of theirs to within a few steps. The reader then asked for the bar to come down further, to a reading in the low sixties, and 9.5% is that reading: the same sample renders <code>57,61,64</code>, the bar's left end over the bare graded ground <code>52,52,52</code> where 19% rendered <code>73</code>, and its right end <code>45,45,45</code> where 19% rendered <code>67</code>, so the bar reads 45 to 64 across its width. Text contrast over the brightest region went from about 6.05:1 to about 8.3:1 with the change. Only the dark fill and the dark hairline are DeepSeek's now; light reads neither token. Its lens is the band-limited family's 3px variant and dark's chain is the plain blur, both through <code>--lg-head-filter</code>; and the head lip above the face is <code>--lg-head-shadow</code>'s <code>inset 0 1px 0</code> in both themes, at 95% white in light and at 30% over a drop shadow in dark, since the rim pair is invisible on this pill either way. Nothing in the header's box changes on scroll, so only the App.vue padding follow animates. Measured in the built app at a 1440px window against the mock transcript (a 1170px column, 422px of scroll): at the transcript's top, its middle and its foot the row is identically <code>1146 × 36</code> at <code>x = 282</code>, <code>y = 8</code>, and the surface and <code>blur(18px)</code> read the same at all three: the neutral lifted face over its shadow in light, <code>rgba(255,255,255,0.095)</code> over <code>rgba(255,255,255,0.06)</code> under <code>--lg-head-shadow</code>'s head line in dark. Sampled from the render, the dark pill reads <code>57,61,64</code> over a code block, against DeepSeek's own bar at <code>74,81,91</code> over its blue-black page. The 36px height comes from the tallest thing inside the row: a 22px pill plus the 1px border each way, 4px of breathing room each way, and 4px of padding on the row. With the material off, the same probe finds the plain 48px opaque row at <code>y = 0</code>, unchanged at all three positions. <code>--panel-head-h</code> and the right panel's head do not move, and <code>.panes.has-header</code> still takes <code>padding-top: var(--panel-head-h, 48px)</code>. Keeping the material on means the transcript's top band passes under a blur, which no other surface in the app does. Its own more-menu is still rendered in a <code>&lt;Teleport to="body"&gt;</code> block.</td></tr>
                <tr><td class="tk">The mobile title bar <code>.topbar</code> (≤640px)</td><td class="val">the header pill's material, with the shape driven by the transcript: a flat full-width band at either end, the same capsule in between</td><td>The header's surface has a second home, because the mobile shell renders no chat header: the bar keeps the desktop pill's tokens in both shapes and never drops them — <code>--lg-head-face</code>, a neutral white lift with no hue of its own (the material's colour is the backdrop's, which is why the reference capsule reads blue over a sky and green over foliage), with <code>--lg-head-shadow</code> in light, <code>--lg-head-fill</code> with the uniform 1px <code>--lg-head-border</code> and <code>--lg-head-shadow</code>'s head lip in dark — over <code>blur(18px)</code>, and in light over the bar's own 3px rim band as well, since this selector is the second name in the lens block's bar rule and reads the same <code>--lg-head-filter</code> the desktop pill does. The dark fill is the desktop pill's own token, so the bar darkened with it when that fill came down to 9.5%, which is intended: one token, one reading, in both shells. Its shape is the transcript's. At either end of the transcript, and when the transcript does not scroll at all, the bar is a flat band spanning the screen with its safe-area inset as padding, keeping <code>border-radius: 0</code> and keeping the shadow, which reads as the band's own foot separation there rather than as a floating capsule; the moment the transcript leaves an end it lifts into the capsule, its sides in 12px and its head 8px below the safe area, with its foot on the same line, so only its head and its sides move and the content under it never shifts. The pane reserves the band and the bar floats over it, so the transcript passes under the blur at every position, as it does on desktop. Measured at 390 × 844 with no safe-area inset: the band is <code>0,0,390,50</code> with a 0 radius, the capsule <code>12,8,366,42</code> at <code>999px</code>, the pane reserve <code>54px</code> (the band plus the 4px the desktop band leaves below its pill), and the morph reaches the capsule by about 200ms of its 420ms spring. The state lives in <code>ConversationPane.vue</code> (<code>headPill</code>, exposed to <code>App.vue</code>) because the pane owns the scroller; it updates on scroll and on resize, and it changes only at an end, so a scroll that stops mid-transcript leaves the pill up. With the material off none of it applies: the bar returns to the flow, opaque, and the pane reserves nothing.</td></tr>
                <tr><td class="tk">The floating sidebar carrier <code>.side .col::before</code> (desktop, ≥641px)</td><td class="val">filter + the panel fill, the rim pair, the shade ring and the wider float shadow, and the band-limited bezel lens: no border</td><td>The panel floats 8px (<code>--lg-sidebar-inset</code>) off the window edges over the graded ground: <code>.side</code> and <code>.sidebar-actions</code> lose their own background, <code>.side .col</code> takes the inset as padding plus <code>position: relative</code>, and this <code>::before</code> carries the material at <code>inset: 8px</code>, <code>border-radius: var(--radius-2xl)</code> (20px) and <code>z-index: -1</code>. Its fill is the panel tier, <code>--lg-face-panel</code> at <code>--lg-tint-panel</code> (45% in both themes), which is the reference collection's dark-glass recipe, the one the pill gave up for DeepSeek's own surface and the one both floating panels' carriers now share. The face is the panel's own and not the neutral raised surface the other tiers mix from. In light it is upstream's own tint: upstream tints its left panel <code>#f9fbfc</code>, and the app's neutral white at 45% renders as pure white over this ground, which left the panel invisible against the page. Dark takes upstream's own tone instead: a black face at the same 45%. The panel is 45% opaque, so 55% of each pixel is the graded ground behind it and 45% is the face, which is why the panel tracks the ground. Measured on the rendered app at 1280x800 and 2x, the panel reads 15 at CSS y=200 against a page of 27 beside it, 13 at y=400 against 22, 9 to 10 at y=600 against 16 to 17, and 8 at y=700 against 16, so it sits 7 to 12 levels below the page at every height. The arithmetic holds at each point: <code>0.55 x 27 = 15</code>, <code>0.55 x 22 = 12</code> against the measured 13, <code>0.55 x 16.5 = 9</code>, and <code>0.55 x 16 = 9</code> against the measured 8 to 9. The face as the fork shipped it, a cool grey <code>rgb(38 42 46)</code> at a 38% tint, read 33 to 34 at CSS y=200 against the page's 27, six to seven levels above it, which is the grey slab; an intermediate face of <code>rgb(13 13 13)</code> at the same 38% tint read 22 to 23 there, four to five levels below. Upstream's sidebar is opaque, so its token <code>--color-sidebar-bg: #0d0d0d</code> renders a flat <code>rgb(13,13,13)</code> everywhere; ours matches that reading at mid height and varies around it as the ground passes through. Raising the tint further would flatten and darken the panel, but would hide the edge refraction, which lives in the backdrop. The panel's top edge still lines up with the pill's, since the pill's vertical inset reads the same token, but the two no longer paint the same face. It draws no border of its own: <code>border: 1px solid transparent</code> keeps the box metrics and paints nothing. Its edge is the rim pair plus the shade ring, <code>inset 0 1px 0 var(--lg-rim-top), inset 0 0 0 1px var(--lg-rim-catch), inset 0 0 0 1px var(--lg-rim-shade), var(--lg-float-shadow)</code>: a bright top line and the rest of the perimeter well below the top line's strength in light, where the catch is held down so the dark shade line carries the edge on a white ground, and the reference collection's own top highlight. The panel needs this because nothing passes behind it, so its blur has no contrast to work on and the edge carries the read. It is a graded edge rather than an outline: a full-strength frame around the whole panel would read as a drawn object. In light the edge is the CSS lip, line and shadow, because the lens draws no contour on this near-white ground: measured, the rim reads 251 at the bright catch, 197 at the 1px line of <code>--lg-rim-shade</code> against a 251 face — 54 levels of contrast, where the older 0.55 catch over a 16% shade drew 236 and 15 — and then a flat 251 face, with the wider <code>--lg-float-shadow</code> carrying the separation from the page. It takes the band-limited bezel lens, not the plain blur: at about 254x884 the panel is far above the band's floor in both themes — 12px for light's 6px band and 6px for dark's 3px one — so only its outer 6px bends in light and its outer 3px in dark, and its face stays as it was. The full refract lens on the 264px column lifted the entire face by about 60 levels (page 18 → sidebar 73 in dark) and read as a grey block, which is why the column carries no lens at all. The right panel's own carrier (<code>.global-preview:not(.mobile) .pt-shell::before</code>) takes the same recipe at the same 8px inset over the same tokens, so the two panels read as one material over one field: the shell's left hairline goes with the flat design, and the pane washes inside the panel step aside so the carrier is the panel's only surface.</td></tr>
                <tr><td class="tk">The outline card <code>.toc-card</code></td><td class="val">its own pair: <code>--lg-toc-fill</code> + <code>--lg-toc-blur</code> + shadow</td><td>It opens over live text, as the menus do, so its labels are read against its own face rather than against what is behind it, but it carries a list of titles rather than a menu to click through and the defocus behind it is the point. It therefore left the dense tier: it paints <code>--lg-toc-fill</code> — the menus' own dense face in light, 72% black in dark — under <code>--lg-toc-blur</code> (<code>blur(30px) saturate(140%)</code>), wide enough that the blurred transcript behind it stops reading as text, plus <code>var(--lg-shadow)</code>. In light the face is the menus' own mix rather than a fill of its own: the reader asked for the card to match the composer's dropdowns, and the black fill it used to carry read darker than they do — measured over this ground the old 4% black face composited to 240 where a menu reads about 253, and every step the card darkened was a step out of <code>--color-text-muted</code>'s contrast (4.2:1 against the black face, 4.8:1 against the old white one). Dark keeps its 72% black: the reader asked for this card darker there in an earlier round and has not changed that, and the menus' near-white face would read as a lit plate over the transcript rather than the defocused card the dark theme wants. The two themes part company here on purpose. It takes the refract lens inside the lens block, where it names its own blur because the lens rides on the chain it is appended to. It takes no border of its own — its 1px <code>--color-line</code> border comes from <code>ConversationToc.vue</code> — but it carries the <code>--lg-rim-shade</code> ring, the 1px inner line the light theme needs where both white rims are invisible.</td></tr>
                <tr><td class="tk">The five menus <code>.ui-menu</code> / <code>.model-dropdown</code> / <code>.perm-dropdown</code> / <code>.slash-menu</code> / <code>.mention-menu</code></td><td class="val">the dense face only: <code>--lg-face-menu</code> at <code>--lg-tint-dense</code>; their blur comes from their own rules and the lens block</td><td>They open over live text, so they run the denser face (95% dark / 88% light) built from <code>--lg-face-menu</code> (<code>var(--color-surface-raised)</code>), which is upstream's own menu tone: their menus mix <code>--color-menu-bg</code>, 95% of <code>#292929</code> in dark and 95% of white in light. A face built from the page colour instead renders a menu darker than the page rather than lighter: measured over the transcript, the page-coloured face at this tint read 23 where upstream reads 41, and at the former 74% it left a quarter of the backdrop showing, through which the dock's chips stayed legible inside an open permission menu. They take only the tint from the material: their blur is the components' own 24px <code>blur(24px) saturate(1.8)</code> on the three composer menus, and the lens block below replaces it with <code>--lg-blur</code> plus the refract lens on all five wherever the lens renders. Two of the five, the composer's model and permission dropdowns, are teleported to the document body and positioned in viewport coordinates so their declared chain paints at all: the composer card is their backdrop root, at rest and while it holds focus, and a filter inside a backdrop root samples nothing (§04 "Composer"). They take no border and no rim from the material.</td></tr>
                <tr><td class="tk">The composer's <code>+</code> menu <code>.add-menu</code></td><td class="val">the dock work panel's material: <code>--color-menu-bg-frost</code> + <code>--p-menu-backdrop</code> (<code>blur(24px) saturate(1.8)</code>)</td><td>It is out of the dense-face list and out of the lens list, because it spans the composer card rather than floating over the transcript: the shared dense face used to override the frosted ink its own rule paints, and it now keeps that ink, the one upstream's wide dock menu uses, which is the same material the dock work panel carries. Its <code>bottom</code> offset is computed from the composer card's top edge plus <code>--space-2</code>, not from the trigger's top, so the panel floats above the card instead of covering it; anchored on the trigger its foot landed 71px below the card's top.</td></tr>
                <tr><td class="tk">The composer's Send and Stop discs <code>.send:not(:disabled)</code> / <code>.stop</code></td><td class="val">filter + a 1px <code>--lg-rim-catch</code> border + the rim pair + the shade ring + a translucent fill mixed from each button's own fill token, and no lens</td><td>They take the material as the dock's chips do, and run no lens. They ran the refract pair until this round: the reader had asked for the edge refraction the other glass surfaces have, but the refract pair is the wrong instrument for a disc in any case: its scale is 0.8 in objectBoundingBox units, so its displacement is a fraction of the element's own size — a 12.8px swing across a 32px disc — and its specular covers the whole face rather than a band at the rim, so what an element this size gets is a wash over the element instead of an edge. Measured by removing the lens and diffing over the disc, in dark that moved the Stop 70.8 levels on average (78 at its worst) and the Send 23.2, its brightest Send pixel going 191 to 209; in light the Stop took 3.5 and the Send 0.18 (7 at its worst, its edge pixel 151 to 149), spread over the whole face. So the discs keep the material's blur, the CSS rim and no lens, and their edge is the rim pair over <code>--lg-rim-shade</code>'s ring, as on the chips and the panel. The lip needs the border rather than a second inset: both rim rings are <code>inset 0 0 0 1px</code> and therefore cover the same pixel of the perimeter, and the catch, being the earlier shadow, blended over the shade underneath it, so the disc's horizontal diameter read <code>235</code> against a <code>245</code> face — a line with no lip above it. The catch is therefore painted on the disc's own 1px border, where it sits outside the ring instead of under it: border <code>250</code>, ring <code>236</code>, face <code>245</code>, which is the reference material's bright lip with its 1px line just inside. The discs are 32px with <code>box-sizing: border-box</code> and carried no border of their own, so the box keeps its size and only the content box loses a pixel a side. Each fill is a mix rather than a token of its own, because each disc already has a fill token and the material only needs the same hue at less weight: <code>--color-send-bg</code> at <code>--lg-tint-disc</code> — 100% in light, where the near-black fill needs full strength to land at the reference's reading, and 78% in dark, where the near-white token sits over a dark ground — and <code>--color-subtle</code> at 70% the stop's neutral. Send is scoped to <code>:not(:disabled)</code> on purpose: the scoped disabled and is-starting rules win the fill at a higher specificity but declare no filter and no shadow, so without the guard a disabled disc would keep the material's rim, its border and its blur under a flat fill, and a control the reader cannot press should not offer the material's edge. The scoped <code>:hover</code> rules win over both, so a pointed-at disc paints its own hover fill and the flat hover shadow.</td></tr>
                <tr><td class="tk">The modal layer <code>.ui-dialog</code> / <code>.ui-sheet</code> / <code>.sheet-panel</code> / <code>.server-auth-card</code> / <code>.ui-toast</code></td><td class="val">opaque: own surface + <code>var(--lg-shadow)</code>, <code>backdrop-filter: none</code></td><td>These carry text and open over content the reader is not meant to be reading, so they stay opaque: with a translucent face the transcript read through it. They keep their own surface and take only the material's shadow, so the family still reads as one without any of them drawing an outline. The tooltip is not in this list (next row), and the settings pane is the one exception.</td></tr>
                <tr><td class="tk">The tooltip <code>.ui-tip__bubble</code></td><td class="val">inverted surface kept; drop shadow only</td><td>It paints the text colour as its fill and the page colour as its label (measured: <code>rgba(255,255,255,0.84)</code> on <code>rgb(18,18,18)</code> in dark, <code>rgba(0,0,0,0.9)</code> on white in light), so swapping that fill for the material's face had put its label at the wrong end of the scale. It takes <code>var(--lg-shadow)</code> and nothing else: no face, no tint, no border, no rim and no filter.</td></tr>
                <tr><td class="tk">The settings pane <code>.ui-dialog:has(.sd)</code></td><td class="val"><code>--lg-tint-pane</code> (72%) + shadow, <code>backdrop-filter: none</code></td><td>The one modal surface that is glass. It sits over the blurred scrim rather than over live text, so the blur is what protects its legibility and the pane can stay translucent (measured 18.16:1 dark, 8.95:1 light). It carries no filter of its own: an element with <code>backdrop-filter</code> is a backdrop root, so a filter here would leave the pane sampling its own empty scrim and render flat. Its face is <code>--lg-face-solid</code> at <code>--lg-tint-pane</code>, its own tier rather than the menus' dense one, and <code>var(--lg-shadow)</code> is its only other material. Its inner groups and cards keep their own opaque surfaces.</td></tr>
                <tr><td class="tk">The popup scrims <code>.ui-dialog__overlay</code> / <code>.ui-sheet__scrim</code> / <code>.sheet-scrim</code> / <code>.server-auth-overlay</code> / <code>.media-preview-overlay</code> / <code>.att-lightbox</code></td><td class="val"><code>--lg-scrim-blur</code> = <code>blur(14px) saturate(140%)</code></td><td>Behind a popup the page goes out of focus rather than just darker, so the reader has one plane to rest on. The scrims' own tints are unchanged.</td></tr>
                <tr><td class="tk">Every page-level control that highlights on hover</td><td class="val">filter + <code>--lg-lens</code> + the material's face</td><td>The hover is what the material is for: a hovered control becomes glass, with the material's blur and refract lens and the material's face (<code>--lg-face</code> at <code>--lg-tint-a</code>) in place of its flat wash. These elements sit on the graded ground or over the transcript, so there is something behind them to bend. The rule that paints them names <code>--lg-blur</code> and <code>--lg-lens</code>, so on Chromium a hovered control carries <code>backdrop-filter: blur(18px) saturate(140%) url("#lg-refract")</code> and the material's face, <code>--lg-face</code> at <code>--lg-tint-a</code>, which in dark is 8% white and reads <code>rgba(255,255,255,0.08)</code>. No narrower rules remain: nothing draws a rim or a border on a hovered control any more, and inside a panel that already carries a filter (a menu, the outline card, the settings pane, the composer card) a descendant's blur renders nothing, so the control keeps the component's own wash and takes nothing from the material. The session row left the list: it is a wash on a panel that already carries the material rather than a second pane of it, and the refract lens alone lifted the row to 97 in dark where upstream reads 25, so its hover is the component's own <code>--sb-hover</code> wash again. The full selector lists live in <code>style.css</code>.</td></tr>
                <tr><td class="tk"><code>.composer-card</code> at rest</td><td class="val">the material's blur + <code>--lg-tint-card</code> face + the rim pair in dark (<code>--lg-card-rim</code>) + the foot shade + the stacked <code>--lg-card-shadow</code> + the bezel lens</td><td>The card sits on the dock, not over content, and used to take only the material's edge, rim and shadow with no filter, on the reasoning that nothing scrolls under it and a blur would have nothing to sample but the ground. That reasoning is about the blur alone, and the reader asked for the rim's refraction, so the card now carries the material's blur and the band-limited bezel lens on top of it, and its face is no longer an opaque plate: it is <code>--lg-tint-card</code> (74% in light, 92% in dark), light running it thinner because at 92% over a near-white ground the graded field showed through by about one level and the card read as a flat plate. In light the card's edge is carried by its hairline plus the foot shade (<code>--lg-rim-shade</code>) and the wider <code>--lg-card-shadow</code> stacked under it, because the ground behind it is smooth, the bezel's highlight is white and the lens draws no contour there: measured, the edge is a single 221 line and then a flat 252 face, and that reading is unchanged by dark's rim pair. Dark's card had no rim at rest in either theme, because <code>--lg-rim-shade</code> is transparent there and the pair was declared under focus alone: its perimeter was its own hairline at 59 against a face of 34, which is the flat dark box with a grey outline the reader saw. It now reads <code>--lg-card-rim</code> at rest, the same pair the panel, the chips and the discs paint, and measured on the card the ring line reads 78 over that face and the top row of the lip 138. Light keeps a zero shadow in <code>--lg-card-rim</code>: its rest edge is untouched, because the pair's ring and the foot line <code>--lg-rim-shade</code> draws land on the same perimeter pixel and the ring would cover the line — measured, light's foot line went 215 to 237 at the probe's column and its rim pixel 252 to 254 under the pair. The card's 1px hairline (<code>--composer-card-border</code>, the text colour at 14%) belongs to <code>Composer.vue</code>, not to the material.</td></tr>
                <tr><td class="tk"><code>.composer-card:focus-within</code></td><td class="val">filter + a <code>--lg-tint-card-focus</code> face + the rim pair in place of <code>--lg-card-rim</code> + the bezel lens; the card's own border and shadow no longer change on focus</td><td>Focus opens the card up and nothing else: the face goes to <code>--lg-tint-card-focus</code> (62% in light, 74% in dark), thinner still so the ground reads through it further while the caret is in the box, and the rim pair replaces the rest state's <code>--lg-card-rim</code> on the edge. The edge keeps the panel's treatment: the top line plus the faint catch, and the foot keeps the shade line and the <code>--lg-card-shadow</code> the rest state draws. Focus itself is the component's own line: a <code>::after</code> pseudo-element carries <code>border: inherit</code> recoloured to <code>--color-composer-focus-line</code> (25% black in light, 25% white in dark) and fades in over <code>--duration-slow</code> on the in-out curve, and this branch does not override it, so the line fades in here exactly as it does with the gate off. Measured, the pixel just inside the hairline goes to 191 in light and 87 in dark with the gate off, both matching the upstream bundle, and to 121 in dark with the gate on because the material's <code>--lg-rim-catch</code> ring already lifts that pixel to 76 at rest; the opacity ramp reads 0.12, 0.58, 0.86, 0.99 at roughly 55, 110, 165 and 250ms against the upstream bundle's 0.01, 0.42, 0.79, 0.98. The fork's focus treatment, an accent border with a 3px accent ring, is gone from both the component and this branch, so no accent hairline and no accent ring appear while the caret is in the box. The filter chain is the card's own, set at rest, and the lens block names this selector too, so the bezel lens stays on the rim while the caret is in the box.</td></tr>
                <tr><td class="tk"><code>.chat-dock</code> and <code>.dock-workbar .ui-pill</code></td><td class="val">transparent dock; the chips carry the material</td><td>Painting the strip itself with the dense face made a lighter rectangle with a hard right edge across the bottom of the chat column, so the dock keeps <code>background-color: transparent</code> under the gate and the graded ground runs behind it instead of a rectangle of <code>--color-bg</code>. The chips carry the material's blur, rim and shadow, and their wash is upstream's own rather than the material's face: <code>--lg-chip-fill</code> (3% black light / 5% white dark) at rest, and <code>--lg-chip-fill-hover</code> (that same wash twice, which is what their own hover overlay does) while pointed at. Their face tier rendered lighter than the page in light and only a few levels above the ground in dark, so the chips read as a lift in one theme and as a smudge in the other; matching upstream's wash puts them on the upstream side of the page in both. They run no lens: the refract pair's specular covers the whole element, which on a 30px chip washes it out rather than bending anything at its edge. That replaces upstream's 24px <code>--p-menu-backdrop</code> on them rather than switching it off, because they sit on the transparent strip and their filter samples the ground. The chip row is padded <code>calc(var(--dock-inline-left) + var(--space-4))</code> on the left and <code>calc(var(--dock-inline-right) + var(--space-4))</code> on the right, so the first chip starts 16px inside the composer card (measured: row x 468, card x 484, first chip x 500), which matches upstream's own measured <code>first − card.left = 16.00</code> rather than the flush edge the previous round shipped. <code>flex-wrap: wrap</code> stays: without it the labelled chips overflowed the composer card's right edge between 641px and 920px.</td></tr>
                <tr><td class="tk">The transcript <code>.chat-main</code> (desktop)</td><td class="val">no material and no filter: nothing blurs the text; a mask fades its last 28px into the ground at the foot</td><td>The defocus vignette that used to sit on <code>.chat-main</code> is gone, with its four tokens (<code>--lg-defocus-blur</code>, <code>--lg-defocus-mask</code> and their deep pair), both of its pseudo-elements and the gesture-driven <code>is-scrolling</code> class that painted them. The older gradient that faded <code>.panes.chat-scroll</code>, with <code>--lg-edge-mask</code> and <code>--lg-edge-gutter</code>, had already gone. Nothing blurs the text while the reader scrolls, and the transcript's scroll offset no longer drives the header, which is a fixed pill. What the foot has now is a <b>mask</b> on the scroller, <code>--scroll-fade-foot</code>, carrying upstream's vignette: a four-stop ramp over the last 28px of the pane. Upstream paints that ramp as an overlay rising out of its dock, which works there because its page is one flat colour and because the dock it paints over hides the band. Here the ground is graded, so a painted plate showed its own tone and its two side edges against it, and the dock is a column of the layout rather than an overlay, so its band is empty space the reader sees. A mask fades the content itself, so the ground shows through and there is no edge, and the band is <b>28px rather than 72</b> so it fits inside the 33px the transcript already keeps clear at its foot (<code>.chat</code>'s own 26px pad plus the last row's margin, measured). At rest no line is faded and no gap is added; taken at upstream's 72px the band left a 105px hole between the last line and the composer. The mask reaches only the transcript: the pane's sole child is the content wrapper, and the floating "latest messages" pill and the abort toast are siblings of the pane. It is keyed to the dock's presence, so a session with no transcript keeps its centred composer unfaded.</td></tr>
                <tr><td class="tk">The ground <code>#app</code></td><td class="val"><code>--lg-ground</code>: two neutral layers, no hue</td><td>One graded field runs under the whole window and the material samples that. Light: <code>linear-gradient(160deg, rgb(255 255 255 / 35%), transparent 55%)</code> and <code>linear-gradient(340deg, rgb(16 24 40 / 10%), transparent 60%)</code>; dark: <code>linear-gradient(160deg, rgb(255 255 255 / 7%), transparent 55%)</code> and <code>linear-gradient(340deg, rgb(0 0 0 / 30%), transparent 62%)</code>. A light wash comes in from the top left and a shade in from the bottom right, and the shade was raised from 5% to 10% because at 5% the whole field sat within 13 levels of the page, so a translucent face over it showed no tone step at all, and no layer carries a hue: the blue accent pools are gone. The right panel steps out of the way so the field runs behind it, and then carries the sidebar's own carrier over it (the same inset, face, rim and lens), so the field reads through the panel rather than beside it: it used to paint <code>--color-bg</code>, which upstream can afford because its page is that one tone everywhere, and here it drew a visible step down the panel's own left edge against the graded ground. The mobile overlay keeps its own surface, because there the panel covers the window.</td></tr>
                <tr><td class="tk">Everything else</td><td class="val">opaque</td><td>Content is never glassed: messages, code blocks, cards and the transcript paint the theme's solid surface from the elevation and line tokens ("Elevation &amp; z-index").</td></tr>
              </tbody>
            </table>
            <table class="dt">
              <thead><tr><th>Token</th><th>Value</th><th>Usage</th></tr></thead>
              <tbody>
                <tr><td class="tk">--lg-blur</td><td class="val">blur(18px) saturate(140%)</td><td>The regular material: a blur with a saturation lift, so the backdrop stays colourful instead of washing grey. It carries no brightness lift, so a dark panel stays dark rather than being raised toward grey. Every panel and hover rule reads it.</td></tr>
                <tr><td class="tk">--lg-tint-a</td><td class="val">46% light / 8% dark</td><td>How much of the face colour the hover material paints over its blur: it is read by the one rule that glasses a page-level control while it is hovered. The dark value is white at 8%, so a chrome-level surface adds light to the blurred backdrop rather than laying a grey plate over it.</td></tr>
                <tr><td class="tk">--lg-tint-panel</td><td class="val">45% in both themes</td><td>The panel tier: the floating sidebar's carrier mixes <code>--lg-face-panel</code> at this alpha. The header pill no longer reads it: in dark it takes DeepSeek's own <code>--lg-head-fill</code>, and in light the reference capsule's <code>--lg-head-face</code>. 45% is the alpha the reference collection's dark-glass skill uses for its smoky fill, and both themes keep it. The theme lives in the face colour rather than in the alpha: dark's face is upstream's own black at the same 45%, which keeps the graded ground reading through the panel rather than laying a plate over it.</td></tr>
                <tr><td class="tk">--lg-rim-top / --lg-rim-catch / --lg-rim-shade</td><td class="val">rgba(255, 255, 255, 0.9) light / rgba(255, 255, 255, 0.34) dark, 0.35 light / 0.2 dark for the perimeter, and <code>rgb(15 23 42 / 38%)</code> light / <code>rgb(0 0 0 / 0%)</code> dark for the shade ring</td><td>The edge of a surface with nothing behind it, read as <code>inset 0 1px 0</code> for the top line and <code>inset 0 0 0 1px</code> for the rest of the perimeter. The pair reads on the surfaces that float over the ground with nothing passing behind them: the sidebar carrier, the composer card, the dock chips, and the composer's Send and Stop discs. The third ring, <code>--lg-rim-shade</code>, is added on the surfaces whose face is light and which had no contour of their own in light — the sidebar carrier, the composer card's foot line, the outline card, the dock chips and, since this round, the two discs — because both rim tokens above are white and a white catch has nothing to read against on a near-white page. The discs joined the list when they lost their lens: with both rims white the 32px neutral Stop had no edge at all on a white card, which is what the reader saw as a flat grey circle. There the catch is painted on the disc's own 1px border rather than as a second inset ring, because two <code>inset 0 0 0 1px</code> rings cover the same perimeter pixel and the catch, painted over the shade, darkens the lip instead of showing one; on the border it sits outside the ring, so the disc reads lip <code>250</code>, line <code>236</code>, face <code>245</code>. The Send carries both as well rather than being the one disc with an asymmetric edge. Their blur has no contrast to work on, so the edge is the only place the material can show; a single bright top line left the other three sides to the step between the face and the ground. The perimeter sits well below the top line's strength in light and at about three fifths of it in dark, rather than at liqui.design's third (<code>rim-lo</code> 0.28 against <code>rim-hi</code> 0.85): the reference ratio is what makes a surface read as an object on a flat background, and the reference collection's dark-glass skill pairs the same highlight with its smoky fill to keep a panel crisp instead of muddy, but at that ratio the light edge was barely visible against a white ground, so both lines were raised by request: in light the catch went 0.28 to 0.55 and then to 0.85 before falling to 0.35, because the catch paints over the shade ring on the same perimeter pixel and a high catch washes that dark line out, and in dark the pair came up twice, the catch 0.04 to 0.12 and the top line 0.12 to 0.2, then both again to 0.2 and 0.34 because the reader looked at dark and saw no rim at all. The size of the alpha is what changed the answer, not the ratio: a 0.12 white line composites to 60 over the composer card's 34 face, where light's 0.35 composites to 253 over a 252 one, so the same proportion that draws light's edge lands within a level or two of the face beside it on a dark one. At 0.34 and 0.2 the ring reads 78 over that face and the top row of the lip 138, and the panel's edge line goes 72 to 88 over a face of 49. The two tokens are shared by the sidebar carrier, the composer card, the dock chips and the two discs, so all of them lift together. It is a graded edge, never a full-strength outline, and never the bezel band, which the sidebar carrier and the composer card take instead. The header pill takes neither in either theme: its edge is <code>--lg-head-shadow</code>, whose inner line is a 60% white ring rather than this dark line in light and a 30% white lip over a drop shadow in dark, and in dark it also carries DeepSeek's uniform 1px <code>--lg-head-border</code> in place of this pair.</td></tr>
                <tr><td class="tk">--lg-chip-fill / --lg-chip-fill-hover</td><td class="val">rgba(0, 0, 0, 0.03) / rgba(0, 0, 0, 0.059) light · rgba(255, 255, 255, 0.05) / rgba(255, 255, 255, 0.0975) dark</td><td>The workbar chips' wash, and upstream's own rather than a face tier of this material: their chip paints the same colour their hovers do, 3% black in light and 5% white in dark, and lays that wash down twice while it is pointed at, because their chip carries an overlay of the same colour rather than a different fill. Sampled from the render, upstream's chip reads <code>247</code> against a <code>255</code> page and <code>30</code> against a <code>17</code> ground, where the chips' former face tier read <code>252</code> against a <code>250</code> ground and <code>19</code> against a <code>16</code> one: the chips sat lighter than the page in light and barely above the ground in dark. The chips keep the material's blur, rim and shadow, and only the wash is upstream's.</td></tr>
                <tr><td class="tk">--lg-tint-dense</td><td class="val">88% light / 95% dark</td><td>The denser face, on the five menus and popovers: they open over live text, so their labels hold contrast against the panel rather than against what is behind it. It is mixed from <code>--lg-face-menu</code>, upstream's own menu tone. In light the outline card reads it too: its face resolves to this same mix, so the card and the composer's dropdowns read the same. The card keeps its own wider blur, because its defocus is the point. In dark the tier is upstream's own opacity rather than a lower one: at 74% a quarter of the backdrop showed and what sat behind a menu read straight through, so the dock's chips were legible inside an open permission menu. At 95% the face holds and nothing behind it reads through.</td></tr>
                <tr><td class="tk">--lg-tint-pane</td><td class="val">72%</td><td>The settings pane's face. A pane works over the blurred scrim rather than over live text, so it can carry a lighter face than a menu and still be legible: the blur is doing the separating, and the tint only has to hold the pane's own text.</td></tr>
                <tr><td class="tk">--lg-tint-card / --lg-tint-card-focus</td><td class="val">74% / 62% light · 92% / 74% dark</td><td>The composer card's own face, which is not the panel tier: the card sits on the dock strip over the graded ground rather than over a blurred scrim, so it can carry a thinner fill than a pane and still hold its text. Light runs it thinner than dark because a near-white face over a near-white ground has no tone step at all at the pane tier, while the same thinness over the dark ground would drop the card's own contrast; at 92% over the light ground the graded field showed through by about one level and the card read as a flat plate. The focus value is thinner still, so the ground reads through the card further while the caret is in the box. Dark is unchanged by the swap: 92% at rest and 74% focused is what the card painted before it had tokens.</td></tr>
                <tr><td class="tk">--lg-toc-fill / --lg-toc-blur</td><td class="val">light <code>color-mix(in srgb, var(--lg-face-menu) var(--lg-tint-dense), transparent)</code> / dark <code>rgb(0 0 0 / 72%)</code>, and <code>blur(30px) saturate(140%)</code></td><td>The outline card's face and blur, off the dense tier it used to share. It opens over live text as the menus do, but it carries a list of titles rather than a menu to click through, and the reader asked for its defocus to actually read: at the menus' 18px the blurred transcript behind it still read as text. In light the face is now the menus' own mix, because the reader asked for the card to match the composer's dropdowns: measured over the same patch the face goes 240 to 255 against a menu's 254, where the old 4% black put it at 238 against a 255 read, and every step it darkened was a step out of <code>--color-text-muted</code>'s contrast (4.2:1 against the black face, 4.8:1 against the old white one). Dark keeps its 72% black, which puts the face at 31 where a transparent card reads 111: the reader asked for this card darker there in an earlier round, and the menus' near-white face would read as a lit plate over the transcript rather than the defocused card the dark theme wants. The two themes part company here on purpose.</td></tr>
                <tr><td class="tk">--lg-face</td><td class="val"><code>var(--color-surface-raised)</code> (light <code>#ffffff</code>, dark <code>#292929</code>)</td><td>The fill colour the hover tier and the composer card are mixed from, and it is the app's own raised surface rather than a hue. The alpha comes from <code>--lg-tint-a</code> (46% light, 8% dark), so both the colour and the alpha follow the theme. The panel tier no longer reads it: see <code>--lg-face-panel</code>.</td></tr>
                <tr><td class="tk">--lg-face-panel</td><td class="val">light <code>rgb(242 246 248)</code> / dark <code>rgb(0 0 0)</code></td><td>The floating panel's own face, which is not the neutral raised surface the other tiers mix from. Light is upstream's rendered tone divided back out of the 45% mix over this ground: upstream gives its left panel <code>#f9fbfc</code>, a cool off-white, and a neutral white at 45% rendered as pure white here, which left the panel indistinguishable from the page (measured <code>255,255,255</code> against a <code>255,255,255</code> page where upstream reads <code>249,251,252</code>). Dark takes upstream's tone rather than departing from it: a black face at the same 45%. The panel is 45% opaque, so 55% of each pixel is the graded ground behind it and 45% is the face. Measured after: the panel reads <code>249,251,252</code> in light, matching upstream to the byte, and in dark it reads 15 at CSS y=200 against a page of 27 beside it, 13 at y=400 against 22, 9 to 10 at y=600 against 16 to 17, and 8 at y=700 against 16, so it sits 7 to 12 levels below the page at every height. The earlier grey face (<code>rgb(38 42 46)</code> at 38%) read 33 to 34 at CSS y=200, above the page. Upstream's sidebar is opaque, so its token <code>--color-sidebar-bg: #0d0d0d</code> renders a flat <code>rgb(13,13,13)</code> everywhere; ours matches that reading at mid height and varies around it as the ground passes through. <code>--color-text-muted</code> on that panel measures 6.43 to 6.46:1 over its 8-to-15 range. <code>--color-text-faint</code> on it is under 4.5:1 (about 4.0:1), which is pre-existing and which this change moved by under 0.1.</td></tr>
                <tr><td class="tk">--lg-face-solid</td><td class="val"><code>var(--color-bg)</code></td><td>The settings pane's face colour, mixed at <code>--lg-tint-pane</code>. It is the page colour rather than the raised one, so the pane darkens what is behind it instead of greying it. The dense tier no longer reads it, and neither does the outline card.</td></tr>
                <tr><td class="tk">--lg-face-menu</td><td class="val"><code>var(--color-surface-raised)</code> (light <code>#ffffff</code>, dark <code>#292929</code>)</td><td>The menus' face colour, mixed at <code>--lg-tint-dense</code>. It is the raised surface rather than the page colour, which is upstream's own choice: their menus mix <code>--color-menu-bg</code>, 95% of <code>#292929</code> in dark and 95% of white in light. A face built from the page colour rendered a menu darker than the page rather than lighter, and at this tint the page-coloured face read 23 over the transcript where upstream reads 41.</td></tr>
                <tr><td class="tk">--lg-head-inset / --lg-head-inline / --lg-head-height</td><td class="val">var(--lg-sidebar-inset) (8px) / 12px / 36px</td><td>The header pill's geometry, and the pill <i>is</i> the row. The inline inset is the row's <code>left</code> and <code>right</code>, fixed at 12px: it never changes, so nothing about the row moves while the reader scrolls. Twelve rather than DeepSeek's own narrowing because our bar has no page gutter to sit inside; the inset only has to lift the capsule off the column edge. The height is the row's own, 36px, and it is set so the pill is the tightest capsule its contents fit in: 16px of side padding each way plus the 4px of height the tallest thing inside it needs. The vertical inset drives the row, and it is the same token the floating sidebar carrier reads: the pill's top edge sits on the panel's top edge, both 8px in from the window's top, and the band the pane reserves (<code>--panel-head-h</code>) leaves 4px clear below the pill. The two boxes line up exactly; the visible lines sit one pixel apart, because the pill's line sits on its box edge — its own <code>border</code> in dark, <code>--lg-head-shadow</code>'s 1px ring in light — while the panel's is its <code>inset 0 1px 0</code> highlight one pixel inside. Its surface is the pill's own, not the panel tier: the reference capsule's <code>--lg-head-face</code> and <code>--lg-head-shadow</code> in light, DeepSeek's <code>--lg-head-fill</code> and <code>--lg-head-border</code> in dark, with <code>--lg-head-blur</code> in both and the bar's own 3px lens where it renders (<code>--lg-head-filter</code>, next row), painted at every scroll position. Nothing in <code>ConversationPane.vue</code> feeds the header any more: the pill is a fixed shape, so the transcript's scroll offset no longer drives it.</td></tr>
                <tr><td class="tk">--lg-head-fill / --lg-head-border / --lg-head-face / --lg-head-shadow / --lg-head-blur / --lg-head-filter</td><td class="val"><code>rgb(255 255 255 / 0%)</code> light · 9.5% white dark / <code>rgb(0 0 0 / 0%)</code> light · 6% white dark / light <code>linear-gradient(180deg, rgb(255 255 255 / 34%), rgb(255 255 255 / 16%))</code> · dark <code>none</code> / light <code>inset 0 1px 0 rgb(255 255 255 / 95%), inset 0 0 0 1px rgb(255 255 255 / 60%), 0 6px 18px -8px rgb(16 24 40 / 27%)</code> · dark <code>inset 0 1px 0 rgb(255 255 255 / 30%), 0 6px 18px -8px rgb(0 0 0 / 45%)</code> / <code>blur(18px)</code> / light <code>blur(18px) saturate(140%) url(#lg-bezel-bar)</code> · dark <code>blur(18px)</code></td><td>The header pill's surface. In dark it is DeepSeek's own, read off their stylesheet (<code>--ds-color-bg-surface-raised</code>, <code>--ds-color-border-default</code>, <code>--ds-blur-glass</code>): a 9.5% white fill and their 6% white hairline, and the border is a uniform 1px edge rather than a top rim, so the dark pill carries no <code>--lg-rim-top</code> and no lens. Its edge is not the hairline alone any more: the reader asked for the light theme's lip on this bar too, so dark's <code>--lg-head-shadow</code> paints a 30% white line at the head over a 45% black drop shadow, which leaves that bar's face, fill, hairline and blur exactly as they were. The lip is the bar's own and not the rim pair: the pair is invisible on this pill in both themes, since light's bar is near white on a near-white page and dark's is a 52-level surface whose 60%-of-the-top-line catch would sit within a level or two of its own face. The blur is the same in both themes, and it is the one value there that departs from their stylesheet: it runs the material's own 18px rather than their <code>--ds-blur-glass</code> 12px. In light neither of those two tokens paints — both read transparent — because the reference capsule replaces them. The flat 38% white fill the light bar used to paint (dropped from their own 45% so the bar read more glassy) is gone in favour of <code>--lg-head-face</code>, and that face is anchored on the reference material's own sample colour: Huawei's immersive-light capsule tints with <code>materialColor: '#4DFFFFFF'</code> (30% white) over a transparent <code>backgroundColor</code>, and their levels are semantic only, with no numeric optical constants anywhere. Their FAQ gives the reason the fill has to be thin rather than opaque: refraction is a property of the material and the documented way to remove it is a thicker, less transparent style, so an opaque fill removes the transparency and the refraction together. The face is therefore a neutral white lift, 34% white at the head and 16% at the foot, both stops translucent so the transcript reads through, and it carries no hue of its own — its colour is the backdrop's, which is why the reference capsule reads blue over a sky and green over foliage. Measured against the backdrop it covers, it lifts that backdrop about 3 levels at the head and about 1 at the foot, where the 80% / 52% pair before it lifted the whole bar to a flat 253 whatever passed underneath. The light hairline is gone in favour of <code>--lg-head-shadow</code>: a 254 white lip at the head, a 60% white ring just inside the perimeter and a soft drop shadow below the foot. That second line is bright rather than dark on purpose — a 1px dark rule at 8% drew a 235 line across the bar's foot where the page reads 253, which is a hard edge on a surface that casts nothing there — and the perimeter now reads on the content behind the bar. The face is sized to the border box (<code>background-origin: border-box</code>) rather than the padding box: the pill's 1px border is transparent in light, and at the padding box that border row would wrap and show the gradient's own foot colour, a dark line above the lip that the reference does not have. The dark fill departs because this ground is a graded field that runs lighter at the top left than their page, so measured against their bar their 25% rendered about 17 levels brighter here (91,94,97 against their 74,81,91) and the pill read as a lighter object than theirs, while 19% rendered 78,81,84, the level of theirs to within a few steps. The reader then asked for that bar to come down, to a reading in the low sixties, and 9.5% is what lands it: the same sample renders <code>57,61,64</code> over a code block, the bar's left end over the bare graded ground renders <code>52,52,52</code> where 19% rendered <code>73</code>, and its right end renders <code>45,45,45</code> where 19% rendered <code>67</code>, so the bar reads 45 to 64 across its width. Header text contrast over the brightest region improved from about 6.05:1 to about 8.3:1 with it. The light bar no longer reads this token at all: it is the reference capsule's, above. <code>--lg-head-filter</code> is the bar's chain where the lens renders, wired to both bar selectors inside the lens block: light takes <code>blur(18px) saturate(140%) url(#lg-bezel-bar)</code>, dark takes the plain <code>blur(18px)</code>. The token exists in both themes even though only light carries the lens, because an undefined token inside <code>var()</code> invalidates the whole declaration and would strip the dark bar's blur; the base rules stay on <code>--lg-head-blur</code>, so an engine that rejects <code>url()</code> keeps the plain blur. Their harness build puts the same surface on a <code>::before</code> layer (<code>inset: -1px</code>, fading <code>opacity: 0</code> to <code>1</code> over <code>.4s ease-in-out</code>) so the bar's own box never repaints; ours paints it on the row's box, which is the pill. Both of theirs fade in on the scroll and out again at the top; ours is painted at every scroll position, because the header keeps the material at both ends of the transcript and drops only the tuck there.</td></tr>
                <tr><td class="tk">--lg-pill-fill</td><td class="val">light <code>rgb(0 0 0 / 4%)</code> / dark <code>rgb(255 255 255 / 7%)</code></td><td>The header's git pills (<code>.chat-header .ch-pill:not(.ch-pr)</code>, plus the PR badge's draft and unknown states). Upstream's pill paints its own opaque well (<code>#f5f5f5</code> light, <code>#1f1f1f</code> dark) and reads as a step off its bar, which is white in light and the page in dark: 245 over 255, and 31 over 18. The same opaque well on this glass bar reads as a hole instead, because the bar is already lifted: at the pills' own y the bar reads <code>57,60,64</code> in dark, so the well is a 26-level pit cut into it. The pill therefore takes a lift rather than a surface, sized to upstream's own step: 4% black over the light bar (245 over 255) and 7% white over the dark one (measured <code>71,74,77</code>, a 14-level lift against upstream's 13). Only the fill moves; the hairline each pill draws, the sync pill's line and the diff pill's green stay. The PR badge's semantic states (open / merged / closed) keep their own fills, because a state carried by colour would drop to the border and the label alone; only its draft and unknown states, which paint the same neutral well the git pills do, take the lift.</td></tr>
                <tr><td class="tk">--lg-edge</td><td class="val">20% text (light) / 14% (dark), read by no rule</td><td>The contour hairline the material used to draw. Every rule that read it is gone, so nothing paints it now; <code>prefers-contrast: more</code> still re-declares it next to <code>--lg-shadow</code>.</td></tr>
                <tr><td class="tk">--lg-shadow</td><td class="val">--shadow-sm</td><td>Contact shadow under the material; it steps up one level under <code>prefers-contrast: more</code>.</td></tr>
                <tr><td class="tk">--lg-float-shadow / --lg-card-shadow / --lg-card-rim</td><td class="val"><code>0 12px 44px -18px rgb(16 24 40 / 14%)</code> light · dark <code>var(--shadow-sm)</code> / <code>0 8px 24px -8px rgb(16 24 40 / 22%)</code> light · dark the zero shadow <code>0 0 0 0 rgb(0 0 0 / 0%)</code> / dark <code>inset 0 1px 0 var(--lg-rim-top), inset 0 0 0 1px var(--lg-rim-catch)</code> · light the same zero shadow</td><td>The reference material separates a capsule from the page with a soft shadow rather than with a painted edge, and on a white page <code>--shadow-sm</code>'s 1px and 3px lines read as a hairline rather than as depth, so in light the two surfaces that float take a wider cast: the floating sidebar's carrier (<code>--lg-float-shadow</code>, the last item in its <code>box-shadow</code> stack) and the composer card (<code>--lg-card-shadow</code>, stacked after the card's own <code>--composer-card-shadow</code> at rest and while it holds focus). The panel's cast is wide and weak on purpose: at <code>0 8px 24px -8px</code> the 22% cast fitted inside the 8px gutter beside the panel and stepped 11 levels across it, and a falloff that short reads as a rectangle outline rather than as depth. At <code>0 12px 44px -18px</code> and 14% the whole cast is lighter: measured by ablating the token, the strongest change anywhere across the panel's edge and the 60px of page beyond it is 6.7 levels, against 12 before, and the ramp inside the gutter runs <code>246, 246, 247, 247, 248, 248, 249, 248, 250</code> into the page's <code>252</code>. One thing the token cannot change: the cast stops at the gutter, because <code>aside.side</code> is <code>overflow: hidden</code> and its box ends exactly where the page begins, so the falloff is cut there however wide the shadow is. Dark keeps <code>--shadow-sm</code> on the panel, so nothing moves there, and the card takes a zero shadow so it keeps exactly the one shadow it had. That dark value is a zero shadow rather than <code>none</code> on purpose: the token is one item in a <code>box-shadow</code> list, and <code>none</code> is only valid as the whole value, so as a list item it would invalidate the declaration and take the card's own shadow with it. <code>--lg-card-rim</code> is the card's rim pair held the same way and read by the same rule: the pair in dark, a zero shadow in light, where the ring would cover the foot line <code>--lg-rim-shade</code> draws on the same perimeter pixel. It is the one place a rim pair needs a token of its own, because the card is the one rim-carrying surface whose light edge is drawn without one.</td></tr>
                <tr><td class="tk">--lg-lens</td><td class="val">dark <code>url(#lg-refract)</code> · light <code>url(#lg-refract-soft)</code></td><td>The SVG refraction lens, on engines that render it. It is appended to the blur chain by the hover rule in its own rule, and by the five menus and the outline card inside the lens block; the composer's <code>+</code> menu is not in that list, and the outline card names its own wider blur there. The composer's two discs left it this round: its scale is 0.8 in objectBoundingBox units, so on a 32px disc its displacement is a 12.8px swing and its specular covers the whole face, which is a wash over the element rather than an edge at its rim. Its band-limited family is <code>--lg-bezel-lens</code> (<code>#lg-bezel-soft</code> light / <code>#lg-bezel</code> dark), wired by the same block to the floating sidebar carrier and the composer card, the two surfaces clear of its floors in both themes (12px for light's 6px band, 6px for dark's 3px one); the same family's third variant, <code>#lg-bezel-bar</code> (3px band), is reached through <code>--lg-head-filter</code> on the header's bar and the mobile top bar. The workbar chips no longer name any lens: its specular covers the whole element, which washed a 30px chip out rather than bending anything at its edge. Its specular covers the whole element, so it is right for a small surface.</td></tr>
                <tr><td class="tk">--lg-ground</td><td class="val">two neutral linear gradients, one per corner</td><td>The graded field on <code>#app</code> that the material samples. Light: <code>linear-gradient(160deg, rgb(255 255 255 / 35%), transparent 55%)</code> and <code>linear-gradient(340deg, rgb(16 24 40 / 10%), transparent 60%)</code>; dark: <code>linear-gradient(160deg, rgb(255 255 255 / 7%), transparent 55%)</code> and <code>linear-gradient(340deg, rgb(0 0 0 / 30%), transparent 62%)</code>. A flat <code>--bg</code> left the material one tone to sample, so a column read as a tone plus a rim. The light shade was raised from 5% to 10% because at 5% the whole field sat within 13 levels of the page, so a translucent face over it showed no tone step; at 10% the field spans about 23 levels corner to corner. No layer carries a hue.</td></tr>
                <tr><td class="tk">--lg-scrim-blur</td><td class="val">blur(14px) saturate(140%)</td><td>The blur the popup scrims put over the page; their own tints are unchanged.</td></tr>
                <tr><td class="tk">--lg-sidebar-inset</td><td class="val">var(--space-2) = 8px</td><td>How far the floating sidebar sits off the window edges, as the carrier's <code>inset</code> and the column's padding. The header pill's vertical inset reads the same token.</td></tr>
                <tr><td class="tk">Removed</td><td class="val">gone</td><td>The transcript defocus pair <code>--lg-defocus-blur</code> / <code>--lg-defocus-mask</code> with its deeper <code>--lg-defocus-blur-deep</code> / <code>--lg-defocus-mask-deep</code> (both <code>.chat-main</code> pseudo-elements went with them), the vignette token <code>--lg-edge-mask</code>, the scrollbar token <code>--lg-edge-gutter</code>, the two-band geometry <code>--lg-edge-size</code> / <code>--lg-edge-hold</code> / <code>--lg-edge-blur</code> with its <code>--lg-edge-defocus-mask</code> pair (the foot fade that replaced them is a mask on the scroller, <code>--scroll-fade-foot</code>, not a token pair), the header's tint <code>--lg-tint-head</code> (the pill reads <code>--lg-head-fill</code> in dark and <code>--lg-head-face</code> in light now), the pill's scroll-driven inset <code>--lg-head-inline-scrolled</code> (the desktop pill's shape is fixed now; the mobile bar drives its own shape from the transcript's ends, through the layout properties rather than a token), the rim token <code>--lg-rim-side</code> (<code>--lg-rim-top</code> reads as a one-pixel top edge, and <code>--lg-rim-shade</code> is a CSS-drawn 1px inner line rather than a lens pass — the lens draws no contour in either theme), the band-limited lens token <code>--lg-lens-edge</code> (the bezel pair itself is reached through <code>--lg-bezel-lens</code>), the carrier's <code>--lg-face-shell</code> and <code>--lg-tint-shell</code>, the chip face <code>--lg-tint-chip</code>, and <code>--lg-ring-width</code>. <code>--lg-edge</code> survives as a declaration no rule reads.</td></tr>
              </tbody>
            </table>
            <div class="callout info"><span class="ico">i</span><div>
              <b>The lens.</b> The filter definitions live in <code>components/ui/GlassDefs.vue</code>, mounted once in <code>App.vue</code>; the file carries two families: a refract pair (<code>#lg-refract</code> dark, <code>#lg-refract-soft</code> light, selected through <code>--lg-lens</code>) and a band-limited family of three (<code>#lg-bezel</code> dark, <code>#lg-bezel-soft</code> light, both selected through <code>--lg-bezel-lens</code>, and <code>#lg-bezel-bar</code> light, selected through <code>--lg-head-filter</code>). All of them are wired inside <code>@supports (backdrop-filter: url(#lg-refract))</code>, so Chromium and Edge get rim refraction while Firefox and Safari keep the plain blur chain. The refract pair's selector list is the five menus and the outline card: its specular covers the whole element rather than a band at its edge, which is right for a small surface, but on the 264px sidebar column it lifted the entire face by about 60 levels (page 18 → sidebar 73 in dark) and read as a grey block, which is the opposite of the material. The composer's two discs sat in that list until this round and have left it: the same whole-face specular and the pair's 0.8-of-the-box scale, a 12.8px swing on a 32px disc, wash a disc instead of giving it an edge, so the discs now carry the material's blur and the CSS rim with no lens. The band-limited family is for a surface with an unlit middle: its displacement and highlight sit in a band at the rim whose width is the variant's erode radius, so the face between the bands stays as it was and only the rim bends, and that band gives it a floor on element size of twice its width. The floating sidebar carrier (about 254x884) and the composer card (about 728x120) clear the band's floor in both themes — 12px for light's 6px band and 6px for dark's 3px one — and take it; the header's pill (36px) clears light's floor now, so the bar keeps the narrower 3px <code>#lg-bezel-bar</code> variant, whose 6px floor leaves it a 30px unlit middle and bends what passes under its head and foot by up to 3px. In light the band was a no-op on both of its targets at the old 28px — removing the lens and diffing moved 0.01 of a level — because the ground behind them is a smooth gradient with no contrast for the displacement to bend and the light bezel's highlight is white; at 6px that highlight sits inside 6px of the edge instead of spreading inward; the light edge is the CSS lip, line and shadow instead, the lens drawing no contour in either theme. In dark the band has been narrowed in three steps: at 28px the highlight read as a thick grey band inside the panel's and the card's edges, the face still at 75 twenty pixels in and short of its floor at forty; at 6px with only a 2px blur the inner boundary read as a cliff, the panel's left edge falling <code>70, 58, 44, 36, 33, 32, 30, 29, 27</code> and its head <code>76, 65, 52, 44, 40, 40, 38, 37, 35</code> after the rim line, steps of up to 14 and 13 levels; and at 4px with a 4px blur, where the blur matched the width, the same samples read <code>42, 41, 38, 36, 34, 33, 31, 30, 29, 28, 27</code> on the left edge and <code>50, 48, 46, 44, 42, 40, 39, 38, 37, 36, 35</code> at the head, steps of at most 3 and 2, the foot climbing <code>30, 30, 30, 31, 31, 31, 32, 32, 32, 32, 33, 33, 34</code> over about 20 CSS pixels in steps of one and the face flat within about ten CSS pixels of the edge. It is now a 3px band with a 3px blur, sampled every 2 device pixels at 2x: the left edge reads <code>30, 26, 23, 21, 19, 18, 17, 16, 16</code>, the face flat within about seven CSS pixels of the edge, and the head reads <code>37, 34, 31, 29, 27, 26, 25, 24, 24</code>, flat within about ten, with the card's head at <code>32, 31, 31, 30, 30</code>, steps of one. The chat header floats (<code>position: absolute</code>; <code>.panes.has-header</code> takes <code>padding-top: var(--panel-head-h, 48px)</code>) and its own more-menu is still rendered in a <code>&lt;Teleport to="body"&gt;</code> block.
            </div></div>
            <div class="callout info"><span class="ico">i</span><div>
              <b>Accessibility and the off switch.</b> The whole material sits inside <code>@media (prefers-reduced-transparency: no-preference)</code>: <code>reduce</code> renders the app's own opaque design, and nothing else consults the feature. Under <code>prefers-contrast: more</code> the material thickens <code>--lg-edge</code> and steps <code>--lg-shadow</code> up one level, leaving the tint alone. The Settings toggle writes <code>html[data-liquid-glass="off"]</code> (storage key <code>kimi-web.liquid-glass</code>, <code>useAppearance().liquidGlass</code> / <code>setLiquidGlass</code>, a row in <code>SettingsDialog.vue</code> and <code>components/mobile/MobileSettingsSheet.vue</code>, i18n keys <code>settings.liquidGlass</code> / <code>settings.liquidGlassHint</code>), for which none of the rules match.
            </div></div>
            <div class="callout good"><span class="ico">✓</span><div>
              <b>Declared once.</b> Only the shared material in <code>src/style.css</code> may declare <code>backdrop-filter</code>; a component adding its own is a <code>no-glassmorphism</code> finding (§06). Upstream's own frosted-menu material is the other one on a surface that mounts: the token <code>--p-menu-backdrop</code> in <code>style.css</code>, used by its menus, its dock work panel, its workbar pills and the workspace dropdown, plus the same 24px chain written out in the three composer menus. The material replaces it on the workbar chips and leaves it alone everywhere else; the composer's <code>+</code> menu is one of those, and it keeps the same material as the dock work panel. Measured cost, read off <code>style.css</code>: at rest, with no state set, four surfaces carry a filter: the floating sidebar's carrier, the header's bar, the composer card and the composer's Send and Stop discs. A hovered page-level control, an open menu, an open outline card, a popup scrim and the workbar chips add one while they are up. The settings pane carries a tint but no filter of its own, and the rest of the modal layer carries neither. The lens is <code>--lg-lens</code>: the hover rule names it in its own rule, and the lens block wires it on the five menus and the outline card; the scrims, the workbar chips and — since this round — the composer's two discs carry no lens. The band-limited family is wired to the floating sidebar carrier and the composer card through <code>--lg-bezel-lens</code>, and to the two bar selectors through <code>--lg-head-filter</code> and the family's 3px <code>#lg-bezel-bar</code> variant.
            </div></div>

            <h4 class="mini">Reduced motion</h4>
            <div class="callout info"><span class="ico">i</span><div>
              Under <code>@media (prefers-reduced-motion: reduce)</code>, all animation and transition durations drop to about <code>0.001ms</code> (effectively off), and the <b>MoonSpinner moon phase pauses</b> on the current frame. Components should not check this individually; it is handled uniformly in the global styles.
            </div></div>

            <h3 class="sub">Layout &amp; breakpoints</h3>
            <p>Layout sizes and responsive breakpoints are tokenized too: sidebar width, content reading-column width, and two global breakpoints. Components should not hard-code pixels.</p>
            <table class="dt">
              <thead><tr><th>Token</th><th>Value</th><th>Usage</th></tr></thead>
              <tbody>
                <tr><td class="tk">--p-sidebar-w</td><td class="val">264px</td><td>left session sidebar width</td></tr>
                <tr><td class="tk">--p-content-max</td><td class="val">760px</td><td>chat reading-column max width (regular chat prose)</td></tr>
                <tr><td class="tk">--p-content-wide</td><td class="val">920px</td><td>wide content (settings / panel)</td></tr>
                <tr><td class="tk">--p-table-max</td><td class="val">1040px</td><td>desktop wide-table max width (see §04)</td></tr>
                <tr><td class="tk">--p-table-cell-max</td><td class="val">700px</td><td>max width of a single table column; longer cell content wraps (see §04)</td></tr>
                <tr><td class="tk">--p-bp-sm</td><td class="val">640px</td><td>mobile / desktop boundary</td></tr>
                <tr><td class="tk">--p-bp-md</td><td class="val">980px</td><td>narrow / wide screen boundary</td></tr>
              </tbody>
            </table>
            <div class="callout info"><span class="ico">i</span><div>
              At ≤640px: dialogs become bottom Sheets, the sidebar collapses into an expandable drawer, and Composer toolbar controls are allowed to wrap.
            </div></div>
          </section>

          <!-- ===== 03 Primitives ===== -->
          <section id="primitives">
            <div class="sec-head">
              <span class="sec-num">03</span>
              <h2 class="sec-title">Primitives</h2>
            </div>
            <p class="sec-desc">
              Component primitives are the "smallest correct units" of the site UI.
              Each primitive exposes variants along only two dimensions — <code>variant</code> / <code>size</code> — with appearance driven by tokens,
              so it naturally supports light / dark mode and customizable theme colors.
            </p>

            <div class="callout info"><span class="ico">i</span><div>
              For every interactive primitive, the <b>keyboard behavior, focus, and ARIA contract are in §08 Accessibility</b>. New primitives must ship with a keyboard model — mouse-only interaction is not enough.
            </div></div>

            <!-- ===== Component selection guide ===== -->
            <h3 class="sub">Component selection guide</h3>
            <table class="dt">
              <thead><tr><th>Scenario</th><th>Use</th></tr></thead>
              <tbody>
                <tr><td>Primary action (submit / confirm)</td><td><code>Button variant=primary</code></td></tr>
                <tr><td>Secondary action / cancel</td><td><code>Button secondary</code> / <code>ghost</code></td></tr>
                <tr><td>Destructive action (delete / abort)</td><td><code>Button danger</code> / <code>danger-soft</code></td></tr>
                <tr><td>Status marker</td><td><code>Badge</code></td></tr>
                <tr><td>Toolbar filter / model switch</td><td><code>Pill</code></td></tr>
                <tr><td>2–4 mutually exclusive options</td><td><code>SegmentedControl</code></td></tr>
                <tr><td>Top tabs</td><td><code>Tabs</code></td></tr>
                <tr><td>Switch / multi-select</td><td><code>Switch</code> / <code>Checkbox</code></td></tr>
                <tr><td>Floating content card / list action menu</td><td><code>Card</code> / <code>Menu</code></td></tr>
                <tr><td>Inline notice / global toast</td><td><code>Banner</code> / <code>Toast</code></td></tr>
                <tr><td>Dialog / confirmation · bottom panel (mobile)</td><td><code>Dialog</code> / <code>Sheet</code></td></tr>
              </tbody>
            </table>

            <!-- ===== Button ===== -->
            <h3 class="sub">Button</h3>
            <p>4 semantic variants × 3 sizes. The primary action <code>primary</code> takes its color from the current theme color (§05 can switch between the blue and black families). Radius uses <code>--radius-md</code> uniformly (small size <code>--radius-sm</code>), weight 600, with a visible focus ring.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Variant matrix <span class="tag spec">light</span></span><span class="sactions"><span class="tab on">preview</span></span></div>
              <div class="stage p col">
                <span class="stage-label">medium · default</span>
                <div class="demo-row">
                  <button class="p-btn primary">Primary action</button>
                  <button class="p-btn secondary">Secondary action</button>
                  <button class="p-btn ghost">Ghost button</button>
                  <button class="p-btn danger-soft">Destructive (soft)</button>
                  <button class="p-btn danger">Destructive action</button>
                </div>
                <span class="stage-label">small</span>
                <div class="demo-row">
                  <button class="p-btn primary sm">Confirm</button>
                  <button class="p-btn secondary sm">Cancel</button>
                  <button class="p-btn ghost sm">More</button>
                </div>
                <span class="stage-label">With icon / state</span>
                <div class="demo-row">
                  <button class="p-btn primary"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z"/></svg>New chat</button>
                  <button class="p-btn secondary"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m10 15.17l9.192-9.191l1.414 1.414L10 17.999l-6.364-6.364l1.414-1.414z"/></svg>Copied</button>
                  <button class="p-btn primary disabled" >Loading…</button>
                </div>
              </div>
            </div>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Dark skin <span class="tag spec">dark</span></span></div>
              <div class="stage dark p col" data-p="dark">
                <div class="demo-row">
                  <button class="p-btn primary">Primary action</button>
                  <button class="p-btn secondary">Secondary action</button>
                  <button class="p-btn ghost">Ghost button</button>
                  <button class="p-btn danger">Destructive action</button>
                </div>
              </div>
            </div>

            <h4 class="mini">API</h4>
            <div class="code">
              <div class="code-bar"><span class="d"></span><span class="d"></span><span class="d"></span><span class="fn">Button.vue · usage</span></div>
              <pre><span class="k">&lt;Button</span> <span class="p">variant</span>=<span class="s">"primary"</span> <span class="p">size</span>=<span class="s">"md"</span> <span class="p">:loading</span>=<span class="s">"submitting"</span><span class="k">&gt;</span>Save<span class="k">&lt;/Button&gt;</span>
    <span class="c">// variant: primary | secondary | ghost | danger | danger-soft</span>
    <span class="c">// size:    sm | md | lg</span></pre>
            </div>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">States</span></div>
              <div class="stage p">
                <div class="demo-row">
                  <button class="p-btn primary" disabled style="opacity:.5;cursor:not-allowed">Disabled primary</button>
                  <button class="p-btn primary"><svg class="p-spinner sm" viewBox="0 0 24 24"><circle class="track" cx="12" cy="12" r="9"/><circle class="arc" cx="12" cy="12" r="9"/></svg>Submitting</button>
                  <button class="p-btn danger" disabled style="opacity:.5;cursor:not-allowed">Disabled danger</button>
                </div>
              </div>
            </div>

            <!-- ===== IconButton ===== -->
            <h3 class="sub">IconButton</h3>
            <p>Unified into three sizes — 26 / 32 / 44px — with a light-grey hover background and a visible focus ring. Replaces the ad-hoc icon + click areas scattered across components today.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">IconButton</span></div>
              <div class="stage p">
                <button class="p-icon-btn"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z"/></svg></button>
                <button class="p-icon-btn"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M3 4h18v2H3zm0 7h18v2H3zm0 7h18v2H3z"/></svg></button>
                <button class="p-icon-btn"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m12 10.587l4.95-4.95l1.414 1.414l-4.95 4.95l4.95 4.95l-1.415 1.414l-4.95-4.95l-4.949 4.95l-1.414-1.415l4.95-4.95l-4.95-4.95L7.05 5.638z"/></svg></button>
                <button class="p-icon-btn sm"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m18.031 16.617l4.283 4.282l-1.415 1.415l-4.282-4.283A8.96 8.96 0 0 1 11 20c-4.968 0-9-4.032-9-9s4.032-9 9-9s9 4.032 9 9a8.96 8.96 0 0 1-1.969 5.617m-2.006-.742A6.98 6.98 0 0 0 18 11c0-3.867-3.133-7-7-7s-7 3.133-7 7s3.133 7 7 7a6.98 6.98 0 0 0 4.875-1.975z"/></svg></button>
                <button class="p-icon-btn sm"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m10 15.17l9.192-9.191l1.414 1.414L10 17.999l-6.364-6.364l1.414-1.414z"/></svg></button>
              </div>
            </div>
            <div class="callout info"><span class="ico">i</span><div>
              The desktop IconButton comes in <code>sm</code> 26 / <code>md</code> 32; on touch devices the tap target should be ≥ 44px, so use <code>lg</code> 44px, satisfying the §01 accessibility principle (the mobile three-piece set uses <code>lg</code>).
            </div></div>

            <!-- ===== Badge / Pill ===== -->
            <h3 class="sub">Badge · Chip · Pill</h3>
            <p>Collapsed into two kinds: <b>Badge</b> (status badge, with an optional status dot) and <b>Pill</b> (the clickable pill in the composer toolbar). Radius, font size, and padding are all unified.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Badge · status badge</span></div>
              <div class="stage p col">
                <span class="stage-label">Semantic variants</span>
                <div class="demo-row">
                  <span class="p-badge neutral"><span class="bd"></span>pending</span>
                  <span class="p-badge info"><span class="bd"></span>running</span>
                  <span class="p-badge success"><span class="bd"></span>completed</span>
                  <span class="p-badge warning"><span class="bd"></span>needs confirmation</span>
                  <span class="p-badge danger"><span class="bd"></span>failed</span>
                  <span class="p-badge solid">KIMI</span>
                </div>
                <span class="stage-label">With icon / small size</span>
                <div class="demo-row">
                  <span class="p-badge info"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1m1 2v14h14V5z"/></svg>plan</span>
                  <span class="p-badge success sm"><span class="bd"></span>passed</span>
                  <span class="p-badge neutral sm">read-only</span>
                </div>
              </div>
            </div>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Pill · toolbar pill (composer)</span></div>
              <div class="stage p">
                <span class="p-pill"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M8 4h13v2H8zM4.5 6.5a1.5 1.5 0 1 1 0-3a1.5 1.5 0 0 1 0 3m0 7a1.5 1.5 0 1 1 0-3a1.5 1.5 0 0 1 0 3m0 6.9a1.5 1.5 0 1 1 0-3a1.5 1.5 0 0 1 0 3M8 11h13v2H8zm0 7h13v2H8z"/></svg><span class="pp-strong">kimi-k2</span><span class="pp-sub">· thinking</span><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m12 13.171l4.95-4.95l1.414 1.415L12 16L5.636 9.636L7.05 8.222z"/></svg></span>
                <span class="p-pill"><span style="width:7px;height:7px;border-radius:50%;background:var(--p-warning)"></span>yolo</span>
                <span class="p-pill"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10s-4.477 10-10 10m0-2a8 8 0 1 0 0-16a8 8 0 0 0 0 16m1-8h4v2h-6V7h2z"/></svg>12k / 200k</span>
              </div>
            </div>

            <!-- ===== Kbd ===== -->
            <h3 class="sub">Kbd · keyboard shortcut</h3>
            <p><b>Kbd</b> renders a shortcut as keycaps — one block per key, never inline text like <code>(⌘K)</code>. Caps are 18px tall (Badge sm rhythm): sunken surface, 1px border with a 2px bottom edge, 11px UI font, muted text. Typical placement: pushed to the row's trailing edge, opposite the label (e.g. the sidebar search row).</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Kbd · keycaps</span></div>
              <div class="stage p">
                <span class="p-kbd"><kbd>⌘</kbd><kbd>K</kbd></span>
                <span class="p-kbd"><kbd>Ctrl</kbd><kbd>K</kbd></span>
                <span class="p-kbd"><kbd>⌘</kbd><kbd>⇧</kbd><kbd>P</kbd></span>
              </div>
            </div>

            <!-- ===== Card / Surface ===== -->
            <h3 class="sub">Card / Surface</h3>
            <p>All cards across the site share <b>one shell</b>: flat, <code>1px</code> border, <code>--radius-md</code> radius, <b>no shadow</b>. The structure is split into three parts — <code>head / body / foot</code>. Cards differ <b>only in the head</b> — in two tiers by visual weight, while the shell stays consistent:</p>
            <ul class="clean">
              <li><b>Operation card</b> —— "process" content such as tool calls, Agent, Todo. The head is compact mono with no fill, low weight by default, not competing with the conversation.</li>
              <li><b>Attention card</b> —— content that needs a user decision, such as Question / Approval. The head carries a semantic color band (accent / warning) to stand out from the message stream.</li>
            </ul>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Operation card · compact mono head (no fill)</span></div>
              <div class="stage p col">
                <div class="p-card" style="max-width:460px">
                  <div class="p-card-head">
                    <span class="p-card-title">read_file</span>
                    <span class="p-badge info sm" style="margin-left:auto">session.ts</span>
                  </div>
                  <div class="p-card-body">The head uses mono + a neutral background to emphasize its "code / process" nature; the body uses sans for readability. Flat, radius-md, same shape as the tool group and Agent group.</div>
                </div>
              </div>
            </div>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Attention card · semantic color-band head (accent / warning)</span></div>
              <div class="stage p col">
                <div class="p-action" style="max-width:460px">
                  <div class="p-action-head"><span class="p-action-title">A decision needs your confirmation</span><span class="p-badge info sm" style="margin-left:auto">question</span></div>
                  <div class="p-action-body">The head uses a semantic light background (<code>accent-soft</code> / <code>warning-soft</code>) to stand out from the message stream, signaling that the user must step in. The shell is exactly the same as the operation card.</div>
                </div>
              </div>
            </div>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Group · the container owns the border, rows are separated by hairlines</span></div>
              <div class="stage p col">
                <div class="p-tool-group open" style="max-width:460px">
                  <div class="p-tool-group-head"><span class="p-dot done"></span><span class="tg-title">3 tool calls</span><span class="tg-meta">· completed</span></div>
                  <div class="p-tool-row"><span class="p-dot done"></span><span class="tr-name">read_file</span><span class="tr-arg">session.ts</span></div>
                  <div class="p-tool-row"><span class="p-dot done"></span><span class="tr-name">grep</span><span class="tr-arg">"jwt" · 4 hits</span></div>
                </div>
              </div>
            </div>
            <ul class="clean check">
              <li><b>Unified shell</b>: all cards are flat + 1px border + radius-md, casting no shadow.</li>
              <li><b>Differences are intentional</b>: only the head distinguishes the type (compact mono vs semantic color band); the shell stays consistent.</li>
              <li><b>Grouping</b>: the outer container owns the border and radius; inner rows are separated by <code>border-top</code> hairlines, rather than each row being its own card.</li>
              <li><b>Status dots</b>: running (pulsing blue) / done (green) / failed (red), sharing one color vocabulary (see §04 tool calls).</li>
            </ul>

            <!-- ===== Input ===== -->
            <h3 class="sub">Input / Select / Textarea</h3>
            <p>Unified 38px height (32px small), <code>--radius-md</code> radius, <code>--color-surface-raised</code> background, and a unified blue focus ring (<code>0 0 0 3px accent-soft</code>). One field is the exception, on purpose: the model picker's search box paints <code>--color-surface-overlay</code> (white in light, 10% white in dark, upstream's own well for it) and keeps the neutral hairline and its resting shadow while focused, instead of taking the accent ring, because upstream's own search reads the same whether or not it is focused.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Form primitives</span></div>
              <div class="stage p col">
                <div class="demo-row" style="align-items:flex-start">
                  <div class="p-field demo-grow">
                    <label class="p-label">Workspace name</label>
                    <input class="p-input" placeholder="e.g. frontend" />
                    <span class="p-hint">Only letters, numbers, and hyphens are allowed.</span>
                  </div>
                  <div class="p-field demo-grow">
                    <label class="p-label">Model provider</label>
                    <select class="p-select"><option>Anthropic</option><option>OpenAI</option><option>Moonshot</option></select>
                  </div>
                </div>
                <div class="p-field">
                  <label class="p-label">System prompt</label>
                  <textarea class="p-textarea" placeholder="Describe this Agent's role and boundaries…"></textarea>
                </div>
              </div>
            </div>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">States</span></div>
              <div class="stage p col">
                <div class="demo-row" style="align-items:flex-start">
                  <div class="p-field demo-grow">
                    <label class="p-label">Workspace name</label>
                    <input class="p-input" value="my workspace!" style="border-color:var(--p-danger)" />
                    <span class="p-field-error">Please enter a valid workspace name</span>
                  </div>
                  <div class="p-field demo-grow">
                    <label class="p-label">Display name</label>
                    <input class="p-input" value="frontend" />
                    <span class="p-hint">Normal state · validation passed</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- ===== Code / Diff ===== -->
            <h3 class="sub">Code / Diff</h3>
            <p>Inline code, code blocks, and diffs all use the monospace font (<code>--p-font-mono</code>). Code blocks have a filename title bar and a copy button. Diffs use <code>+</code> / <code>-</code> row colors to express additions and deletions — additions use a success light background, deletions use a danger light background, with no gradients.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Code / Diff</span></div>
              <div class="stage p col">
                <span class="stage-label">inline code</span>
                <div>The server uses <code class="p-code-inline">jwt.verify(token)</code> to verify the signature, returning 401 on failure.</div>
                <span class="stage-label">code block</span>
                <div class="p-code-block">
                  <div class="p-code-block-head">
                    <span>session.ts</span>
                    <button class="p-icon-btn sm" aria-label="Copy"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M7 6V3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3v3c0 .552-.45 1-1.007 1H4.007A1 1 0 0 1 3 21l.003-14c0-.552.45-1 1.006-1zM5.002 8L5 20h10V8zM9 6h8v10h2V4H9z"/></svg></button>
                  </div>
                  <pre>import { verify } from './jwt';

    export function auth(token: string) {
      return verify(token, process.env.JWT_SECRET!);
    }</pre>
                </div>
                <span class="stage-label">diff</span>
                <div class="p-diff">
                  <div class="p-diff-head">session.ts · +3 -1</div>
                  <div class="p-diff-row"><span class="pm"></span><span class="p-diff-code">import { verify } from './jwt';</span></div>
                  <div class="p-diff-row del"><span class="pm">-</span><span class="p-diff-code">const secret = 'dev-secret';</span></div>
                  <div class="p-diff-row add"><span class="pm">+</span><span class="p-diff-code">const secret = process.env.JWT_SECRET!;</span></div>
                  <div class="p-diff-row"><span class="pm"></span><span class="p-diff-code">return verify(token, secret);</span></div>
                </div>
              </div>
            </div>

            <!-- ===== Dialog ===== -->
            <h3 class="sub">Dialog</h3>
            <p>One dialog primitive replaces 6 hand-written implementations: unified <code>--radius-xl</code> radius, <code>--shadow-xl</code> shadow, 20px head padding, right-aligned footer actions, and an IconButton close button.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Dialog primitive</span></div>
              <div class="stage p col" style="align-items:center">
                <div class="p-dialog">
                  <div class="p-dialog-head">
                    <div>
                      <div class="p-dialog-title">New chat</div>
                      <div class="p-dialog-desc">Create an independent Agent chat in the current workspace.</div>
                    </div>
                    <button class="p-icon-btn sm"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m12 10.587l4.95-4.95l1.414 1.414l-4.95 4.95l4.95 4.95l-1.415 1.414l-4.95-4.95l-4.949 4.95l-1.414-1.415l4.95-4.95l-4.95-4.95L7.05 5.638z"/></svg></button>
                  </div>
                  <div class="p-dialog-body">
                    <div class="p-field">
                      <label class="p-label">Chat title (optional)</label>
                      <input class="p-input" placeholder="Generated automatically" />
                    </div>
                  </div>
                  <div class="p-dialog-foot">
                    <button class="p-btn secondary">Cancel</button>
                    <button class="p-btn primary">Create</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="callout info"><span class="ico">i</span><div>
              <b>Size &amp; height</b>: Dialog offers three widths — <code>md</code> 440 / <code>lg</code> 640 / <code>xl</code> 760 (<code>--p-content-max</code>) — chosen by content weight. Height comes in two kinds: <code>auto</code> (default, grows with content up to <code>max-height</code>) and <code>fixed</code> (constant height <code>min(680px, 100vh - 64px)</code>, with overflow scrolled inside the body). <b>Content / multi-tab dialogs</b> (settings, model picker, provider manager, folder browser) always use <code>fixed</code> so the frame size stays constant and doesn't jump when switching tabs or content length; short confirmation dialogs keep <code>auto</code>. The model picker is that <code>lg</code> (640px) fixed-height (680px) dialog with a flush body (<code>:padded="false"</code>): a <code>.mp</code> column that owns its own top inset and the 22px side gutter the search field and the provider chip strip read, a borderless chip strip (28px chips at <code>radius-full</code>), a scrolling <code>.model-list</code>, and rows 56px tall with <code>8px 12px</code> padding carrying the model name over one muted meta line (provider, context size, capabilities) with the current-row check and the star grouped in a trailing slot. The footer is a hint of <code>Kbd</code> keycaps over a hairline.
            </div></div>

            <!-- ===== Toast ===== -->
            <h3 class="sub">Toast</h3>
            <p>Unified information architecture: status icon + title + description. The status color appears only on the icon, avoiding large colored areas that create visual noise.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Toast</span></div>
              <div class="stage p col">
                <div class="p-toast success">
                  <span class="ti"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m10 15.17l9.192-9.191l1.414 1.414L10 17.999l-6.364-6.364l1.414-1.414z"/></svg></span>
                  <div><div class="tt">Connected to server</div><div class="td">The local daemon is responding normally; you can start a new chat.</div></div>
                </div>
                <div class="p-toast warning">
                  <span class="ti"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m12.866 3l9.526 16.5a1 1 0 0 1-.866 1.5H2.474a1 1 0 0 1-.866-1.5L11.134 3a1 1 0 0 1 1.732 0m-8.66 16h15.588L12 5.5zM11 16h2v2h-2zm0-7h2v5h-2z"/></svg></span>
                  <div><div class="tt">Context usage 82%</div><div class="td">Consider running /compact to free up space.</div></div>
                </div>
              </div>
            </div>

            <!-- ===== Spinner ===== -->
            <h3 class="sub">Spinner</h3>
            <p>Loaders fall into two categories by scenario — <b>do not mix them</b>:</p>
            <ul class="clean">
              <li><b>Spinner (plain · SVG ring)</b> —— the default loader. Used for button loading, app startup (GlobalLoading), and general inline waits — "everything else".</li>
              <li><b>MoonSpinner (moon phase · brand signature)</b> —— used <b>only</b> for the chat waiting state of "message sent, waiting for the Agent's first response" (the sending placeholder in ChatPane, SideChatPanel, ActivityNotice).</li>
            </ul>

            <h4 class="mini">Spinner · plain loader (default)</h4>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Spinner · common scenarios</span></div>
              <div class="stage p col">
                <div class="demo-row">
                  <svg class="p-spinner" viewBox="0 0 24 24"><circle class="track" cx="12" cy="12" r="9"/><circle class="arc" cx="12" cy="12" r="9"/></svg>
                  <span class="p-thinking"><svg class="p-spinner sm" viewBox="0 0 24 24"><circle class="track" cx="12" cy="12" r="9"/><circle class="arc" cx="12" cy="12" r="9"/></svg>Loading…</span>
                  <button class="p-btn primary disabled"><svg class="p-spinner sm" viewBox="0 0 24 24" style="--p-accent:#fff;--p-line:rgba(255,255,255,.35)"><circle class="track" cx="12" cy="12" r="9"/><circle class="arc" cx="12" cy="12" r="9"/></svg>Submitting</button>
                </div>
              </div>
            </div>

            <h4 class="mini">MoonSpinner · moon phase (only "waiting for the Agent")</h4>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">MoonSpinner · chat waiting state only <span class="tag spec">signature</span></span></div>
              <div class="stage p col">
                <span class="stage-label">Frame loop (8 frames)</span>
                <div class="demo-row" style="font-size:22px;letter-spacing:2px;line-height:1">
                  <span>🌑</span><span>🌒</span><span>🌓</span><span>🌔</span><span>🌕</span><span>🌖</span><span>🌗</span><span>🌘</span>
                </div>
                <span class="stage-label">Usage · only while the chat waits for a response</span>
                <div class="demo-row">
                  <span class="p-thinking"><span style="font-size:16px;line-height:1">🌔</span>Thinking…</span>
                  <span class="p-thinking"><span style="font-size:16px;line-height:1">🌕</span>Waiting for response…</span>
                </div>
              </div>
            </div>
            <div class="callout info"><span class="ico">i</span><div>The moon phase is the <b>sole exception</b> to the emoji-as-icon rule, and is <b>limited</b> to the "waiting for the Agent's first response" scenario. It is currently implemented twice — in <code>MoonSpinner.vue</code> and <code>ActivityNotice.vue</code> — and should be merged into a single <code>MoonSpinner</code> component, sized via tokens and supporting <code>prefers-reduced-motion</code>. All other loading states use the plain Spinner.</div></div>

            <!-- ===== Link ===== -->
            <h3 class="sub">Link</h3>
            <p>Inline text link: the default is the accent color with no underline; on hover it shows an underline and darkens. The <code>.muted</code> variant uses the secondary text color. Used for in-text jumps, external links, "view all", and other lightweight actions.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Link · inline link</span></div>
              <div class="stage p col">
                <div class="demo-row" style="font-size:var(--p-font-size-base);color:var(--p-text)">
                  <span>Read the full <a class="p-link" href="#">design token docs</a> before building.</span>
                  <a class="p-link" href="#">View on GitHub<svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M10 6v2H5v11h11v-5h2v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm11-3v8h-2V6.413l-7.793 7.794l-1.414-1.414L17.585 5H13V3z"/></svg></a>
                  <a class="p-link muted" href="#">View history</a>
                </div>
              </div>
            </div>

            <!-- ===== Menu / Dropdown ===== -->
            <h3 class="sub">Menu / Dropdown</h3>
            <p>Dropdown menu panel: raised surface + border + <code>--shadow-menu</code> (the token upstream's own <code>.ui-menu</code> carries: three layers, softer than the small-control shadow, because a menu lifts further off the page than a button does). Menu items support icons, the current (active) state, the danger state, and the disabled state, with separators grouping items. On touch / mobile, use <code>lg</code> (≥44px row height) for menu items.</p>
            <p>The model menu (<code>ui/ModelEffortSelect.vue</code>, used by the composer and by the settings subagent pins) is one bounded scroll region, <code>.ms-list</code>, holding one labelled section per provider: the current model's provider group leads and the current row carries a check glyph in a fixed-width leading slot, the same one the composer's model rows use, so names start in the same place whether or not they are current. A provider can carry dozens of models, so the list is capped (320px / 44vh inside a 400px / 56vh panel) and scrolls while a pinned <code>More models…</code> row below it stays reachable; that row leaves this menu for the host's full model picker, so it is gated by a <code>showMore</code> prop and reported through a <code>more</code> emit. <code>SettingsDialog.vue</code> handles that emit by mounting <code>ModelPicker.vue</code> over the settings pane for the pin in question.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Menu · dropdown menu</span></div>
              <div class="stage p col" style="align-items:flex-start">
                <div class="p-menu">
                  <div class="p-menu-item"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M9 2.003V2h10.998C20.55 2 21 2.455 21 2.992v18.016a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 20.993V8zM5.83 8H9V4.83zM11 4v5a1 1 0 0 1-1 1H5v10h14V4z"/></svg>Open file</div>
                  <div class="p-menu-item active"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m10 15.17l9.192-9.191l1.414 1.414L10 17.999l-6.364-6.364l1.414-1.414z"/></svg>Selected item</div>
                  <div class="p-menu-item disabled"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10s-4.477 10-10 10m0-2a8 8 0 1 0 0-16a8 8 0 0 0 0 16M8.523 7.109l8.368 8.368a6 6 0 0 1-1.414 1.414L7.109 8.523A6 6 0 0 1 8.523 7.11"/></svg>Disabled item</div>
                  <div class="p-menu-sep"></div>
                  <div class="p-menu-item danger"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m12 10.587l4.95-4.95l1.414 1.414l-4.95 4.95l4.95 4.95l-1.415 1.414l-4.95-4.95l-4.949 4.95l-1.414-1.415l4.95-4.95l-4.95-4.95L7.05 5.638z"/></svg>Delete chat</div>
                </div>
              </div>
            </div>

            <!-- ===== SegmentedControl ===== -->
            <h3 class="sub">SegmentedControl</h3>
            <p>Mutually exclusive short option groups, commonly used for 2–4 option switches such as "light / dark / follow system". The current item is highlighted with a raised surface + subtle shadow.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">SegmentedControl</span></div>
              <div class="stage p col">
                <div class="p-seg">
                  <span class="p-seg-item on">Light</span>
                  <span class="p-seg-item">Dark</span>
                  <span class="p-seg-item">Follow system</span>
                </div>
              </div>
            </div>

            <!-- ===== Tabs ===== -->
            <h3 class="sub">Tabs</h3>
            <p>Tabs with a bottom hairline, used for grouping and switching sibling content. The current tab is marked with accent text + an accent underline.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Tabs</span></div>
              <div class="stage p col">
                <div class="p-tabs">
                  <span class="p-tab on">General</span>
                  <span class="p-tab">Agent</span>
                  <span class="p-tab">Advanced</span>
                </div>
              </div>
            </div>

            <!-- ===== Switch ===== -->
            <h3 class="sub">Switch</h3>
            <p>A two-state switch for settings that take effect immediately. 36×20 track with full radius, 16px knob; when on, the track turns accent and the knob slides right, with the transition driven by tokens.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Switch</span></div>
              <div class="stage p">
                <span class="p-switch on"></span>
                <span class="p-switch"></span>
              </div>
            </div>

            <!-- ===== Checkbox ===== -->
            <h3 class="sub">Checkbox</h3>
            <p>A 17×17 checkbox. When checked it fills with the accent color and shows a white tick (inline SVG). Often paired with a text label.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Checkbox</span></div>
              <div class="stage p">
                <span class="p-check on"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m10 15.17l9.192-9.191l1.414 1.414L10 17.999l-6.364-6.364l1.414-1.414z"/></svg></span>
                <span class="p-check"></span>
                <label style="display:inline-flex;align-items:center;gap:8px;color:var(--p-text);font-size:var(--p-font-size-base);cursor:pointer"><span class="p-check on"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m10 15.17l9.192-9.191l1.414 1.414L10 17.999l-6.364-6.364l1.414-1.414z"/></svg></span>Enable auto-save</label>
              </div>
            </div>

            <!-- ===== Avatar ===== -->
            <h3 class="sub">Avatar</h3>
            <p>A 32px default avatar with md radius; <code>.sm</code> is 24px. Can hold an initial or an icon; falls back to this placeholder when there is no image.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Avatar</span></div>
              <div class="stage p">
                <span class="p-avatar">K</span>
                <span class="p-avatar"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M4 22a8 8 0 1 1 16 0h-2a6 6 0 0 0-12 0zm8-9c-3.315 0-6-2.685-6-6s2.685-6 6-6s6 2.685 6 6s-2.685 6-6 6m0-2c2.21 0 4-1.79 4-4s-1.79-4-4-4s-4 1.79-4 4s1.79 4 4 4"/></svg></span>
                <span class="p-avatar sm">K</span>
              </div>
            </div>

            <!-- ===== EmptyState ===== -->
            <h3 class="sub">EmptyState</h3>
            <p>A centered placeholder for empty lists / panels: a 48px faint icon + title + hint, avoiding blank pages.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">EmptyState</span></div>
              <div class="stage p col">
                <div class="p-empty" style="width:100%;border:1px dashed var(--p-line);border-radius:var(--p-r-lg)">
                  <svg class="em-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1zm-.692-2H20V5H4v13.385zM8 10h8v2H8z"/></svg>
                  <div class="em-title">No chats yet</div>
                  <div class="em-hint">Click "New chat" to start a conversation with Kimi</div>
                </div>
              </div>
            </div>

            <!-- ===== Divider ===== -->
            <h3 class="sub">Divider</h3>
            <p>A 1px horizontal divider (<code>--p-line</code>); <code>.p-divider-v</code> is the vertical divider, used between inline elements.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Divider</span></div>
              <div class="stage p col">
                <div style="width:100%;font-size:var(--p-font-size-sm);color:var(--p-text)">Content above</div>
                <hr class="p-divider">
                <div style="width:100%;font-size:var(--p-font-size-sm);color:var(--p-text)">Content below</div>
                <div style="display:flex;align-items:center;gap:10px;height:24px;font-size:var(--p-font-size-sm);color:var(--p-text)">
                  <span>kimi-k2</span>
                  <span class="p-divider-v"></span>
                  <span>thinking</span>
                </div>
              </div>
            </div>

            <!-- ===== Tooltip ===== -->
            <h3 class="sub">Tooltip</h3>
            <p>A CSS-only hover hint, wrapped in <code>.p-tip</code>. Inverted background (<code>--p-text</code> / <code>--p-bg</code>), single line, no wrapping — carries only short notes. The bubble keeps that inverted pair under the material gate, which gives it the material's 1px edge and drop shadow and nothing else: swapping its fill for the material's face put its label at the wrong end of the scale (§02 "Surface material").</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Tooltip (hover the button)</span></div>
              <div class="stage p">
                <span class="p-tip">
                  <button class="p-icon-btn"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z"/></svg></button>
                  <span class="p-tooltip">New chat</span>
                </span>
              </div>
            </div>

            <!-- ===== Banner ===== -->
            <h3 class="sub">Banner</h3>
            <p>An inline notice bar placed at the top of a content area. Three states — <code>.info</code> / <code>.warning</code> / <code>.danger</code> — each with a matching 18px icon.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Banner</span></div>
              <div class="stage p col">
                <div class="p-banner info"><svg class="bn-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10s-4.477 10-10 10m0-2a8 8 0 1 0 0-16a8 8 0 0 0 0 16M11 7h2v2h-2zm0 4h2v6h-2z"/></svg>Connected to server</div>
                <div class="p-banner warning"><svg class="bn-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m12.866 3l9.526 16.5a1 1 0 0 1-.866 1.5H2.474a1 1 0 0 1-.866-1.5L11.134 3a1 1 0 0 1 1.732 0m-8.66 16h15.588L12 5.5zM11 16h2v2h-2zm0-7h2v5h-2z"/></svg>Currently in yolo mode; tool calls will run automatically</div>
              </div>
            </div>

            <!-- ===== Sheet / BottomSheet ===== -->
            <h3 class="sub">Sheet / BottomSheet</h3>
            <p>A mobile bottom slide-up panel: xl top radius + drag handle, xl shadow. At ≤640px, dialogs become bottom-anchored Sheets.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">BottomSheet</span></div>
              <div class="stage p col" style="align-items:center">
                <div class="p-sheet" style="width:100%;max-width:360px">
                  <div class="p-sheet-handle"></div>
                  <div style="font-size:var(--p-font-size-base);font-weight:700;color:var(--p-text);margin-bottom:8px">Choose a model</div>
                  <div class="p-menu-item" style="padding:8px 10px">kimi-k2 · thinking</div>
                  <div class="p-menu-item" style="padding:8px 10px">kimi-k2 · instant</div>
                </div>
              </div>
            </div>

            <!-- ===== Skeleton ===== -->
            <h3 class="sub">Skeleton</h3>
            <p>A placeholder for loading content, using a breathing opacity animation (no gradients), following the <code>no-gradient-text</code> rule. Composed into titles / text lines / avatars.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Skeleton</span></div>
              <div class="stage p col">
                <div style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:360px">
                  <div class="p-skeleton" style="height:16px;width:55%"></div>
                  <div class="p-skeleton" style="height:12px;width:100%"></div>
                  <div class="p-skeleton" style="height:12px;width:82%"></div>
                  <div class="p-skeleton" style="height:32px;width:32px;border-radius:var(--p-r-full)"></div>
                </div>
              </div>
            </div>

            <!-- ===== Command Bar ===== -->
            <h3 class="sub">Command Bar</h3>
            <p>An inline combination of "primary action + command text + copy", sitting between a button and a code block — used for install / onboarding / one-click execution. The primary action reuses <code>Button primary</code>; the command area uses a mono light-grey background.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Command Bar</span></div>
              <div class="stage p col">
                <div class="p-cmdbar" style="max-width:620px">
                  <button class="p-btn primary">Install Kimi Code ▾</button>
                  <span class="p-cmd"><span class="cmd-text">curl -fsSL https://code.kimi.com/install.sh | bash</span><button class="cmd-copy"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M7 6V3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3v3c0 .552-.45 1-1.007 1H4.007A1 1 0 0 1 3 21l.003-14c0-.552.45-1 1.006-1zM5.002 8L5 20h10V8zM9 6h8v10h2V4H9z"/></svg></button></span>
                </div>
              </div>
            </div>

            <!-- ===== TopBar ===== -->
            <h3 class="sub">TopBar</h3>
            <p>The <code>ui/TopBar.vue</code> primitive, solid by default; its <code>.frost</code> variant is translucent + background blur for sticky navigation bars. <b>No screen in the app mounts this primitive</b>: on desktop the top bar is the conversation header (<code>ChatHeader.vue</code>), a bar that floats over the transcript (<code>position: absolute</code>, with <code>.panes.has-header</code> taking <code>padding-top: var(--panel-head-h, 48px)</code> so the transcript scrolls under it). Under the liquid-glass gate the row itself is the pill: a fixed <code>--radius-full</code> capsule, 36px tall and inset 12px from the column's edges, carrying <code>blur(18px)</code> and a constant surface at every scroll position, plus the material's own 3px rim band in light. Nothing feeds it a scroll state any more: the shape and the surface are constant. In dark that surface is DeepSeek's own — <code>--lg-head-fill</code>, a uniform 1px <code>--lg-head-border</code> and <code>blur(18px)</code>, the blur the one departure from their 12px — and its edge is <code>--lg-head-shadow</code>'s head line at 30% white over a 45% drop shadow, because the reader asked for the light theme's lip here too. In light it is the reference capsule's: <code>--lg-head-face</code>, a neutral white lift that is stronger at the head than at the foot and carries no hue of its own — its colour is the backdrop's, which is why the reference capsule reads blue over a sky and green over foliage — edged by <code>--lg-head-shadow</code>'s bright lip, bright 60% ring and soft drop shadow, with both DeepSeek tokens reading transparent there. Its lens is the band-limited family's own 3px variant, read through <code>--lg-head-filter</code>: the 36px capsule would fit the panels' 6px band now, but the bar keeps the narrowest setting, whose 6px floor leaves it 30px of unlit middle and bends what passes under its head and foot. Unlike theirs, the material stays on at both ends of the transcript, so its top band passes under the blur. The chips inside the row read upstream's own tokens rather than the fork's: their rings are <code>--color-line</code>, their fills <code>--color-well</code>, the branch label is set in the UI face rather than the mono one, and the diff pill runs <code>tabular-nums</code>, so the row measures as upstream's does (<code>175</code> for the branch cluster, <code>23</code> and <code>48</code> for its two pills). Rendered, those rings and fills are identical in dark; in light the two neutral rings stay a step lighter, because this app's light line token is <code>#e7eaee</code> where upstream's line is 13% black. Under the gate the fills move to <code>--lg-pill-fill</code>: the opaque well reads as a hole cut into a bar that is already lifted, so the pills and the PR badge's draft and unknown states take a translucent lift at upstream's own step (4% black over the light bar, 7% white over the dark one) while the PR badge's open / merged / closed states keep their own semantic fills. Its own more-menu is rendered in a <code>&lt;Teleport to="body"&gt;</code> block. The mobile shell draws the same bar with the shape driven by the transcript: its own <code>.topbar</code> floats too, flat and full width with the material at either end of the transcript and lifting into the same capsule, sides and head only, while the transcript sits away from both ends. The two stages below show the primitive.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">TopBar · solid / frosted glass</span></div>
              <div class="stage p col" style="gap:14px;background:radial-gradient(circle at 18% 30%,rgba(23,131,255,.16),transparent 42%),radial-gradient(circle at 82% 75%,rgba(20,23,28,.10),transparent 46%),var(--p-surface-sunken)">
                <div class="p-topbar" style="width:100%;max-width:580px">
                  <span class="tb-title">Solid TopBar</span>
                  <span class="tb-actions"><button class="p-icon-btn sm"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M3 4h18v2H3zm0 7h18v2H3zm0 7h18v2H3z"/></svg></button></span>
                </div>
                <div class="p-topbar frost" style="width:100%;max-width:580px">
                  <span class="tb-title">Frosted-glass TopBar · .frost</span>
                  <span class="tb-actions"><button class="p-icon-btn sm"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M3 4h18v2H3zm0 7h18v2H3zm0 7h18v2H3z"/></svg></button></span>
                </div>
              </div>
            </div>

            <h3 class="sub">SectionLabel</h3>
            <p>A small group title for sidebar lists, used to section the content below (such as <code>Workspaces</code> in the sidebar). Spec: <code>--text-xs</code> (12px at the default font size) / <code>--weight-section-label</code> (600) / uppercase, color <code>var(--faint)</code>; padding <code>0 var(--sb-action-inset) var(--space-1) var(--space-2)</code> inside the head's own <code>var(--space-3) var(--sb-inset) 0</code>, so the title lands on the row's starting padding (<code>--sb-pad-x</code>) and the trailing controls end where the footer's settings button ends. The weight is upstream's own section-label step, heavier than body text because the label is 12px uppercase, where 400 reads as a whisper next to the row titles. For scripts without case (such as Chinese), <code>text-transform:uppercase</code> simply has no effect — no special handling needed.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Sidebar · group title</span></div>
              <div class="stage p col" style="gap:0;background:var(--p-surface);padding:0;max-width:300px;align-items:stretch">
                <div class="p-section-label" style="padding:12px 16px 4px">Workspaces</div>
                <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;margin:1px 6px;border-radius:8px;color:var(--p-text);font-size:13px">
                  <svg style="color:var(--d-fg-faint);flex:none" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M4 5v14h16V7h-8.414l-2-2zm8.414 0H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414z"/></svg>
                  kimi-code-web
                </div>
                <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;margin:1px 6px;border-radius:8px;color:var(--p-text);font-size:13px">
                  <svg style="color:var(--d-fg-faint);flex:none" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M4 5v14h16V7h-8.414l-2-2zm8.414 0H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414z"/></svg>
                  playground
                </div>
              </div>
            </div>
          </section>

          <!-- ===== 04 Chat Interface ===== -->
          <section id="chat">
            <div class="sec-head">
              <span class="sec-num">04</span>
              <h2 class="sec-title">Chat Interface Overhaul</h2>
            </div>
            <p class="sec-desc">
              The message stream is the core of Kimi Web. The goal of the overhaul: have the 6 card types (Agent / Tool / Question / Approval / Swarm / Todo)
              <b>share one card skeleton</b>, distinguished only by the head icon and semantic color; and collapse the Composer into a single rounded container.
            </p>

            <h3 class="sub">Unified message stream</h3>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Conversation · 760px reading column</span></div>
              <div class="stage p col" style="align-items:center;background:#fff">
                <div class="demo-chat">

                  <!-- user -->
                  <div class="p-bubble-user">Please change the login endpoint to JWT and add the corresponding unit tests.</div>

                  <!-- thinking -->
                  <span class="p-thinking"><span style="font-size:15px;line-height:1">🌔</span>Analyzing the auth module…</span>

                  <!-- compact tool group: multiple tool calls collapsed into a stack, low weight by default -->
                  <div class="p-tool-group open">
                    <div class="p-tool-group-head">
                      <span class="p-dot done"></span>
                      <svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M8 4h13v2H8zM4.5 6.5a1.5 1.5 0 1 1 0-3a1.5 1.5 0 0 1 0 3m0 7a1.5 1.5 0 1 1 0-3a1.5 1.5 0 0 1 0 3m0 6.9a1.5 1.5 0 1 1 0-3a1.5 1.5 0 0 1 0 3M8 11h13v2H8zm0 7h13v2H8z"/></svg>
                      <span class="tg-title">3 tool calls</span>
                      <span class="tg-meta">· completed · 0.8s</span>
                      <svg class="tg-car" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m13.172 12l-4.95-4.95l1.414-1.413L16 12l-6.364 6.364l-1.414-1.415z"/></svg>
                    </div>
                    <!-- row 1 · expanded (details disclosed on demand) -->
                    <div class="p-tool-row expanded">
                      <span class="p-dot done"></span>
                      <svg class="tr-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M9 2.003V2h10.998C20.55 2 21 2.455 21 2.992v18.016a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 20.993V8zM5.83 8H9V4.83zM11 4v5a1 1 0 0 1-1 1H5v10h14V4z"/></svg>
                      <span class="tr-name">read_file</span>
                      <span class="tr-arg">src/auth/session.ts</span>
                      <span class="tr-time">0.2s</span>
                      <svg class="tr-car" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m13.172 12l-4.95-4.95l1.414-1.413L16 12l-6.364 6.364l-1.414-1.415z"/></svg>
                    </div>
                    <div class="p-tool-detail">
                      <div class="p-code">12  export function verify(token: string) {<br/>13    return jwt.verify(token, getSecret());<br/>14  }</div>
                    </div>
                    <!-- row 2 · collapsed -->
                    <div class="p-tool-row">
                      <span class="p-dot done"></span>
                      <svg class="tr-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M9 2.003V2h10.998C20.55 2 21 2.455 21 2.992v18.016a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 20.993V8zM5.83 8H9V4.83zM11 4v5a1 1 0 0 1-1 1H5v10h14V4z"/></svg>
                      <span class="tr-name">read_file</span>
                      <span class="tr-arg">src/auth/middleware.ts</span>
                      <span class="tr-time">0.2s</span>
                      <svg class="tr-car" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m13.172 12l-4.95-4.95l1.414-1.413L16 12l-6.364 6.364l-1.414-1.415z"/></svg>
                    </div>
                    <!-- row 3 · collapsed -->
                    <div class="p-tool-row">
                      <span class="p-dot done"></span>
                      <svg class="tr-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m18.031 16.617l4.283 4.282l-1.415 1.415l-4.282-4.283A8.96 8.96 0 0 1 11 20c-4.968 0-9-4.032-9-9s4.032-9 9-9s9 4.032 9 9a8.96 8.96 0 0 1-1.969 5.617m-2.006-.742A6.98 6.98 0 0 0 18 11c0-3.867-3.133-7-7-7s-7 3.133-7 7s3.133 7 7 7a6.98 6.98 0 0 0 4.875-1.975z"/></svg>
                      <span class="tr-name">grep</span>
                      <span class="tr-arg">"jwt.verify" · 4 matches</span>
                      <span class="tr-time">0.1s</span>
                      <svg class="tr-car" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m13.172 12l-4.95-4.95l1.414-1.413L16 12l-6.364 6.364l-1.414-1.415z"/></svg>
                    </div>
                  </div>

                  <!-- assistant prose (conclusion) -->
                  <div class="p-msg">
                    <p>I looked at the structure of <code>src/auth</code>; it is currently based on a session cookie. The scope of the change is below — once you confirm, I'll start.</p>
                  </div>

                  <!-- question (needs a user decision → keep the full card) -->
                  <div class="p-action">
                    <div class="p-action-head">
                      <svg class="p-ic" style="color:var(--p-accent)" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10s-4.477 10-10 10m0-2a8 8 0 1 0 0-16a8 8 0 0 0 0 16m-1-5h2v2h-2zm2-1.645V14h-2v-1.5a1 1 0 0 1 1-1a1.5 1.5 0 1 0-1.471-1.794l-1.962-.393A3.501 3.501 0 1 1 13 13.355"/></svg>
                      <span class="p-action-title">A decision needs your confirmation</span>
                    </div>
                    <div class="p-action-body">How long should the JWT expiry be? Default 7 days, refresh token 30 days.</div>
                    <div class="p-action-foot">
                      <button class="p-btn secondary sm">Customize</button>
                      <button class="p-btn primary sm">Use default</button>
                    </div>
                  </div>

                  <!-- approval (warning) -->
                  <div class="p-action warn">
                    <div class="p-action-head">
                      <svg class="p-ic" style="color:var(--p-warning)" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m12.866 3l9.526 16.5a1 1 0 0 1-.866 1.5H2.474a1 1 0 0 1-.866-1.5L11.134 3a1 1 0 0 1 1.732 0m-8.66 16h15.588L12 5.5zM11 16h2v2h-2zm0-7h2v5h-2z"/></svg>
                      <span class="p-action-title">Write permission required</span>
                      <span class="p-badge warning sm" style="margin-left:auto">write_file</span>
                    </div>
                    <div class="p-action-body">About to modify <code>src/auth/middleware.ts</code>, 42 lines changed. Allow?</div>
                    <div class="p-action-foot">
                      <button class="p-btn secondary sm">Deny</button>
                      <button class="p-btn primary sm">Allow this time</button>
                      <button class="p-btn ghost sm">Always allow</button>
                    </div>
                  </div>

                  <!-- todo -->
                  <div class="p-todo">
                    <div class="p-todo-row done"><span class="p-todo-check">✓</span>Replace session with JWT signing</div>
                    <div class="p-todo-row active"><span class="p-todo-check">●</span>Refactor the auth middleware</div>
                    <div class="p-todo-row"><span class="p-todo-check">○</span>Add unit tests</div>
                  </div>

                </div>
              </div>
            </div>
            <p><b>Wide markdown tables (desktop):</b> regular chat prose stays within the 760px reading column (<code>--p-content-max</code>). On desktop a wide table may grow naturally with its content up to 1040px (<code>--p-table-max</code>), centred within the conversation pane; beyond that the excess scrolls horizontally inside the table's own wrapper — the page and the chat area never scroll sideways. A single column is capped at 700px (<code>--p-table-cell-max</code>), so long cell content wraps inside the cell instead of stretching the table. The conversation outline (TOC) keeps its usual position just outside the reading column; when a table grows past it and scrolls under the rail, the TOC is hidden temporarily and returns as soon as the table leaves, without touching the user's TOC setting. On mobile a table never breaks out of the reading column.</p>

            <h3 class="sub">Tool calls: compact by default, grouped, expand on demand</h3>
            <p>High-frequency calls like <code>read_file</code> / <code>bash</code> / <code>grep</code> are "operational noise" — if each one took a full card, parallel triggers would quickly drown out the conversation.
            The new strategy splits tool calls into three tiers by <b>visual weight</b>, pushing them as light as possible:</p>

            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Three visual-weight tiers</span></div>
              <div class="stage p col">
                <span class="stage-label">① Tool row · lightest (default)</span>
                <div class="p-tool-row" style="border:1px solid var(--p-line);border-radius:8px">
                  <span class="p-dot done"></span>
                  <svg class="tr-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M9 2.003V2h10.998C20.55 2 21 2.455 21 2.992v18.016a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 20.993V8zM5.83 8H9V4.83zM11 4v5a1 1 0 0 1-1 1H5v10h14V4z"/></svg>
                  <span class="tr-name">read_file</span>
                  <span class="tr-arg">src/auth/session.ts</span>
                  <span class="tr-time">0.2s</span>
                </div>
                <span class="stage-label">② Tool group · medium (consecutive / parallel auto-merged; collapsed to one line)</span>
                <div class="p-tool-group">
                  <div class="p-tool-group-head">
                    <span class="p-dot done"></span>
                    <svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M8 4h13v2H8zM4.5 6.5a1.5 1.5 0 1 1 0-3a1.5 1.5 0 0 1 0 3m0 7a1.5 1.5 0 1 1 0-3a1.5 1.5 0 0 1 0 3m0 6.9a1.5 1.5 0 1 1 0-3a1.5 1.5 0 0 1 0 3M8 11h13v2H8zm0 7h13v2H8z"/></svg>
                    <span class="tg-title">3 tool calls</span>
                    <span class="tg-meta">· completed · 0.8s</span>
                    <svg class="tg-car" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m13.172 12l-4.95-4.95l1.414-1.413L16 12l-6.364 6.364l-1.414-1.415z"/></svg>
                  </div>
                </div>
                <span class="stage-label">③ Decision card · heavy (only question / approval, needs user input)</span>
                <div class="p-action warn">
                  <div class="p-action-head"><span class="p-action-title">Write permission required</span><span class="p-badge warning sm" style="margin-left:auto">write_file</span></div>
                  <div class="p-action-body" style="padding:10px 14px;font-size:13px">About to modify <code>src/auth/middleware.ts</code>, 42 lines changed.</div>
                </div>
              </div>
            </div>

            <ul class="clean check">
              <li>Tool calls <b>render as compact rows by default</b> (30px single-line mono + status dot + key argument); no head / body / shadow.</li>
              <li>Consecutive or parallel calls <b>auto-merge into one tool group</b>; when collapsed, the whole group takes one line (<code>N tool calls · status</code>).</li>
              <li>Clicking a row <b>expands it in place</b> to show details (code / output); click again to collapse — details don't grab attention by default.</li>
              <li>Status is expressed with a <b>colored dot</b>: running (pulsing blue) / done (green) / failed (red), taking no extra space.</li>
              <li><b>Only two types keep a full card</b>: <code>Question</code> (needs an answer) and <code>Approval</code> (needs authorization) — they genuinely need the user's attention.</li>
            </ul>

            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Tool Call · compact row (expand on demand)</span></div>
              <div class="stage p">
                <div class="p-tool-group open">
                  <div class="p-tool-group-head"><span class="p-dot done"></span><span class="tg-title">3 tool calls</span><span class="tg-meta">· completed</span></div>
                  <div class="p-tool-row expanded"><span class="p-dot done"></span><span class="tr-name">read_file</span><span class="tr-arg">session.ts</span></div>
                  <div class="p-tool-detail"><div class="p-code" style="font-size:11px;padding:7px 9px;margin-top:8px">12  export function verify(…</div></div>
                  <div class="p-tool-row"><span class="p-dot done"></span><span class="tr-name">read_file</span><span class="tr-arg">middleware.ts</span></div>
                  <div class="p-tool-row"><span class="p-dot done"></span><span class="tr-name">grep</span><span class="tr-arg">"jwt" · 4 hits</span></div>
                </div>
              </div>
            </div>

            <h3 class="sub">Composer</h3>
            <p>One 32px-radius card on <code>--color-composer-bg</code>, with a 1px hairline (<code>--color-text</code> at 14%, upstream's <code>rgba(255,255,255,.12)</code> in dark), the <code>0 5px 16px -4px rgba(0,0,0,.07)</code> shadow, and a <code>14px 16px 8px</code> text inset over an 8px-gap input row; on focus a second border fades in one pixel inside the hairline, at 25% black in light and 25% white in dark, while the border and the shadow hold still. Under the liquid-glass gate the material is on the card at rest as well as on focus: at rest it carries the material's blur, the band-limited bezel lens, a <code>--lg-tint-card</code> face (74% in light, 92% in dark), the foot shade, the rim pair in dark and, in light, the wider <code>--lg-card-shadow</code> stacked under its own; focus opens the face further to <code>--lg-tint-card-focus</code> (62% in light, 74% in dark) and keeps the same lens, while focus itself stays the component's fading line, which this branch does not override, so no accent line and no accent ring appear (§02 "Surface material"). Toolbar controls all use the Pill / IconButton primitives, and the send button is a 32px circle. Under the gate the two discs in the toolbar take the material as well: Send and Stop carry the material's blur, a 1px <code>--lg-rim-catch</code> border that gives them the reference's bright lip, the <code>--lg-rim-shade</code> ring just inside it and a translucent fill mixed from their own fill tokens at <code>--lg-tint-disc</code> (100% in light, where the near-black Send needs full strength, and 78% in dark), with no lens — the refract pair's whole-face specular and its 0.8-of-the-box scale wash a 32px disc rather than edging it — and a disabled Send stays flat on its own fill on purpose (§02 "Surface material"). The <code>+</code> control's menu spans the card rather than the trigger: its foot is computed from the card's top edge plus <code>--space-2</code>, so the panel floats above the card instead of covering it, and it keeps the dock work panel's frosted material rather than taking the shared dense face (§02 "Surface material"). The model and permission dropdowns are teleported to the document body and placed in viewport coordinates, like the <code>+</code> menu beside them, and for the same load-bearing reason: the card carries a <code>backdrop-filter</code>, at rest and while it holds the caret, an element with a filter is a backdrop root, and a descendant's own <code>backdrop-filter</code> inside a backdrop root samples nothing. While the two panels lived inside the card they declared the material's <code>blur(18px) saturate(1.4) url(#lg-refract)</code> and painted neither the blur nor the lens, so they read as flat plates. Teleported, the chain paints: measured mean-abs difference over the menu box went from <code>17.44</code> to <code>85.14</code> for the model menu and <code>28.78</code> to <code>85.93</code> for the permission menu, against the header's own kebab menu at <code>83.69</code>, which was always teleported. Their rects are unchanged at 1440×900 (model <code>[978,588,1178,831]</code>, permission <code>[495,671,1045,837]</code>), and the shared clamp in <code>useViewportClamp.ts</code> now keeps them on screen: at 700px wide the permission menu used to hang 147px past the viewport edge.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Composer</span></div>
              <div class="stage p col" style="align-items:center;background:#fff">
                <div class="p-composer" style="width:100%;max-width:620px">
                  <div class="p-composer-ta ph">Message Kimi, / to run a command, @ to reference a file…</div>
                  <div class="p-composer-bar">
                    <div class="p-composer-left">
                      <button class="p-icon-btn"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M11 11V5h2v6h6v2h-6v6h-2v-6H5v-2z"/></svg></button>
                      <span class="p-pill"><span style="width:7px;height:7px;border-radius:50%;background:var(--p-warning)"></span>yolo</span>
                      <span class="p-pill"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M8 4h13v2H8zM4.5 6.5a1.5 1.5 0 1 1 0-3a1.5 1.5 0 0 1 0 3m0 7a1.5 1.5 0 1 1 0-3a1.5 1.5 0 0 1 0 3m0 6.9a1.5 1.5 0 1 1 0-3a1.5 1.5 0 0 1 0 3M8 11h13v2H8zm0 7h13v2H8z"/></svg>plan</span>
                    </div>
                    <div class="p-composer-right">
                      <span class="p-pill"><span class="pp-strong">kimi-k2</span><span class="pp-sub">· thinking</span><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="m12 13.171l4.95-4.95l1.414 1.415L12 16L5.636 9.636L7.05 8.222z"/></svg></span>
                      <button class="p-send"><svg class="p-ic" viewBox="0 0 24 24" fill="currentColor"><path fill="currentColor" d="M13 7.828V20h-2V7.828l-5.364 5.364l-1.414-1.414L12 4l7.778 7.778l-1.414 1.414z"/></svg></button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="callout info"><span class="ico">i</span><div>
              <b>Site-wide consistency</b>: the composer has only one radius (32px, a local <code>--composer-card-radius</code> outside the <code>--radius-*</code> scale) and one height; toolbar controls all use the Pill / IconButton primitives, and the send button is a 32px circle — it no longer drifts with the theme. The workbar chips above the card are 16px in from its left edge (the row's own padding, upstream's measured geometry) and carry the material under the liquid-glass gate (§02 "Surface material").
            </div></div>

            <h3 class="sub">Responsive</h3>
            <p>See §02 <code>--p-bp-sm</code> for the breakpoint. This section only gives mobile-adaptation pointers for the chat interface; a full mobile mockup is out of scope for this spec.</p>
            <div class="callout info"><span class="ico">i</span><div>
              At ≤640px: dialogs anchor to the bottom as Sheets (xl top radius, top drag handle), the sidebar collapses into an expandable drawer, the Composer toolbar is allowed to wrap, and the chat reading column drops its max-width to fill the screen.
            </div></div>
          </section>

          <!-- ===== 05 Theming ===== -->
          <section id="themes">
            <div class="sec-head">
              <span class="sec-num">05</span>
              <h2 class="sec-title">Theming</h2>
            </div>
            <p class="sec-desc">
              Kimi Web uses <b>one unified theme</b>: the same components, fonts, radii, shadows, and surfaces — "reskinning" only changes colors.
              Colors are collapsed into <b>4 seed tokens</b> — two theme colors + one light surface + one dark surface; the neutrals and accent are derived from them,
              and the semantic status colors (success / warning / danger) ship as independent palettes paired with the seeds, one set each for light / dark.
            </p>

            <h3 class="sub">Color seeds</h3>
            <p>Day-to-day customization only needs these 4 seeds; the whole site's neutrals and accent change with them:</p>
            <div class="panel panel-pad" style="margin:16px 0">
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px">
                <div style="text-align:center"><div style="width:48px;height:48px;border-radius:12px;background:#1783ff;margin:0 auto 8px;box-shadow:var(--d-shadow-sm)"></div><div style="font-size:13px;font-weight:700">Theme color · primary</div><div class="mono" style="font-size:11.5px;color:var(--d-fg-muted)">--accent-primary</div></div>
                <div style="text-align:center"><div style="width:48px;height:48px;border-radius:12px;background:#6b7280;margin:0 auto 8px;box-shadow:var(--d-shadow-sm)"></div><div style="font-size:13px;font-weight:700">Theme color · secondary</div><div class="mono" style="font-size:11.5px;color:var(--d-fg-muted)">--accent-secondary</div></div>
                <div style="text-align:center"><div style="width:48px;height:48px;border-radius:12px;background:#ffffff;border:1px solid var(--d-line);margin:0 auto 8px;box-shadow:var(--d-shadow-sm)"></div><div style="font-size:13px;font-weight:700">Light surface</div><div class="mono" style="font-size:11.5px;color:var(--d-fg-muted)">--surface-light</div></div>
                <div style="text-align:center"><div style="width:48px;height:48px;border-radius:12px;background:#0d1117;margin:0 auto 8px;box-shadow:var(--d-shadow-sm)"></div><div style="font-size:13px;font-weight:700">Dark surface</div><div class="mono" style="font-size:11.5px;color:var(--d-fg-muted)">--surface-dark</div></div>
              </div>
            </div>

            <h3 class="sub">Accent families</h3>
            <p>Within one theme, <b>the theme color (accent) can switch among several color families</b>. Two parallel families are provided today: <b>blue</b> (default, brand blue, carrying semantic emphasis) and <b>black</b> (neutral black, carrying the most restrained strong action). Both share the same components, fonts, radii, and surfaces — switching families only swaps the accent token set, with zero structural change; more families (green / purple, etc.) can be added later. The two cards below show the same <code>primary</code> button under the two families.</p>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Family switch · same primary, different theme color</span></div>
              <div class="stage p col">
                <div class="demo-row" style="align-items:stretch">
                  <div class="demo-col" style="flex:1;border:1px solid var(--p-line);border-radius:12px;background:var(--p-surface-raised);padding:16px;gap:12px">
                    <span class="stage-label">Blue family · default</span>
                    <div class="demo-row"><button class="p-btn primary sm">Primary action</button><span class="p-badge info sm"><span class="bd"></span>accent</span></div>
                    <span class="mono" style="font-size:11px;color:var(--p-text-muted)">--accent #1783ff · soft #e8f3ff</span>
                  </div>
                  <div class="demo-col demo-family-black" style="flex:1;border:1px solid var(--p-line);border-radius:12px;background:var(--p-surface-raised);padding:16px;gap:12px">
                    <span class="stage-label">Black family · neutral</span>
                    <div class="demo-row"><button class="p-btn primary sm">Primary action</button><span class="p-badge info sm"><span class="bd"></span>accent</span></div>
                    <span class="mono" style="font-size:11px;color:var(--p-text-muted)">--accent #14171c · soft #f1f2f4</span>
                  </div>
                </div>
              </div>
            </div>

            <h3 class="sub">Theme console · change 4 colors, light &amp; dark change together</h3>
            <div class="stage-wrap">
              <div class="stage-bar"><span class="st">Theme Console</span></div>
              <div class="stage p col" style="gap:18px">
                <div class="demo-row" style="justify-content:center;gap:10px;flex-wrap:wrap">
                  <span class="p-badge info"><span style="width:10px;height:10px;border-radius:3px;background:#1783ff"></span>Primary #1783ff</span>
                  <span class="p-badge neutral"><span style="width:10px;height:10px;border-radius:3px;background:#6b7280"></span>Secondary #6b7280</span>
                  <span class="p-badge neutral"><span style="width:10px;height:10px;border-radius:3px;background:#ffffff;border:1px solid var(--p-line)"></span>Light surface #ffffff</span>
                  <span class="p-badge neutral"><span style="width:10px;height:10px;border-radius:3px;background:#0d1117"></span>Dark surface #0d1117</span>
                </div>
                <div class="demo-row" style="align-items:stretch">
                  <div class="demo-col" style="flex:1;border:1px solid var(--p-line);border-radius:12px;background:var(--p-surface-raised);padding:16px;gap:10px">
                    <span class="stage-label">Light surface preview</span>
                    <button class="p-btn primary sm" style="align-self:flex-start">Primary action</button>
                    <span style="font-size:12px;color:var(--p-text-muted)">White background + accent button + neutral text</span>
                  </div>
                  <div class="demo-col" data-p="dark" style="flex:1;border:1px solid var(--p-line);border-radius:12px;background:var(--p-surface-raised);padding:16px;gap:10px">
                    <span class="stage-label" style="color:#9aa0a8">Dark surface preview</span>
                    <button class="p-btn primary sm" style="align-self:flex-start">Primary action</button>
                    <span style="font-size:12px;color:var(--p-text-muted)">Dark background + same accent + derived text</span>
                  </div>
                </div>
              </div>
            </div>

            <h3 class="sub">Light / dark mode</h3>
            <p>Driven by the two surfaces <code>--surface-light</code> / <code>--surface-dark</code>: whichever surface is current derives the corresponding foreground, border, shadow, and status colors. Switching light / dark simply swaps between these two sets of derived tokens, with zero structural change.</p>

            <div class="callout good"><span class="ico">✓</span><div>
              <b>Benefits of one theme</b>: components, fonts, radii, and surfaces are consistent site-wide; reskinning only changes 4 color seeds; light / dark mode works out of the box; semantic status colors are independently tunable.
            </div></div>
          </section>


          <!-- ===== 06 Style Rules ===== -->
          <section id="rules">
            <div class="sec-head">
              <span class="sec-num">06</span>
              <h2 class="sec-title">Style Rules</h2>
            </div>
            <p class="sec-desc">
              Anti-pattern rules that all UI code must follow. These rules are also the basis of the check-style detection script, one-to-one with a warning.
            </p>

            <table class="dt">
              <thead><tr><th>Rule ID</th><th>What it detects</th><th>Action</th></tr></thead>
              <tbody>
                <tr><td class="tk">no-gradient-text</td><td>gradient text / gradient background</td><td><span class="pill red">Forbidden</span></td></tr>
                <tr><td class="tk">no-glassmorphism</td><td><code>backdrop-filter</code> declared outside the shared material. The one sanctioned glassmorphism is the liquid-glass material in <code>style.css</code>; a component adding its own is a finding. Two exemptions remain, both upstream material rather than this fork's: the <code>.frost</code> variant of the unmounted <code>ui/TopBar</code> primitive, and upstream's frosted-menu blur (<code>--p-menu-backdrop</code>) on its menus and its dock work panel, which the material leaves alone (it replaces that blur on the workbar chips)</td><td><span class="pill amber">style.css only</span></td></tr>
                <tr><td class="tk">no-color-glow</td><td>colored / large-radius box-shadow glow</td><td><span class="pill red">Forbidden</span></td></tr>
                <tr><td class="tk">no-emoji-icon</td><td>using emoji as a functional icon (<b>the moon phases 🌑…🌘 are the sole exception</b>, and only in the "waiting for the Agent to respond" chat state; all other loading states use the plain Spinner)</td><td><span class="pill amber">Moon phase exempt</span></td></tr>
                <tr><td class="tk">no-hardcoded-hex</td><td>unregistered hex color inside a component <code>&lt;style&gt;</code></td><td><span class="pill amber">Warning</span></td></tr>
                <tr><td class="tk">no-hardcoded-font</td><td>hard-coded <code>font-family</code> in a component (e.g. <code>'Inter'</code>) instead of <code>var(--font-ui)</code></td><td><span class="pill amber">Warning</span></td></tr>
                <tr><td class="tk">radius-from-scale</td><td>radius value not in <code>{4,6,8,12,16,20,999}</code></td><td><span class="pill amber">Warning</span></td></tr>
                <tr><td class="tk">z-from-scale</td><td>z-index using an unregistered large number</td><td><span class="pill amber">Warning</span></td></tr>
                <tr><td class="tk">weight-from-scale</td><td>font-weight not in <code>{400,500}</code></td><td><span class="pill amber">Warning</span></td></tr>
              </tbody>
            </table>

            <h3 class="sub">State matrix</h3>
            <p>Every interactive primitive should define the following states where applicable; missing ones are flagged by the style rules. <code>focus-visible</code> always uses <code>--p-focus-ring</code> (appears only on keyboard focus, see §08); <code>disabled</code> is uniformly <code>opacity:.5</code>.</p>
            <table class="dt">
              <thead><tr><th>State</th><th>Button</th><th>Input</th><th>Card</th><th>Menu item</th><th>Switch</th></tr></thead>
              <tbody>
                <tr><td class="tk">default</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
                <tr><td class="tk">hover</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>—</td></tr>
                <tr><td class="tk">active / pressed</td><td>✓</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
                <tr><td class="tk">focus-visible</td><td>✓</td><td>✓</td><td>—</td><td>—</td><td>✓</td></tr>
                <tr><td class="tk">disabled</td><td>✓</td><td>✓</td><td>—</td><td>✓</td><td>—</td></tr>
                <tr><td class="tk">loading</td><td>✓</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
                <tr><td class="tk">selected / active</td><td>—</td><td>—</td><td>—</td><td>✓</td><td>✓</td></tr>
                <tr><td class="tk">error</td><td>—</td><td>✓</td><td>—</td><td>—</td><td>—</td></tr>
                <tr><td class="tk">readonly</td><td>—</td><td>✓</td><td>—</td><td>—</td><td>—</td></tr>
              </tbody>
            </table>

            <h3 class="sub">Moon phase exemption</h3>
            <div class="callout good"><span class="ico">✓</span><div>
              The "🌑…🌘" moon-phase emoji are a brand signature of Kimi Web, <b>used only in the chat state of "message sent, waiting for the Agent's first response"</b>, and are rendered uniformly by the <code>MoonSpinner</code> component; waiting states such as <code>ActivityNotice</code> reuse it rather than implementing their own moon phase.
              It is the sole exception to the <code>no-emoji-icon</code> rule; all other loading states use the plain <code>Spinner</code>.
            </div></div>

            <h3 class="sub">Glassmorphism exemption</h3>
            <div class="callout good"><span class="ico">✓</span><div>
              Glass is declared in exactly one place: the shared material in <code>src/style.css</code>, gated on <code>html[data-liquid-glass="on"]</code> (§02 "Surface material"). <b>A component that adds its own <code>backdrop-filter</code> is a <code>no-glassmorphism</code> finding.</b> The check's two remaining exemptions are upstream material rather than this fork's: the <code>.frost</code> variant of the unmounted <code>ui/TopBar</code> primitive, and upstream's frosted-menu blur (<code>--p-menu-backdrop</code>, <code>blur(24px) saturate(1.8)</code>) shared by its menus and its dock work panel — the material replaces that blur on the workbar chips, the one surface of upstream's the gate repaints, and leaves it alone on the composer's <code>+</code> menu, which carries the same material as the dock work panel (§02 "Surface material"). Streaming surfaces stay clear of material altogether: the terminal paints none of its own, and the chat scroll carries no material at all, neither a surface nor a filter, so the transcript is never blurred by the scroller. The header's own bar is the one surface that passes over the transcript, and it keeps its blur at every scroll position by request, so the top band does pass under it. The scroller's foot carries a mask, not a filter, so the fade there is a fade of the content rather than a blur of it.
            </div></div>

            <div class="footer">
              <span>Kimi Web Design System · v1.0</span>
              <span>The reference when changing the web UI</span>
            </div>
          </section>

          <!-- ===== 07 App Shell & Sidebar ===== -->
          <section id="shell">
            <div class="sec-head">
              <span class="sec-num">07</span>
              <h2 class="sec-title">App Shell &amp; Sidebar</h2>
            </div>
            <p class="sec-desc">
              The structural spec for the app shell (three-column grid + right preview panel) and the left session sidebar. These are business-agnostic "skeletons" —
              components, fonts, radii, and surfaces are reused from §02 / §03, but layout and alignment have their own conventions.
            </p>

            <h3 class="sub">Layout grid</h3>
            <p>On desktop it is a single-row 5-track grid: the sidebar and the right panel each occupy a permanent <code>auto</code> track, with the conversation column in the middle; two 0-width tracks are for the ResizeHandles.</p>
            <div class="code"><div class="code-bar"><span class="d"></span><span class="d"></span><span class="d"></span><span class="fn">App.vue · .app</span></div><pre>grid-template-columns: auto 0 minmax(0, 1fr) 0 auto;
    /*         sidebar ↑    ↑handle  ↑conversation  ↑handle ↑right panel (auto) */</pre></div>
            <table class="dt">
              <thead><tr><th>Token</th><th>Value</th><th>Usage</th></tr></thead>
              <tbody>
                <tr><td class="tk">sidebar width</td><td class="val">270px default (adjustable)</td><td>expanded sidebar width, changed by dragging the ResizeHandle; should approach §02's <code>--p-sidebar-w</code> (264px)</td></tr>
                <tr><td class="tk">--preview-w</td><td class="val">460px</td><td>width of the right preview panel when open</td></tr>
                <tr><td class="tk">--panel-head-h</td><td class="val">48px</td><td>unified height for all right panel heads + the conversation column head, so the hairline runs as one line</td></tr>
                <tr><td class="tk">--p-bp-sm</td><td class="val">640px</td><td>≤640 switches to a mobile single column (top bar + conversation), no sidebar / handle / right panel</td></tr>
              </tbody>
            </table>
            <ul class="clean">
              <li>The right panel track exists permanently, with its width transitioning between <code>0 ↔ var(--preview-w)</code> (when open it squeezes the conversation column, rather than switching templates).</li>
              <li>The sidebar collapses SYMMETRICALLY to the right panel: its container width animates to 0 while the content keeps its fixed width anchored to the right edge (clipped, sliding out left — no reflow, hairline stays on the clipped content). No rail remains. The collapse control differs by platform: on <b>macOS desktop</b> the toggle is a single resident floating IconButton pinned beside the traffic lights (rendered in both states, only the glyph swaps — the sidebar slides underneath it, never moves or flashes); on <b>Windows / web</b> the collapse button lives inside the sidebar header (right-aligned), and a floating expand button appears at the top-left only while collapsed. The conversation header pads left in step with the transition while collapsed. Under the liquid-glass gate the floating toggle centres on the header pill rather than on the 48px band the pill sits inside (the band's own centre leaves it 2px above the pill): <code>top: calc(var(--lg-head-inset) + (var(--lg-head-height) - var(--icon-button-sm)) / 2)</code>, the same formula the right-panel toggle reads. Only its vertical position moves; the non-glass <code>top: 11px</code> for the flat band stays, and so do the macOS variant's <code>left</code> and its disabled animation.</li>
              <li>All grid children must have <code>min-height:0; min-width:0</code>, so only the inner scroll containers scroll and the page itself does not scroll.</li>
            </ul>

            <h3 class="sub">Sidebar alignment system (<code>--sb-*</code>)</h3>
            <p>All sidebar rows (group head, session row, New session button) share these custom properties, so the "session title" aligns precisely under the "workspace name".</p>
            <table class="dt">
              <thead><tr><th>Token</th><th>Value</th><th>Usage</th></tr></thead>
              <tbody>
                <tr><td class="tk">--sb-inset</td><td class="val"><code>var(--space-2)</code> = 8px</td><td>row box (hover/selected pill) inset from the sidebar edges. Both inset values are upstream's own, measured against its running build at a 270px column: its row pill sits [253×32 @8] and its section-head title starts at x=16. Its sidebar is flush and ours starts inside the floating panel's 8px carrier, but the same two numbers land inside our panel's own content box.</td></tr>
                <tr><td class="tk">--sb-pad-x</td><td class="val"><code>var(--space-4)</code> = 16px</td><td>content start x (= --sb-inset + 8px row padding)</td></tr>
                <tr><td class="tk">--sb-gutter</td><td class="val">16px</td><td>leading icon slot width — matches the workspace folder icon so the session title aligns under the workspace name</td></tr>
                <tr><td class="tk">--sb-gap</td><td class="val"><code>var(--space-2)</code> = 8px</td><td>gap between the icon slot and the text, on the session rows, the New session button and the search row alike, so the distance is one value across the panel</td></tr>
                <tr><td class="tk">--sb-action-inset</td><td class="val"><code>calc((max(var(--ui-font-size-sm) * var(--leading-tight), var(--p-ic-md)) + 2 * var(--space-2) - var(--icon-button-sm)) / 2)</code> = 3.125px at the default font size</td><td>trailing inset for the quiet icon buttons that end a text row (the section head's two controls and the footer's settings entry). Upstream's formula: half of what the row's own height (its text line or the 16px icon slot, whichever is taller, plus the row's 2×8px padding) leaves over a 26px button, so the buttons' optical edge sits on the text rows' edge instead of on the panel's. The footer's own padding is <code>8px</code> top and bottom, <code>--sb-inset</code> at the start and <code>--sb-inset + --sb-action-inset</code> (11.125px) at the end.</td></tr>
                <tr><td class="tk">--sb-hover</td><td class="val"><code>var(--color-hover)</code></td><td>the row hover wash: global <code>--color-hover</code>, lighter than the selected fill, and both are translucent so they sit on any surface. The session row's hover is this and nothing else, because the shared liquid-glass hover rule in <code>style.css</code> no longer lists the row: it is a wash on a panel that already carries the material rather than a second pane of it (§02 "Surface material"). The active row keeps <code>--color-selected</code> while the pointer is on it, which the row's own doubled selector pins against its hover at equal specificity.</td></tr>
              </tbody>
            </table>
            <div class="callout info"><span class="ico">i</span><div>
              The session title's starting x = <code>--sb-pad-x + --sb-gutter + --sb-gap</code>. The group head has a folder icon and the session row has a status slot; both icons are the same width and position, so the titles align naturally.
            </div></div>

            <h3 class="sub">Sidebar structure</h3>
            <p>The sidebar from top to bottom: brand header → New session → search → section head → pinned rows (only while something is pinned) → grouped list (workspace head + session rows) → account row + settings. Controls reuse the §03 primitives as much as possible. The sidebar sits on <code>--color-sidebar-bg</code> (one step off <code>--color-bg</code>: warm off-white in light, near-black in dark — the session column reads as its own plane; the hairline still separates it from the conversation pane). Under the liquid-glass gate it steps off that surface: <code>.side</code> and <code>.sidebar-actions</code> go transparent and the material lives on a carrier inset 8px (<code>--lg-sidebar-inset</code>) from the window edges, so the graded ground shows around the floating panel. That carrier is a 20px-radius panel (<code>--radius-2xl</code>) with the panel fill (<code>--lg-face-panel</code> at <code>--lg-tint-panel</code>, 45% in both themes), a transparent border that keeps the box metrics and draws nothing, and the rim pair over its edge (<code>--lg-rim-top</code>, <code>--lg-rim-catch</code> and, in light, the <code>--lg-rim-shade</code> ring): no full outline, because a lit frame around the whole panel read as a drawn object rather than as glass, so the panel's edge is the step between its own face and the ground plus the wider <code>--lg-float-shadow</code> and those lines, with the band-limited bezel lens bending its outer 6px in light and its outer 3px in dark (§02 "Surface material"; desktop only). Vertical rhythm: the brand header keeps 12px padding (on macOS desktop the left padding grows to 80px to clear the traffic lights); rows inside the actions group (New session + search) stack flush (0 gap, same rhythm as the list rows); adjacent groups are separated by 12px. Row hover uses <code>--sb-hover</code> (= the global <code>--color-hover</code> wash); the selected row uses <code>--color-selected</code> — neutral, never the accent — and keeps that fill while the pointer is on it.</p>
            <table class="dt">
              <thead><tr><th>Block</th><th>Use</th><th>Note</th></tr></thead>
              <tbody>
                <tr><td>Brand header</td><td>logo + name + collapse IconButton (right-aligned)</td><td>on Windows / web the brand is left and the collapse IconButton sm is right-aligned inside the header; the logo is animated (a blinking eye). On macOS desktop the header is a bare drag strip (brand hidden, traffic lights + resident floating toggle over it)</td></tr>
                <tr><td>New session</td><td>full-width left-aligned button (custom)</td><td>same rhythm as the session rows in the list (left-aligned, hover = <code>--sb-hover</code>), with the <code>Kbd</code> keycaps (⌘⇧O / Ctrl Shift O) pushed to the trailing edge. <b>Do not</b> use Button (centered, breaks the rhythm)</td></tr>
                <tr><td>Search</td><td>bare search row (custom)</td><td>no border, hover/focus shows a sunken background; icon + label, with the <code>Kbd</code> keycaps (⌘K / Ctrl K) pushed to the trailing edge — label and shortcut are justified apart. <b>Do not</b> use Input (the 38px bordered version is too heavy). The two rows stack flush inside one actions block, which is the last fixed block above the list — it carries the scroll-linked seam</td></tr>
                <tr><td>Section head</td><td><code>.sessions-head &gt; .side-section-label</code></td><td>uppercase muted small titles like "sessions"; fixed above the scroll container (it does not scroll away with the rows). Its padding is <code>var(--space-3) var(--sb-inset) 0</code>, and the label inside it adds the 8px that lands the title on <code>--sb-pad-x</code>. The head carries the list's scroll-linked seam as well: a transparent hairline plus upstream's three-band gradient (13px, <code>--p-sidebar-seam-h</code>), both revealed only once the list has actually scrolled, so an unscrolled list shows no abrupt boundary. The head wraps the label — upstream nests the two, so keep them as separate elements rather than one element carrying both classes. Trailing actions: the collapse-all / expand-all IconButton sm (only while a collapsible group list is on screen) and the list-options IconButton sm, which opens the <code>Menu</code> holding the view mode (grouped / flat) and the workspace sort order. Both are hover/focus-revealed</td></tr>
                <tr><td>Workspace head / session row</td><td>see next two sections</td><td>share <code>--sb-*</code> alignment</td></tr>
                <tr><td>Account footer</td><td>account row (custom) + settings <code>IconButton</code></td><td>pinned row under the session list, separated by a 1px <code>--line</code> top border; the row shows a user icon + the account name ("Not signed in" without a credential) and opens the settings surface — no auth flow starts here; the settings button sits on the row's trailing edge</td></tr>
              </tbody>
            </table>
            <div class="callout warn"><span class="ico">!</span><div>
              <b>Why New session / search / inline rename don't use Button / Input:</b> they are "list-style" controls (full-width, left-aligned, compact, borderless), while Button is centered and Input is a 38px bordered control — forcing them in would break the sidebar's visual density and alignment. This is an intentional custom exception, not an oversight.
            </div></div>

            <h3 class="sub">Session row</h3>
            <p>A session row is an inset rounded pill, structured as: <code>status slot → title → time → attention Badge → kebab</code>, with the hover-revealed pin / archive actions floating over the trailing slot's left edge.</p>
            <table class="dt">
              <thead><tr><th>Part</th><th>Rule</th></tr></thead>
              <tbody>
                <tr><td>Container</td><td><code>padding: 8px 8px</code> inside the list's <code>--sb-inset</code> gutter, <code>radius-sm</code>; <b>no fixed/min height</b> — row height is font-driven (title <code>line-height: --leading-tight</code>, ≈16px) → ≈32px total, the sidebar-wide row rhythm. The hover kebab is absolutely positioned so it never forces the row taller (no hover jitter). hover = <code>--sb-hover</code> (the global <code>--color-hover</code> wash); active = <code>--color-selected</code> — neutral, no accent tint, no border, no weight change. The list and the pinned scroller both reserve their scrollbar track with <code>scrollbar-gutter: stable</code>, so the browser's own bar never reflows a row when it appears; the track stays on the right only, because <code>both-edges</code> reserves a second gutter on the left and pushes the rows off the panel's inset grid</td></tr>
                <tr><td>Status slot (lead)</td><td>fixed <code>--sb-gutter</code> width; running = <code>Spinner</code> sm, otherwise unread = 7px accent dot</td></tr>
                <tr><td>Title</td><td>flex:1, clipped rather than ellipsised: <code>text-overflow: clip</code> plus a mask that fades the title's right end (16px at rest, 34px under the pointer, resting band kept on a row with a trailing badge). A title wider than its slot scrolls while the pointer is on the row. Double-click enters inline rename (compact input, not Input)</td></tr>
                <tr><td>Time</td><td>mono xs, <code>fg-faint</code>; yields to the kebab on hover</td></tr>
                <tr><td>Attention Badge</td><td><code>Badge</code> sm: info (needs answer) / warning (needs approval) / danger (aborted)</td></tr>
                <tr><td>Inline actions</td><td>pin + archive <code>IconButton</code> sm, absolutely positioned immediately left of the kebab and revealed with it (Done rows read as reopen). The layer backs itself with the row's own background — the sidebar surface plus the row wash, or the neutral selected fill — so the overlapped title tail and badges don't bleed through. Hovering the row changes neither its height nor the title's available width</td></tr>
                <tr><td>kebab</td><td><code>IconButton</code> sm, shown on hover; keeps the full menu (copy id, rename, emoji, pin, fork, export, archive / reopen, delete, last-active); dropdown uses <code>Menu/MenuItem</code></td></tr>
                <tr><td>Archive confirmation</td><td>replaces the title area, <code>Button</code> sm (danger confirm / secondary cancel)</td></tr>
              </tbody>
            </table>
            <p><b>The title's fade.</b> A title wider than its slot is clipped rather than ellipsised, on the reference build's own rule: <code>text-overflow: clip</code> plus a mask, so the text reads as continuing under the row's trailing edge instead of ending there. The band is two tokens, <code>--sb-fade</code> and <code>--sb-fade-len</code>: <code>0px</code> and <code>16px</code> at rest, <code>34px</code> and <code>26px</code> under <code>.se:hover .t</code>, and back to <code>0px</code> and <code>16px</code> on a row carrying a badge (<code>.se.has-badge:hover .t</code>, where the trailing tag already holds the title clear of the pin / archive buttons). The gradient lives in the token <code>--sb-vignette</code>, because the style guard rejects a bare gradient in a rendered property; only its alpha is read, so the stop colour is the theme's opaque <code>--color-text-strong</code>.</p>
            <p><b>The hover scroll</b> is this fork's own addition, and the reference build has no equivalent. On pointer entry the title's inner span translates left by its own overflow plus a 60px band, over <code>max(600ms, travel / 40px per second)</code>, at a reading pace rather than a transition; the return leg is 180ms, short enough that the next hover starts from the same place without a visible rewind. The band is added to the travel so the title's tail comes to rest where the mask is still opaque: stopping at the overflow alone parks it under the hover buttons and inside the fade. The travel is a transform on the inner span and the row keeps its layout, so the row, the time and the kebab hold their exact rects whether or not the pointer is on the row. A title that fits writes nothing and never moves; a row inside the pinned list never scrolls, because that scroller carries its own mask; and <code>prefers-reduced-motion: reduce</code> drops the transform while keeping the mask.</p>

            <h3 class="sub">Workspace group</h3>
            <p>The group head and session rows share <code>--sb-*</code>: folder icon (open/closed) → name, with the kebab and "+" revealed on hover.</p>
            <ul class="clean">
              <li>The folder icon leads the row (switching icons between open and closed states) with the plain <code>--sb-gap</code> before the name — it does not pad out the <code>--sb-gutter</code> slot.</li>
              <li>The name is quiet by design — regular weight, muted color (<code>--color-text-muted</code>, one step lighter than session titles), so group heads read as grouping labels. No path subtitle; hovering the name shows the full root path in a <code>Tooltip</code>.</li>
              <li>The kebab (menu) and "+" (new chat in this workspace) both use <code>IconButton</code> sm inside a floating actions layer anchored to the row's right edge — no reserved layout space, so the name uses the full row width when idle. Shown on hover, keyboard focus, or while the menu is open; the layer backs itself with the sidebar surface (container background) plus the row hover wash (an <code>::after</code> shown only while the row is hovered), so its color exactly equals the row's current background and the overlapped name tail doesn't bleed through (hidden via <code>opacity:0</code>, staying in the tab order).</li>
              <li>The group is collapsible; when collapsed its session list is hidden.</li>
            </ul>

            <h3 class="sub">Show more &amp; collapse</h3>
            <p>The "load more / show less" control at the bottom of each workspace group is a session-row-shaped compact list control (same family as search, New session, inline rename — not a Button). It doubles as the pagination trigger and the in-group expand / collapse toggle.</p>
            <table class="dt">
              <thead><tr><th>Part</th><th>Rule</th></tr></thead>
              <tbody>
                <tr><td class="tk">Container</td><td>session-row pill: <code>display:flex; gap:--sb-gap; padding:8px …</code>, <b>no fixed/min height</b> (font-driven, ≈32px like a session row), same padding as a session row, <code>radius-sm</code>; hover = <code>--sb-hover</code> (no text recolor); <code>:focus-visible</code> uses <code>--p-focus-ring</code></td></tr>
                <tr><td class="tk">Lead slot</td><td>empty, <code>--sb-gutter</code> wide, so the label's start x aligns with the session titles (<code>--sb-pad-x + --sb-gutter + --sb-gap</code>)</td></tr>
                <tr><td class="tk">Label</td><td><code>font-ui</code>, <code>text-xs</code>, <code>--color-text</code>; flex:1, truncated</td></tr>
                <tr><td class="tk">Behavior</td><td>"Load more" fetches the next page and auto-expands; once more than the first page is loaded, "Show less" appears and collapses back to the first page (view-layer trim — data is kept, no refetch); "Show all" re-expands</td></tr>
              </tbody>
            </table>

            <h3 class="sub">ResizeHandle</h3>
            <p>A 4px vertical drag bar, layered over the 1px column border (<code>margin: 0 -2px</code> makes the whole 4px grabbable), turning accent on hover / drag.</p>
            <table class="dt">
              <thead><tr><th>Rule</th><th>Value</th></tr></thead>
              <tbody>
                <tr><td>Width / cursor</td><td>4px / <code>col-resize</code></td></tr>
                <tr><td>Normal / active</td><td>transparent / <code>accent</code> fill</td></tr>
                <tr><td>Layer</td><td><code>--z-dropdown</code>, above pane-level sticky chrome (chat dock at <code>--z-sticky</code>) so the overhang stays visible and grabbable</td></tr>
                <tr><td>Behavior</td><td>panel width follows the pointer 1:1 while dragging (the parent disables transitions to avoid lag); on release it is persisted to localStorage</td></tr>
              </tbody>
            </table>

            <h3 class="sub">Right panel</h3>
            <p>The right panels (file preview / Diff / thinking / sub-agent / side chat) share one track and one head primitive.</p>
            <ul class="clean">
              <li>The panel head uses the <code>PanelHeader</code> primitive (48px = <code>--panel-head-h</code>), the same height as the conversation column head, so the hairline runs as one line.</li>
              <li>Panel head: bold mono title + optional muted subtitle + middle slot (Badge / control / path) + close IconButton on the right.</li>
              <li>The panel width animates in both directions over <code>--duration-slow</code>: from <code>0 → var(--preview-w)</code> when it opens, smoothly squeezing the conversation column, and back out over the same 260ms when it closes. The <code>sliding</code> class carries that transition and is set on the close as well as the open; it comes off when the transition ends, which keeps a resize drag immediate. A phone never slides: the panel is a fixed full-viewport overlay there and its closed state is <code>display: none</code>, so a width transition would have nothing to draw.</li>
              <li>At ≤640px the panel becomes a full-screen overlay (<code>position:fixed; inset:0</code>).</li>
            </ul>

            <div class="callout info"><span class="ico">i</span><div>
              <b>One-sentence principle:</b> the sidebar / shell is a "list + grid" skeleton that reuses the §02 tokens and §03 primitives (Button / IconButton / Badge / Kbd / Menu / Spinner / PanelHeader); compact list controls that don't fit a primitive (search, New session, inline rename, show-more) keep their custom form, governed by this section.
            </div></div>
          </section>

          <!-- ===== 08 Accessibility A11y ===== -->
          <section id="a11y">
            <div class="sec-head">
              <span class="sec-num">08</span>
              <h2 class="sec-title">Accessibility (pragmatic edition)</h2>
            </div>
            <p class="sec-desc">
              Kimi Web is a local developer tool; it <b>does not target a specific WCAG conformance level</b>, nor maintain a full screen-reader QA matrix.
              This section collects only the rules that are "low-cost, don't hurt the look, and directly benefit keyboard-heavy users", as the baseline contract for each primitive;
              the more expensive, lower-ROI parts (such as real-time announcement orchestration for streaming output) are not mandatory for now.
            </p>

            <div class="callout info"><span class="ico">i</span><div>
              <b>On the "ugly" focus ring:</b> the focus visibility required below always uses <code>:focus-visible</code> (not <code>:focus</code>).
              It appears <b>only on keyboard focus</b>; mouse clicks don't trigger it, so it doesn't pollute the mouse-driven visual; the ring's strength is tuned uniformly with <code>--p-focus-ring</code>, not overridden per place.
            </div></div>

            <h4 class="mini">1. Contrast &amp; color</h4>
            <ul class="clean">
              <li>Body text vs. background contrast <b>≥ 4.5:1</b>; control borders, icons, and key graphics <b>≥ 3:1</b>. When changing theme colors / dark mode, verify against §05 together.</li>
              <li><b>Button text vs. button background</b>, and <b>form controls</b> (input, placeholder, helper / error text) <b>vs. their section background</b> must all have contrast ≥ 4.5:1 (large text ≥ 3:1). White-on-white text, a transparent borderless button floating over the page background, and a light placeholder on a near-white background are all flagged by the style rules.</li>
              <li><b>State is not conveyed by color alone.</b> Error, selected, and disabled states also carry text, an icon, or a shape change (for example an error state is not just red, but also carries text or an icon).</li>
            </ul>

            <h4 class="mini">2. Keyboard operable</h4>
            <p>Anything doable with a mouse must also be doable with a keyboard; Tab order follows the DOM, with no invented skipping. Composite controls define their keyboard model per the table below; a missing model is treated as incomplete:</p>
            <table class="dt">
              <thead><tr><th>Control</th><th>Keyboard behavior</th></tr></thead>
              <tbody>
                <tr><td class="tk">Dialog</td><td><code>Tab</code> cycles within the dialog (focus trap); <code>Esc</code> closes; focus returns to the trigger element after closing.</td></tr>
                <tr><td class="tk">Menu</td><td><code>↑</code> / <code>↓</code> move the highlight, <code>Enter</code> selects, <code>Esc</code> closes.</td></tr>
                <tr><td class="tk">Tabs</td><td><code>←</code> / <code>→</code> switch tabs (roving tabindex); only the current tab is in the Tab sequence.</td></tr>
                <tr><td class="tk">Switch / Segmented</td><td><code>←</code> / <code>→</code> or <code>Space</code> / <code>Enter</code> to toggle.</td></tr>
              </tbody>
            </table>

            <h4 class="mini">3. Focus visibility</h4>
            <ul class="clean">
              <li>Every interactive element must have a visible focus indicator on keyboard focus, uniformly via <code>:focus-visible</code> + <code>--p-focus-ring</code> (primary actions may use <code>--p-focus-ring-strong</code>).</li>
              <li>Bare <code>outline: none</code> is forbidden. To remove the default outline, you must provide an equivalent replacement style.</li>
            </ul>

            <h4 class="mini">4. Labels &amp; semantics</h4>
            <ul class="clean">
              <li><b>Semantic HTML first</b> (button / a / input / dialog…); ARIA is added only when native semantics fall short.</li>
              <li>Icon-only buttons must have an <code>aria-label</code> — <code>IconButton</code> already enforces this with a required <code>label</code> prop.</li>
              <li>Dialog: <code>role="dialog"</code> + <code>aria-modal="true"</code>, with the title as the dialog's accessible name.</li>
              <li>Purely decorative SVG / icons get <code>aria-hidden="true"</code> to avoid being read out by screen readers.</li>
            </ul>

            <h4 class="mini">5. Target size</h4>
            <p>Desktop click targets <b>≥ 32px</b>; touch devices <b>≥ 44px</b> (consistent with the §01 principle and the IconButton <code>lg</code> tier).</p>

            <h4 class="mini">6. Reduced motion</h4>
            <p>Handled uniformly in the global styles per §02's <code>@media (prefers-reduced-motion: reduce)</code>; components do not check this individually. The MoonSpinner moon phase pauses on the current frame, and the spring transitions snap (including the §02 spring presets, which collapse to a still curve, so no menu / dialog travels).</p>

            <h4 class="mini">6b. Reduced transparency &amp; increased contrast</h4>
            <p>Both are contracts of the <b>material system</b>, not per-component rules (see §02 "Surface material"). The whole material sits inside <code>@media (prefers-reduced-transparency: no-preference)</code>, so <code>reduce</code> renders the app's own opaque design and nothing else consults the feature. Under <code>prefers-contrast: more</code> the material thickens <code>--lg-edge</code> and steps <code>--lg-shadow</code> up one level, leaving the tint alone. Add a new surface to the elevation and line tokens in <code>style.css</code> rather than writing an accessibility override inside a component.</p>

            <h4 class="mini">7. Live announcements (non-mandatory)</h4>
            <p>Screen-reader announcements are <b>not a mandatory contract</b> in this product. Short hints like Toast can use <code>role="status"</code> / <code>aria-live</code>; chat streaming output is currently not announced word-by-word, which is an acceptable trade-off, to be added later if a real need arises.</p>

            <div class="callout good"><span class="ico">✓</span><div>
              <b>Explicitly not mandatory for now:</b> a WCAG conformance-level claim, a complete ARIA pattern table, a per-screen-reader QA matrix, and real-time announcement orchestration for streaming output — these are not written into the primitive contract, to avoid becoming slogans no one maintains.
            </div></div>
          </section>

        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* =====================================================================
   Document framework styles (ported from design/design-system.html).
   The private --d-* tokens alias to the product tokens in style.css so
   this spec page follows the product theme automatically.
   ===================================================================== */
  /* =====================================================================
     Document's own design tokens (used only to render this proposal page;
     decoupled from product tokens)
     ===================================================================== */
  .ds-page {
    --d-bg: var(--color-bg);
    --d-surface: var(--color-surface);
    --d-surface-2: var(--color-surface-sunken);
    --d-surface-3: var(--color-line);
    --d-fg: var(--color-text);
    --d-fg-soft: var(--color-text-muted);
    --d-fg-muted: var(--color-text-muted);
    --d-fg-faint: var(--color-text-faint);
    --d-line: var(--color-line);
    --d-line-2: var(--color-line);
    --d-accent: var(--color-accent);
    --d-accent-2: var(--color-accent-hover);
    --d-accent-soft: var(--color-accent-soft);
    --d-accent-bd: var(--color-accent-bd);
    --d-green: var(--color-success);
    --d-green-soft: var(--color-success-soft);
    --d-amber: var(--color-warning);
    --d-amber-soft: var(--color-warning-soft);
    --d-red: var(--color-danger);
    --d-red-soft: var(--color-danger-soft);
    --d-violet: var(--color-done);
    --d-code-bg: var(--color-surface-sunken);
    --d-sidebar: var(--color-surface);
    --d-shadow-sm: var(--shadow-sm);
    --d-shadow-md: var(--shadow-md);
    --d-shadow-lg: var(--shadow-lg);
    --sidebar-w: var(--p-sidebar-w);
    --content-max: var(--p-content-wide);
  }

  .ds-page *, .ds-page *::before, .ds-page *::after { box-sizing: border-box }
  .ds-page { scroll-behavior: smooth }
  .ds-page {
    margin: 0;
    background: var(--d-bg);
    color: var(--color-text);
    font-family: var(--font-ui);
    font-size: var(--text-base);
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  h1, h2, h3, h4 { color: var(--d-fg); letter-spacing: -.01em; line-height: 1.25; margin: 0; }
  p { margin: 0 0 14px; color: var(--d-fg-soft); }
  a { color: var(--d-accent-2); text-decoration: none; }
  a:hover { text-decoration: underline; }
  code, pre, .mono { font-family: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  code {
    background: var(--d-code-bg);
    border: 1px solid var(--d-line-2);
    border-radius: 5px;
    padding: 1px 6px;
    font-size: .88em;
    color: #1f2937;
    white-space: nowrap;
  }

  /* ---------- Layout ---------- */
  .layout { display: grid; grid-template-columns: var(--sidebar-w) minmax(0, 1fr); min-height: 100vh; }
  .sidebar {
    position: sticky; top: 0; align-self: start; height: 100vh;
    background: var(--d-sidebar); border-right: 1px solid var(--d-line);
    padding: 26px 22px; overflow-y: auto;
  }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .brand-mark {
    width: 26px; height: 26px; border-radius: 7px; flex: none;
    background: var(--d-fg); color: #fff; display: grid; place-items: center;
    font-weight: 800; font-size: 14px; letter-spacing: -.04em;
  }
  .brand-name { font-weight: 700; font-size: 15px; letter-spacing: -.01em; }
  .brand-sub { font-size: 12px; color: var(--d-fg-faint); margin-bottom: 26px; padding-left: 36px; }
  .nav-group { margin: 22px 0 8px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--d-fg-faint); }
  .p-section-label { font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--d-fg-faint); }
  .nav a {
    display: flex; align-items: center; gap: 9px; padding: 7px 10px; border-radius: 7px;
    font-size: 13.5px; font-weight: 500; color: var(--d-fg-soft); margin: 1px 0;
    transition: background .15s, color .15s;
  }
  .nav a .num { font-family: "JetBrains Mono", monospace; font-size: 11px; color: var(--d-fg-faint); width: 18px; }
  .nav a:hover { background: var(--d-surface-2); color: var(--d-fg); text-decoration: none; }
  .nav a.active { background: var(--d-accent-soft); color: var(--d-accent-2); }
  .nav a.active .num { color: var(--d-accent-2); }

  .content { min-width: 0; }
  .content-inner { max-width: var(--content-max); margin: 0 auto; padding: 64px 56px 120px; }
  section { scroll-margin-top: 32px; padding-top: 8px; }
  section + section { margin-top: 72px; }

  /* ---------- Hero ---------- */
  .hero { padding: 8px 0 40px; border-bottom: 1px solid var(--d-line); margin-bottom: 56px; }
  .eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    font-family: "JetBrains Mono", monospace; font-size: 12px; font-weight: 600; letter-spacing: .04em;
    color: var(--d-fg); background: rgba(23,131,255,.1); border: none;
    padding: 6px 12px; border-radius: 8px; margin-bottom: 22px;
  }
  .hero h1 { font-size: 48px; font-weight: 600; line-height: 1.08; letter-spacing: -.025em; margin-bottom: 18px; }
  .hero h1 .grad { color: var(--d-accent); }
  .hero p.lead { font-size: 18px; line-height: 1.6; color: var(--d-fg-soft); max-width: 680px; }
  .hero-meta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 28px; }
  .meta-chip {
    display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--d-fg-muted);
    background: var(--d-surface); border: 1px solid var(--d-line); border-radius: 8px; padding: 7px 12px;
  }
  .meta-chip b { color: var(--d-fg); font-weight: 600; }
  .meta-chip .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--d-green); }

  /* ---------- General typography ---------- */
  .sec-head { display: flex; align-items: baseline; gap: 14px; margin-bottom: 8px; }
  .sec-num { font-family: "JetBrains Mono", monospace; font-size: 13px; font-weight: 600; color: var(--d-accent-2); }
  .sec-title { font-size: 26px; letter-spacing: -.02em; }
  .sec-desc { font-size: 15.5px; color: var(--d-fg-muted); max-width: 720px; margin-bottom: 28px; }
  h3.sub { font-size: 17px; margin: 40px 0 14px; display: flex; align-items: center; gap: 10px; }
  h3.sub::before { content: ""; width: 4px; height: 16px; border-radius: 2px; background: var(--d-accent); }
  h4.mini { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--d-fg-muted); margin: 24px 0 12px; }

  /* ---------- Stat cards / metrics ---------- */
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 24px 0; }
  .stat { background: var(--d-surface); border: 1px solid var(--d-line); border-radius: 14px; padding: 18px 18px 16px; }
  .stat .v { font-size: 34px; font-weight: 800; letter-spacing: -.03em; line-height: 1; color: var(--d-fg); }
  .stat .v small { font-size: 16px; color: var(--d-fg-muted); font-weight: 600; }
  .stat .l { font-size: 12.5px; color: var(--d-fg-muted); margin-top: 8px; line-height: 1.4; }
  .stat.warn { background: var(--d-amber-soft); border-color: #f0d9b8; }
  .stat.warn .v { color: var(--d-amber); }
  .stat.bad { background: var(--d-red-soft); border-color: #f0cccc; }
  .stat.bad .v { color: var(--d-red); }
  .stat.good { background: var(--d-green-soft); border-color: #bfe3cc; }
  .stat.good .v { color: var(--d-green); }

  /* ---------- Cards / panels ---------- */
  .panel { background: var(--d-bg); border: 1px solid var(--d-line); border-radius: 16px; box-shadow: var(--d-shadow-sm); }
  .panel-pad { padding: 22px; }
  .panel-soft { background: var(--d-surface); border: 1px solid var(--d-line); border-radius: 14px; }
  .callout {
    display: flex; gap: 12px; padding: 14px 16px; border-radius: 12px; font-size: 14px; line-height: 1.55;
    background: var(--d-surface); border: 1px solid var(--d-line); color: var(--d-fg-soft); margin: 18px 0;
  }
  .callout .ico { flex: none; width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; font-size: 12px; font-weight: 800; }
  .callout.info { background: var(--d-accent-soft); border-color: var(--d-accent-bd); }
  .callout.info .ico { background: var(--d-accent); color: #fff; }
  .callout.warn { background: var(--d-amber-soft); border-color: #f0d9b8; }
  .callout.warn .ico { background: var(--d-amber); color: #fff; }
  .callout.good { background: var(--d-green-soft); border-color: #bfe3cc; }
  .callout.good .ico { background: var(--d-green); color: #fff; }

  /* ---------- Tables ---------- */
  table.dt { width: 100%; border-collapse: collapse; font-size: 13.5px; margin: 16px 0; }
  table.dt th { text-align: left; font-size: 11.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--d-fg-faint); font-weight: 700; padding: 10px 12px; border-bottom: 1px solid var(--d-line); }
  table.dt td { padding: 11px 12px; border-bottom: 1px solid var(--d-line-2); color: var(--d-fg-soft); vertical-align: middle; }
  table.dt tr:last-child td { border-bottom: none; }
  table.dt td.tk { font-family: "JetBrains Mono", monospace; font-size: 12.5px; color: var(--d-fg); white-space: nowrap; }
  table.dt td.val { font-family: "JetBrains Mono", monospace; font-size: 12px; color: var(--d-fg-muted); }
  .swatch { display: inline-block; width: 16px; height: 16px; border-radius: 4px; border: 1px solid rgba(0,0,0,.08); vertical-align: -3px; margin-right: 8px; }

  /* ---------- Color swatches ---------- */
  .palette { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
  .color-card { border: 1px solid var(--d-line); border-radius: 12px; overflow: hidden; background: var(--d-bg); }
  .color-chip { height: 56px; border-bottom: 1px solid var(--d-line); }
  .color-meta { padding: 10px 12px 12px; }
  .color-meta .cn { font-size: 13px; font-weight: 600; color: var(--d-fg); }
  .color-meta .cv { font-family: "JetBrains Mono", monospace; font-size: 11.5px; color: var(--d-fg-muted); margin-top: 2px; }

  /* ---------- Type scale ---------- */
  .type-row { display: flex; align-items: baseline; gap: 18px; padding: 13px 0; border-bottom: 1px solid var(--d-line-2); }
  .type-row:last-child { border-bottom: none; }
  .type-sample { flex: 1; color: var(--d-fg); line-height: 1.2; }
  .type-meta { width: 190px; flex: none; text-align: right; font-family: "JetBrains Mono", monospace; font-size: 12px; color: var(--d-fg-muted); }

  /* ---------- Spacing / radius ---------- */
  .space-row { display: flex; align-items: center; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--d-line-2); }
  .space-row:last-child { border-bottom: none; }
  .space-bar { height: 18px; border-radius: 4px; background: linear-gradient(90deg, var(--d-accent), var(--d-accent-2)); flex: none; }
  .space-meta { font-family: "JetBrains Mono", monospace; font-size: 12.5px; color: var(--d-fg-soft); width: 150px; }
  .space-use { font-size: 12.5px; color: var(--d-fg-muted); }
  .radius-grid { display: flex; flex-wrap: wrap; gap: 22px; align-items: flex-end; margin: 16px 0; }
  .radius-item { display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .radius-box { width: 64px; height: 64px; border: 2px solid var(--d-accent); background: var(--d-accent-soft); }
  .radius-item .rl { font-family: "JetBrains Mono", monospace; font-size: 12px; color: var(--d-fg-soft); }

  /* ---------- Component stage ---------- */
  .stage-wrap { border: 1px solid var(--d-line); border-radius: 16px; overflow: hidden; margin: 18px 0; background: var(--d-bg); box-shadow: var(--d-shadow-sm); }
  .stage-bar { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--d-line); background: var(--d-surface); }
  .stage-bar .st { font-size: 13px; font-weight: 600; color: var(--d-fg); display: flex; align-items: center; gap: 8px; }
  .stage-bar .st .tag { font-size: 10.5px; font-weight: 700; letter-spacing: .04em; padding: 2px 7px; border-radius: 999px; }
  .tag.after { background: var(--d-green-soft); color: var(--d-green); }
  .tag.before { background: var(--d-red-soft); color: var(--d-red); }
  .tag.spec { background: var(--d-accent-soft); color: var(--d-accent-2); }
  .stage-bar .sactions { display: flex; gap: 6px; }
  .tab { font-family: "JetBrains Mono", monospace; font-size: 11.5px; padding: 4px 10px; border-radius: 6px; color: var(--d-fg-muted); cursor: default; }
  .tab.on { background: var(--d-bg); color: var(--d-fg); border: 1px solid var(--d-line); }
  .stage {
    padding: 32px; display: flex; flex-wrap: wrap; align-items: center; gap: 16px;
    background:
      radial-gradient(circle at 1px 1px, rgba(0,0,0,.045) 1px, transparent 0) 0 0 / 18px 18px,
      var(--d-surface);
  }
  .stage.col { flex-direction: column; align-items: stretch; }
  .stage.dark {
    background:
      radial-gradient(circle at 1px 1px, rgba(255,255,255,.06) 1px, transparent 0) 0 0 / 18px 18px,
      #0d1117;
  }
  .stage-label { width: 100%; font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--d-fg-faint); margin-bottom: -6px; }
  .stage.dark .stage-label { color: #6b7280; }

  /* ---------- Before / After ---------- */
  .ba { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid var(--d-line); border-radius: 16px; overflow: hidden; margin: 18px 0; box-shadow: var(--d-shadow-sm); }
  .ba-col { min-width: 0; }
  .ba-col + .ba-col { border-left: 1px solid var(--d-line); }
  .ba-head { display: flex; align-items: center; justify-content: space-between; padding: 11px 16px; border-bottom: 1px solid var(--d-line); }
  .ba-head.before { background: var(--d-red-soft); }
  .ba-head.after { background: var(--d-green-soft); }
  .ba-head .bh { font-size: 13px; font-weight: 700; }
  .ba-head.before .bh { color: var(--d-red); }
  .ba-head.after .bh { color: var(--d-green); }
  .ba-head .bh small { font-weight: 500; opacity: .7; margin-left: 6px; }
  .ba-body { padding: 24px; background: var(--d-surface); min-height: 120px; }
  .ba-col.after .ba-body { background: #fff; }

  /* ---------- Code block ---------- */
  .code { background: #0d1117; border-radius: 12px; overflow: hidden; margin: 16px 0; border: 1px solid #1c2128; }
  .code-bar { display: flex; align-items: center; gap: 8px; padding: 9px 14px; background: #161b22; border-bottom: 1px solid #1c2128; }
  .code-bar .d { width: 10px; height: 10px; border-radius: 50%; background: #30363d; }
  .code-bar .fn { font-family: "JetBrains Mono", monospace; font-size: 11.5px; color: #8b949e; margin-left: 4px; }
  .code pre { margin: 0; padding: 18px; overflow-x: auto; font-size: 12.5px; line-height: 1.7; color: #c9d1d9; }
  .code .c { color: #8b949e; }
  .code .k { color: #ff7b72; }
  .code .s { color: #a5d6ff; }
  .code .p { color: #79c0ff; }
  .code .n { color: #d2a8ff; }
  .code .v { color: #ffa657; }

  /* ---------- Tag / pill (document use) ---------- */
  .pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--d-line); background: var(--d-surface); color: var(--d-fg-soft); }
  .pill.blue { background: var(--d-accent-soft); border-color: var(--d-accent-bd); color: var(--d-accent-2); }
  .pill.green { background: var(--d-green-soft); border-color: #bfe3cc; color: var(--d-green); }
  .pill.amber { background: var(--d-amber-soft); border-color: #f0d9b8; color: var(--d-amber); }
  .pill.red { background: var(--d-red-soft); border-color: #f0cccc; color: var(--d-red); }
  .pill.mono { font-family: "JetBrains Mono", monospace; }

  /* ---------- Lists ---------- */
  ul.clean { list-style: none; padding: 0; margin: 14px 0; }
  ul.clean li { position: relative; padding: 8px 0 8px 26px; color: var(--d-fg-soft); border-bottom: 1px solid var(--d-line-2); }
  ul.clean li:last-child { border-bottom: none; }
  ul.clean li::before { content: ""; position: absolute; left: 4px; top: 17px; width: 7px; height: 7px; border-radius: 50%; background: var(--d-accent); }
  ul.clean.check li::before { content: "✓"; background: none; color: var(--d-green); font-weight: 800; top: 7px; left: 0; font-size: 14px; }
  ul.clean.cross li::before { content: "✕"; background: none; color: var(--d-red); font-weight: 800; top: 7px; left: 0; font-size: 13px; }
  ul.clean li b { color: var(--d-fg); }
  ul.clean li .path { font-family: "JetBrains Mono", monospace; font-size: 12px; color: var(--d-fg-muted); }

  /* ---------- Timeline / migration plan ---------- */
  .roadmap { position: relative; margin: 24px 0; }
  .phase { position: relative; display: grid; grid-template-columns: 120px 1fr; gap: 24px; padding: 0 0 32px; }
  .phase:not(:last-child)::after { content: ""; position: absolute; left: 59px; top: 36px; bottom: 0; width: 2px; background: var(--d-line); }
  .phase-tag { text-align: right; padding-top: 4px; }
  .phase-tag .pt { display: inline-block; font-family: "JetBrains Mono", monospace; font-size: 12px; font-weight: 700; color: var(--d-accent-2); background: var(--d-accent-soft); border: 1px solid var(--d-accent-bd); padding: 5px 10px; border-radius: 8px; }
  .phase-tag .pe { font-size: 11.5px; color: var(--d-fg-faint); margin-top: 8px; }
  .phase-body { background: var(--d-bg); border: 1px solid var(--d-line); border-radius: 14px; padding: 18px 20px; box-shadow: var(--d-shadow-sm); }
  .phase-body h4 { font-size: 16px; margin-bottom: 8px; }
  .phase-body p { font-size: 14px; margin-bottom: 12px; }
  .phase-body ul { margin: 0; }

  /* ---------- Anti-pattern matrix ---------- */
  .matrix { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 16px 0; }
  .anti { border: 1px solid var(--d-line); border-radius: 12px; padding: 16px; background: var(--d-bg); }
  .anti .ah { display: flex; align-items: center; gap: 9px; font-size: 14px; font-weight: 700; margin-bottom: 8px; }
  .anti .ah .verdict { margin-left: auto; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 999px; }
  .verdict.pass { background: var(--d-green-soft); color: var(--d-green); }
  .verdict.fail { background: var(--d-red-soft); color: var(--d-red); }
  .verdict.warn { background: var(--d-amber-soft); color: var(--d-amber); }
  .anti p { font-size: 13px; margin: 0; color: var(--d-fg-muted); }

  /* ---------- Footnote ---------- */
  .footer { margin-top: 80px; padding-top: 28px; border-top: 1px solid var(--d-line); font-size: 13px; color: var(--d-fg-faint); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .kbd { font-family: "JetBrains Mono", monospace; font-size: 11px; background: var(--d-surface-2); border: 1px solid var(--d-line); border-bottom-width: 2px; border-radius: 5px; padding: 1px 6px; }

  @media (max-width: 980px) {
    .layout { grid-template-columns: 1fr; }
    .sidebar { position: static; height: auto; }
    .nav { display: flex; flex-wrap: wrap; gap: 4px; }
    .content-inner { padding: 40px 22px 80px; }
    .stat-grid { grid-template-columns: repeat(2, 1fr); }
    .ba { grid-template-columns: 1fr; }
    .ba-col + .ba-col { border-left: none; border-top: 1px solid var(--d-line); }
    .palette { grid-template-columns: repeat(2, 1fr); }
    .matrix { grid-template-columns: 1fr; }
  }

/* =====================================================================
   Component preview styles (ported from design/design-system.html).
   The private --p-* tokens alias to the product tokens; the ~1900 lines
   of component CSS below are kept verbatim. The [data-p="dark"] block
   keeps its literal hex because it is a forced dark preview, not a token.
   ===================================================================== */
  /* ---- Proposal tokens: default = modern / light ---- */
  .ds-page .p, .ds-page .stage.p-skin, .ds-page [data-p] {
    --p-font-sans: var(--font-ui);
    --p-font-mono: var(--font-mono);
    --p-bg: var(--color-bg);
    --p-surface: var(--color-surface);
    --p-surface-raised: var(--color-surface-raised);
    --p-surface-sunken: var(--color-surface-sunken);
    --p-text: var(--color-text);
    --p-text-muted: var(--color-text-muted);
    --p-text-faint: var(--color-text-faint);
    --p-text-on-accent: var(--color-text-on-accent);
    --p-line: var(--color-line);
    --p-line-strong: var(--color-line-strong);
    --p-accent: var(--color-accent);
    --p-accent-hover: var(--color-accent-hover);
    --p-accent-soft: var(--color-accent-soft);
    --p-accent-bd: var(--color-accent-bd);
    --p-success: var(--color-success); --p-success-soft: var(--color-success-soft); --p-success-bd: var(--color-success-bd);
    --p-warning: var(--color-warning); --p-warning-soft: var(--color-warning-soft); --p-warning-bd: var(--color-warning-bd);
    --p-danger: var(--color-danger); --p-danger-soft: var(--color-danger-soft); --p-danger-bd: var(--color-danger-bd);
    --p-info: var(--color-info);
    --p-sp-1: var(--space-1); --p-sp-2: var(--space-2); --p-sp-3: var(--space-3); --p-sp-4: var(--space-4); --p-sp-5: var(--space-5); --p-sp-6: var(--space-6); --p-sp-8: var(--space-8);
    --p-r-xs: var(--radius-xs); --p-r-sm: var(--radius-sm); --p-r-md: var(--radius-md); --p-r-lg: var(--radius-lg); --p-r-xl: var(--radius-xl); --p-r-2xl: var(--radius-2xl); --p-r-full: var(--radius-full);
    --p-sh-xs: var(--shadow-xs);
    --p-sh-sm: var(--shadow-sm);
    --p-sh-md: var(--shadow-md);
    --p-sh-lg: var(--shadow-lg);
    --p-sh-xl: var(--shadow-xl);
    --p-font-size-xs: var(--text-xs); --p-font-size-sm: var(--text-sm); --p-font-size-base: var(--text-base); --p-font-size-md: var(--text-base); --p-font-size-lg: var(--text-lg); --p-font-size-xl: var(--text-xl); --p-font-size-2xl: var(--text-2xl);
    --p-leading-tight: var(--leading-tight); --p-leading-normal: var(--leading-normal); --p-leading-relaxed: var(--leading-relaxed);
    --p-ease: var(--ease-out);
    --p-ease-inout: var(--ease-in-out);
    --p-dur-fast: var(--duration-fast); --p-dur: var(--duration-base); --p-dur-slow: var(--duration-slow);
    font-family: var(--font-ui); color: var(--color-text); font-size: var(--text-base);
  }
  /* ---- Dark skin overrides ---- */
  .ds-page [data-p="dark"] {
    --p-bg: #0d1117; --p-surface: #161b22; --p-surface-raised: #1c2128; --p-surface-sunken: #0d1117;
    --p-text: #c9cdd4; --p-text-muted: #9aa0a8; --p-text-faint: #6b7280;
    --p-text-on-accent: #ffffff;
    --p-line: #2d333b; --p-line-strong: #3d444d;
    --p-accent: #58a6ff; --p-accent-hover: #79b8ff; --p-accent-soft: rgba(88,166,255,.14); --p-accent-bd: rgba(88,166,255,.28);
    --p-success: #3fb950; --p-success-soft: rgba(63,185,80,.14); --p-success-bd: rgba(63,185,80,.28);
    --p-warning: #d29922; --p-warning-soft: rgba(210,153,34,.14); --p-warning-bd: rgba(210,153,34,.28);
    --p-danger: #f85149;  --p-danger-soft: rgba(248,81,73,.14);  --p-danger-bd: rgba(248,81,73,.28);
    --p-sh-sm: 0 1px 2px rgba(0,0,0,.4); --p-sh-md: 0 4px 12px rgba(0,0,0,.45); --p-sh-lg: 0 12px 32px rgba(0,0,0,.55);
    --p-selection: rgba(88,166,255,.32);
  }

  /* Global icon baseline: all .p-ic SVGs default to 16×16 to avoid filling the
     container when no context sets a size. Each component context
     (.p-btn/.p-badge/.p-pill, etc.) overrides the size as needed. */
  .p-ic { width: 16px; height: 16px; flex: none; display: inline-block; vertical-align: middle; }

  /* ===== Button ===== */
  .p-btn {
    --_h: 36px; --_px: 16px; --_fs: var(--p-font-size-base); --_r: var(--p-r-md);
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    height: var(--_h); padding: 0 var(--_px); border-radius: var(--_r);
    font-family: var(--p-font-sans); font-size: var(--_fs); font-weight: 600; line-height: 1;
    border: 1px solid transparent; cursor: pointer; white-space: nowrap;
    transition: background var(--p-dur) var(--p-ease), border-color var(--p-dur) var(--p-ease),
                color var(--p-dur) var(--p-ease), box-shadow var(--p-dur) var(--p-ease), transform var(--p-dur-fast) var(--p-ease);
  }
  .p-btn:active { transform: scale(.98); }
  .p-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--p-accent-soft), 0 0 0 1px var(--p-accent); }
  .p-btn .p-ic { width: 16px; height: 16px; }
  .p-btn.sm { --_h: 30px; --_px: 12px; --_fs: var(--p-font-size-sm); --_r: var(--p-r-sm); }
  .p-btn.sm .p-ic { width: 14px; height: 14px; }
  .p-btn.lg { --_h: 42px; --_px: 20px; --_fs: var(--p-font-size-md); --_r: var(--p-r-lg); }
  .p-btn.primary { background: var(--p-accent); color: var(--p-text-on-accent); border-color: var(--p-accent); box-shadow: var(--p-sh-xs); }
  .p-btn.primary:hover { background: var(--p-accent-hover); border-color: var(--p-accent-hover); }
  .p-btn.secondary { background: var(--p-surface-raised); color: var(--p-text); border-color: var(--p-line-strong); box-shadow: var(--p-sh-xs); }
  .p-btn.secondary:hover { background: var(--p-surface-sunken); border-color: var(--p-line-strong); }
  .p-btn.ghost { background: transparent; color: var(--p-text); border-color: transparent; }
  .p-btn.ghost:hover { background: var(--p-surface-sunken); color: var(--p-text); }
  .p-btn.danger { background: var(--p-danger); color: #fff; border-color: var(--p-danger); box-shadow: var(--p-sh-xs); }
  .p-btn.danger:hover { filter: brightness(.96); }
  .p-btn.danger-soft { background: var(--p-danger-soft); color: var(--p-danger); border-color: var(--p-danger-bd); }
  .p-btn.danger-soft:hover { background: var(--p-danger); color: #fff; border-color: var(--p-danger); }
  .p-btn[disabled], .p-btn.disabled { opacity: .5; cursor: not-allowed; box-shadow: none; transform: none; }

  .p-icon-btn {
    --_s: 32px; display: inline-grid; place-items: center; width: var(--_s); height: var(--_s); flex: none;
    border-radius: var(--p-r-md); border: 1px solid transparent; background: transparent; color: var(--p-text-muted); cursor: pointer;
    transition: background var(--p-dur) var(--p-ease), color var(--p-dur) var(--p-ease);
  }
  .p-icon-btn:hover { background: var(--p-surface-sunken); color: var(--p-text); }
  .p-icon-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--p-accent-soft); }
  .p-icon-btn.sm { --_s: 26px; border-radius: var(--p-r-sm); }
  .p-icon-btn.lg { --_s: 44px; }
  .p-icon-btn .p-ic { width: 16px; height: 16px; }
  .p-icon-btn.lg .p-ic { width: 20px; height: 20px; }

  /* ===== Badge / Chip / Pill ===== */
  .p-badge {
    display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 9px;
    border-radius: var(--p-r-full); font-family: var(--p-font-sans); font-size: var(--p-font-size-xs); font-weight: 600; line-height: 1;
    border: 1px solid var(--p-line); background: var(--p-surface); color: var(--p-text); white-space: nowrap;
  }
  .p-badge.sm { height: 18px; padding: 0 7px; font-size: 11px; }
  .p-badge .bd { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
  .p-badge.neutral { background: var(--p-surface-sunken); border-color: var(--p-line); color: var(--p-text-muted); }
  .p-badge.info { background: var(--p-accent-soft); border-color: var(--p-accent-bd); color: var(--p-accent-hover); }
  .p-badge.success { background: var(--p-success-soft); border-color: var(--p-success-bd); color: var(--p-success); }
  .p-badge.warning { background: var(--p-warning-soft); border-color: var(--p-warning-bd); color: var(--p-warning); }
  .p-badge.danger { background: var(--p-danger-soft); border-color: var(--p-danger-bd); color: var(--p-danger); }
  .p-badge.solid { background: var(--p-text); color: var(--p-bg); border-color: var(--p-text); }
  .p-badge .p-ic { width: 12px; height: 12px; }

  /* Kbd — shortcut keycaps (one <kbd> block per key) */
  .p-kbd { display: inline-flex; align-items: center; gap: 3px; }
  .p-kbd kbd {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 18px; height: 18px; padding: 0 5px;
    border: 1px solid var(--p-line); border-bottom-width: 2px; border-radius: var(--p-r-xs);
    background: var(--p-surface-sunken); color: var(--p-text-muted);
    font-family: var(--p-font-sans); font-size: 11px; line-height: 1;
  }

  /* model / mode pill (composer toolbar) */
  .p-pill {
    display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px;
    border-radius: var(--p-r-md); border: 1px solid transparent; background: transparent;
    font-family: var(--p-font-sans); font-size: var(--p-font-size-sm); font-weight: 500; color: var(--p-text); cursor: pointer;
    transition: background var(--p-dur) var(--p-ease), color var(--p-dur) var(--p-ease);
  }
  .p-pill:hover { background: var(--p-surface-sunken); color: var(--p-text); }
  .p-pill .pp-strong { font-weight: 700; color: var(--p-text); }
  .p-pill .pp-sub { color: var(--p-accent); font-weight: 600; }
  .p-pill .p-ic { width: 14px; height: 14px; color: var(--p-text-faint); }

  /* ===== Card / Surface ===== */
  /* Unified card shell: flat, 1px border, radius-md, no shadow. All cards share this
     shell; they differ only in the head — action cards have a compact mono head with no
     fill; note cards have a semantic color band in the head. */
  .p-card {
    background: var(--p-surface); border: 1px solid var(--p-line); border-radius: var(--p-r-md);
    overflow: hidden; color: var(--p-text);
  }
  .p-card.interactive { transition: background var(--p-dur) var(--p-ease), border-color var(--p-dur) var(--p-ease); cursor: pointer; }
  .p-card.interactive:hover { background: var(--p-surface); border-color: var(--p-line-strong); }
  .p-card-head { display: flex; align-items: center; gap: 9px; padding: 10px 14px; border-bottom: 1px solid var(--p-line); background: var(--p-surface); }
  .p-card-title { font-size: var(--p-font-size-sm); font-weight: 600; color: var(--p-text); font-family: var(--p-font-mono); }
  .p-card-body { padding: 14px; font-size: var(--p-font-size-base); color: var(--p-text); line-height: var(--p-leading-normal); }
  .p-card-foot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--p-line); background: var(--p-surface); }

  /* ===== Form Input / Select / Textarea ===== */
  .p-field { display: flex; flex-direction: column; gap: 6px; }
  .p-label { font-size: var(--p-font-size-sm); font-weight: 600; color: var(--p-text); }
  .p-input, .p-select, .p-textarea {
    width: 100%; height: 38px; padding: 0 12px; border-radius: var(--p-r-md);
    border: 1px solid var(--p-line-strong); background: var(--p-surface-raised);
    font-family: var(--p-font-sans); font-size: var(--p-font-size-base); color: var(--p-text);
    box-shadow: var(--p-sh-xs); transition: border-color var(--p-dur) var(--p-ease), box-shadow var(--p-dur) var(--p-ease);
  }
  .p-textarea { height: auto; min-height: 84px; padding: 10px 12px; resize: vertical; line-height: var(--p-leading-normal); }
  .p-input:hover, .p-select:hover, .p-textarea:hover { border-color: var(--p-line-strong); }
  .p-input:focus, .p-select:focus, .p-textarea:focus { outline: none; border-color: var(--p-accent); box-shadow: 0 0 0 3px var(--p-accent-soft); }
  .p-input::placeholder, .p-textarea::placeholder { color: var(--p-text-faint); }
  .p-input.sm { height: 32px; font-size: var(--p-font-size-sm); border-radius: var(--p-r-sm); }
  .p-hint { font-size: var(--p-font-size-xs); color: var(--p-text-faint); }

  /* ===== Dialog ===== */
  .p-dialog {
    width: 480px; max-width: calc(100vw - 48px); background: var(--p-surface-raised); border: 1px solid var(--p-line);
    border-radius: var(--p-r-xl); box-shadow: var(--p-sh-xl); overflow: hidden; color: var(--p-text);
  }
  .p-dialog-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 20px 22px 14px; }
  .p-dialog-title { font-size: var(--p-font-size-lg); font-weight: 700; letter-spacing: -.01em; }
  .p-dialog-desc { font-size: var(--p-font-size-base); color: var(--p-text-muted); margin-top: 4px; line-height: var(--p-leading-normal); }
  .p-dialog-body { padding: 4px 22px 18px; }
  .p-dialog-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 22px 20px; }

  /* ===== Toast ===== */
  .p-toast {
    display: flex; align-items: flex-start; gap: 11px; width: 360px; padding: 13px 14px;
    background: var(--p-surface-raised); border: 1px solid var(--p-line); border-radius: var(--p-r-lg); box-shadow: var(--p-sh-md);
  }
  .p-toast .ti { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; flex: none; margin-top: 1px; }
  .p-toast.success .ti { background: var(--p-success-soft); color: var(--p-success); }
  .p-toast.warning .ti { background: var(--p-warning-soft); color: var(--p-warning); }
  .p-toast .tt { font-size: var(--p-font-size-base); font-weight: 600; color: var(--p-text); }
  .p-toast .td { font-size: var(--p-font-size-sm); color: var(--p-text-muted); margin-top: 2px; line-height: 1.45; }

  /* ===== Spinner (plain SVG ring, the default loader) ===== */
  .p-spinner { width: 18px; height: 18px; animation: p-spin 0.85s linear infinite; }
  .p-spinner.sm { width: 14px; height: 14px; }
  .p-spinner circle { fill: none; stroke-width: 2.2; stroke-linecap: round; }
  .p-spinner .track { stroke: var(--p-line); }
  .p-spinner .arc { stroke: var(--p-accent); stroke-dasharray: 56 56; stroke-dashoffset: 38; }
  @keyframes p-spin { to { transform: rotate(360deg); } }
  .p-thinking { display: inline-flex; align-items: center; gap: 9px; font-size: var(--p-font-size-sm); color: var(--p-text-muted); font-family: var(--p-font-sans); }

  /* ===== Chat: user bubble ===== */
  .p-bubble-user {
    align-self: flex-end; max-width: 78%; background: var(--p-accent-soft); border: 1px solid var(--p-accent-bd);
    color: var(--p-text); border-radius: 18px 18px 5px 18px; padding: 11px 15px;
    font-size: var(--p-font-size-md); line-height: var(--p-leading-normal); box-shadow: var(--p-sh-xs);
  }
  .p-msg { max-width: 760px; font-size: var(--p-font-size-md); line-height: var(--p-leading-relaxed); color: var(--p-text); }
  .p-msg p { margin: 0 0 10px; color: var(--p-text); }
  .p-msg code { font-family: var(--p-font-mono); background: var(--p-surface-sunken); border: 1px solid var(--p-line); color: var(--p-accent-hover); padding: 1px 6px; border-radius: 5px; font-size: .9em; }

  /* ===== Chat: Agent card ===== */
  .p-agent { background: var(--p-surface-raised); border: 1px solid var(--p-line); border-radius: var(--p-r-md); overflow: hidden; }
  .p-agent-head { display: flex; align-items: center; gap: 10px; padding: 11px 14px; }
  .p-agent-av { width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; background: var(--p-surface-sunken); border: 1px solid var(--p-line); color: var(--p-text-muted); flex: none; }
  .p-agent-name { font-size: var(--p-font-size-sm); font-weight: 600; color: var(--p-text); }
  .p-agent-phase { font-size: var(--p-font-size-xs); color: var(--p-text-muted); }
  .p-agent-body { padding: 0 14px 13px; }

  /* ===== Chat: tool call card ===== */
  .p-tool { background: var(--p-surface-raised); border: 1px solid var(--p-line); border-radius: var(--p-r-md); overflow: hidden; }
  .p-tool-head { display: flex; align-items: center; gap: 9px; padding: 9px 13px; background: var(--p-surface); border-bottom: 1px solid var(--p-line); }
  .p-tool-ic { width: 18px; height: 18px; border-radius: 5px; display: grid; place-items: center; background: var(--p-accent-soft); color: var(--p-accent); flex: none; }
  .p-tool-name { font-family: var(--p-font-mono); font-size: var(--p-font-size-sm); font-weight: 600; color: var(--p-text); }
  .p-tool-body { padding: 12px 13px; }
  .p-code { font-family: var(--p-font-mono); font-size: var(--p-font-size-sm); line-height: 1.65; background: var(--p-surface-sunken); border: 1px solid var(--p-line); border-radius: var(--p-r-md); padding: 11px 13px; color: var(--p-text); overflow-x: auto; }

  /* ===== Chat: question / approval card ===== */
  .p-action { border-radius: var(--p-r-md); overflow: hidden; border: 1px solid var(--p-accent-bd); background: var(--p-surface); }
  .p-action.warn { border-color: var(--p-warning-bd); }
  .p-action-head { display: flex; align-items: center; gap: 9px; padding: 10px 14px; background: var(--p-accent-soft); border-bottom: 1px solid var(--p-accent-bd); }
  .p-action.warn .p-action-head { background: var(--p-warning-soft); border-bottom-color: var(--p-warning-bd); }
  .p-action-title { font-size: var(--p-font-size-base); font-weight: 600; color: var(--p-accent-hover); }
  .p-action.warn .p-action-title { color: var(--p-warning); }
  .p-action-body { padding: 14px; font-size: var(--p-font-size-base); color: var(--p-text); line-height: var(--p-leading-normal); }
  .p-action-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 11px 14px; border-top: 1px solid var(--p-line); background: var(--p-surface); }

  /* ===== Chat: Todo card ===== */
  .p-todo { background: var(--p-surface-raised); border: 1px solid var(--p-line); border-radius: var(--p-r-md); padding: 6px; }
  .p-todo-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--p-r-md); font-size: var(--p-font-size-base); color: var(--p-text); }
  .p-todo-row.done { color: var(--p-text-faint); text-decoration: line-through; }
  .p-todo-row.active { background: var(--p-accent-soft); color: var(--p-text); }
  .p-todo-check { width: 16px; flex: none; font-size: var(--p-font-size-base); line-height: 1; text-align: center; user-select: none; color: var(--p-text-faint); }
  .p-todo-row.done .p-todo-check { color: var(--p-success); }
  .p-todo-row.active .p-todo-check { color: var(--p-accent); font-weight: 500; }

  /* ===== Chat: compact tool calls (high-frequency, low-weight calls such as read_file / bash / grep) ===== */
  /* Status dot */
  .p-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--p-text-faint); }
  .p-dot.done { background: var(--p-success); }
  .p-dot.error { background: var(--p-danger); }
  .p-dot.running { background: var(--p-accent); box-shadow: 0 0 0 0 var(--p-accent-soft); animation: p-pulse 1.4s ease-out infinite; }
  @keyframes p-pulse { 0% { box-shadow: 0 0 0 0 rgba(23,131,255,.4); } 100% { box-shadow: 0 0 0 6px rgba(23,131,255,0); } }

  /* Tool call group: collapses a run of consecutive / parallel calls into a stack;
     overall visual weight is much lower than a card. */
  .p-tool-group { border: 1px solid var(--p-line); border-radius: var(--p-r-md); background: var(--p-surface); overflow: hidden; }
  .p-tool-group-head { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 11px; cursor: pointer; font-size: var(--p-font-size-sm); color: var(--p-text-muted); user-select: none; }
  .p-tool-group-head:hover { background: var(--p-surface-sunken); color: var(--p-text); }
  .p-tool-group-head .tg-title { font-weight: 600; color: var(--p-text); }
  .p-tool-group-head .tg-meta { color: var(--p-text-faint); }
  .p-tool-group-head .tg-car { margin-left: auto; width: 14px; height: 14px; color: var(--p-text-faint); transition: transform var(--p-dur) var(--p-ease); }
  .p-tool-group.open .p-tool-group-head .tg-car { transform: rotate(90deg); }

  /* Single-line tool call: compact by default, fits on one line */
  .p-tool-row { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 11px; border-top: 1px solid var(--p-line-2, var(--p-line)); cursor: pointer; font-family: var(--p-font-mono); font-size: var(--p-font-size-sm); color: var(--p-text); }
  .p-tool-row:hover { background: var(--p-surface-sunken); }
  .p-tool-row .tr-ic { width: 14px; height: 14px; color: var(--p-text-faint); flex: none; }
  .p-tool-row .tr-name { font-weight: 600; color: var(--p-text); flex: none; }
  .p-tool-row .tr-arg { color: var(--p-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .p-tool-row .tr-time { margin-left: auto; color: var(--p-text-faint); font-size: var(--p-font-size-xs); flex: none; }
  .p-tool-row .tr-car { width: 13px; height: 13px; color: var(--p-text-faint); flex: none; transition: transform var(--p-dur) var(--p-ease); }
  .p-tool-row.expanded { background: var(--p-surface-sunken); }
  .p-tool-row.expanded .tr-car { transform: rotate(90deg); }

  /* Detail after a row is expanded (code / output) */
  .p-tool-detail { padding: 0 11px 11px; background: var(--p-surface-sunken); border-top: 1px solid var(--p-line); }
  .p-tool-detail .p-code { margin-top: 10px; }

  /* ===== Chat: Composer ===== */
  .p-composer { position: relative; background: var(--color-composer-bg); border: 1px solid color-mix(in srgb, var(--p-text) 14%, transparent); border-radius: 32px; box-shadow: 0 5px 16px -4px rgba(0,0,0,.07); overflow: hidden; }
  .p-composer::after { content: ""; position: absolute; inset: 0; border: inherit; border-color: var(--color-composer-focus-line); border-radius: 32px; opacity: 0; pointer-events: none; transition: opacity var(--p-dur-slow) var(--p-ease-inout); }
  .p-composer:focus-within::after { opacity: 1; }
  .p-composer-ta { padding: 14px 16px 8px; font-family: var(--p-font-sans); font-size: var(--p-font-size-md); color: var(--p-text); line-height: var(--p-leading-normal); }
  .p-composer-ta.ph { color: var(--p-text-faint); }
  .p-composer-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px 8px; }
  .p-composer-left, .p-composer-right { display: flex; align-items: center; gap: 2px; }
  .p-send { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--p-accent); color: var(--p-text-on-accent); border: none; cursor: pointer; box-shadow: var(--p-sh-xs); transition: transform var(--p-dur-fast) var(--p-ease), background var(--p-dur) var(--p-ease); }
  .p-send:hover { background: var(--p-accent-hover); }
  .p-send:active { transform: scale(.92); }
  .p-send .p-ic { width: 16px; height: 16px; }

  /* ===== Text selection ===== */
  .p ::selection, [data-p] ::selection { background: var(--p-selection); }

  /* ===== Text link ===== */
  .p-link {
    color: var(--p-accent); text-decoration: none; font-family: var(--p-font-sans);
    transition: color var(--p-dur) var(--p-ease);
  }
  .p-link:hover { color: var(--p-accent-hover); text-decoration: underline; }
  .p-link:focus-visible { outline: none; box-shadow: var(--p-focus-ring); border-radius: var(--p-r-xs); }
  .p-link.muted { color: var(--p-text-muted); }
  .p-link.muted:hover { color: var(--p-text); }
  .p-link .p-ic { width: var(--p-ic-sm); height: var(--p-ic-sm); vertical-align: -2px; }

  /* ===== Menu / Dropdown ===== */
  .p-menu {
    background: var(--p-surface-raised); border: 1px solid var(--p-line);
    border-radius: var(--p-r-lg); box-shadow: var(--p-sh-sm);
    padding: var(--p-sp-1); min-width: 180px;
    font-family: var(--p-font-sans); color: var(--p-text);
  }
  .p-menu-item {
    display: flex; align-items: center; gap: 8px; padding: 6px 10px;
    border-radius: var(--p-r-sm); font-size: var(--p-font-size-sm); color: var(--p-text);
    cursor: pointer; transition: background var(--p-dur) var(--p-ease), color var(--p-dur) var(--p-ease);
  }
  .p-menu-item:hover { background: var(--p-surface-sunken); color: var(--p-text); }
  .p-menu-item.active { background: var(--p-accent-soft); color: var(--p-accent-hover); }
  .p-menu-item.active:hover { background: var(--p-accent-soft); color: var(--p-accent-hover); }
  .p-menu-item.danger { color: var(--p-danger); }
  .p-menu-item.danger:hover { background: var(--p-danger-soft); color: var(--p-danger); }
  .p-menu-item.disabled { opacity: .5; cursor: not-allowed; }
  .p-menu-item.disabled:hover { background: transparent; color: var(--p-text); }
  .p-menu-item .p-ic { width: var(--p-ic-sm); height: var(--p-ic-sm); }
  .p-menu-item.lg { min-height: 44px; padding: 12px 14px; font-size: var(--p-font-size-base); }
  .p-menu-sep { height: 1px; background: var(--p-line); margin: 4px 0; }

  /* ===== SegmentedControl ===== */
  .p-seg {
    display: inline-flex; gap: 2px; padding: 2px;
    background: var(--p-surface-sunken); border: 1px solid var(--p-line);
    border-radius: var(--p-r-md); font-family: var(--p-font-sans);
  }
  .p-seg-item {
    padding: 5px 12px; border-radius: var(--p-r-sm); font-size: var(--p-font-size-sm);
    font-weight: 500; color: var(--p-text); cursor: pointer; white-space: nowrap;
    transition: background var(--p-dur) var(--p-ease), color var(--p-dur) var(--p-ease), box-shadow var(--p-dur) var(--p-ease);
  }
  .p-seg-item:hover { color: var(--p-text); }
  .p-seg-item.on { background: var(--p-surface-raised); color: var(--p-text); box-shadow: var(--p-sh-xs); }

  /* ===== Tabs ===== */
  .p-tabs {
    display: flex; align-items: center; gap: 0;
    border-bottom: 1px solid var(--p-line); font-family: var(--p-font-sans);
  }
  .p-tab {
    padding: 8px 14px; font-size: var(--p-font-size-sm); font-weight: 500;
    color: var(--p-text-muted); cursor: pointer; white-space: nowrap;
    border-bottom: 2px solid transparent; margin-bottom: -1px;
    transition: color var(--p-dur) var(--p-ease), border-color var(--p-dur) var(--p-ease);
  }
  .p-tab:hover { color: var(--p-text); }
  .p-tab.on { color: var(--p-accent); border-bottom-color: var(--p-accent); }

  /* ===== Switch ===== */
  .p-switch {
    position: relative; display: inline-block; width: 36px; height: 20px; flex: none;
    border-radius: var(--p-r-full); background: var(--p-line-strong);
    cursor: pointer; transition: background var(--p-dur) var(--p-ease);
  }
  .p-switch::after {
    content: ""; position: absolute; top: 2px; left: 2px;
    width: 16px; height: 16px; border-radius: var(--p-r-full);
    background: var(--surface-light); box-shadow: var(--p-sh-xs);
    transition: transform var(--p-dur) var(--p-ease);
  }
  .p-switch.on { background: var(--p-accent); }
  .p-switch.on::after { background: var(--p-text-on-accent); transform: translateX(16px); }
  .p-switch:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }

  /* ===== Checkbox ===== */
  .p-check {
    width: 17px; height: 17px; flex: none; display: inline-grid; place-items: center;
    border: 1.5px solid var(--p-line-strong); border-radius: var(--p-r-sm);
    background: var(--p-surface-raised); color: var(--p-text-on-accent);
    cursor: pointer; transition: background var(--p-dur) var(--p-ease), border-color var(--p-dur) var(--p-ease);
  }
  .p-check.on { background: var(--p-accent); border-color: var(--p-accent); }
  .p-check:focus-visible { outline: none; box-shadow: var(--p-focus-ring); }
  .p-check .p-ic { width: 12px; height: 12px; }

  /* ===== Avatar ===== */
  .p-avatar {
    width: 32px; height: 32px; flex: none; display: grid; place-items: center;
    border-radius: var(--p-r-md); background: var(--p-surface-sunken);
    border: 1px solid var(--p-line); color: var(--p-text-muted);
    font-size: var(--p-font-size-sm); font-weight: 600;
  }
  .p-avatar.sm { width: 24px; height: 24px; border-radius: var(--p-r-sm); font-size: var(--p-font-size-xs); }
  .p-avatar .p-ic { width: 16px; height: 16px; }
  .p-avatar.sm .p-ic { width: 13px; height: 13px; }

  /* ===== EmptyState ===== */
  .p-empty {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 32px 16px; color: var(--p-text-muted); text-align: center;
  }
  .p-empty .em-ic { width: 48px; height: 48px; color: var(--p-text-faint); }
  .p-empty .em-title { font-size: var(--p-font-size-base); font-weight: 600; color: var(--p-text); }
  .p-empty .em-hint { font-size: var(--p-font-size-sm); color: var(--p-text-muted); }

  /* ===== Divider ===== */
  .p-divider { width: 100%; height: 1px; background: var(--p-line); border: none; }
  .p-divider-v { width: 1px; align-self: stretch; background: var(--p-line); border: none; }

  /* ===== Tooltip ===== */
  .p-tip { position: relative; display: inline-flex; }
  .p-tip .p-tooltip {
    position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%);
    background: var(--p-text); color: var(--p-bg); font-size: var(--p-font-size-xs);
    padding: 4px 8px; border-radius: var(--p-r-sm); white-space: nowrap;
    opacity: 0; pointer-events: none; transition: opacity var(--p-dur-fast) var(--p-ease);
  }
  .p-tip:hover .p-tooltip { opacity: 1; }

  /* ===== Banner ===== */
  .p-banner {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px;
    border-radius: var(--p-r-md); border: 1px solid var(--p-line);
    background: var(--p-surface); font-size: var(--p-font-size-sm); color: var(--p-text);
  }
  .p-banner .bn-ic { width: 18px; height: 18px; flex: none; }
  .p-banner.info { background: var(--p-accent-soft); border-color: var(--p-accent-bd); }
  .p-banner.info .bn-ic { color: var(--p-accent); }
  .p-banner.warning { background: var(--p-warning-soft); border-color: var(--p-warning-bd); }
  .p-banner.warning .bn-ic { color: var(--p-warning); }
  .p-banner.danger { background: var(--p-danger-soft); border-color: var(--p-danger-bd); }
  .p-banner.danger .bn-ic { color: var(--p-danger); }

  /* ===== Sheet / BottomSheet ===== */
  .p-sheet {
    background: var(--p-surface-raised); border: 1px solid var(--p-line);
    border-radius: var(--p-r-xl) var(--p-r-xl) 0 0; box-shadow: var(--p-sh-xl);
    padding: 8px 16px 20px;
  }
  .p-sheet-handle {
    width: 36px; height: 4px; border-radius: var(--p-r-full);
    background: var(--p-line-strong); margin: 0 auto 8px;
  }

  /* ===== Skeleton ===== */
  .p-skeleton {
    background: var(--p-surface-sunken); border-radius: var(--p-r-sm);
    animation: p-skel 1.2s var(--p-ease-inout) infinite alternate;
  }
  @keyframes p-skel { from { opacity: .5; } to { opacity: 1; } }

  /* ===== Command Bar ===== */
  .p-cmdbar { display: flex; align-items: center; gap: 8px; width: 100%; }
  .p-cmd { flex: 1; min-width: 0; height: 38px; display: flex; align-items: center; gap: 10px; padding: 0 10px 0 14px; background: var(--p-surface-sunken); border: 1px solid var(--p-line); border-radius: var(--p-r-md); font-family: var(--p-font-mono); font-size: var(--p-font-size-sm); color: var(--p-text-muted); }
  .p-cmd .cmd-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .p-cmd .cmd-copy { margin-left: auto; flex: none; display: grid; place-items: center; width: 26px; height: 26px; border: none; background: transparent; border-radius: var(--p-r-sm); color: var(--p-text-faint); cursor: pointer; transition: background var(--p-dur) var(--p-ease), color var(--p-dur) var(--p-ease); }
  .p-cmd .cmd-copy:hover { background: var(--p-surface-raised); color: var(--p-text); }
  .p-cmd .cmd-copy .p-ic { width: 15px; height: 15px; }

  /* ===== TopBar ===== */
  .p-topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; height: 48px; padding: 0 16px; background: var(--p-surface-raised); border: 1px solid var(--p-line); border-radius: var(--p-r-lg); }
  .p-topbar .tb-title { font-size: var(--p-font-size-sm); font-weight: 600; color: var(--p-text); }
  .p-topbar .tb-actions { display: flex; align-items: center; gap: 4px; }
  .p-topbar.frost { background: rgba(255,255,255,.72); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-color: rgba(255,255,255,.6); }
  [data-p="dark"] .p-topbar.frost { background: rgba(22,27,34,.72); border-color: rgba(255,255,255,.08); }

  /* Color-family demo: override the accent token set to neutral black to demo the
     "black" family. Real switching is handled uniformly by the theme layer; components
     do not need to be aware of it. */
  .demo-family-black { --p-accent: #14171c; --p-accent-hover: #2f3540; --p-accent-soft: #f1f2f4; --p-accent-bd: #d8dbe0; --p-text-on-accent: #ffffff; }

  /* Utility: demo rows */
  .demo-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .demo-stack { display: flex; flex-direction: column; gap: 12px; width: 100%; }
  .demo-col { display: flex; flex-direction: column; gap: 10px; }
  .demo-grow { flex: 1; min-width: 0; }
  .demo-chat { display: flex; flex-direction: column; gap: 14px; width: 100%; max-width: 560px; }

  /* Icon catalog (§02 Icon library) */
  .icon-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 8px; margin: 14px 0; }
  .icon-group-label { grid-column: 1 / -1; margin-top: 10px; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--d-fg-muted); }
  .icon-cell { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--d-line); border-radius: 8px; background: var(--d-surface); }
  .icon-cell .kw-icon { width: 20px; height: 20px; color: var(--d-fg-soft); }
  .icon-cell .ic-name { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; color: var(--d-fg); }
  .icon-sizes { display: flex; align-items: end; gap: 22px; flex-wrap: wrap; }
  .icon-sizes .sz { display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 11px; color: var(--d-fg-muted); font-family: "JetBrains Mono", ui-monospace, monospace; }

  /* ===== Code / Diff ===== */
  .p-code-inline { font-family: var(--p-font-mono); background: var(--p-surface-sunken); color: var(--p-text); padding: 0 5px; border-radius: var(--p-r-sm); font-size: .9em; }
  .p-code-block { border: 1px solid var(--p-line); border-radius: var(--p-r-md); overflow: hidden; background: var(--p-surface-sunken); }
  .p-code-block-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--p-surface); border-bottom: 1px solid var(--p-line); font-family: var(--p-font-mono); font-size: var(--p-font-size-xs); color: var(--p-text-muted); }
  .p-code-block pre { margin: 0; padding: 12px 14px; font-family: var(--p-font-mono); font-size: var(--p-font-size-sm); line-height: 1.65; color: var(--p-text); overflow-x: auto; }
  .p-diff { border: 1px solid var(--p-line); border-radius: var(--p-r-md); overflow: hidden; font-family: var(--p-font-mono); font-size: var(--p-font-size-sm); }
  .p-diff-head { padding: 8px 12px; background: var(--p-surface); border-bottom: 1px solid var(--p-line); font-size: var(--p-font-size-xs); color: var(--p-text-muted); }
  .p-diff-row { display: flex; gap: 10px; padding: 2px 12px; line-height: 1.6; }
  .p-diff-row .pm { width: 14px; flex: none; color: var(--p-text-faint); }
  .p-diff-row.add { background: var(--p-success-soft); }
  .p-diff-row.add .pm { color: var(--p-success); }
  .p-diff-row.del { background: var(--p-danger-soft); }
  .p-diff-row.del .pm { color: var(--p-danger); }
  .p-diff-row .p-diff-code { color: var(--p-text); }

  /* ===== Field error ===== */
  .p-field-error { color: var(--p-danger); font-size: var(--p-font-size-xs); }

  /* Inline spinner inside a button: follows the text color so it stays visible on an
     accent background (no hard-coded color needed). */
  .p-btn .p-spinner { vertical-align: middle; }
  .p-btn .p-spinner .track { stroke: currentColor; opacity: .35; }
  .p-btn .p-spinner .arc { stroke: currentColor; }

/* ---- View shell + topbar (scoped, product tokens) ---- */
.ds-page {
  position: fixed;
  inset: 0;
  z-index: var(--z-max);
  overflow-y: auto;
}
.ds-topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-line);
}
.ds-back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  cursor: pointer;
}
.ds-back:hover {
  background: var(--color-surface-sunken);
}
.ds-topbar-title {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-muted);
}
</style>
