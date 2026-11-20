export {};
declare global {
  interface BiCaptchaOptions { action: string; apiBase: string; trustPassV2?: boolean }
  interface BiCaptchaInstance {
    execute(callback: (token: string, error?: string) => void): Promise<void>;
    destroy(): void;
  }
  interface Window { BiCaptcha?: { init(siteKey: string, options: BiCaptchaOptions): BiCaptchaInstance } }
}
