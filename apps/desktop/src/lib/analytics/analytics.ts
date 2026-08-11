import type { PostHogWrapper } from "$lib/telemetry/posthog";
import type { AppSettings } from "@gitbutler/but-sdk";

export async function initAnalyticsIfEnabled(
	_appSettings: AppSettings,
	_postHog: PostHogWrapper,
	_confirmedOverride?: boolean,
): Promise<void> {
	// GitTogether 0.2.x is local-first and has no independent telemetry service.
	// Never initialize the upstream GitButler PostHog or Sentry projects, including
	// when an existing fork-era settings file still contains enabled flags.
}
