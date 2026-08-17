import { generalSettingsPages } from "$lib/settings/generalSettingsPages";
import { describe, expect, it } from "vitest";

describe("generalSettingsPages", () => {
	it("places GitButler next to General in the global settings sidebar", () => {
		expect(generalSettingsPages.slice(0, 2)).toEqual([
			{
				id: "general",
				label: "General",
				icon: "settings",
			},
			{
				id: "gitbutler",
				label: "GitButler",
				icon: "workbench",
			},
		]);
	});

	it("does not expose GitButler organizations as a separate sidebar page", () => {
		expect(generalSettingsPages.map((page) => page.id)).not.toContain("organizations");
	});
});
