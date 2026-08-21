import { generalSettingsPages } from "$lib/settings/generalSettingsPages";
import { describe, expect, test } from "vitest";

describe("generalSettingsPages", () => {
	test("exposes one merged Git Integrations destination", () => {
		const gitPages = generalSettingsPages.filter((page) =>
			["git", "integrations", "git-integrations"].includes(page.id),
		);

		expect(gitPages).toEqual([
			{
				id: "git-integrations",
				label: "Git Integrations",
				icon: "puzzle",
			},
		]);
	});

	test("keeps the merged page between branch and AI settings", () => {
		const ids = generalSettingsPages.map((page) => page.id);

		expect(ids.indexOf("git-integrations")).toBe(ids.indexOf("branches-and-commits") + 1);
		expect(ids.indexOf("ai")).toBe(ids.indexOf("git-integrations") + 1);
	});
});
