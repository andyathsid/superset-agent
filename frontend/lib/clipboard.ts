export function getClipboardErrorDescription(fallback: string): string {
  if (!window.isSecureContext) {
    return "Copy requires a secure connection. Open this page using HTTPS.";
  }

  return fallback;
}
