// apps/kimi-web/src/lib/bareDuration.ts
// Bare elapsed time in upstream's units ("5m4s", "11h39m", "9s") — the form its
// task rows and its goal panel head show, taken from the same `timeUnit*`
// strings its bundle carries. Upstream's rule (`Oc` in its bundle): a zero
// component is dropped ("5m", not "5m0s"), and anything under a second formats
// to nothing at all, which is how its rows come to show no time.

import { i18n } from '../i18n';

const t = i18n.global.t;

export function bareDuration(seconds: number): string {
  const hour = t('tasks.durationHour');
  const minute = t('tasks.durationMinute');
  const second = t('tasks.durationSecond');
  const total = Math.max(0, Math.floor(seconds));
  if (total < 60) return total === 0 ? '' : `${total}${second}`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) {
    const s = total % 60;
    return s === 0 ? `${minutes}${minute}` : `${minutes}${minute}${s}${second}`;
  }
  const hours = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${hours}${hour}` : `${hours}${hour}${m}${minute}`;
}
