<!-- apps/kimi-web/src/components/chat/MarkdownFrontmatter.vue -->
<!-- The YAML frontmatter of a message, rendered as a metadata card: one row per
     entry, and array values as chips. A block outside the subset
     lib/frontmatter understands is shown raw inside the same card, so nothing
     is hidden. -->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { parseFrontmatterEntries } from '../../lib/frontmatter';
import Badge from '../ui/Badge.vue';
import Card from '../ui/Card.vue';

const props = defineProps<{ source: string }>();

const { t } = useI18n();
const entries = computed(() => parseFrontmatterEntries(props.source));
</script>

<template>
  <Card class="md-metadata" role="region" :aria-label="t('filePreview.metadata')">
    <div class="md-metadata-title">{{ t('filePreview.metadata') }}</div>
    <dl v-if="entries" class="md-metadata-fields">
      <template v-for="entry in entries" :key="entry.key">
        <dt>{{ entry.key }}</dt>
        <dd>
          <div v-if="entry.tags" class="md-metadata-tags">
            <span v-for="(tag, i) in entry.tags" :key="i" class="md-metadata-tag">
              <Badge>{{ tag }}</Badge>
            </span>
          </div>
          <span v-else class="md-metadata-value">{{ entry.value }}</span>
        </dd>
      </template>
    </dl>
    <pre v-else class="md-metadata-source">{{ source }}</pre>
  </Card>
</template>

<style scoped>
.md-metadata {
  margin: 0 0 var(--space-3);
}

.md-metadata-title {
  margin-bottom: var(--space-2);
  font-weight: var(--weight-medium);
  color: var(--color-text-muted);
}

.md-metadata-fields {
  display: grid;
  grid-template-columns: fit-content(40%) minmax(0, 1fr);
  gap: var(--space-1) var(--space-4);
  margin: 0;
}
.md-metadata-fields dt {
  font-family: var(--font-mono);
  overflow-wrap: anywhere;
}
.md-metadata-fields dd {
  min-width: 0;
  margin: 0;
  color: var(--color-text);
}

.md-metadata-value {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.md-metadata-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}
/* A chip longer than the row scrolls instead of stretching the grid column. */
.md-metadata-tag {
  max-width: 100%;
  overflow-x: auto;
}

.md-metadata-source {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
  font-family: var(--font-mono);
}
</style>
