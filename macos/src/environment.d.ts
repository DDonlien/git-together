export {};
declare global {
  interface Window {
    gittogether?: {
      environment: () => Promise<{ nativeGlass: boolean; platform: string }>;
      setTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>;
    };
  }
}
