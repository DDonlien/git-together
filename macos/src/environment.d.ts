export {};
declare global {
  interface Window {
    gittogether?: {
      environment: () => Promise<{ nativeGlass: boolean; platform: string }>;
      setTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>;
      import: (method: string, input: unknown) => Promise<unknown>;
      chooseDirectory: () => Promise<string | null>;
    };
  }
}
