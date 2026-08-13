<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { Rive, RuntimeLoader } from '@rive-app/canvas';
import avatarUrl from '../../assets/rive/kimi_avatar_default.riv?url';
import riveWasmUrl from '../../assets/rive/rive.wasm?url';
import riveFallbackWasmUrl from '../../assets/rive/rive_fallback.wasm?url';

const props = withDefaults(
  defineProps<{
    size?: number;
    label?: string;
  }>(),
  { size: 48, label: 'Kimi' },
);

const canvas = ref<HTMLCanvasElement | null>(null);
const failed = ref(false);
let rive: Rive | null = null;
let onResize: (() => void) | null = null;

onMounted(() => {
  if (!canvas.value) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    failed.value = true;
    return;
  }

  try {
    RuntimeLoader.setWasmUrl(riveWasmUrl);
    RuntimeLoader.setWasmFallbackUrl(riveFallbackWasmUrl);
    const instance = new Rive({
      canvas: canvas.value,
      src: avatarUrl,
      autoplay: true,
      onLoad: () => {
        const stateMachine = instance.stateMachineNames[0];
        if (stateMachine) instance.play(stateMachine);
        instance.resizeDrawingSurfaceToCanvas();
      },
      onLoadError: () => {
        failed.value = true;
      },
    });
    rive = instance;
    onResize = () => instance.resizeDrawingSurfaceToCanvas();
    window.addEventListener('resize', onResize);
  } catch {
    failed.value = true;
  }
});

onBeforeUnmount(() => {
  if (onResize) window.removeEventListener('resize', onResize);
  onResize = null;
  rive?.cleanup();
  rive = null;
});
</script>

<template>
  <span
    class="rive-avatar"
    :style="{ width: `${size}px`, height: `${size}px` }"
    role="img"
    :aria-label="label"
  >
    <canvas v-if="!failed" ref="canvas" :width="size * 2" :height="size * 2" />
    <span v-else class="rive-avatar__fallback" aria-hidden="true">K</span>
  </span>
</template>

<style scoped>
.rive-avatar {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}
.rive-avatar canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.rive-avatar__fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
</style>
