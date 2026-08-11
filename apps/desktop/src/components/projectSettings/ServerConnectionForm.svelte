<script lang="ts">
	import SettingsSection from "$components/shared/SettingsSection.svelte";
	import { BACKEND } from "$lib/backend";
	import { showError } from "$lib/error/showError";
	import { GitTogetherService } from "$lib/gittogether/gitTogetherService";
	import { inject } from "@gitbutler/core/context";
	import { Button, CardGroup, chipToasts } from "@gitbutler/ui";
	import { onMount } from "svelte";
	import type { ConnectionState } from "$lib/gittogether/types";

	const { projectId }: { projectId: string } = $props();
	const service = new GitTogetherService(inject(BACKEND));

	let connectionState = $state<ConnectionState>({ profiles: [], bindings: {} });
	let loading = $state(true);
	let saving = $state(false);
	let selectedProfileId = $state("");
	let label = $state("");
	let baseUrl = $state("");
	let username = $state("");
	let secret = $state("");

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

	async function saveAndBind() {
		if (!label.trim() || !baseUrl.trim() || !username.trim() || !secret) return;
		saving = true;
		try {
			const profile = await service.saveConnection({
				label,
				baseUrl,
				username,
				secretValue: secret,
			});
			connectionState = await service.bindConnection(projectId, profile.id);
			selectedProfileId = profile.id;
			label = "";
			baseUrl = "";
			username = "";
			secret = "";
			chipToasts.success("Connection saved in Keychain and bound to this repository");
		} catch (error: unknown) {
			showError("Unable to save Git server connection", error);
		} finally {
			saving = false;
		}
	}
</script>

<SettingsSection>
	{#snippet title()}Self-hosted HTTPS connection{/snippet}
	{#snippet description()}
		Choose a generic Git server account for fetch, Get Latest, and push. Passwords and PATs stay in
		the operating-system Keychain and are never written into the remote URL.
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
				</div>
			{/snippet}
		</CardGroup.Item>
	</CardGroup>

	<div class="connection-form">
		<div>
			<label for="gittogether-connection-label">Label</label>
			<input id="gittogether-connection-label" bind:value={label} placeholder="Studio Gitea" />
		</div>
		<div>
			<label for="gittogether-connection-url">HTTPS server root</label>
			<input
				id="gittogether-connection-url"
				bind:value={baseUrl}
				placeholder="https://git.example.com"
			/>
		</div>
		<div>
			<label for="gittogether-connection-user">Username</label>
			<input id="gittogether-connection-user" bind:value={username} autocomplete="username" />
		</div>
		<div>
			<label for="gittogether-connection-secret">Password / PAT</label>
			<input
				id="gittogether-connection-secret"
				bind:value={secret}
				type="password"
				autocomplete="new-password"
			/>
		</div>
		<Button
			style="pop"
			onclick={() => void saveAndBind()}
			disabled={saving || !label.trim() || !baseUrl.trim() || !username.trim() || !secret}
		>
			{saving ? "Saving…" : "Save in Keychain and bind"}
		</Button>
	</div>
</SettingsSection>

<style lang="postcss">
	.binding-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.binding-actions select,
	.connection-form input {
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

	.connection-form {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		padding: 16px;
		gap: 12px;
		border: 1px solid var(--border-2);
		border-radius: var(--radius-ml);
		background: var(--bg-2);
	}

	.connection-form > div {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.connection-form label {
		color: var(--text-2);
		font-size: 11px;
	}

	.connection-form :global(button) {
		justify-self: start;
	}

	@media (max-width: 720px) {
		.connection-form {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
