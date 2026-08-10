import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { TestInfo } from "@playwright/test";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const fixtureScriptsDir = path.join(repoRoot, "e2e/playwright/scripts");
const fixtureGitConfig = path.join(repoRoot, "e2e/playwright/fixtures/.gitconfig");

export type LiteTestEnvironment = {
	appDataDir: string;
	electronUserDataDir: string;
	gitConfig: string;
	workdir: string;
};

export const processEnvironment = (overrides: Record<string, string>): Record<string, string> =>
	Object.fromEntries(
		Object.entries({ ...process.env, ...overrides }).filter(
			(entry): entry is [string, string] => entry[1] !== undefined,
		),
	);

export const createLiteTestEnvironment = (testInfo: TestInfo): LiteTestEnvironment => {
	const appDataDir = testInfo.outputPath("app-data");
	const electronUserDataDir = testInfo.outputPath("electron-user-data");
	const gitConfig = testInfo.outputPath("gitconfig");
	const workdir = testInfo.outputPath("workdir");

	for (const directory of [appDataDir, electronUserDataDir, workdir])
		mkdirSync(directory, { recursive: true });

	const credentialStore = testInfo.outputPath("git-credentials");
	const baseGitConfig = readFileSync(fixtureGitConfig, "utf8").trimEnd();
	writeFileSync(
		gitConfig,
		`${baseGitConfig}\n[credential]\n\thelper = store --file ${credentialStore}\n`,
	);
	writeFileSync(
		path.join(electronUserDataDir, "settings.json"),
		JSON.stringify({ version: 1, autoUpdate: false, theme: "light" }, null, "\t"),
	);

	return { appDataDir, electronUserDataDir, gitConfig, workdir };
};

export const seedScenario = async (
	scenario: string,
	environment: LiteTestEnvironment,
): Promise<void> => {
	const scriptPath = path.join(fixtureScriptsDir, scenario);
	if (!existsSync(scriptPath)) throw new Error(`Fixture script does not exist: ${scriptPath}`);

	const but = process.env.BUT ?? path.join(repoRoot, "target/debug/but");
	if (!existsSync(but)) {
		throw new Error(
			`GitButler CLI does not exist at ${but}; build it with \`cargo build -p but\`.`,
		);
	}

	const { promise, resolve, reject } = Promise.withResolvers<void>();
	const child = spawn("bash", [scriptPath], {
		cwd: environment.workdir,
		stdio: "inherit",
		env: processEnvironment({
			BUT: but,
			E2E_TEST_APP_DATA_DIR: environment.appDataDir,
			GIT_CONFIG_GLOBAL: environment.gitConfig,
		}),
	});

	child.on("error", reject);
	child.on("close", (code) => {
		if (code === 0) resolve();
		else reject(new Error(`Fixture script ${scenario} failed with exit code ${code ?? "unknown"}`));
	});

	await promise;
};

export const paths = {
	electronMain: path.join(repoRoot, "apps/lite/dist/electron/main.js"),
	repoRoot,
};
