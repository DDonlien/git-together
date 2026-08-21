import {
	SHORT_DEFAULT_BRANCH_TEMPLATE,
	SHORT_DEFAULT_COMMIT_TEMPLATE,
	SHORT_DEFAULT_PR_TEMPLATE,
} from "$lib/ai/prompts";
import { ModelKind, type AIClient, type AIEvalOptions, type Prompt } from "$lib/ai/types";
import type { IBackend } from "$lib/backend";
import { Channel } from "@tauri-apps/api/core";

export type NativeModelKind = ModelKind.OpenAISubscription | ModelKind.OpenCodeGo;

export interface SubscriptionStatus {
	authenticated: boolean;
	email?: string;
}

export interface ApiKeyStatus {
	hasApiKey: boolean;
}

export interface AiModel {
	id: string;
	label: string;
}

type AiStreamEvent = {
	type: "token";
	value: string;
};

export class NativeAIClient implements AIClient {
	defaultCommitTemplate = SHORT_DEFAULT_COMMIT_TEMPLATE;
	defaultBranchTemplate = SHORT_DEFAULT_BRANCH_TEMPLATE;
	defaultPRTemplate = SHORT_DEFAULT_PR_TEMPLATE;

	constructor(
		private backend: IBackend,
		private provider: NativeModelKind,
		private model: string,
	) {}

	async evaluate(prompt: Prompt, options?: AIEvalOptions): Promise<string> {
		const onEvent = new Channel<AiStreamEvent>();
		onEvent.onmessage = (event) => {
			if (event.type === "token") options?.onToken?.(event.value);
		};

		return await this.backend.invoke<string>("ai_evaluate", {
			request: {
				provider: this.provider,
				model: this.model,
				prompt,
				maxTokens: options?.maxTokens,
			},
			onEvent,
		});
	}
}
