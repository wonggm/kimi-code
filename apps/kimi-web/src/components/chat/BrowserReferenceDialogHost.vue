<!-- apps/kimi-web/src/components/chat/BrowserReferenceDialogHost.vue -->
<!-- Renders the single browser-reference dialog driven by
     useBrowserReferences(). Mount once at the app root: the pills that open it
     live deep in the transcript, the dialog belongs to the app. -->
<script setup lang="ts">
import { useBrowserReferences } from '../../composables/useBrowserReferences';
import BrowserReferenceDialog from './BrowserReferenceDialog.vue';

const { dialogState, closeDialog, settleDialog } = useBrowserReferences();
</script>

<template>
  <BrowserReferenceDialog
    :open="dialogState !== null"
    :state="dialogState"
    @close="closeDialog"
    @resolve="settleDialog"
  />
</template>
