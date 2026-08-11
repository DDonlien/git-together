<script lang="ts">
	import AnalyticsSettings from "$components/shared/AnalyticsSettings.svelte";
	import { SETTINGS_SERVICE } from "$lib/settings/appSettings";
	import { inject } from "@gitbutler/core/context";
	import { AsyncButton, TestId } from "@gitbutler/ui";

	const settingsService = inject(SETTINGS_SERVICE);
	const appSettings = $derived(settingsService.appSettings);
</script>

<div class="analytics-confirmation">
	<h1 class="title text-serif-42">Privacy by default</h1>
	<AnalyticsSettings />

	{#if $appSettings !== undefined}
		<div class="analytics-confirmation__actions">
			<AsyncButton
				style="pop"
				testId={TestId.OnboardingPageAnalyticsSettingsContinueButton}
				icon="chevron-right"
				action={async () => {
					await settingsService.updateOnboardingComplete(true);
				}}
			>
				Continue
			</AsyncButton>
		</div>
	{/if}
</div>

<style lang="postcss">
	.analytics-confirmation {
		display: flex;
		flex-direction: column;
		width: 100%;
		gap: 12px;
	}

	.title {
		color: var(--text-1);
	}

	.analytics-confirmation__actions {
		display: flex;
		justify-content: flex-end;
	}
</style>
