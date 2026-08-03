import { createApp } from 'vue';
import App from './App.vue';
import i18n from './i18n';
import { installClientErrorCapture } from './debug/trace';
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/inter/opsz-italic.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './style.css';

// Always retain bounded metadata for uncaught failures. With ?debug=1 / the
// debug flag, console output is included too; HMR restores listeners/wrappers.
installClientErrorCapture();

// Dev-only performance bench harness: ?bench=1 mounts an isolated page that
// renders the real presentational components off synthetic data (no server).
// `import.meta.env.DEV` is replaced with the literal `false` in production
// builds, so this whole branch — including the dynamic BenchView import — is
// dead-code-eliminated and the production bundle stays unchanged.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('bench') === '1') {
  void import('./views/BenchView.vue').then(({ default: BenchView }) => {
    createApp(BenchView).use(i18n).mount('#app');
  });
} else {
  createApp(App).use(i18n).mount('#app');
}
