<!-- apps/kimi-web/src/components/chat/ComposerAddMenu.vue -->
<!-- Content of the composer "+" menu (Files / Goal / Plan / Swarm). Rendered
     inside the composer's anchored add-menu panel on desktop and inside the
     mobile bottom sheet; the rows and their actions are identical in both,
     so the content lives here once and the composer picks the wrapper. -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Icon from '../ui/Icon.vue';

withDefaults(
  defineProps<{
    /** Files row shows only when the composer accepts uploads. */
    hasUpload: boolean;
    /** Upstream's mobile sheet carries the Commands and Mention rows; its
        desktop popover does not, so the composer decides per surface. */
    showTriggerRows?: boolean;
    goalActive: boolean;
    goalMode: boolean;
    goalCanPause: boolean;
    goalCanResume: boolean;
    planOn: boolean;
    planArmedOn: boolean;
    swarmOn: boolean;
  }>(),
  {
    hasUpload: false,
    showTriggerRows: false,
    goalActive: false,
    goalMode: false,
    goalCanPause: false,
    goalCanResume: false,
    planOn: false,
    planArmedOn: false,
    swarmOn: false,
  },
);

const emit = defineEmits<{
  files: [];
  /** Mobile-only: seed the composer with the '/' trigger. */
  commands: [];
  /** Mobile-only: seed the composer with the '@' trigger. */
  mention: [];
  /** Goal row: arm for the next send, or focus the running goal when active. */
  goalMain: [];
  /** Plan row: arm for the next send, or turn an active plan off. */
  plan: [];
  swarm: [];
  pause: [];
  resume: [];
  cancel: [];
}>();

const { t } = useI18n();

// Goal / Plan / Swarm marks, copied verbatim from the upstream bundle's
// Kimi icon set. They are inlined here rather than registered in
// lib/icons.ts because the registry's nearest entries (target-line,
// file-edit-line, sparkling-line) draw different glyphs; Files reuses the
// registry's attachment icon, which is already byte-identical to upstream's.
const GOAL_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="kw-icon" aria-hidden="true"><path d="M7.01562 3.41459C7.4446 3.16449 7.9954 3.30924 8.24609 3.73784C8.49645 4.167 8.35189 4.71868 7.92285 4.96928C5.51497 6.37506 3.90054 8.98498 3.90039 11.9703C3.90076 16.4435 7.52672 20.0699 12 20.0699C16.4733 20.0699 20.0992 16.4435 20.0996 11.9703C20.0996 11.2291 20 10.5116 19.8145 9.83159C19.6838 9.35222 19.967 8.85702 20.4463 8.72612C20.9256 8.59541 21.4207 8.87778 21.5518 9.35698C21.7792 10.1901 21.9004 11.0674 21.9004 11.9703C21.9 17.4376 17.4674 21.8697 12 21.8697C6.53261 21.8697 2.09998 17.4376 2.09961 11.9703C2.09976 8.31904 4.07782 5.12972 7.01562 3.41459ZM8.39258 8.24077C8.75015 7.89591 9.3199 7.90591 9.66504 8.26323C10.01 8.62076 9.99985 9.19051 9.64258 9.53569C9.00203 10.1541 8.60558 11.02 8.60547 11.979C8.60584 13.8536 10.1253 15.3736 12 15.3736C13.8746 15.3735 15.3942 13.8536 15.3945 11.979C15.3945 11.6847 15.3577 11.3989 15.2881 11.1285C15.1646 10.6474 15.4536 10.1568 15.9346 10.0328C16.4158 9.9089 16.9071 10.1991 17.0312 10.6802C17.1383 11.096 17.1943 11.5321 17.1943 11.979C17.194 14.8477 14.8688 17.1733 12 17.1734C9.1312 17.1734 6.80506 14.8478 6.80469 11.979C6.8048 10.5117 7.41519 9.18431 8.39258 8.24077ZM11.5459 1.12651C11.8216 0.965605 12.1631 0.963306 12.4414 1.11967L19.1953 4.91752C19.4859 5.08108 19.662 5.39277 19.6533 5.72612C19.6443 6.05972 19.4515 6.36154 19.1523 6.50932L12.9004 9.5933V12.2583C12.9004 12.7554 12.4971 13.1587 12 13.1587C11.5029 13.1587 11.0996 12.7554 11.0996 12.2583V1.90385C11.0999 1.58444 11.2702 1.2878 11.5459 1.12651ZM12.9004 7.58549L16.8252 5.64897L12.9004 3.44194V7.58549Z" fill="currentColor"></path></svg>';

const PLAN_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="kw-icon" aria-hidden="true"><path d="M18.0179 3.09998C18.3963 3.10003 18.7709 3.17491 19.1205 3.31971C19.4701 3.46454 19.7884 3.67614 20.056 3.94373C20.3237 4.21144 20.5362 4.52965 20.681 4.87928C20.8258 5.22887 20.8997 5.60423 20.8997 5.9828C20.8997 6.36118 20.8257 6.73591 20.681 7.08533C20.5362 7.43497 20.3237 7.75317 20.056 8.02088L17.639 10.4379L9.15756 18.9183C8.5296 19.5463 7.74274 19.992 6.8812 20.2074L4.21811 20.8734C3.91148 20.95 3.5871 20.8596 3.36362 20.6361C3.14017 20.4126 3.05063 20.0883 3.12729 19.7816L3.79233 17.1185C4.00771 16.257 4.45344 15.4701 5.08139 14.8422L15.9798 3.94373C16.5203 3.40346 17.2536 3.09998 18.0179 3.09998ZM19.0003 19.1C19.4972 19.1002 19.8997 19.5034 19.8997 20.0004C19.8995 20.4971 19.4971 20.8996 19.0003 20.8998H12.0003C11.5034 20.8998 11.1001 20.4973 11.0999 20.0004C11.0999 19.5033 11.5033 19.1 12.0003 19.1H19.0003ZM18.0179 4.89979C17.7309 4.89979 17.4553 5.01417 17.2523 5.21717L6.35385 16.1146C5.95661 16.5119 5.67469 17.01 5.53842 17.5551L5.23666 18.7631L6.44467 18.4613C6.98971 18.3251 7.48782 18.0431 7.8851 17.6459L18.7826 6.74744C18.883 6.64702 18.9635 6.52821 19.0179 6.39686C19.0723 6.26558 19.0999 6.1247 19.0999 5.9828C19.0999 5.84075 19.0723 5.69916 19.0179 5.56776C18.9635 5.43645 18.883 5.31757 18.7826 5.21717C18.6821 5.11678 18.5631 5.03716 18.432 4.9828C18.3008 4.92845 18.16 4.89983 18.0179 4.89979Z" fill="currentColor"></path></svg>';

const COMMANDS_ICON =
  '<svg data-v-a1d223ba=\"\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\" class=\"kw-icon\" aria-hidden=\"true\"><path d=\"M16.5293 15.0596C16.9496 15.1021 17.2772 15.4572 17.2773 15.8887C17.2773 16.3202 16.9497 16.6753 16.5293 16.7178L16.4443 16.7217H12C11.5399 16.7216 11.167 16.3488 11.167 15.8887C11.1671 15.4286 11.54 15.0558 12 15.0557H16.4443L16.5293 15.0596Z\" fill=\"currentColor\"></path><path d=\"M6.96582 7.52246C7.27077 7.21751 7.75375 7.1983 8.08105 7.46484L8.14453 7.52246L10.8232 10.2002C11.5102 10.8872 11.5102 12.0014 10.8232 12.6885L8.14453 15.3672L8.08105 15.4248C7.75377 15.6913 7.27075 15.6721 6.96582 15.3672C6.66114 15.0621 6.64234 14.5791 6.90918 14.252L6.96582 14.1885L9.64453 11.5098C9.68057 11.4736 9.68062 11.415 9.64453 11.3789L6.96582 8.7002C6.64116 8.37488 6.6411 7.84774 6.96582 7.52246Z\" fill=\"currentColor\"></path><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M17 3.09961C19.1539 3.09966 20.9004 4.84612 20.9004 7V17C20.9004 19.1539 19.1539 20.9003 17 20.9004H7C4.84609 20.9004 3.09961 19.1539 3.09961 17V7C3.09961 4.84609 4.84609 3.09961 7 3.09961H17ZM7 4.90039C5.8402 4.90039 4.90039 5.8402 4.90039 7V17C4.90039 18.1598 5.8402 19.0996 7 19.0996H17C18.1598 19.0996 19.0996 18.1598 19.0996 17V7C19.0996 5.84024 18.1598 4.90044 17 4.90039H7Z\" fill=\"currentColor\"></path></svg>';

const MENTION_ICON =
  '<svg data-v-a1d223ba=\"\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\" class=\"kw-icon\" aria-hidden=\"true\"><path d=\"M2.20312 12.2657C2.20312 6.22136 6.37933 2.2002 12.2978 2.2002C17.8831 2.2002 21.8031 5.81671 21.8031 11.2541C21.8031 14.4407 20.2659 16.6157 18.0625 16.6157C16.7302 16.6157 15.731 15.8317 15.3467 14.5419H15.1929C14.5524 15.9581 13.297 16.7421 11.606 16.7421C9.04391 16.7421 7.0711 14.7695 7.0711 12.0128C7.0711 9.15503 9.04391 7.10652 11.606 7.10652C13.0408 7.10652 14.3731 7.91581 14.9623 9.00329H15.0904V7.51116H16.8839V13.0497C16.8839 14.1119 17.3707 14.7948 18.1393 14.7948C19.1385 14.7948 19.8303 13.4038 19.8303 11.33C19.8303 6.95477 16.7046 4.04639 12.2978 4.04639C7.5579 4.04639 4.20156 7.33413 4.20156 12.2657C4.20156 16.8939 7.5579 19.9287 12.2721 19.9287C13.835 19.9287 15.7053 19.4482 17.1145 18.5883L17.96 20.2322C16.3459 21.1932 14.1681 21.8002 12.2978 21.8002C6.37933 21.8002 2.20312 17.9814 2.20312 12.2657ZM9.2745 12.0128C9.2745 13.6567 10.3762 14.7695 11.9647 14.7695C13.6044 14.7695 14.7574 13.6567 14.7574 12.0128C14.7574 10.2678 13.6044 9.07916 11.9647 9.07916C10.3762 9.07916 9.2745 10.2678 9.2745 12.0128Z\" fill=\"currentColor\"></path></svg>';

const SWARM_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="kw-icon" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M18.9893 6.60743C20.5897 6.60757 21.8877 7.8926 21.8877 9.47736C21.8877 10.7416 21.0607 11.8129 19.9141 12.1955V14.257C19.914 15.8428 18.6152 17.1288 17.0137 17.1289H12.8438V20.1381C12.8437 20.6301 12.4412 21.0293 11.9443 21.0296C11.4473 21.0296 11.044 20.6302 11.0439 20.1381V16.4356C11.0441 15.8343 11.5363 15.3461 12.1436 15.3458H17.0137C17.6211 15.3457 18.1133 14.8585 18.1133 14.257V12.2129C16.9408 11.8451 16.0909 10.7598 16.0908 9.47736C16.0908 7.89251 17.3887 6.60743 18.9893 6.60743ZM18.9893 8.38953C18.3828 8.38953 17.8906 8.87684 17.8906 9.47736C17.8907 10.0778 18.3828 10.5642 18.9893 10.5642C19.5956 10.5641 20.0869 10.0777 20.0869 9.47736C20.0869 8.87693 19.5956 8.38967 18.9893 8.38953Z" fill="currentColor"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M4.89844 6.60743C6.49899 6.60747 7.79688 7.89254 7.79688 9.47736C7.79684 10.7388 6.97371 11.8078 5.83105 12.1926V14.4021C5.83105 15.0036 6.32315 15.4918 6.93066 15.4918H8.37109C8.86789 15.492 9.27038 15.8905 9.27051 16.3824C9.27051 16.8744 8.86797 17.2737 8.37109 17.2739H6.93066C5.32904 17.2739 4.03027 15.9879 4.03027 14.4021V12.2158C2.85382 11.8504 2.00004 10.7627 2 9.47736C2 7.89251 3.29784 6.60743 4.89844 6.60743ZM4.89844 8.38953C4.29196 8.38953 3.7998 8.87684 3.7998 9.47736C3.79985 10.0778 4.29198 10.5642 4.89844 10.5642C5.50485 10.5642 5.99605 10.0778 5.99609 9.47736C5.99609 8.87687 5.50488 8.38958 4.89844 8.38953Z" fill="currentColor"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M11.9434 2.9707C13.5439 2.97075 14.8418 4.25581 14.8418 5.84063C14.8418 7.11413 14.0035 8.1923 12.8438 8.56745V13.0135C12.8436 13.5056 12.4403 13.9041 11.9434 13.9041C11.4466 13.9039 11.0431 13.5055 11.043 13.0135V8.56745C9.8836 8.19209 9.04496 7.11387 9.04492 5.84063C9.04492 4.25592 10.343 2.97093 11.9434 2.9707ZM11.9434 4.75281C11.3371 4.75303 10.8447 5.24026 10.8447 5.84063C10.8448 6.44097 11.3371 6.92726 11.9434 6.92749C12.5498 6.92745 13.041 6.44108 13.041 5.84063C13.041 5.24014 12.5498 4.75285 11.9434 4.75281Z" fill="currentColor"></path></svg>';
</script>

<template>
  <!-- Rows only: upstream puts `am-scroll` inside its desktop `.add-menu` and
       renders these rows bare inside the mobile sheet's `.msheet-add`, so each
       call site supplies its own wrapper (see Composer.vue). -->
    <!-- Files — opens the attachment picker -->
    <button
      v-if="hasUpload"
      type="button"
      class="am-row"
      role="menuitem"
      @mousedown.prevent
      @click="emit('files')"
    >
      <span class="am-icon"><Icon name="attachment" size="sm" /></span>
      <span class="am-name">{{ t('composer.addFiles') }}</span>
      <span class="am-desc">{{ t('composer.addFilesDesc') }}</span>
    </button>

    <!-- Commands / Mention — upstream's mobile sheet carries these two rows and
         its desktop popover does not; each seeds the composer with the trigger
         that opens the slash / mention menu. -->
    <button
      v-if="showTriggerRows"
      type="button"
      class="am-row"
      role="menuitem"
      @mousedown.prevent
      @click="emit('commands')"
    >
      <!-- eslint-disable-next-line vue/no-v-html -- static upstream icon mark -->
      <span class="am-icon" v-html="COMMANDS_ICON" />
      <span class="am-name">{{ t('composer.addCommands') }}</span>
      <span class="am-desc">{{ t('composer.addCommandsDesc') }}</span>
    </button>
    <button
      v-if="showTriggerRows"
      type="button"
      class="am-row"
      role="menuitem"
      @mousedown.prevent
      @click="emit('mention')"
    >
      <!-- eslint-disable-next-line vue/no-v-html -- static upstream icon mark -->
      <span class="am-icon" v-html="MENTION_ICON" />
      <span class="am-name">{{ t('composer.addMention') }}</span>
      <span class="am-desc">{{ t('composer.addMentionDesc') }}</span>
    </button>

    <!-- Goal — arm for the next send; a running goal drops focus into the goal bar -->
    <button
      type="button"
      class="am-row"
      role="menuitem"
      @mousedown.prevent
      @click="emit('goalMain')"
    >
      <!-- eslint-disable-next-line vue/no-v-html -- static upstream icon mark -->
      <span class="am-icon" v-html="GOAL_ICON" />
      <span class="am-name">{{ t('status.goalLabel') }}</span>
      <span class="am-desc">{{ t('composer.addGoalDesc') }}</span>
    </button>

    <!-- Plan — arm for the next send (deferred); toggles an active plan off -->
    <button
      type="button"
      class="am-row"
      role="menuitem"
      @mousedown.prevent
      @click="emit('plan')"
    >
      <!-- eslint-disable-next-line vue/no-v-html -- static upstream icon mark -->
      <span class="am-icon" v-html="PLAN_ICON" />
      <span class="am-name">{{ t('status.planLabel') }}</span>
      <span class="am-desc">{{ t('composer.addPlanDesc') }}</span>
    </button>

    <!-- Swarm — immediate client toggle -->
    <button
      type="button"
      class="am-row"
      role="menuitem"
      @mousedown.prevent
      @click="emit('swarm')"
    >
      <!-- eslint-disable-next-line vue/no-v-html -- static upstream icon mark -->
      <span class="am-icon" v-html="SWARM_ICON" />
      <span class="am-name">{{ t('status.swarmLabel') }}</span>
      <span class="am-desc">{{ t('composer.addSwarmDesc') }}</span>
    </button>
</template>

<style scoped>
/* Row geometry and colours are upstream's add-menu rules; values in the fork's
   tokens where a token exists, otherwise upstream's literal (the fork's token
   sheet has no --p-slash-menu-h, --space-1-5, --menu-rows-seam or
   --menu-row-gap-icon). The wrapper rules live with the wrappers: `.am-scroll`
   in Composer.vue's desktop popover, `.msheet-add` in its mobile sheet. */
.am-row {
  display: flex;
  align-items: center;
  /* Upstream --menu-row-gap-icon */
  gap: 7px;
  margin: 0 -6px;
  /* Upstream padding-block/inline (2px / calc(--space-4 - --space-3 + hug) =
     10px) with --menu-row-touch-padding-block layered on top */
  padding: 11px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  cursor: pointer;
  font-size: var(--ui-font-size);
  color: var(--color-text);
  text-align: left;
  transition: background var(--duration-base) var(--ease-out);
}
.am-row:hover { background: var(--color-hover); }
.am-row:focus-visible { background: var(--color-selected); outline: none; }

.am-icon {
  flex: none;
  width: var(--p-ic-sm);
  display: flex;
  justify-content: center;
  color: var(--color-text-muted);
  transition: color var(--duration-base) var(--ease-out);
}
.am-row:hover .am-icon,
.am-row:focus-visible .am-icon { color: var(--color-text); }

.am-name {
  flex: none;
  font-weight: var(--weight-medium);
}
.am-desc {
  margin-left: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--ui-font-size-sm);
}
</style>
