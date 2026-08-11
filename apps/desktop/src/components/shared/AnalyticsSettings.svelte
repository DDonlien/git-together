<script lang="ts">
	import { CardGroup, TestId, Toggle } from "@gitbutler/ui";
</script>

<div class="analytics-settings__content">
	<p class="text-13 text-body analytics-settings__text">
		GitTogether 0.2.x does not send usage metrics or automatic error reports to GitButler, PostHog,
		Sentry, or another project service.
	</p>
	<p class="text-13 text-body analytics-settings__text">
		Diagnostic logs stay on this machine unless you explicitly choose and share an archive. These
		controls are locked off by the current product policy.
	</p>
</div>

<CardGroup testId={TestId.OnboardingPageAnalyticsSettings}>
	<CardGroup.Item labelFor="errorReportingToggle">
		{#snippet title()}
			Error reporting
		{/snippet}
		{#snippet caption()}
			Automatic external error reporting is disabled.
		{/snippet}
		{#snippet actions()}
			<Toggle
				id="errorReportingToggle"
				testId={TestId.OnboardingPageAnalyticsSettingsErrorReportingToggle}
				checked={false}
				disabled
			/>
		{/snippet}
	</CardGroup.Item>

	<CardGroup.Item labelFor="metricsEnabledToggle">
		{#snippet title()}
			Usage metrics
		{/snippet}
		{#snippet caption()}
			Automatic external usage reporting is disabled.
		{/snippet}
		{#snippet actions()}
			<Toggle
				id="metricsEnabledToggle"
				testId={TestId.OnboardingPageAnalyticsSettingsTelemetryToggle}
				checked={false}
				disabled
			/>
		{/snippet}
	</CardGroup.Item>
</CardGroup>

<style lang="postcss">
	.analytics-settings__content {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.analytics-settings__text {
		margin-bottom: 10px;
		color: var(--text-2);
	}
</style>
