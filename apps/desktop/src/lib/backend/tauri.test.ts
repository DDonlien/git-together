import {
	formatIpcParamsForLogging,
	isValidDeepLinkUrl,
	parseDeepLinkUrl,
} from "$lib/backend/tauri";
import { describe, expect, test } from "vitest";

describe("formatIpcParamsForLogging", () => {
	test.each(["ai_evaluate", "ai_opencode_key_save", "secret_set_global"])(
		"redacts %s params",
		(command) => {
			expect(formatIpcParamsForLogging(command, { secret: "do-not-log" })).toBe("[redacted]");
		},
	);

	test("keeps ordinary command params useful for diagnostics", () => {
		expect(formatIpcParamsForLogging("get_project", { id: "project-id" })).toBe(
			'{"id":"project-id"}',
		);
	});
});

describe("isValidDeepLinkUrl", () => {
	test("returns true for valid GitTogether URLs", () => {
		expect(isValidDeepLinkUrl("gittogether://open")).toBe(true);
		expect(isValidDeepLinkUrl("gittogether://open?path=/some/path")).toBe(true);
		expect(isValidDeepLinkUrl("gittogether://open/?path=C:\\some\\path")).toBe(true);
		expect(isValidDeepLinkUrl("gittogether://open?path=/some/path&other=param")).toBe(true);
	});

	test("returns true for valid development and nightly URLs", () => {
		expect(isValidDeepLinkUrl("gittogether-dev://open?path=/dev/path")).toBe(true);
		expect(isValidDeepLinkUrl("gittogether-nightly://open?path=/nightly/path")).toBe(true);
	});

	test("returns false for invalid schemes", () => {
		expect(isValidDeepLinkUrl("http://open")).toBe(false);
		expect(isValidDeepLinkUrl("https://open")).toBe(false);
		expect(isValidDeepLinkUrl("invalid://open")).toBe(false);
		expect(isValidDeepLinkUrl("but://open")).toBe(false);
	});

	test("returns false for missing or invalid paths", () => {
		expect(isValidDeepLinkUrl("gittogether://")).toBe(false);
		expect(isValidDeepLinkUrl("gittogether://invalid")).toBe(false);
		expect(isValidDeepLinkUrl("gittogether://invalid-path")).toBe(false);
		expect(isValidDeepLinkUrl("gittogether://open-other")).toBe(false);
		expect(isValidDeepLinkUrl("gittogether://open/extra?path=/some/path")).toBe(false);
		expect(isValidDeepLinkUrl("gittogether://close")).toBe(false);
	});

	test("returns false for unsupported URL components", () => {
		expect(isValidDeepLinkUrl("gittogether://user@open?path=/some/path")).toBe(false);
		expect(isValidDeepLinkUrl("gittogether://open:123?path=/some/path")).toBe(false);
		expect(isValidDeepLinkUrl("gittogether://open?path=/some/path#fragment")).toBe(false);
	});

	test("returns false for malformed URLs", () => {
		expect(isValidDeepLinkUrl("gittogether:")).toBe(false);
		expect(isValidDeepLinkUrl("gittogether:/")).toBe(false);
		expect(isValidDeepLinkUrl("gittogether")).toBe(false);
		expect(isValidDeepLinkUrl("")).toBe(false);
	});
});

describe("parseDeepLinkUrl", () => {
	test("parses simple open URLs without query parameters", () => {
		const result = parseDeepLinkUrl("gittogether://open");
		expect(result).not.toBeNull();
		expect(result![0]).toBe("open");
		expect(result![1].toString()).toBe("");
	});

	test("parses open URLs with a single query parameter", () => {
		const result = parseDeepLinkUrl("gittogether://open?path=/some/path");
		expect(result).not.toBeNull();
		expect(result![0]).toBe("open");
		expect(result![1].get("path")).toBe("/some/path");
	});

	test("parses Windows-normalized URLs with a root path", () => {
		const result = parseDeepLinkUrl("gittogether://open/?path=C:\\some\\path");
		expect(result).not.toBeNull();
		expect(result![1].get("path")).toBe("C:\\some\\path");
	});

	test("parses Windows-normalized login URLs", () => {
		const result = parseDeepLinkUrl("gittogether://login/?access_token=token&t=123");
		expect(result).not.toBeNull();
		expect(result![0]).toBe("login");
		expect(result![1].get("access_token")).toBe("token");
	});

	test("parses multiple and encoded query parameters", () => {
		const result = parseDeepLinkUrl(
			"gittogether://open?path=/path/with%20spaces&key=value%26special&new_window=1",
		);
		expect(result).not.toBeNull();
		expect(result![1].get("path")).toBe("/path/with spaces");
		expect(result![1].get("key")).toBe("value&special");
		expect(result![1].get("new_window")).toBe("1");
	});

	test("works with all configured schemes", () => {
		for (const scheme of ["gittogether", "gittogether-dev", "gittogether-nightly"]) {
			const result = parseDeepLinkUrl(`${scheme}://open?path=/test`);
			expect(result).not.toBeNull();
			expect(result![0]).toBe("open");
			expect(result![1].get("path")).toBe("/test");
		}
	});

	test("returns null for missing and invalid top-level paths", () => {
		expect(parseDeepLinkUrl("gittogether://")).toBeNull();
		expect(parseDeepLinkUrl("gittogether://invalid")).toBeNull();
		expect(parseDeepLinkUrl("gittogether://?path=/test")).toBeNull();
	});

	test("handles empty and trailing query separators", () => {
		const empty = parseDeepLinkUrl("gittogether://open?");
		expect(empty).not.toBeNull();
		expect(empty![1].toString()).toBe("");

		const trailing = parseDeepLinkUrl("gittogether://open?path=/test&");
		expect(trailing).not.toBeNull();
		expect(trailing![1].get("path")).toBe("/test");
	});
});
