<!-- apps/kimi-web/src/components/chat/EmptyDoodle.vue -->
<!-- New-chat landing doodle: upstream's Rive animation (retro computer over
     the KIMI wordmark). Lazily imports @rive-app/canvas and falls back to the
     plain title text whenever Rive can't run (reduced motion, wasm/riv load
     failure, exception) — the fallback IS the pre-port look, so this never
     renders worse than before. The artboard follows the app theme through the
     state machine's "light/dark" number input (1 = dark), mirroring upstream's
     KimiDoodle. -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useIsDark } from '../../composables/useIsDark';
import rivUrl from '../../assets/rive/k3_doodle1.riv?url';
import wasmUrl from '../../assets/rive/rive.wasm?url';

const { t } = useI18n();
const isDark = useIsDark();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const failed = ref(false);
let stop: (() => void) | null = null;

onMounted(async () => {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      failed.value = true;
      return;
    }
    const { Rive, Layout, Fit, RuntimeLoader } = await import('@rive-app/canvas');
    RuntimeLoader.setWasmUrl(wasmUrl);
    let themeInput: { value: number | boolean } | null = null;
    const applyTheme = () => {
      if (themeInput) themeInput.value = isDark.value ? 1 : 0;
    };
    const rive = new Rive({
      canvas: canvasRef.value!,
      src: rivUrl,
      layout: new Layout({ fit: Fit.Contain }),
      autoplay: true,
      onLoad: () => {
        const sm = rive.stateMachineNames[0];
        if (!sm) return;
        rive.play(sm);
        themeInput =
          (rive.stateMachineInputs(sm) ?? []).find((input) => input.name === 'light/dark') ?? null;
        // Mirror upstream: apply on the next frame so the state machine is
        // actually running when the input lands.
        requestAnimationFrame(applyTheme);
      },
      onLoadError: () => {
        failed.value = true;
      },
    });
    const stopThemeWatch = watch(isDark, applyTheme);
    stop = () => {
      stopThemeWatch();
      try {
        rive.stop();
      } catch {
        /* already torn down */
      }
    };
  } catch {
    failed.value = true;
  }
});

onUnmounted(() => stop?.());
</script>

<template>
  <div class="doodle-host empty-doodle">
    <canvas
      v-show="!failed"
      ref="canvasRef"
      class="doodle-canvas"
      width="560"
      height="220"
      role="img"
      aria-label="Kimi"
    ></canvas>
    <div v-if="failed" class="doodle-fallback">{{ t('composer.emptyConversationTitle') }}</div>
  </div>
</template>

<style scoped>
.empty-doodle {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 96px;
  width: 100%;
}
/* Upstream's landing doodle box: `min(340px, 62vw)` wide at its own 338/152
   ratio (measured 340x152.9), against the fork's earlier 280x110. Rive lays the
   art out with `Fit.Contain`, so a different box cannot distort it. */
.doodle-canvas {
  width: min(340px, 62vw);
  height: auto;
  aspect-ratio: 338 / 152;
}
.doodle-fallback {
  font-family: var(--font-ui);
  font-size: calc(var(--ui-font-size) + 16px);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
}
</style>
