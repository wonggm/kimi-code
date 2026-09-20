<!-- apps/kimi-web/src/components/ui/GlassDefs.vue -->
<!-- Hidden SVG defs powering the liquid-glass rim-refraction layer.
     `#lg-refract` (dark) and `#lg-refract-soft` (light) are the two filters
     style.css references through its `--lg-lens` token, and it appends the
     URL to `backdrop-filter` only inside
     `@supports (backdrop-filter: url(#lg-refract))`, so engines that reject
     the url() function keep the plain blur/saturate/brightness chain.
     `#lg-bezel` (dark), `#lg-bezel-soft` (light) and `#lg-bezel-bar` (light)
     are the same material limited to a band at the element's rim: their
     displacement and their highlight exist only in that band, so the face
     stays as it was and only the rim bends. The light variant runs a 28px band
     and the dark one a 3px band with a 3px blur, because the band is the lens's
     specular highlight and its inner boundary is the blur's job: at 28px the
     dark highlight read as a thick grey band hugging the panel's and the card's
     edges, and at 6px with only a 2px blur the highlight was a flat strip whose
     inner edge read as a cliff, so the blur now equals the band width and the
     highlight ramps across the whole band. Light's 28px band measures nothing on
     that theme's near-white ground, so it keeps the width the reference's own
     rim bend follows. The bar variant runs a 7px band for the 36px header pill,
     which the light 28px band's 56px floor keeps out. All three run off the
     element's own alpha, never off an external asset.
     Each pair is a twin, one per theme, and the two twins are NOT the same
     material. The dark ones draw their edge with light: a white specular over
     a dark backdrop reads on its own. The light ones cannot, because the page
     under them is near-white, so their white specular has no contrast to read
     against and the smooth document ground gives their few pixels of
     displacement nothing to bend. The light twins therefore run a thinner,
     tighter highlight, and their edge is drawn outside this file.
     Neither pair draws a contour. An earlier round gave the light twins a
     `shade` key: a ring eroded from the element's own box, materialised into
     RGB, and multiplied into the displaced backdrop. It existed because this
     theme's two white rim tokens are both invisible on a near-white page and a
     dark edge looked like the only edge available. Measured, it painted a soft
     band rather than a line: on the floating sidebar panel the rim dropped
     from a flat 251 to 227 and ramped back to the face over about 20px, and on
     the composer card the darkest rim pixel went from 221 to 214 with an
     8-level ramp back over about 15px. The reference material — Huawei's
     immersive-light capsules — has no such band. At full resolution it shows a
     soft outer drop shadow, a bright white lip of about 1.5px, a thin dark line
     of about 1px just inside that lip, and a fill that carries no hue of its
     own: it reads blue over a sky and green over foliage, because every colour
     on it comes from the backdrop. The 1px line is what
     --lg-rim-shade in style.css already draws and the lip outside it is the
     --lg-rim-top / --lg-rim-catch pair; the outer shadow and the neutral lift
     are style.css's --lg-float-shadow, --lg-head-shadow and --lg-head-face. So the
     ring, its five primitives and its multiply blend are gone from both
     filters, and the light edge is the CSS rim plus the CSS shadow: a 1px line,
     not a ramp.
     No chromatic dispersion pass. Three staggered per-channel displacement
     passes were tried here and measured 0.01 of a level on both the composer
     card and the panel, which is a physical result rather than a wiring fault:
     these surfaces float over a flat achromatic ground, so the red, green and
     blue passes sample the same value and there is nothing to split.
     The refract pair runs with primitiveUnits="objectBoundingBox": the lens
     maps and light positions are fractions of the target element, so one
     definition refracts identically on a small menu and the sidebar column
     (resolution-independent). The bezel pair runs in userSpaceOnUse instead,
     because its band is a fixed pixel width at the rim. Mounted once per
     app, from App.vue. -->
<script setup lang="ts">
// Theme-linked specular for the SVG lens. `specularConstant` /
// `specularExponent` are SVG attributes, not CSS properties, so the theme
// choice cannot be a token retarget on one filter — instead the two themes get
// twin filters that differ ONLY in the rim highlight, and style.css selects the
// twin by theme through its `--lg-lens` token (`#lg-refract` dark,
// `#lg-refract-soft` light). Dark keeps the full white band; a white rim
// on a white face is invisible, so the light variant drops the highlight to a
// thin, tighter edge.
// That highlight is all either table carries beyond its constants. The light
// twins used to carry a `shade` key as well, a ring multiplied over the rim to
// darken it; the header records the measurement and why it was taken out. No
// entry has a contour now, and the two tables differ only in their specular
// values.
const LENS_VARIANTS = [
  { id: 'lg-refract', specularConstant: 0.95, specularExponent: 20 },
  { id: 'lg-refract-soft', specularConstant: 0.5, specularExponent: 26 },
];

// The same twin arrangement for the band-limited pair: identical geometry, a
// theme-selected rim highlight. Both constants sit below their refract twin's,
// because the bevel lights a band at the rim instead of the whole face.
//   scale  feDisplacementMap's scale, in user pixels. The dark pair's value
//          (4) is what the band was tuned around; light runs 12, so the rim
//          bends more of the ground it sits on. Measured, that change on its
//          own is 0.01 of a level: the ground under both of these surfaces is
//          a smooth gradient, so there is little contrast for the displacement
//          to bend, and the light edge is the CSS rim's job rather than the
//          filter's.
// No dispersion pass, in either table. Staggering the three displacement
// offsets by colour synthesises a fringe only where the rim band crosses a
// luminance edge; over these surfaces' flat achromatic ground the red, green
// and blue passes sample the same value and there is nothing to split. It was
// built and measured, and bought 0.01 of a level on the composer card and 0.01
// on the panel.
// Dark carries scale 4: its single displacement pass is the one this band was
// measured with.
//   erode  feMorphology's erode radius, in user pixels: the width of the band
//          at the rim. blur is its feGaussianBlur, the ramp across that band
//          that the displacement samples. The floor on element size is
//          2 * erode: below it the two bands meet and the whole face bends.
//   scale  feDisplacementMap's scale, in user pixels: how far the band may
//          bend what passes under it. It is one item of each variant, with its
//          own band width and highlight, because the three targets differ in
//          size by an order of magnitude and one band width cannot serve them
//          all.
const BEZEL_VARIANTS = [
  { id: 'lg-bezel', specularConstant: 0.6, specularExponent: 16, erode: 3, blur: 3, scale: 4 },
  { id: 'lg-bezel-soft', specularConstant: 0.32, specularExponent: 22, erode: 28, blur: 6, scale: 12 },
  { id: 'lg-bezel-bar', specularConstant: 0.5, specularExponent: 18, erode: 7, blur: 2, scale: 10 },
];
</script>

<template>
  <svg class="glass-defs" aria-hidden="true" focusable="false" width="0" height="0">
    <defs>
      <!-- Edge-lens maps. feDisplacementMap shifts a pixel by
           scale * (channel - 0.5): 0x80 (128) is neutral, so each ramp runs
           0x60 → 0x80 → 0xA0 within the outer ~24% of the element (the
           CSS analogue of --lg-edge-px) and stays flat in the middle.
           One channel per image so they can be summed channel-wise. -->
      <linearGradient id="lg-lens-x-grad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#600000" />
        <stop offset="0.24" stop-color="#800000" />
        <stop offset="0.76" stop-color="#800000" />
        <stop offset="1" stop-color="#a00000" />
      </linearGradient>
      <linearGradient id="lg-lens-y-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#006000" />
        <stop offset="0.24" stop-color="#008000" />
        <stop offset="0.76" stop-color="#008000" />
        <stop offset="1" stop-color="#00a000" />
      </linearGradient>
      <rect id="lg-lens-x-src" width="100" height="100" fill="url(#lg-lens-x-grad)" />
      <rect id="lg-lens-y-src" width="100" height="100" fill="url(#lg-lens-y-grad)" />

      <!-- #lg-refract / #lg-refract-soft — the two filters the `--lg-lens`
           token selects by theme in style.css.
           Primitives: feImage (x2, the R/G lens
           ramps) → feComposite arithmetic (channel-wise sum into one lens
           map) → feComponentTransfer (table remap, holds the neutral 0.5
           centre and caps the edge pull at ±0.25) → feDisplacementMap (`bent`,
           the visible rim refraction of the backdrop) → feGaussianBlur of
           SourceAlpha (the height field the specular is lit from) →
           feSpecularLighting + feDistantLight (a highlight over the whole
           surface, key light high-left at azimuth 225° / elevation 55°) →
           feComposite (clip the highlight to the surface) → feTurbulence +
           feColorMatrix + feComposite (single-octave fractal grain at a few
           percent alpha) → feMerge.
           No contour pass, in either theme. The light twin's ring was removed
           with the bezel pair's; the header carries the measurement. On a light
           surface this filter now paints only the white specular and the grain,
           and over a near-white page the specular has no contrast to read
           against, so on the five menus and the outline card it is a lift of
           about 4 levels rather than an edge (measured on the model dropdown,
           whose rim sits at 250). The edge there is the CSS rim — the bright
           lip of --lg-rim-top over --lg-rim-catch, with --lg-rim-shade's 1px
           line just inside it — over the outer shadow style.css declares. -->
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
        <feDisplacementMap in="SourceGraphic" in2="lens" scale="0.8" xChannelSelector="R" yChannelSelector="G" result="bent" />
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

      /* #lg-bezel / #lg-bezel-soft / #lg-bezel-bar — the band-limited family, one
     variant per target size. The band is built from the element's own alpha, so
     it needs no asset:
     feFlood + feComposite (materialise SourceAlpha into a real image —
     feMorphology leaves the element square when it is fed SourceAlpha
     itself, measured in Chromium) → feMorphology erode by the variant's
     `erode` (the inner core) → feComposite out (the ring, `erode` px in from
     the rim) → feGaussianBlur by the variant's `blur` (its channel values ramp
     across the band, which is what bends the backdrop instead of shifting it) →
     feColorMatrix (alpha into RGB, alpha pinned to 1, so the displaced channels
     carry that ramp) → feComponentTransfer table (the empty middle rises to
     the neutral 0.5, so the face between the bands is displaced by nothing at
     all) → feDisplacementMap (scale in user px, from the variant, result
     `bent`) → feSpecularLighting + feDistantLight (the refract pair's key
     light, on the ring as its bump) → feComposite (the highlight is clipped to
     the band, then to the surface). No grain: the refract pair's grain covers
     the whole face, and nothing outside the band may move here.
     The three variants differ only in band width, highlight and displacement,
     and each is sized to its target:
       lg-bezel      3px band, erode 3 / blur 3 / scale 4 — the dark panel and
                     card. The blur equals the band width, so the highlight ramps
                     across the whole band instead of sitting flat with a hard
                     inner edge: 28px painted a wide grey band, and 6px with a
                     2px blur left that cliff.
       lg-bezel-soft 28px band, erode 28 / blur 6 / scale 12 — the same band in
                     light, where the wider displacement follows the reference's
                     own rim bend and the band itself measures nothing.
       lg-bezel-bar  7px band, erode 7 / blur 2 / scale 10 — the 36px header
                     pill. The light 28px band has a 56px floor: on a 36px bar
                     the two bands would meet and the whole face would bend. The
                     bar variant's floor is 14px, so the 36px bar clears it with
                     a 22px unlit middle and bends up to 5px of what passes
                     under its head and its foot.
     The floor on element size is 2 * erode for every variant, in a direction:
     56px for the light 28px band, 6px for the dark 3px one, 14px for the bar.
     The dark band's width is the reader's complaint measured, and it has been
     narrowed in three steps. Their screenshot at 2x showed the 28px state: the
     panel's face at 28 in the middle, climbing to 69 approaching the right edge
     over roughly 17 CSS pixels, which is the 28px highlight itself, and the face
     still at 75 twenty pixels in and short of its floor at forty.
     The 6px state fixed the width but not the boundary: at 2x, sampling every 2
     device pixels, the panel's left edge fell 70, 58, 44, 36, 33, 32, 30, 29, 27
     and its head 76, 65, 52, 44, 40, 40, 38, 37, 35 after the rim line, steps of
     up to 14 and 13 levels, because a 2px blur at the inner edge of a 6px band
     is a cliff.
     The 4px band with a 4px blur matched the blur to the width and ramped across
     its whole width: the same samples read 42, 41, 38, 36, 34, 33, 31, 30, 29,
     28, 27 on the left edge and 50, 48, 46, 44, 42, 40, 39, 38, 37, 36, 35 at the
     head, whose largest steps are 3 and 2, with the foot climbing
     30, 30, 30, 31, 31, 31, 32, 32, 32, 32, 33, 33, 34 over about 20 CSS pixels
     in steps of one and the face flat within about ten CSS pixels of the edge.
     At 1x the panel's left edge reads 48, 89, 47, 46, 44, 43, 41, 39, 38, 37,
     36, 35, 34, 34: the rim line, then a smooth fall to a flat 34.
     The current 3px band with a 3px blur narrows it again: the left edge reads
     30, 26, 23, 21, 19, 18, 17, 16, 16, the face flat within about seven CSS
     pixels of the edge, and the head reads 37, 34, 31, 29, 27, 26, 25, 24, 24,
     flat within about ten. The card's head reads 32, 31, 31, 30, 30, steps of
     one. The rim line itself rose slightly as the band narrowed, because the
     same highlight concentrates: 101 to 110 on the panel's left edge and 154 to
     160 at its head, measured against the reverted rim structure.
     No contour on any of them. The light twins used to carry a second, 12px
     ring whose only job was `shade`: it ran before the displacement, was
     multiplied over the result, and was what kept the panel and the card
     reading on a white page. It painted a soft band rather than the reference
     material's 1px line, so it was removed; the header has the measurement.
     What the light bands paint now is the displacement and a low white
     specular, and over the graded ground behind the panel and the card the
     displacement moves 0.01 of a level. The light edge is therefore the CSS rim
     (--lg-rim-top over --lg-rim-catch, with --lg-rim-shade's 1px line just
     inside it) plus the outer shadow style.css declares on the surfaces that
     take it.
     No dispersion pass. Three staggered per-channel displacement passes
     (each followed by a feColorMatrix that kept one channel, summed back
     with feComposite arithmetic) were tried here, to synthesise a
     chromatic fringe from the backdrop. Measured, they bought 0.01 of a
     level on the composer card and 0.01 on the panel. The reason is
     physical rather than a wiring fault: these surfaces float over a
     flat achromatic ground, so the red, green and blue passes sample the
     same value and there is nothing to split. The fringe would need a
     luminance edge inside the rim band to sample across, and these two
     surfaces have none — the composer card sits on the dock strip's
     flat face, and hiding the whole transcript behind it changes
     nothing. A single pass is therefore all there is, at `scale`.
     `bent` is what the specular's clip and the final merge read.
     The filter region is the element exactly (0/100%, where the refract
     pair bleeds 6%): the backdrop image's alpha reaches the region's own
     edge, so eroding it puts the band's inner edge at the element's rim on all
     four sides. A percentage bleed would offset that per axis — 6% of a 270px
     column is 16px, 6% of its height is 54px — and the band would slide off the
     top and bottom edges. */
      <filter
        v-for="variant in BEZEL_VARIANTS"
        :key="variant.id"
        :id="variant.id"
        x="0%"
        y="0%"
        width="100%"
        height="100%"
        filterUnits="objectBoundingBox"
        primitiveUnits="userSpaceOnUse"
        color-interpolation-filters="sRGB"
      >
        <feFlood flood-color="#000000" flood-opacity="1" result="ink" />
        <feComposite in="ink" in2="SourceAlpha" operator="in" result="face" />
        <feMorphology in="face" operator="erode" :radius="variant.erode" result="core" />
        <feComposite in="face" in2="core" operator="out" result="ring" />
        <feGaussianBlur in="ring" :stdDeviation="variant.blur" result="band" />
        <feColorMatrix
          in="band"
          type="matrix"
          values="0 0 0 1 0  0 0 0 1 0  0 0 0 1 0  0 0 0 0 1"
          result="band-ink"
        />
        <feComponentTransfer in="band-ink" result="band-map">
          <feFuncR type="table" tableValues="0.5 1" />
          <feFuncG type="table" tableValues="0.5 1" />
        </feComponentTransfer>
        <feDisplacementMap
          in="SourceGraphic"
          in2="band-map"
          :scale="variant.scale"
          xChannelSelector="R"
          yChannelSelector="G"
          result="bent"
        />
        <feSpecularLighting
          in="band"
          surfaceScale="0.6"
          :specularConstant="variant.specularConstant"
          :specularExponent="variant.specularExponent"
          lighting-color="#ffffff"
          result="spec"
        >
          <feDistantLight azimuth="225" elevation="55" />
        </feSpecularLighting>
        <feComposite in="spec" in2="band" operator="in" result="spec-band" />
        <feComposite in="spec-band" in2="bent" operator="in" result="spec-in" />
        <feMerge>
          <feMergeNode in="bent" />
          <feMergeNode in="spec-in" />
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
