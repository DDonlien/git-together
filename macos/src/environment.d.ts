import type { UpdateBridge } from './update-model';
declare global {
  interface Window {
    gittogether?: {
      environment: () => Promise<{ nativeGlass: boolean; platform: string }>;
      setTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>;
      import: (method: string, input: unknown) => Promise<unknown>;
      chooseDirectory: () => Promise<string | null>;
      openGithubAuthorization: () => Promise<void>;
      githubWeb?: (method: 'start' | 'poll' | 'cancel' | 'open', input: unknown) => Promise<unknown>;
      updates: UpdateBridge;
    };
  }
}
