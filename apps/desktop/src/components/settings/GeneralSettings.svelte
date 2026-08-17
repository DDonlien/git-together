<script lang="ts">
	import { goto } from "$app/navigation";
	import { BACKEND } from "$lib/backend";
	import { PROJECTS_SERVICE } from "$lib/project/projectsService";
	import { SETTINGS_SERVICE } from "$lib/settings/appSettings";
	import { TERMINAL_SERVICE } from "$lib/settings/terminalService";
	import {
		UI_STATE,
		type CodeEditorSettings,
		type TerminalSettings,
	} from "$lib/state/uiState.svelte";
	import { UPDATER_SERVICE } from "$lib/updater/updater";
	import { USER_SERVICE } from "$lib/user/userService.svelte";
	import { inject } from "@gitbutler/core/context";
	import { Button, CardGroup, Modal, Select, SelectItem, Toggle, chipToasts } from "@gitbutler/ui";
	import { onMount } from "svelte";

	const userService = inject(USER_SERVICE);
	const settingsService = inject(SETTINGS_SERVICE);
	const projectsService = inject(PROJECTS_SERVICE);

	const updaterService = inject(UPDATER_SERVICE);
	const disableAutoChecks = updaterService.disableAutoChecks;

	const backend = inject(BACKEND);
	const platformName = backend.platformName;

	const terminalService = inject(TERMINAL_SERVICE);

	let isDeleting = $state(false);

	let deleteConfirmationModal: ReturnType<typeof Modal> | undefined = $state();

	const uiState = inject(UI_STATE);
	const defaultCodeEditor = uiState.global.defaultCodeEditor;
	const defaultTerminal = uiState.global.defaultTerminal;

	const editorOptions: CodeEditorSettings[] = [
		{ schemeIdentifer: "vscodium", displayName: "VSCodium" },
		{ schemeIdentifer: "vscode", displayName: "VSCode" },
		{ schemeIdentifer: "vscode-insiders", displayName: "VSCode Insiders" },
		{ schemeIdentifer: "windsurf", displayName: "Windsurf" },
		{ schemeIdentifer: "zed", displayName: "Zed" },
		{ schemeIdentifer: "cursor", displayName: "Cursor" },
		{ schemeIdentifer: "trae", displayName: "Trae" },
		{ schemeIdentifer: "antigravity-ide", displayName: "Antigravity IDE" },
	];
	const editorOptionsForSelect = editorOptions.map((option) => ({
		label: option.displayName,
		value: option.schemeIdentifer,
	}));

	let terminalOptions: TerminalSettings[] = $state([]);
	let terminalOptionsForSelect: Array<{ label: string; value: string }> = $state([]);

	onMount(async () => {
		try {
			const options = await terminalService.getTerminalOptionsForPlatform(platformName);
			terminalOptions = options;
			terminalOptionsForSelect = options.map((option) => ({
				label: option.displayName,
				value: option.identifier,
			}));
		} catch (err) {
			console.error("Failed to load terminal options", err);
		}
	});

	async function onDeleteClicked() {
		isDeleting = true;
		try {
			await settingsService.deleteAllData();
			projectsService.unsetLastOpenedProject();
			await userService.forgetUserCredentials();
			chipToasts.success("All data deleted");
			goto("/", { replaceState: true, invalidateAll: true });
		} finally {
			deleteConfirmationModal?.close();
			isDeleting = false;
		}
	}
</script>

<CardGroup>
	<CardGroup.Item alignment="center">
		{#snippet title()}
			Default code editor
		{/snippet}
		{#snippet actions()}
			<Select
				value={defaultCodeEditor.current.schemeIdentifer}
				options={editorOptionsForSelect}
				onselect={(value) => {
					const selected = editorOptions.find((option) => option.schemeIdentifer === value);
					if (selected) {
						defaultCodeEditor.set(selected);
					}
				}}
			>
				{#snippet itemSnippet({ item, highlighted })}
					<SelectItem
						selected={item.value === defaultCodeEditor.current.schemeIdentifer}
						{highlighted}
					>
						{item.label}
					</SelectItem>
				{/snippet}
			</Select>
		{/snippet}
	</CardGroup.Item>
	{#if platformName !== "web"}
		<CardGroup.Item alignment="center">
			{#snippet title()}
				Default terminal
			{/snippet}
			{#snippet actions()}
				<Select
					value={defaultTerminal.current.identifier}
					options={terminalOptionsForSelect}
					onselect={(value) => {
						const selected = terminalOptions.find((option) => option.identifier === value);
						if (selected) {
							defaultTerminal.set(selected);
						}
					}}
				>
					{#snippet itemSnippet({ item, highlighted })}
						<SelectItem selected={item.value === defaultTerminal.current.identifier} {highlighted}>
							{item.label}
						</SelectItem>
					{/snippet}
				</Select>
			{/snippet}
		</CardGroup.Item>
	{/if}
</CardGroup>

<CardGroup>
	<CardGroup.Item labelFor="disable-auto-checks">
		{#snippet title()}
			Automatically check for updates
		{/snippet}

		{#snippet caption()}
			Automatically check for updates. You can still check manually when needed.
		{/snippet}

		{#snippet actions()}
			<Toggle
				id="disable-auto-checks"
				checked={!$disableAutoChecks}
				onclick={() => ($disableAutoChecks = !$disableAutoChecks)}
			/>
		{/snippet}
	</CardGroup.Item>
</CardGroup>

<CardGroup>
	<CardGroup.Item>
		{#snippet title()}
			Remove all projects
		{/snippet}
		{#snippet caption()}
			You can remove all repositories from the GitTogether app.
			<br />
			Your code remains safe. it only clears the configuration.
		{/snippet}

		{#snippet actions()}
			<Button style="danger" kind="outline" onclick={() => deleteConfirmationModal?.show()}>
				Remove projects…
			</Button>
		{/snippet}
	</CardGroup.Item>
</CardGroup>

<Modal
	bind:this={deleteConfirmationModal}
	width="small"
	title="Remove all projects"
	onSubmit={onDeleteClicked}
>
	<p>Are you sure you want to remove all GitTogether repositories?</p>

	{#snippet controls(close)}
		<Button style="danger" kind="outline" loading={isDeleting} type="submit">Remove</Button>
		<Button style="pop" onclick={close}>Cancel</Button>
	{/snippet}
</Modal>
