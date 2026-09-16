<!-- apps/kimi-web/src/components/settings/AccountPlanUsage.vue
     Settings → Account: the managed account's plan usage. Each quota row
     carries its label, the reset countdown and a meter; the monthly row splits
     into the Kimi and Code segments and gains the legend for them. The booster
     wallet (balance, monthly charge) follows as its own group when the server
     reports one. -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { getKimiWebApi } from '../../api';
import type { ManagedUsageResult, UsageQuotaEntry } from '../../api/types';
import {
  planUsageMoney,
  planUsageMonthSplit,
  planUsagePct,
  planUsageReset,
  planUsageRows,
  type PlanUsageDurationUnit,
  type PlanUsageRowKey,
} from '../../lib/planUsage';
import Button from '../ui/Button.vue';
import Spinner from '../ui/Spinner.vue';
import Tooltip from '../ui/Tooltip.vue';

export type AccountPlanUsage = ManagedUsageResult;

const props = withDefaults(
  defineProps<{
    account?: string | null;
    usage?: AccountPlanUsage | null;
    loading?: boolean;
  }>(),
  { account: null, usage: null, loading: false },
);

const { t } = useI18n();

/** Retry repeats the request the app root makes on sign-in, so a failed load
 *  can be recovered from inside the panel. */
const reloaded = ref<AccountPlanUsage | null>(null);
const reloading = ref(false);

const result = computed(() => reloaded.value ?? props.usage);
const busy = computed(() => reloading.value || props.loading);
const quota = computed(() => (result.value?.kind === 'ok' ? result.value.quota : null));
const booster = computed(() => quota.value?.extraUsage ?? null);
const rows = computed(() => (quota.value === null ? [] : planUsageRows(quota.value.usages)));
const split = computed(() =>
  quota.value === null ? null : planUsageMonthSplit(quota.value.usages),
);
const failedText = computed(() =>
  result.value?.kind === 'error' ? result.value.message : t('settings.planUsageLoadFailed'),
);
const monthlyCap = computed(
  () =>
    booster.value !== null &&
    booster.value.monthlyChargeLimitEnabled &&
    booster.value.monthlyChargeLimitCents > 0,
);
const monthlyUsedRatio = computed(() => {
  const wallet = booster.value;
  if (wallet === null || wallet.monthlyChargeLimitCents <= 0) return 0;
  return wallet.monthlyUsedCents / wallet.monthlyChargeLimitCents;
});

const DURATION_KEYS: Record<PlanUsageDurationUnit, string> = {
  day: 'settings.planUsageDurationDay',
  hour: 'settings.planUsageDurationHour',
  minute: 'settings.planUsageDurationMinute',
  second: 'settings.planUsageDurationSecond',
};

const LABEL_KEYS: Record<PlanUsageRowKey, { key: string; n?: number }> = {
  limit5h: { key: 'settings.planUsageHourLimit', n: 5 },
  limit7d: { key: 'settings.planUsageWeekLimit' },
  monthTotal: { key: 'settings.planUsageMonthlyLimit' },
};

function rowLabel(key: PlanUsageRowKey): string {
  const label = LABEL_KEYS[key];
  return label.n === undefined ? t(label.key) : t(label.key, { n: label.n });
}

function resetText(entry: UsageQuotaEntry): string {
  const reset = planUsageReset(entry.resetAt, Date.now());
  if (reset === null) return '';
  if (reset.kind === 'done') return t('settings.planUsageResetDone');
  const duration = reset.parts
    .map((part) => t(DURATION_KEYS[part.unit], { n: part.n }))
    .join(' ');
  return t('settings.planUsageResetsIn', { duration });
}

async function reload(): Promise<void> {
  if (reloading.value) return;
  reloading.value = true;
  try {
    reloaded.value = await getKimiWebApi().getManagedUsage();
  } catch {
    reloaded.value = { kind: 'error', message: t('settings.planUsageLoadFailed') };
  } finally {
    reloading.value = false;
  }
}
</script>

<template>
  <section class="plan-usage">
    <h3 class="usage-title">{{ t('settings.planUsageTitle') }}</h3>
    <div v-if="account" class="account-line">{{ account }}</div>

    <div class="usage-group">
      <div v-if="busy" class="usage-row usage-state">
        <Spinner size="sm" />
      </div>
      <div v-else-if="quota === null" class="usage-row usage-state">
        <span class="usage-error">{{ failedText }}</span>
        <Button variant="ghost" size="sm" @click="reload">
          {{ t('settings.planUsageRetry') }}
        </Button>
      </div>
      <template v-else>
        <div v-if="rows.length === 0" class="usage-row usage-state usage-empty">
          {{ t('settings.planUsageEmpty') }}
        </div>
        <div v-for="row in rows" :key="row.key" class="usage-row">
          <span class="usage-main">
            <span class="usage-label">{{ rowLabel(row.key) }}</span>
            <span v-if="resetText(row.entry)" class="usage-hint">{{ resetText(row.entry) }}</span>
            <span v-if="row.key === 'monthTotal' && split" class="usage-legend">
              <span class="usage-legend-item">
                <span class="usage-swatch usage-swatch-kimi" aria-hidden="true" />Kimi
              </span>
              <span class="usage-legend-item">
                <span class="usage-swatch usage-swatch-code" aria-hidden="true" />Code
              </span>
            </span>
          </span>
          <span class="usage-value">
            {{ t('settings.planUsageUsedPct', { pct: planUsagePct(row.entry.usedRatio) }) }}
          </span>
          <span
            v-if="row.key === 'monthTotal' && split"
            class="usage-meter usage-meter-stacked"
            role="progressbar"
            :aria-label="rowLabel(row.key)"
            :aria-valuenow="planUsagePct(row.entry.usedRatio)"
            aria-valuemax="100"
          >
            <Tooltip
              :text="
                t('settings.planUsageSegmentUsage', {
                  name: 'Kimi',
                  pct: planUsagePct(split.kimiRatio),
                })
              "
            >
              <span
                class="usage-seg usage-seg-kimi"
                :class="{ 'is-tip': split.codeRatio <= 0 }"
                :style="{ width: `${planUsagePct(split.kimiRatio)}%` }"
              />
            </Tooltip>
            <Tooltip
              :text="
                t('settings.planUsageSegmentUsage', {
                  name: 'Code',
                  pct: planUsagePct(split.codeRatio),
                })
              "
            >
              <span
                class="usage-seg usage-seg-code"
                :style="{ width: `${planUsagePct(split.codeRatio)}%` }"
              />
            </Tooltip>
          </span>
          <span
            v-else
            class="usage-meter"
            role="progressbar"
            :aria-label="rowLabel(row.key)"
            :aria-valuenow="planUsagePct(row.entry.usedRatio)"
            aria-valuemax="100"
          >
            <span class="usage-seg" :style="{ width: `${planUsagePct(row.entry.usedRatio)}%` }" />
          </span>
        </div>
      </template>
    </div>

    <template v-if="booster">
      <h3 class="usage-title booster-title">{{ t('settings.planUsageBoosterTitle') }}</h3>
      <div class="usage-group">
        <div class="usage-row">
          <span class="usage-main">
            <span class="usage-label">{{ t('settings.planUsageMonthlyUsed') }}</span>
          </span>
          <span class="usage-value">
            {{ planUsageMoney(booster.monthlyUsedCents, booster.currency) }}
            <span v-if="monthlyCap" class="usage-value-sub">
              / {{ planUsageMoney(booster.monthlyChargeLimitCents, booster.currency) }}
            </span>
          </span>
          <span
            v-if="monthlyCap"
            class="usage-meter"
            role="progressbar"
            :aria-label="t('settings.planUsageMonthlyUsed')"
            :aria-valuenow="planUsagePct(monthlyUsedRatio)"
            aria-valuemax="100"
          >
            <span class="usage-seg" :style="{ width: `${planUsagePct(monthlyUsedRatio)}%` }" />
          </span>
        </div>
        <div class="usage-row">
          <span class="usage-main">
            <span class="usage-label">{{ t('settings.planUsageBoosterLimit') }}</span>
          </span>
          <span class="usage-value">
            {{
              monthlyCap
                ? planUsageMoney(booster.monthlyChargeLimitCents, booster.currency)
                : t('settings.planUsageUnlimited')
            }}
          </span>
        </div>
        <div class="usage-row">
          <span class="usage-main">
            <span class="usage-label">{{ t('settings.planUsageBoosterBalance') }}</span>
          </span>
          <span class="usage-value">
            {{ planUsageMoney(booster.balanceCents, booster.currency) }}
          </span>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.plan-usage { margin-top: var(--space-4); }
.usage-title { margin: 0 0 var(--space-2); font-size: var(--text-xs); font-weight: var(--weight-medium); letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-text-muted); }
.booster-title { margin-top: var(--space-4); }
.account-line { margin-bottom: var(--space-2); color: var(--color-text); font-size: var(--text-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Rows follow the settings groups around the panel: one surface, hairline
   separators, 52px rows. The meter sits last on the row, after the value. */
.usage-group { overflow: hidden; border-radius: var(--radius-xl); background: var(--color-surface); }
.usage-row { display: flex; align-items: center; gap: var(--space-3); min-height: 52px; padding: var(--space-3) var(--space-4); border-top: 1px solid var(--color-line); }
.usage-row:first-child { border-top: none; }
.usage-state { color: var(--color-text-muted); font-size: var(--text-sm); }
.usage-empty { color: var(--color-text-faint); }
.usage-error { flex: 1; min-width: 0; }
.usage-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.usage-label { font-size: var(--text-sm); color: var(--color-text); }
.usage-hint { font-size: var(--text-xs); color: var(--color-text-faint); }
.usage-value { flex: none; font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--color-text); font-variant-numeric: tabular-nums; white-space: nowrap; }
.usage-value-sub { font-weight: var(--weight-regular); color: var(--color-text-faint); }
.usage-legend { display: flex; align-items: center; gap: var(--space-3); }
.usage-legend-item { display: inline-flex; align-items: center; gap: var(--space-1); font-size: var(--text-xs); color: var(--color-text-faint); }
.usage-swatch { width: 8px; height: 8px; border-radius: var(--radius-xs); }
.usage-swatch-kimi { background: var(--color-text); }
.usage-swatch-code { background: var(--color-accent); }
.usage-meter { flex: none; display: block; width: 120px; height: 5px; border-radius: var(--radius-full); background: var(--color-line); overflow: hidden; }
.usage-meter-stacked { display: flex; }
.usage-seg { display: block; height: 100%; border-radius: var(--radius-full); background: var(--color-accent); transition: width var(--duration-base) var(--ease-out); }
.usage-seg-kimi { background: var(--color-text); }
/* Stacked segments are squared off where they meet and rounded only on the
   outer end, which the meter's own rounding already gives the left side. */
.usage-meter-stacked .usage-seg-kimi { border-radius: 0; }
.usage-meter-stacked .usage-seg-kimi.is-tip { border-radius: 0 var(--radius-full) var(--radius-full) 0; }
.usage-meter-stacked .usage-seg-code { border-radius: 0 var(--radius-full) var(--radius-full) 0; }
</style>
