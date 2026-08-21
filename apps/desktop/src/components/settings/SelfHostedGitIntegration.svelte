<script lang="ts">
	import { BACKEND } from "$lib/backend";
	import { showError } from "$lib/error/showError";
	import { GitTogetherService } from "$lib/gittogether/gitTogetherService";
	import { inject } from "@gitbutler/core/context";
	import { Button, CardGroup, Icon, Textbox, chipToasts } from "@gitbutler/ui";
	import { onMount } from "svelte";
	import type { ConnectionProfile, ConnectionState } from "$lib/gittogether/types";

	const service = new GitTogetherService(inject(BACKEND));

	let connectionState = $state<ConnectionState>({ profiles: [], bindings: {} });
	let loading = $state(true);
	let saving = $state(false);
	let editingId = $state<string>();
	let pendingRevokeId = $state<string>();
	let showingForm = $state(false);
	let label = $state("");
	let baseUrl = $state("");
	let username = $state("");
	let secret = $state("");

	const canSave = $derived(
		!!label.trim() && !!baseUrl.trim() && !!username.trim() && (!!editingId || !!secret),
	);

	onMount(() => {
		void loadConnections();
	});

	async function loadConnections() {
		loading = true;
		try {
			connectionState = await service.connections();
		} catch (error: unknown) {
			showError("Unable to load self-hosted Git connections", error);
		} finally {
			loading = false;
		}
	}

	function resetForm() {
		showingForm = false;
		editingId = undefined;
		pendingRevokeId = undefined;
		label = "";
		baseUrl = "";
		username = "";
		secret = "";
	}

	function addConnection() {
		resetForm();
		showingForm = true;
	}

	function editConnection(profile: ConnectionProfile) {
		showingForm = true;
		editingId = profile.id;
		pendingRevokeId = undefined;
		label = profile.label;
		baseUrl = profile.baseUrl;
		username = profile.username;
		secret = "";
	}

	async function saveConnection() {
		if (!canSave) return;
		saving = true;
		try {
			await service.saveConnection({
				id: editingId,
				label: label.trim(),
				baseUrl: baseUrl.trim(),
				username: username.trim(),
				secretValue: secret || undefined,
			});
			await loadConnections();
			chipToasts.success(
				editingId
					? "Self-hosted Git connection updated"
					: "Self-hosted Git connection saved in Keychain",
			);
			resetForm();
		} catch (error: unknown) {
			showError("Unable to save self-hosted Git connection", error);
		} finally {
			saving = false;
		}
	}

	async function revokeConnection(profile: ConnectionProfile) {
		if (pendingRevokeId !== profile.id) {
			pendingRevokeId = profile.id;
			return;
		}

		try {
			connectionState = await service.deleteConnection(profile.id);
			if (editingId === profile.id) resetForm();
			pendingRevokeId = undefined;
			chipToasts.success("Self-hosted Git connection revoked");
		} catch (error: unknown) {
			showError("Unable to revoke self-hosted Git connection", error);
		}
	}
</script>

<div class="stack-v gap-8">
	<CardGroup>
		{#if loading}
			<CardGroup.Item>
				{#snippet iconSide()}
					<div class="server-icon"><Icon name="git" size={24} /></div>
				{/snippet}
				{#snippet title()}Loading self-hosted Git connections…{/snippet}
			</CardGroup.Item>
		{:else}
			{#each connectionState.profiles as profile (profile.id)}
				<CardGroup.Item>
					{#snippet iconSide()}
						<div class="server-icon"><Icon name="git" size={24} /></div>
					{/snippet}
					{#snippet title()}{profile.label}{/snippet}
					{#snippet caption()}
						{profile.username} · {profile.baseUrl}
					{/snippet}
					{#snippet actions()}
						<div class="profile-actions">
							<Button kind="outline" icon="edit" onclick={() => editConnection(profile)}>
								Edit
							</Button>
							<Button style="danger" kind="outline" onclick={() => void revokeConnection(profile)}>
								{pendingRevokeId === profile.id ? "Confirm revoke" : "Revoke"}
							</Button>
						</div>
					{/snippet}
				</CardGroup.Item>
			{/each}

			<CardGroup.Item background={connectionState.profiles.length > 0 ? "var(--bg-2)" : undefined}>
				{#snippet iconSide()}
					<div class="server-icon"><Icon name="git" size={24} /></div>
				{/snippet}
				{#snippet title()}Gitea / Self-hosted Git{/snippet}
				{#snippet caption()}
					Reusable HTTPS credentials for clone, fetch, Get Latest, and push
				{/snippet}
				{#snippet actions()}
					<Button kind="outline" icon="plus" disabled={showingForm} onclick={addConnection}>
						Add server
					</Button>
				{/snippet}
			</CardGroup.Item>
		{/if}
	</CardGroup>

	{#if showingForm}
		<CardGroup>
			<CardGroup.Item>
				{#snippet title()}
					{editingId ? "Update self-hosted Git server" : "Add Gitea / self-hosted Git server"}
				{/snippet}
				{#snippet caption()}
					Credentials are sent only to matching HTTPS hosts and path prefixes. Leave the secret
					empty while editing to keep the existing Keychain value.
				{/snippet}
				<div class="connection-form">
					<Textbox
						label="Label"
						size="large"
						value={label}
						placeholder="Studio Gitea"
						oninput={(value) => (label = value)}
					/>
					<Textbox
						label="HTTPS server root"
						size="large"
						value={baseUrl}
						placeholder="https://git.example.com"
						oninput={(value) => (baseUrl = value)}
					/>
					<Textbox
						label="Username"
						size="large"
						value={username}
						autocomplete={true}
						oninput={(value) => (username = value)}
					/>
					<Textbox
						label={editingId ? "Replace password / PAT (optional)" : "Password / PAT"}
						size="large"
						type="password"
						value={secret}
						autocomplete={true}
						placeholder={editingId
							? "Leave empty to keep current secret"
							: "Stored only in Keychain"}
						oninput={(value) => (secret = value)}
					/>
				</div>
			</CardGroup.Item>
			<CardGroup.Item>
				<div class="form-actions">
					<Button style="gray" kind="outline" onclick={resetForm}>Cancel</Button>
					<Button style="pop" disabled={!canSave} loading={saving} onclick={saveConnection}>
						{editingId ? "Update connection" : "Save to Keychain"}
					</Button>
				</div>
			</CardGroup.Item>
		</CardGroup>
	{/if}

	<div class="credential-note text-12 text-body">
		<Icon name="lock-auth" size={16} />
		<span>Passwords and PATs stay in your operating system Keychain / Credential Manager.</span>
	</div>
</div>

<style lang="postcss">
	.server-icon {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		color: var(--text-2);
	}

	.profile-actions,
	.form-actions,
	.credential-note {
		display: flex;
		align-items: center;
	}

	.profile-actions,
	.form-actions {
		gap: 6px;
	}

	.form-actions {
		justify-content: flex-end;
		width: 100%;
	}

	.connection-form {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		width: 100%;
		margin-top: 16px;
		gap: 12px;
	}

	.credential-note {
		gap: 8px;
		color: var(--text-2);
	}

	@media (max-width: 720px) {
		.connection-form {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
