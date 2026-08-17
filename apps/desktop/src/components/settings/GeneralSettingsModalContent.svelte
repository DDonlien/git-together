<script lang="ts">
	import AppearanceSettings from "$components/projectSettings/AppearanceSettings.svelte";
	import AiSettings from "$components/settings/AiSettings.svelte";
	import ExperimentalSettings from "$components/settings/ExperimentalSettings.svelte";
	import GeneralSettings from "$components/settings/GeneralSettings.svelte";
	import GitButlerSettings from "$components/settings/GitButlerSettings.svelte";
	import GitSettings from "$components/settings/GitSettings.svelte";
	import IntegrationsSettings from "$components/settings/IntegrationsSettings.svelte";
	import LanesAndBranchesSettings from "$components/settings/LanesAndBranchesSettings.svelte";
	import SettingsModalLayout from "$components/settings/SettingsModalLayout.svelte";
	import TelemetrySettings from "$components/settings/TelemetrySettings.svelte";
	import { generalSettingsPages } from "$lib/settings/generalSettingsPages";
	import type { GeneralSettingsModalState, GeneralSettingsPageId } from "$lib/state/uiState.svelte";

	type Props = {
		data: GeneralSettingsModalState;
	};

	const { data }: Props = $props();

	let currentSelectedId = $derived(data.selectedId || generalSettingsPages[0]!.id);

	function selectPage(pageId: GeneralSettingsPageId) {
		currentSelectedId = pageId;
	}
</script>

<SettingsModalLayout
	title="Global settings"
	pages={generalSettingsPages}
	selectedId={currentSelectedId}
	onSelectPage={selectPage}
>
	{#snippet content({ currentPage })}
		{#if currentPage}
			{#if currentPage.id === "general"}
				<GeneralSettings />
			{:else if currentPage.id === "gitbutler"}
				<GitButlerSettings />
			{:else if currentPage.id === "appearance"}
				<AppearanceSettings />
			{:else if currentPage.id === "lanes-and-branches"}
				<LanesAndBranchesSettings />
			{:else if currentPage.id === "git"}
				<GitSettings />
			{:else if currentPage.id === "integrations"}
				<IntegrationsSettings />
			{:else if currentPage.id === "ai"}
				<AiSettings />
			{:else if currentPage.id === "telemetry"}
				<TelemetrySettings />
			{:else if currentPage.id === "experimental"}
				<ExperimentalSettings />
			{:else}
				Settings page {currentPage.id} not Found.
			{/if}
		{:else}
			Settings page {currentSelectedId} not Found.
		{/if}
	{/snippet}
</SettingsModalLayout>
