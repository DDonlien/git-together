import { type IconName } from "@gitbutler/ui";

interface SettingsPage {
	id: string;
	label: string;
	icon: IconName;
	adminOnly?: boolean;
}

export const generalSettingsPages = [
	{
		id: "general",
		label: "General",
		icon: "settings",
	},
	{
		id: "appearance",
		label: "Appearance",
		icon: "appearance",
	},
	{
		id: "branches-and-commits",
		label: "Branches & commits",
		icon: "branch",
	},
	{
		id: "git-integrations",
		label: "Git Integrations",
		icon: "puzzle",
	},
	{
		id: "ai",
		label: "AI Options",
		icon: "ai",
	},
	{
		id: "telemetry",
		label: "Telemetry",
		icon: "chart-bar-x",
	},
	{
		id: "experimental",
		label: "Experimental",
		icon: "lab",
	},
	{
		id: "organizations",
		label: "Organizations",
		icon: "factory",
		adminOnly: true,
	},
] as const satisfies readonly SettingsPage[];

export type GeneralSettingsPage = (typeof generalSettingsPages)[number];
