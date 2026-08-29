<!-- apps/kimi-web/src/components/chat/EmptyDoodle.vue -->
<!-- New-chat landing doodle: upstream's Rive animation (retro computer over
     the KIMI wordmark). Lazily imports @rive-app/canvas and falls back to the
     plain title text whenever Rive can't run (reduced motion, wasm/riv load
     failure, exception) — the fallback IS the pre-port look, so this never
     renders worse than before. -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import rivUrl from '../../assets/rive/k3_doodle1.riv?url';
import wasmUrl from '../../assets/rive/rive.wasm?url';

const { t } = useI18n();
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
    const rive = new Rive({
      canvas: canvasRef.value!,
      src: rivUrl,
      layout: new Layout({ fit: Fit.Contain }),
      autoplay: true,
      onLoadError: () => {
        failed.value = true;
      },
    });
    stop = () => {
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
  <div class="empty-doodle">
    <canvas
      v-show="!failed"
      ref="canvasRef"
      class="doodle-canvas"
      width="560"
      height="220"
      aria-hidden="true"
    ></canvas>
    <span v-if="failed" class="doodle-fallback">{{ t('composer.emptyConversationTitle') }}</span>
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
.doodle-canvas {
  width: min(280px, 60vw);
  height: 110px;
}
.doodle-fallback {
  font-family: var(--font-ui);
  font-size: calc(var(--ui-font-size) + 16px);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
}
</style>
