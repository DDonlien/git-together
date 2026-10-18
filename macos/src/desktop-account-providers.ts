import providers from './desktop-account-providers.json';
export type DesktopAccountProvider = 'github' | 'github-enterprise' | 'gitea';
export const desktopAccountProviders = providers as ReadonlyArray<{ id: DesktopAccountProvider; label: string }>;
