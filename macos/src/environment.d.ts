import type { UpdateBridge } from './update-model';
import type { DiagnosticInput, DiagnosticsStatus } from './diagnostics-model';
declare global {
  interface Window {
    gittogether?: {
      environment: () => Promise<{ nativeGlass: boolean; platform: string }>;
      setTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>;
      import: (method: string, input: unknown, requestId?: string) => Promise<unknown>;
      presence?: (method: 'status' | 'configure' | 'reconnect', input: unknown) => Promise<unknown>;
      remoteControl?: (method: string, input: unknown) => Promise<unknown>;
      diagnostics?: {
        status: (input?: unknown) => Promise<DiagnosticsStatus>;
        record: (input: DiagnosticInput) => Promise<boolean>;
        open: (input?: unknown) => Promise<boolean>;
        copy?: () => Promise<number>;
      };
      chooseDirectory: () => Promise<string | null>;
      openGithubAuthorization: () => Promise<void>;
      githubWeb?: (method: 'start' | 'poll' | 'cancel' | 'open', input: unknown) => Promise<unknown>;
      updates: UpdateBridge;
    };
  }
}
