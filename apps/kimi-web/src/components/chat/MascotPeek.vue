<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

const svgRef = ref<SVGSVGElement | null>(null);
let blinkTimer: ReturnType<typeof setTimeout> | undefined;
let enterTimer: ReturnType<typeof setTimeout> | undefined;

function blinkOnce(): void {
  const el = svgRef.value;
  if (!el) return;
  el.classList.remove('is-blinking');
  void el.getBoundingClientRect();
  el.classList.add('is-blinking');
  clearTimeout(blinkTimer);
  blinkTimer = setTimeout(() => el.classList.remove('is-blinking'), 300);
}

function blinkOnEntry(): void {
  const el = svgRef.value;
  if (!el) return;
  el.classList.remove('is-entering');
  void el.getBoundingClientRect();
  el.classList.add('is-entering');
  clearTimeout(enterTimer);
  enterTimer = setTimeout(() => el.classList.remove('is-entering'), 700);
}

onMounted(blinkOnEntry);

onBeforeUnmount(() => {
  clearTimeout(blinkTimer);
  clearTimeout(enterTimer);
});
</script>

<template>
  <svg
    ref="svgRef"
    class="mascot-peek"
    viewBox="0 0 65 36"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    @click="blinkOnce"
  >
    <path d="M59.6211 0C62.2733 0 64.4233 2.14999 64.4233 4.80213C64.4233 7.45428 62.2733 9.60426 59.6211 9.60426H55.384C55.072 9.60426 54.819 9.35132 54.819 9.03931V4.80213C54.819 2.14999 56.969 0 59.6211 0Z" />
    <path d="M29.2718 0.746931C45.4382 0.746939 58.5435 13.8523 58.5435 30.0187C58.5435 32.0684 58.3331 34.0692 57.9322 36H0.611314C0.210431 34.0692 0 32.0684 0 30.0187C0 13.8523 13.1053 0.746931 29.2718 0.746931Z" />
    <g class="eyes">
      <path d="M33.134 17.5415C32.8534 15.4987 30.9828 14.0689 28.9563 14.3472C26.9299 14.6256 25.5149 16.5066 25.7953 18.5492L26.6498 24.7698C26.9303 26.8124 28.8 28.2431 30.8264 27.965C32.8529 27.6867 34.269 25.8048 33.9885 23.762L33.134 17.5415Z" />
      <path d="M47.7987 15.6802C47.532 13.7397 45.8374 12.3692 44.0136 12.6197C42.1898 12.8702 40.927 14.6468 41.1934 16.5874L42.0058 22.4974C42.2725 24.4378 43.9671 25.8074 45.7909 25.5569C47.6145 25.3061 48.8766 23.5306 48.6102 21.5902L47.7987 15.6802Z" />
    </g>
  </svg>
</template>

<style scoped>
.mascot-peek {
  display: block;
  width: 100%;
  height: auto;
  fill: var(--logo);
  cursor: pointer;
  user-select: none;
  touch-action: manipulation;
}
.eyes {
  transform-box: fill-box;
  transform-origin: center;
  transition: transform var(--duration-fast) var(--ease-out);
  fill: var(--color-text-on-accent);
}
.mascot-peek.is-blinking .eyes {
  transform: scaleY(0.08);
}
.mascot-peek.is-entering .eyes {
  animation: mascot-enter-blink 240ms var(--ease-in-out) 450ms backwards;
}
@keyframes mascot-enter-blink {
  0%,
  100% {
    transform: scaleY(1);
  }
  50% {
    transform: scaleY(0.08);
  }
}
</style>
