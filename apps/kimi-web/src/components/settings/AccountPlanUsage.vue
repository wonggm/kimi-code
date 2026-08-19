<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

export interface AccountPlanUsageWindow {
  duration: number;
  unit: 'minute' | 'hour' | 'day' | 'week';
}

export interface AccountPlanUsageRow {
  name?: string;
  window?: AccountPlanUsageWindow;
  used: number;
  limit: number;
  reset_at?: string;
}

export type AccountPlanUsage =
  | {
      kind: 'ok';
      summary: AccountPlanUsageRow | null;
      limits: AccountPlanUsageRow[];
      extra_usage: {
        balance_cents: number;
        total_cents: number;
        monthly_charge_limit_enabled: boolean;
        monthly_charge_limit_cents: number;
        monthly_used_cents: number;
        currency: string;
      } | null;
    }
  | { kind: 'error'; message: string; status?: number };

const props = withDefaults(
  defineProps<{
    account?: string | null;
    usage?: AccountPlanUsage | null;
    loading?: boolean;
  }>(),
  { account: null, usage: null, loading: false },
);

const { t } = useI18n();

function formatReset(value: string | undefined): string {
  if (!value) return t('settings.planUsageNoReset');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatRow(row: AccountPlanUsageRow): string {
  const remaining = Math.max(0, row.limit - row.used).toLocaleString();
  const pct = row.limit > 0 ? Math.round((row.used / row.limit) * 100) : 0;
  const usedPct = pct > 0 ? `${t('settings.planUsageUsedPct', { pct })} · ` : '';
  return `${usedPct}${row.used.toLocaleString()} / ${row.limit.toLocaleString()} · ${t('settings.planUsageRemaining', { remaining })}`;
}

const rows = computed(() => {
  if (props.usage?.kind !== 'ok') return [];
  return props.usage.limits.length > 0
    ? props.usage.limits
    : props.usage.summary ? [props.usage.summary] : [];
});
</script>

<template>
  <section class="plan-usage">
    <h3 class="usage-title">{{ t('settings.planUsageTitle') }}</h3>
    <div v-if="account" class="account-line">{{ account }}</div>
    <div v-if="loading" class="usage-state">{{ t('settings.planUsageLoading') }}</div>
    <div v-else-if="usage === null || usage === undefined" class="usage-state">
      {{ t('settings.planUsageUnavailable') }}
    </div>
    <div v-else-if="usage.kind === 'error'" class="usage-state">{{ usage.message }}</div>
    <template v-else>
      <div v-if="rows.length === 0" class="usage-state">{{ t('settings.planUsageEmpty') }}</div>
      <div v-for="(row, index) in rows" :key="`${row.name ?? 'limit'}-${index}`" class="usage-row">
        <span class="usage-label">{{ row.name ?? t('settings.planUsageLimit') }}</span>
        <span class="usage-value">{{ formatRow(row) }}</span>
        <span class="usage-reset">{{ t('settings.planUsageResets', { time: formatReset(row.reset_at) }) }}</span>
      </div>
    </template>
  </section>
</template>

<style scoped>
.plan-usage { margin-top: var(--space-4); padding: var(--space-3); border: 1px solid var(--color-line); border-radius: var(--radius-md); background: var(--color-surface-sunken); }
.usage-title { margin: 0 0 var(--space-2); font-size: var(--text-xs); font-weight: var(--weight-medium); letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-text-muted); }
.account-line { margin-bottom: var(--space-2); color: var(--color-text); font-size: var(--text-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.usage-state { color: var(--color-text-muted); font-size: var(--text-sm); }
/* Density: rows sized to the settings baseline (labels at text-base, values at
   text-sm, taller padding) so the usage panel reads at the same weight as the
   surrounding account rows. */
.usage-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-1) var(--space-3); padding: var(--space-3) 0; border-top: 1px solid var(--color-line); }
.usage-label { color: var(--color-text); font-size: var(--text-base); }
.usage-value { color: var(--color-text); font-family: var(--font-mono); font-size: var(--text-sm); }
.usage-reset { grid-column: 1 / -1; color: var(--color-text-faint); font-size: var(--text-xs); }
</style>
