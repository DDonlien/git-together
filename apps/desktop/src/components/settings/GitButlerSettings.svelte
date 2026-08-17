<script lang="ts">
	import CliSymlinkSetup from "$components/settings/CliSymlinkSetup.svelte";
	import OrganisationSettings from "$components/settings/OrganisationSettings.svelte";
	import AccessTokenSignIn from "$components/shared/AccessTokenSignIn.svelte";
	import { BACKEND } from "$lib/backend";
	import { getUserErrorCode } from "$lib/backend/ipc";
	import { URL_SERVICE } from "$lib/backend/url";
	import { CLI_MANAGER } from "$lib/config/cli";
	import { GIT_CONFIG_SERVICE } from "$lib/config/gitConfigService";
	import { showToast } from "$lib/notifications/toasts";
	import { SETTINGS_SERVICE } from "$lib/settings/appSettings";
	import type { User } from "$lib/user/user";
	import { USER_SERVICE } from "$lib/user/userService.svelte";
	import { inject } from "@gitbutler/core/context";
	import {
		Button,
		CardGroup,
		Link,
		ProfilePictureUpload,
		Spacer,
		Textbox,
		Toggle,
		chipToasts,
	} from "@gitbutler/ui";
	import { onMount } from "svelte";

	const backend = inject(BACKEND);
	const cliManager = inject(CLI_MANAGER);
	const gitConfig = inject(GIT_CONFIG_SERVICE);
	const settingsService = inject(SETTINGS_SERVICE);
	const urlService = inject(URL_SERVICE);
	const userService = inject(USER_SERVICE);

	const appSettings = settingsService.appSettings;
	const platformName = backend.platformName;
	const [installCLI, installingCLI] = cliManager.install;

	let accessProfileLoaded = $state(false);
	let annotateCommits = $state(true);
	let newName = $state("");
	let saving = $state(false);
	let selectedPictureFile: File | undefined = $state();
	let showSymlink = $state(false);
	let userPicture = $state(userService.user?.picture);

	onMount(async () => {
		annotateCommits = (await gitConfig.get("gitbutler.gitbutlerCommitter")) === "1";
	});

	$effect(() => {
		if (userService.user && !accessProfileLoaded) {
			accessProfileLoaded = true;
			userService.getUser().then((cloudUser) => {
				const userData: User = {
					...cloudUser,
					name: cloudUser.name || undefined,
					email: cloudUser.email || undefined,
					login: cloudUser.login || undefined,
					picture: cloudUser.picture || "#",
					locale: cloudUser.locale || "en",
					access_token: cloudUser.access_token || "impossible-situation",
					role: cloudUser.role || "user",
					supporter: cloudUser.supporter || false,
				};
				userPicture = userData.picture;
				userService.setUser(userData);
			});
			newName = userService.user.name || "";
		}
	});

	async function onSubmit(e: SubmitEvent) {
		if (!userService.user) return;
		saving = true;
		e.preventDefault();

		try {
			const updatedUser = await userService.updateUser({
				name: newName,
				picture: selectedPictureFile,
			});
			userService.setUser(updatedUser);
			chipToasts.success("Profile updated");
			selectedPictureFile = undefined;
		} finally {
			saving = false;
		}
	}

	function onPictureChange(file: File) {
		selectedPictureFile = file;
		userPicture = URL.createObjectURL(file);
	}

	function toggleCommitterSigning() {
		annotateCommits = !annotateCommits;
		gitConfig.set("gitbutler.gitbutlerCommitter", annotateCommits ? "1" : "0");
	}
</script>

<p class="text-13 text-body gitbutler-settings__about-text">
	Optional upstream GitButler account, service, and compatibility features are collected here so
	GitTogether's own application preferences stay separate.
</p>

{#if userService.user}
	<CardGroup>
		<form onsubmit={onSubmit} class="profile-form">
			<ProfilePictureUpload
				bind:picture={userPicture}
				onFileSelect={onPictureChange}
				onInvalidFileType={() => chipToasts.error("Please use a valid image file")}
			/>

			<div id="contact-info" class="contact-info">
				<div class="contact-info__fields">
					<Textbox label="Full name" bind:value={newName} required />
					<Textbox label="Email" value={userService.user.email} readonly />
				</div>

				<Button type="submit" style="pop" loading={saving}>Update profile</Button>
			</div>
		</form>
	</CardGroup>

	<CardGroup>
		<CardGroup.Item>
			{#snippet title()}
				Forget GitButler credentials and log out
			{/snippet}
			{#snippet caption()}
				Clear the GitButler account token stored by GitTogether on this machine.
			{/snippet}
			{#snippet actions()}
				<Button
					kind="outline"
					icon="logout"
					onclick={async () => {
						await userService.forgetUserCredentials();
					}}>Forget credentials</Button
				>
			{/snippet}
		</CardGroup.Item>
	</CardGroup>
{/if}

<AccessTokenSignIn />

<Spacer />

<CardGroup>
	<CardGroup.Item labelFor="committerSigning">
		{#snippet title()}
			Credit upstream GitButler as the committer
		{/snippet}
		{#snippet caption()}
			GitTogether keeps the upstream GitButler committer-credit compatibility option. You can opt in
			to crediting GitButler as the committer in virtual branch commits.
			<Link
				href="https://github.com/gitbutlerapp/gitbutler-docs/blob/d81a23779302c55f8b20c75bf7842082815b4702/content/docs/features/virtual-branches/committer-mark.mdx"
			>
				Learn more
			</Link>
		{/snippet}
		{#snippet actions()}
			<Toggle id="committerSigning" checked={annotateCommits} onclick={toggleCommitterSigning} />
		{/snippet}
	</CardGroup.Item>
</CardGroup>

<CardGroup>
	<CardGroup.Item>
		{#snippet title()}
			Install the compatible <code class="code-string">but</code> CLI
		{/snippet}

		{#snippet caption()}
			{#if $appSettings?.ui.cliIsManagedByPackageManager}
				The <code>but</code> CLI is managed by your package manager. Please use your package manager to
				install, update, or remove it.
			{:else if platformName === "windows"}
				On Windows, you can manually copy the executable (<code>`but`</code>) to a directory in your
				PATH. Click "Show command" for instructions.
			{:else}
				Installs the upstream-compatible CLI (<code>`but`</code>) in your PATH so GitTogether's
				shared Git engine can also be used from the terminal. This action will request admin
				privileges. Alternatively, you can create a symlink manually.
			{/if}
		{/snippet}

		{#if !$appSettings?.ui.cliIsManagedByPackageManager}
			<div class="flex flex-col gap-16">
				<div class="flex gap-8 justify-end">
					{#if platformName !== "windows"}
						<Button
							style="pop"
							icon="play"
							onclick={async () => {
								try {
									await installCLI();
								} catch (err: unknown) {
									if (getUserErrorCode(err) === "CliInstallCancelled") {
										showToast({
											style: "info",
											message: "CLI install cancelled.",
										});
										return;
									}
									throw err;
								}
							}}
							loading={installingCLI.current.isLoading}
						>
							Install But CLI</Button
						>
					{/if}
					<Button
						style="gray"
						kind="outline"
						disabled={showSymlink}
						onclick={() => (showSymlink = !showSymlink)}>Show command</Button
					>
				</div>
			</div>

			{#if showSymlink}
				<CliSymlinkSetup class="m-t-14" />
			{/if}
		{/if}
	</CardGroup.Item>
</CardGroup>

{#if userService.user?.role === "admin"}
	<Spacer />
	<div class="gitbutler-settings__section-heading">
		<h2 class="text-14 text-bold">GitButler organizations</h2>
		<p class="text-12 text-body">
			Manage organizations attached to the signed-in GitButler account.
		</p>
	</div>
	<OrganisationSettings />
{/if}

<Spacer />

<CardGroup>
	<CardGroup.Item>
		{#snippet title()}
			GitButler resources
		{/snippet}
		{#snippet caption()}
			Open the upstream GitButler documentation or community Discord.
		{/snippet}
		{#snippet actions()}
			<div class="flex gap-8">
				<Button
					kind="outline"
					icon="docs"
					onclick={async () => await urlService.openExternalUrl("https://docs.gitbutler.com/")}
				>
					Docs
				</Button>
				<Button
					kind="outline"
					icon="discord"
					onclick={async () => await urlService.openExternalUrl("https://discord.gg/MmFkmaJ42D")}
				>
					Discord
				</Button>
			</div>
		{/snippet}
	</CardGroup.Item>
</CardGroup>

<style lang="postcss">
	.gitbutler-settings__about-text,
	.gitbutler-settings__section-heading p {
		color: var(--text-2);
	}

	.gitbutler-settings__section-heading {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.profile-form {
		display: flex;
		padding: 16px;
		gap: 24px;
	}

	.contact-info {
		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: flex-end;
		gap: 20px;
	}

	.contact-info__fields {
		display: flex;
		flex-direction: column;
		width: 100%;
		gap: 12px;
	}
</style>
