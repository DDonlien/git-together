<script lang="ts">
	import AIPromptEdit from "$components/settings/AIPromptEdit.svelte";
	import AiCredentialCheck from "$components/settings/AiCredentialCheck.svelte";
	import AuthorizationBanner from "$components/settings/AuthorizationBanner.svelte";
	import SettingsSection from "$components/shared/SettingsSection.svelte";
	import { AISecretHandle, AI_SERVICE, GitAIConfigKey, KeyOption } from "$lib/ai/service";
	import type { AiModel, ApiKeyStatus, SubscriptionStatus } from "$lib/ai/nativeClient";
	import { OpenAIModelName, AnthropicModelName, ModelKind } from "$lib/ai/types";
	import { GIT_CONFIG_SERVICE } from "$lib/config/gitConfigService";
	import { SECRET_SERVICE } from "$lib/secrets/secretsService";
	import { USER_SERVICE } from "$lib/user/userService.svelte";
	import { inject } from "@gitbutler/core/context";
	import {
		Button,
		CardGroup,
		Icon,
		InfoMessage,
		Link,
		RadioButton,
		Select,
		SelectItem,
		Spacer,
		Textbox,
	} from "@gitbutler/ui";

	import { onMount, tick } from "svelte";
	import { run } from "svelte/legacy";

	const gitConfigService = inject(GIT_CONFIG_SERVICE);
	const secretsService = inject(SECRET_SERVICE);
	const aiService = inject(AI_SERVICE);
	const userService = inject(USER_SERVICE);
	let initialized = false;

	let modelKind: ModelKind | undefined = $state();
	let openAISubscriptionModel: string | undefined = $state();
	let openAISubscriptionStatus: SubscriptionStatus | undefined = $state();
	let openAISubscriptionModels: AiModel[] = $state([]);
	let openAISubscriptionBusy = $state(false);
	let openAISubscriptionError: string | undefined = $state();
	let openAIKeyOption: KeyOption | undefined = $state();
	let anthropicKeyOption: KeyOption | undefined = $state();
	let openAIKey: string | undefined = $state();
	let openAICustomEndpoint: string | undefined = $state();
	let openAIModelName: OpenAIModelName | undefined = $state();
	let anthropicKey: string | undefined = $state();
	let anthropicModelName: AnthropicModelName | undefined = $state();
	let diffLengthLimit: number | undefined = $state();
	let ollamaEndpoint: string | undefined = $state();
	let ollamaModel: string | undefined = $state();
	let lmStudioEndpoint: string | undefined = $state();
	let lmStudioModel: string | undefined = $state();
	let openRouterKey: string | undefined = $state();
	let openRouterModel: string | undefined = $state();
	let openCodeGoKey = $state("");
	let openCodeGoModel: string | undefined = $state();
	let openCodeGoStatus: ApiKeyStatus | undefined = $state();
	let openCodeGoModels: AiModel[] = $state([]);
	let openCodeGoBusy = $state(false);
	let openCodeGoError: string | undefined = $state();

	function errorMessage(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}

	function modelOptions(models: AiModel[]) {
		return models.map((model) => ({ label: model.label, value: model.id }));
	}

	async function loadOpenAISubscriptionModels() {
		if (!openAISubscriptionStatus?.authenticated) return;
		openAISubscriptionModels = await aiService.getOpenAISubscriptionModels();
		if (!openAISubscriptionModels.some((model) => model.id === openAISubscriptionModel)) {
			openAISubscriptionModel = openAISubscriptionModels[0]?.id;
		}
	}

	async function signInOpenAISubscription() {
		openAISubscriptionBusy = true;
		openAISubscriptionError = undefined;
		try {
			openAISubscriptionStatus = await aiService.signInOpenAISubscription();
			await loadOpenAISubscriptionModels();
		} catch (error) {
			openAISubscriptionError = errorMessage(error);
		} finally {
			openAISubscriptionBusy = false;
		}
	}

	async function signOutOpenAISubscription() {
		openAISubscriptionBusy = true;
		openAISubscriptionError = undefined;
		try {
			openAISubscriptionStatus = await aiService.signOutOpenAISubscription();
			openAISubscriptionModels = [];
		} catch (error) {
			openAISubscriptionError = errorMessage(error);
		} finally {
			openAISubscriptionBusy = false;
		}
	}

	async function loadOpenCodeGoModels() {
		openCodeGoModels = await aiService.getOpenCodeGoModels();
		if (!openCodeGoModels.some((model) => model.id === openCodeGoModel)) {
			openCodeGoModel = openCodeGoModels[0]?.id;
		}
	}

	async function saveOpenCodeGoKey() {
		openCodeGoBusy = true;
		openCodeGoError = undefined;
		try {
			openCodeGoStatus = await aiService.saveOpenCodeGoKey(openCodeGoKey);
			openCodeGoKey = "";
			await loadOpenCodeGoModels();
		} catch (error) {
			openCodeGoError = errorMessage(error);
		} finally {
			openCodeGoBusy = false;
		}
	}

	async function deleteOpenCodeGoKey() {
		openCodeGoBusy = true;
		openCodeGoError = undefined;
		try {
			openCodeGoStatus = await aiService.deleteOpenCodeGoKey();
			openCodeGoKey = "";
		} catch (error) {
			openCodeGoError = errorMessage(error);
		} finally {
			openCodeGoBusy = false;
		}
	}

	async function setConfiguration(key: GitAIConfigKey, value: string | undefined) {
		if (!initialized) return;
		gitConfigService.set(key, value || "");
	}

	async function setSecret(handle: AISecretHandle, secret: string | undefined) {
		if (!initialized) return;
		await secretsService.set(handle, secret || "");
	}

	onMount(async () => {
		modelKind = await aiService.getModelKind();
		openAISubscriptionModel = await aiService.getOpenAISubscriptionModelName();
		openAISubscriptionStatus = await aiService.getOpenAISubscriptionStatus();
		if (openAISubscriptionStatus.authenticated) {
			try {
				await loadOpenAISubscriptionModels();
			} catch (error) {
				openAISubscriptionError = errorMessage(error);
			}
		}

		openAIKeyOption = await aiService.getOpenAIKeyOption();
		openAIModelName = await aiService.getOpenAIModelName();
		openAIKey = await aiService.getOpenAIKey();
		openAICustomEndpoint = await aiService.getOpenAICustomEndpoint();

		anthropicKeyOption = await aiService.getAnthropicKeyOption();
		anthropicModelName = await aiService.getAnthropicModelName();
		anthropicKey = await aiService.getAnthropicKey();

		diffLengthLimit = await aiService.getDiffLengthLimit();

		ollamaEndpoint = await aiService.getOllamaEndpoint();
		ollamaModel = await aiService.getOllamaModelName();

		lmStudioEndpoint = await aiService.getLMStudioEndpoint();
		lmStudioModel = await aiService.getLMStudioModelName();

		openRouterKey = await aiService.getOpenRouterKey();
		openRouterModel = await aiService.getOpenRouterModelName();

		openCodeGoModel = await aiService.getOpenCodeGoModelName();
		openCodeGoStatus = await aiService.getOpenCodeGoStatus();
		try {
			await loadOpenCodeGoModels();
		} catch (error) {
			openCodeGoError = errorMessage(error);
		}

		// Ensure reactive declarations have finished running before we set initialized to true
		await tick();

		initialized = true;
	});

	const keyOptions = [
		{
			label: "Use GitButler API",
			value: KeyOption.ButlerAPI,
		},
		{
			label: "Your own key",
			value: KeyOption.BringYourOwn,
		},
	];

	const openAIModelOptions = [
		{
			label: "GPT 5.4",
			value: OpenAIModelName.GPT54,
		},
		{
			label: "GPT 5.4 Mini",
			value: OpenAIModelName.GPT54Mini,
		},
		{
			label: "GPT 5.4 Nano (recommended)",
			value: OpenAIModelName.GPT54Nano,
		},
	];

	const anthropicModelOptions = [
		{
			label: "Haiku (recommended)",
			value: AnthropicModelName.Haiku,
		},
		{
			label: "Sonnet",
			value: AnthropicModelName.Sonnet,
		},
		{
			label: "Opus",
			value: AnthropicModelName.Opus,
		},
	];

	let form = $state<HTMLFormElement>();

	function onFormChange(form: HTMLFormElement) {
		const formData = new FormData(form);
		modelKind = formData.get("modelKind") as ModelKind;
	}
	run(() => {
		setConfiguration(GitAIConfigKey.ModelProvider, modelKind);
	});
	run(() => {
		setConfiguration(GitAIConfigKey.OpenAISubscriptionModelName, openAISubscriptionModel);
	});
	run(() => {
		setConfiguration(GitAIConfigKey.OpenAIKeyOption, openAIKeyOption);
	});
	run(() => {
		setConfiguration(GitAIConfigKey.OpenAIModelName, openAIModelName);
	});
	run(() => {
		setConfiguration(GitAIConfigKey.OpenAICustomEndpoint, openAICustomEndpoint);
	});
	run(() => {
		setSecret(AISecretHandle.OpenAIKey, openAIKey);
	});
	run(() => {
		setConfiguration(GitAIConfigKey.AnthropicKeyOption, anthropicKeyOption);
	});
	run(() => {
		setConfiguration(GitAIConfigKey.AnthropicModelName, anthropicModelName);
	});
	run(() => {
		setConfiguration(GitAIConfigKey.DiffLengthLimit, diffLengthLimit?.toString());
	});
	run(() => {
		setSecret(AISecretHandle.AnthropicKey, anthropicKey);
	});
	run(() => {
		setConfiguration(GitAIConfigKey.OllamaEndpoint, ollamaEndpoint);
	});
	run(() => {
		setConfiguration(GitAIConfigKey.OllamaModelName, ollamaModel);
	});
	run(() => {
		setConfiguration(GitAIConfigKey.LMStudioEndpoint, lmStudioEndpoint);
	});
	run(() => {
		setConfiguration(GitAIConfigKey.LMStudioModelName, lmStudioModel);
	});
	run(() => {
		setSecret(AISecretHandle.OpenRouterKey, openRouterKey);
	});
	run(() => {
		setConfiguration(GitAIConfigKey.OpenRouterModelName, openRouterModel);
	});
	run(() => {
		setConfiguration(GitAIConfigKey.OpenCodeGoModelName, openCodeGoModel);
	});
	run(() => {
		if (form) form.modelKind.value = modelKind;
	});
</script>

{#snippet shortNote(text: string)}
	<div class="ai-settings__short-note">
		<Icon name="info" size={14} />
		<p class="text-12 text-body">{text}</p>
	</div>
{/snippet}

<p class="text-13 text-body ai-settings__about-text">
	GitTogether supports ChatGPT subscription access, OpenAI and Anthropic APIs, OpenCode Go API,
	OpenRouter, and local models through Ollama and LM Studio.
</p>

<CardGroup>
	<form class="git-radio" bind:this={form} onchange={(e) => onFormChange(e.currentTarget)}>
		<CardGroup.Item labelFor="open-ai-subscription">
			{#snippet title()}
				OpenAI Subscription
			{/snippet}
			{#snippet actions()}
				<RadioButton
					name="modelKind"
					id="open-ai-subscription"
					value={ModelKind.OpenAISubscription}
				/>
			{/snippet}
		</CardGroup.Item>
		{#if modelKind === ModelKind.OpenAISubscription}
			<CardGroup.Item>
				<div class="ai-settings__provider-fields">
					{#if openAISubscriptionError}
						<InfoMessage style="danger" filled outlined={false} error={openAISubscriptionError}>
							{#snippet title()}ChatGPT authorization failed{/snippet}
							{#snippet content()}Try signing in again or check the network connection.{/snippet}
						</InfoMessage>
					{:else if openAISubscriptionStatus?.authenticated}
						<InfoMessage style="success" filled outlined={false}>
							{#snippet title()}Connected to ChatGPT{/snippet}
							{#snippet content()}
								{openAISubscriptionStatus?.email ?? "Subscription authorization is active."}
							{/snippet}
						</InfoMessage>
					{:else}
						{@render shortNote(
							"Sign in in your browser to use models included with your ChatGPT subscription. No API key is required.",
						)}
					{/if}

					{#if openAISubscriptionStatus?.authenticated && openAISubscriptionModels.length > 0}
						<Select
							value={openAISubscriptionModel}
							options={modelOptions(openAISubscriptionModels)}
							label="Subscription model"
							wide
							onselect={(value) => {
								openAISubscriptionModel = value;
							}}
						>
							{#snippet itemSnippet({ item, highlighted })}
								<SelectItem selected={item.value === openAISubscriptionModel} {highlighted}>
									{item.label}
								</SelectItem>
							{/snippet}
						</Select>
					{/if}

					<div class="ai-settings__provider-actions">
						{#if openAISubscriptionStatus?.authenticated}
							<Button
								kind="outline"
								loading={openAISubscriptionBusy}
								onclick={signOutOpenAISubscription}>Sign out</Button
							>
						{:else}
							<Button
								style="pop"
								icon="open-in-browser"
								loading={openAISubscriptionBusy}
								onclick={signInOpenAISubscription}>Sign in with ChatGPT</Button
							>
						{/if}
					</div>
				</div>
			</CardGroup.Item>
		{/if}

		<CardGroup.Item labelFor="open-ai">
			{#snippet title()}
				OpenAI API
			{/snippet}
			{#snippet actions()}
				<RadioButton name="modelKind" id="open-ai" value={ModelKind.OpenAI} />
			{/snippet}
		</CardGroup.Item>
		{#if modelKind === ModelKind.OpenAI}
			<CardGroup.Item>
				<Select
					value={openAIKeyOption}
					options={keyOptions}
					wide
					label="Do you want to provide your own key?"
					onselect={(value) => {
						openAIKeyOption = value as KeyOption;
					}}
				>
					{#snippet itemSnippet({ item, highlighted })}
						<SelectItem selected={item.value === openAIKeyOption} {highlighted}>
							{item.label}
						</SelectItem>
					{/snippet}
				</Select>

				{#if openAIKeyOption === KeyOption.ButlerAPI}
					{#if !userService.user}
						<AuthorizationBanner message="Please sign in to use the GitButler API." />
					{:else}
						{@render shortNote("GitButler uses OpenAI API for commit messages and branch names.")}
					{/if}
				{/if}

				{#if openAIKeyOption === KeyOption.BringYourOwn}
					<Textbox
						label="API key"
						type="password"
						bind:value={openAIKey}
						required
						placeholder="sk-..."
					/>

					<Select
						value={openAIModelName}
						options={openAIModelOptions}
						label="Model version"
						wide
						onselect={(value) => {
							openAIModelName = value as OpenAIModelName;
						}}
					>
						{#snippet itemSnippet({ item, highlighted })}
							<SelectItem selected={item.value === openAIModelName} {highlighted}>
								{item.label}
							</SelectItem>
						{/snippet}
					</Select>

					<Textbox
						label="Custom endpoint"
						bind:value={openAICustomEndpoint}
						placeholder="https://api.openai.com/v1"
					/>
				{/if}
			</CardGroup.Item>
		{/if}

		<CardGroup.Item labelFor="anthropic">
			{#snippet title()}
				Anthropic
			{/snippet}
			{#snippet actions()}
				<RadioButton name="modelKind" id="anthropic" value={ModelKind.Anthropic} />
			{/snippet}
		</CardGroup.Item>
		{#if modelKind === ModelKind.Anthropic}
			<CardGroup.Item>
				<Select
					value={anthropicKeyOption}
					options={keyOptions}
					wide
					label="Do you want to provide your own key?"
					onselect={(value) => {
						anthropicKeyOption = value as KeyOption;
					}}
				>
					{#snippet itemSnippet({ item, highlighted })}
						<SelectItem selected={item.value === anthropicKeyOption} {highlighted}>
							{item.label}
						</SelectItem>
					{/snippet}
				</Select>

				{#if anthropicKeyOption === KeyOption.ButlerAPI}
					{#if !userService.user}
						<AuthorizationBanner message="Please sign in to use the GitButler API." />
					{:else}
						{@render shortNote(
							"GitButler uses Anthropic API for commit messages and branch names.",
						)}
					{/if}
				{/if}

				{#if anthropicKeyOption === KeyOption.BringYourOwn}
					<Textbox
						label="API key"
						type="password"
						bind:value={anthropicKey}
						required
						placeholder="sk-ant-api03-..."
					/>

					<Select
						value={anthropicModelName}
						options={anthropicModelOptions}
						label="Model version"
						onselect={(value) => {
							anthropicModelName = value as AnthropicModelName;
						}}
					>
						{#snippet itemSnippet({ item, highlighted })}
							<SelectItem selected={item.value === anthropicModelName} {highlighted}>
								{item.label}
							</SelectItem>
						{/snippet}
					</Select>
				{/if}
			</CardGroup.Item>
		{/if}

		<CardGroup.Item labelFor="opencode-go">
			{#snippet title()}
				OpenCode Go API
			{/snippet}
			{#snippet actions()}
				<RadioButton name="modelKind" id="opencode-go" value={ModelKind.OpenCodeGo} />
			{/snippet}
		</CardGroup.Item>
		{#if modelKind === ModelKind.OpenCodeGo}
			<CardGroup.Item>
				<div class="ai-settings__provider-fields">
					{#if openCodeGoError}
						<InfoMessage style="danger" filled outlined={false} error={openCodeGoError}>
							{#snippet title()}OpenCode Go configuration failed{/snippet}
							{#snippet content()}Check the API key and network connection, then try again.{/snippet}
						</InfoMessage>
					{:else if openCodeGoStatus?.hasApiKey}
						<InfoMessage style="success" filled outlined={false}>
							{#snippet title()}API key saved{/snippet}
							{#snippet content()}
								The key is stored in the system keychain and is never loaded back into this form.
							{/snippet}
						</InfoMessage>
					{/if}

					<Textbox
						label={openCodeGoStatus?.hasApiKey ? "Replace API key" : "API key"}
						type="password"
						bind:value={openCodeGoKey}
						placeholder="OpenCode Go API key"
					/>

					<div class="ai-settings__provider-actions">
						<Button
							style="pop"
							disabled={!openCodeGoKey.trim()}
							loading={openCodeGoBusy}
							onclick={saveOpenCodeGoKey}>Save API key</Button
						>
						{#if openCodeGoStatus?.hasApiKey}
							<Button kind="outline" loading={openCodeGoBusy} onclick={deleteOpenCodeGoKey}
								>Clear saved key</Button
							>
						{/if}
					</div>

					{#if openCodeGoModels.length > 0}
						<Select
							value={openCodeGoModel}
							options={modelOptions(openCodeGoModels)}
							label="Model"
							wide
							onselect={(value) => {
								openCodeGoModel = value;
							}}
						>
							{#snippet itemSnippet({ item, highlighted })}
								<SelectItem selected={item.value === openCodeGoModel} {highlighted}>
									{item.label}
								</SelectItem>
							{/snippet}
						</Select>
					{/if}
				</div>
			</CardGroup.Item>
		{/if}

		<CardGroup.Item labelFor="ollama">
			{#snippet title()}
				Ollama 🦙
			{/snippet}
			{#snippet actions()}
				<RadioButton name="modelKind" id="ollama" value={ModelKind.Ollama} />
			{/snippet}
		</CardGroup.Item>
		{#if modelKind === ModelKind.Ollama}
			<CardGroup.Item>
				<Textbox
					label="Endpoint"
					bind:value={ollamaEndpoint}
					placeholder="http://127.0.0.1:11434"
				/>
				<Textbox label="Model" bind:value={ollamaModel} placeholder="llama3" />
				<InfoMessage filled outlined={false}>
					{#snippet title()}
						Configuring Ollama
					{/snippet}
					{#snippet content()}
						To connect to your Ollama endpoint, <b>allow-list it in the app’s CSP settings</b>.
						<br />
						See the <Link href="https://docs.gitbutler.com/troubleshooting/custom-csp"
							>docs for details</Link
						>
					{/snippet}
				</InfoMessage>
			</CardGroup.Item>
		{/if}

		<CardGroup.Item labelFor="lmstudio">
			{#snippet title()}
				LM Studio
			{/snippet}
			{#snippet actions()}
				<RadioButton name="modelKind" id="lmstudio" value={ModelKind.LMStudio} />
			{/snippet}
		</CardGroup.Item>
		{#if modelKind === ModelKind.LMStudio}
			<CardGroup.Item>
				<Textbox
					label="Endpoint"
					bind:value={lmStudioEndpoint}
					placeholder="http://127.0.0.1:1234"
				/>
				<Textbox label="Model" bind:value={lmStudioModel} placeholder="default" />
				<InfoMessage filled outlined={false}>
					{#snippet title()}
						Configuring LM Studio
					{/snippet}
					{#snippet content()}
						<div class="ai-settings__section-text-block">
							<p>Connecting to your LM Studio endpoint requires that you do two things:</p>

							<p>
								1. <span class="text-bold"
									>Allow-list it in the CSP settings for the application</span
								>. You can find more details on how to do that in the <Link
									href="https://docs.gitbutler.com/troubleshooting/custom-csp">GitButler docs</Link
								>.
							</p>

							<p>
								2. <span class="text-bold">Enable CORS support in LM Studio</span>. You can find
								more details on how to do that in the <Link
									href="https://lmstudio.ai/docs/cli/server-start#enable-cors-support"
									>LM Studio docs</Link
								>.
							</p>
						</div>
					{/snippet}
				</InfoMessage>
			</CardGroup.Item>
		{/if}

		<CardGroup.Item labelFor="openrouter">
			{#snippet title()}
				OpenRouter
			{/snippet}
			{#snippet actions()}
				<RadioButton name="modelKind" id="openrouter" value={ModelKind.OpenRouter} />
			{/snippet}
		</CardGroup.Item>
		{#if modelKind === ModelKind.OpenRouter}
			<CardGroup.Item>
				<Textbox
					label="API key"
					type="password"
					bind:value={openRouterKey}
					required
					placeholder="sk-or-..."
				/>

				<Textbox label="Model" bind:value={openRouterModel} placeholder="openai/gpt-4.1-mini" />
			</CardGroup.Item>
		{/if}

		<CardGroup.Item>
			<AiCredentialCheck />
		</CardGroup.Item>
	</form>
</CardGroup>

<Spacer />

<CardGroup.Item standalone>
	{#snippet title()}
		Amount of provided context
	{/snippet}
	{#snippet caption()}
		How many characters of your git diff should be provided to AI
	{/snippet}
	{#snippet actions()}
		<Textbox
			type="number"
			width={80}
			textAlign="center"
			value={diffLengthLimit?.toString()}
			minVal={100}
			oninput={(value: string) => {
				diffLengthLimit = parseInt(value);
			}}
			placeholder="5000"
		/>
	{/snippet}
</CardGroup.Item>

<Spacer />

<SettingsSection>
	{#snippet title()}
		Custom AI prompts
	{/snippet}
	{#snippet description()}
		GitButler's AI assistant generates commit messages and branch names. Use default prompts or
		create your own. Assign prompts in the project settings.
	{/snippet}

	<div class="prompt-groups">
		<AIPromptEdit promptUse="commits" />
		<Spacer margin={12} />
		<AIPromptEdit promptUse="branches" />
	</div>
</SettingsSection>

<style>
	.ai-settings__about-text {
		margin-bottom: 12px;
		color: var(--text-2);
	}

	.prompt-groups {
		display: flex;
		flex-direction: column;
		margin-top: 16px;
		gap: 12px;
	}

	.ai-settings__short-note {
		display: flex;
		align-items: center;
		padding: 6px 10px;
		gap: 8px;
		border-radius: var(--radius-m);
		background-color: var(--bg-2);
		color: var(--text-2);
	}

	.ai-settings__section-text-block {
		display: flex;
		flex-direction: column;
	}

	.ai-settings__provider-fields {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 12px;
	}

	.ai-settings__provider-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
</style>
