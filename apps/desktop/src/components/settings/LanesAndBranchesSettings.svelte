<script lang="ts">
	import {
		autoSelectBranchNameFeature,
		autoSelectBranchCreationFeature,
		stagingBehaviorFeature,
		type StagingBehavior,
	} from "$lib/config/uiFeatureFlags";
	import { CardGroup, RadioButton, Spacer, Toggle } from "@gitbutler/ui";

	function onStagingBehaviorFormChange(form: HTMLFormElement) {
		const formData = new FormData(form);
		const selectedStagingBehavior = formData.get("stagingBehaviorType") as StagingBehavior | null;
		if (!selectedStagingBehavior) return;
		stagingBehaviorFeature.set(selectedStagingBehavior);
	}
</script>

<CardGroup>
	<CardGroup.Item labelFor="auto-select-creation">
		{#snippet title()}
			Auto-select text on branch creation
		{/snippet}
		{#snippet caption()}
			Automatically select the pre-populated text in the branch name field when creating a new
			branch, making it easier to type your own name.
		{/snippet}
		{#snippet actions()}
			<Toggle
				id="auto-select-creation"
				checked={$autoSelectBranchCreationFeature}
				onclick={() => ($autoSelectBranchCreationFeature = !$autoSelectBranchCreationFeature)}
			/>
		{/snippet}
	</CardGroup.Item>
	<CardGroup.Item labelFor="auto-select-rename">
		{#snippet title()}
			Auto-select text on branch rename
		{/snippet}
		{#snippet caption()}
			Automatically select the text when renaming a branch, making it easier to replace the entire
			name.
		{/snippet}
		{#snippet actions()}
			<Toggle
				id="auto-select-rename"
				checked={$autoSelectBranchNameFeature}
				onclick={() => ($autoSelectBranchNameFeature = !$autoSelectBranchNameFeature)}
			/>
		{/snippet}
	</CardGroup.Item>
</CardGroup>

<Spacer />

<div class="stack-v gap-8">
	<h2 class="text-15 text-bold">Commit staging behavior</h2>
	<p class="text-12 text-body clr-text-2">
		Controls which files are pre-selected when opening the staging view.
		<br />
		You can always change the selection manually.
	</p>
</div>

<CardGroup>
	<form class="stack-v" onchange={(e) => onStagingBehaviorFormChange(e.currentTarget)}>
		<CardGroup.Item labelFor="stage-all">
			{#snippet title()}
				Auto-select all changed files
			{/snippet}
			{#snippet caption()}
				Pre-selects every changed file in the working tree.
			{/snippet}
			{#snippet actions()}
				<RadioButton
					name="stagingBehaviorType"
					value="all"
					id="stage-all"
					checked={$stagingBehaviorFeature === "all"}
				/>
			{/snippet}
		</CardGroup.Item>

		<CardGroup.Item labelFor="stage-selection">
			{#snippet title()}
				Auto-select only your picked files
			{/snippet}
			{#snippet caption()}
				Pre-selects only the files you have already picked. If nothing is picked, no files are
				pre-selected.
			{/snippet}
			{#snippet actions()}
				<RadioButton
					name="stagingBehaviorType"
					value="selection"
					id="stage-selection"
					checked={$stagingBehaviorFeature === "selection"}
				/>
			{/snippet}
		</CardGroup.Item>

		<CardGroup.Item labelFor="stage-none">
			{#snippet title()}
				No auto-selection
			{/snippet}
			{#snippet caption()}
				Nothing is pre-selected. You manually pick what to include in each commit.
			{/snippet}
			{#snippet actions()}
				<RadioButton
					name="stagingBehaviorType"
					value="none"
					id="stage-none"
					checked={$stagingBehaviorFeature === "none"}
				/>
			{/snippet}
		</CardGroup.Item>
	</form>
</CardGroup>
