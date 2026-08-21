import { NativeAIClient } from "$lib/ai/nativeClient";
import { MessageRole, ModelKind } from "$lib/ai/types";
import type { IBackend } from "$lib/backend";
import { describe, expect, test, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
	Channel: class {
		onmessage = (_event: unknown) => {};
	},
}));

describe("NativeAIClient", () => {
	test("invokes the native provider and forwards streamed tokens", async () => {
		const onToken = vi.fn();
		const invoke = vi.fn(async (_command: string, params: Record<string, unknown>) => {
			const channel = params.onEvent as { onmessage: (event: unknown) => void };
			channel.onmessage({ type: "token", value: "streamed" });
			return "streamed response";
		});
		const backend = { invoke } as unknown as IBackend;
		const client = new NativeAIClient(backend, ModelKind.OpenCodeGo, "gpt-5.6-luna");
		const prompt = [{ role: MessageRole.User, content: "Summarize this diff" }];

		await expect(client.evaluate(prompt, { maxTokens: 42, onToken })).resolves.toBe(
			"streamed response",
		);
		expect(onToken).toHaveBeenCalledWith("streamed");
		expect(invoke).toHaveBeenCalledWith("ai_evaluate", {
			request: {
				provider: ModelKind.OpenCodeGo,
				model: "gpt-5.6-luna",
				prompt,
				maxTokens: 42,
			},
			onEvent: expect.anything(),
		});
	});
});
