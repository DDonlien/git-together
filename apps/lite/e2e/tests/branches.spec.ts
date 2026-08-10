import { expect, test } from "../test.ts";

test.describe("branches", () => {
	test.use({ scenario: "project-with-remote-branches.sh" });

	test("applies a remote branch to the workspace", async ({ appWindow }) => {
		await expect(appWindow.getByRole("button", { name: /select project/i })).toBeVisible();
		await appWindow.keyboard.press("ControlOrMeta+Shift+A");

		const picker = appWindow.getByRole("dialog", { name: "Apply branch" });
		await expect(picker).toBeVisible();

		const search = picker.getByRole("combobox", { name: "Search for branches to apply…" });
		await search.fill("branch1");
		await search.press("Enter");

		await expect(picker).toBeHidden();
		await expect(appWindow.getByRole("treeitem", { name: "branch1", exact: true })).toBeVisible();
		await expect(appWindow.getByRole("treeitem", { name: "branch1: second commit" })).toBeVisible();
		await expect(appWindow.getByRole("treeitem", { name: "branch1: first commit" })).toBeVisible();
	});
});
