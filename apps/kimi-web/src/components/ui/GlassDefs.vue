<!-- apps/kimi-web/src/components/ui/GlassDefs.vue -->
<!-- Hidden SVG defs powering the liquid-glass rim-refraction layer.
     style.css appends these filters to `backdrop-filter` only inside
     `@supports (backdrop-filter: url(#lg-refract))` AND only on surfaces
     carrying the `.lg-lens` marker class (floating overlays — see the
     §SVG rim refraction comment in style.css for the rasterization-cost
     reason), so engines that reject
     the url() function keep the plain blur/saturate/brightness chain.
     Every filter runs with primitiveUnits="objectBoundingBox": the lens maps
     and light positions are fractions of the target element, so one
     definition refracts identically on a small tooltip and a 900px dialog
     (resolution-independent). Mount exactly once per app root (App.vue,
     BenchView.vue). -->
<script setup lang="ts">
// Theme-linked specular for the SVG lens. `specularConstant` /
// `specularExponent` are SVG attributes, not CSS properties, so the theme
// choice cannot be a token retarget on one filter — instead the two themes get
// twin filters that differ ONLY in the rim highlight, and style.css selects the
// twin through `--lg-lens-filter` (gl-renderer takes the same numbers from
// `--lg-spec` on the WebGL path). Dark keeps the full white band; a white rim
// on a white face is invisible, so the light variant drops the highlight to a
// thin, tighter edge and lets the shaded CSS rim carry the contour.
const LENS_VARIANTS = [
  { id: 'lg-refract', specularConstant: 0.7, specularExponent: 22 },
  { id: 'lg-refract-soft', specularConstant: 0.32, specularExponent: 30 },
];
</script>

<template>
  <svg class="glass-defs" aria-hidden="true" focusable="false" width="0" height="0">
    <defs>
      <!-- Edge-lens maps. feDisplacementMap shifts a pixel by
           scale * (channel - 0.5): 0x80 (128) is neutral, so each ramp runs
           0x60 → 0x80 → 0xA0 within the outer ~18% of the element (the
           CSS analogue of --lg-edge-px) and stays flat in the middle.
           One channel per image so they can be summed channel-wise. -->
      <linearGradient id="lg-lens-x-grad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#600000" />
        <stop offset="0.18" stop-color="#800000" />
        <stop offset="0.82" stop-color="#800000" />
        <stop offset="1" stop-color="#a00000" />
      </linearGradient>
      <linearGradient id="lg-lens-y-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#006000" />
        <stop offset="0.18" stop-color="#008000" />
        <stop offset="0.82" stop-color="#008000" />
        <stop offset="1" stop-color="#00a000" />
      </linearGradient>
      <rect id="lg-lens-x-src" width="100" height="100" fill="url(#lg-lens-x-grad)" />
      <rect id="lg-lens-y-src" width="100" height="100" fill="url(#lg-lens-y-grad)" />

      <!-- #lg-refract / #lg-refract-soft — the surfaces that carry the
           .lg-lens marker class (always paired with .lg-glass or .lg-frost).
           Primitives: feImage (x2, the R/G lens
           ramps) → feComposite arithmetic (channel-wise sum into one lens
           map) → feComponentTransfer (table remap, holds the neutral 0.5
           centre and caps the edge pull at ±0.25) → feDisplacementMap (the
           visible rim refraction of the backdrop) → feGaussianBlur of
           SourceAlpha (a bevel height field sloping at the edges) →
           feSpecularLighting + feDistantLight (rim-band highlight following
           the edge curvature, key light high-left at azimuth 225° /
           elevation 55° — corners read brightest, matching real glass) →
           feComposite (clip the highlight to the surface) → feTurbulence +
           feColorMatrix + feComposite (single-octave fractal grain at a few
           percent alpha) → feMerge. -->
      <filter
        v-for="variant in LENS_VARIANTS"
        :key="variant.id"
        :id="variant.id"
        x="-6%"
        y="-6%"
        width="112%"
        height="112%"
        filterUnits="objectBoundingBox"
        primitiveUnits="objectBoundingBox"
        color-interpolation-filters="sRGB"
      >
        <feImage href="#lg-lens-x-src" x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="lensx" />
        <feImage href="#lg-lens-y-src" x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="lensy" />
        <feComposite in="lensx" in2="lensy" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lenssum" />
        <feComponentTransfer in="lenssum" result="lens">
          <feFuncR type="table" tableValues="0.25 0.5 0.75" />
          <feFuncG type="table" tableValues="0.25 0.5 0.75" />
        </feComponentTransfer>
        <feDisplacementMap in="SourceGraphic" in2="lens" scale="0.5" xChannelSelector="R" yChannelSelector="G" result="bent" />
        <feGaussianBlur in="SourceAlpha" stdDeviation="0.015" result="bevel" />
        <feSpecularLighting
          in="bevel"
          surfaceScale="0.04"
          :specularConstant="variant.specularConstant"
          :specularExponent="variant.specularExponent"
          lighting-color="#ffffff"
          result="spec"
        >
          <feDistantLight azimuth="225" elevation="55" />
        </feSpecularLighting>
        <feComposite in="spec" in2="bent" operator="in" result="spec-in" />
        <feTurbulence type="fractalNoise" baseFrequency="120" numOctaves="1" seed="7" result="grain-noise" />
        <feColorMatrix
          in="grain-noise"
          type="matrix"
          values="0 0 0 0 0.55  0 0 0 0 0.55  0 0 0 0 0.55  0.05 0.05 0.05 0 -0.045"
          result="grain-flat"
        />
        <feComposite in="grain-flat" in2="bent" operator="in" result="grain-in" />
        <feMerge>
          <feMergeNode in="bent" />
          <feMergeNode in="spec-in" />
          <feMergeNode in="grain-in" />
        </feMerge>
      </filter>
    </defs>
  </svg>
</template>

<style scoped>
/* Rendered but zero-footprint: display:none would drop the filter/gradient
   defs out of the render tree in some engines, so shrink instead. */
.glass-defs {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}
</style>
