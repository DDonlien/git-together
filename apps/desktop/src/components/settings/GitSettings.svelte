<script lang="ts">
	import { SETTINGS_SERVICE } from "$lib/settings/appSettings";
	import { inject } from "@gitbutler/core/context";
	import { CardGroup, Select, SelectItem } from "@gitbutler/ui";

	const settingsService = inject(SETTINGS_SERVICE);
	const settings = settingsService.appSettings;

	let fetchFrequency = $state<number>(-1);

	const fetchFrequencyOptions = [
		{ label: "1 minute", value: "1", minutes: 1 },
		{ label: "5 minutes", value: "5", minutes: 5 },
		{ label: "10 minutes", value: "10", minutes: 10 },
		{ label: "15 minutes", value: "15", minutes: 15 },
		{ label: "None", value: "none", minutes: -1 },
	] as const;

	async function updateFetchFrequency(value: string) {
		const option = fetchFrequencyOptions.find((opt) => opt.value === value);
		if (option) {
			fetchFrequency = option.minutes;
			await settingsService.updateFetch({ autoFetchIntervalMinutes: option.minutes });
		}
	}

	const selectedValue = $derived(
		fetchFrequencyOptions.find((opt) => opt.minutes === fetchFrequency)?.value ?? "none",
	);

	$effect(() => {
		if ($settings?.fetch) {
			fetchFrequency = $settings.fetch.autoFetchIntervalMinutes;
		}
	});
</script>

<CardGroup.Item standalone labelFor="fetchFrequency" alignment="center">
	{#snippet title()}
		Auto-fetch frequency
	{/snippet}
	{#snippet actions()}
		<Select
			id="fetchFrequency"
			options={fetchFrequencyOptions}
			value={selectedValue}
			onselect={updateFetchFrequency}
		>
			{#snippet itemSnippet({ item, highlighted })}
				<SelectItem selected={item.value === selectedValue} {highlighted}>
					{item.label}
				</SelectItem>
			{/snippet}
		</Select>
	{/snippet}
</CardGroup.Item>
