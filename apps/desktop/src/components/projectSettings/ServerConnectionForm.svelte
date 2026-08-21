<script lang="ts">
	import SettingsSection from "$components/shared/SettingsSection.svelte";
	import { BACKEND } from "$lib/backend";
	import { showError } from "$lib/error/showError";
	import { GitTogetherService } from "$lib/gittogether/gitTogetherService";
	import { useSettingsModal } from "$lib/settings/settingsModal.svelte";
	import { inject } from "@gitbutler/core/context";
	import { Button, CardGroup, chipToasts } from "@gitbutler/ui";
	import { onMount } from "svelte";
	import type { ConnectionState } from "$lib/gittogether/types";

	const { projectId }: { projectId: string } = $props();
	const service = new GitTogetherService(inject(BACKEND));
	const { openGeneralSettings } = useSettingsModal();

	let connectionState = $state<ConnectionState>({ profiles: [], bindings: {} });
	let loading = $state(true);
	let selectedProfileId = $state("");

	onMount(() => {
		void load();
	});

	async function load() {
		loading = true;
		try {
			connectionState = await service.connections();
			selectedProfileId = connectionState.bindings[projectId] ?? "";
		} catch (error: unknown) {
			showError("Unable to load Git server connections", error);
		} finally {
			loading = false;
		}
	}

	async function bindProfile() {
		try {
			connectionState = await service.bindConnection(projectId, selectedProfileId || undefined);
			chipToasts.success(
				selectedProfileId
					? "HTTPS connection bound to this repository"
					: "Repository returned to system Git credentials",
			);
		} catch (error: unknown) {
			showError("Unable to bind Git server connection", error);
		}
	}
</script>

<SettingsSection>
	{#snippet title()}Self-hosted HTTPS connection{/snippet}
	{#snippet description()}
		Bind a saved Git server account for fetch, Get Latest, and push. Create, edit, and revoke Gitea
		or other self-hosted connections globally in Git Integrations.
	{/snippet}

	<CardGroup>
		<CardGroup.Item labelFor="gittogether-server-profile">
			{#snippet title()}Repository connection{/snippet}
			{#snippet caption()}
				The account is sent only to HTTPS remotes within the saved server host and path scope.
			{/snippet}
			{#snippet actions()}
				<div class="binding-actions">
					<select id="gittogether-server-profile" bind:value={selectedProfileId} disabled={loading}>
						<option value="">System Git credentials</option>
						{#each connectionState.profiles as profile}
							<option value={profile.id}>{profile.label} · {profile.username}</option>
						{/each}
					</select>
					<Button onclick={() => void bindProfile()} disabled={loading}>Apply</Button>
					<Button
						kind="outline"
						icon="settings"
						onclick={() => openGeneralSettings("git-integrations")}
					>
						Manage in Git Integrations
					</Button>
				</div>
			{/snippet}
		</CardGroup.Item>
	</CardGroup>
</SettingsSection>

<style lang="postcss">
	.binding-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.binding-actions select {
		padding: 8px 10px;
		border: 1px solid var(--border-2);
		border-radius: 8px;
		outline: 0;
		background: var(--bg-1);
		color: var(--text-1);
		font: inherit;
		font-size: 12px;
	}

	.binding-actions select {
		max-width: 250px;
	}
</style>
