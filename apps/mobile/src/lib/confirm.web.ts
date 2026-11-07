/** Web version of confirm.ts: React Native's Alert does nothing in the browser, so use the browser's dialog. */
export function confirmAction(opts: { title: string; message: string; confirmLabel: string; destructive?: boolean }): Promise<boolean> {
  return Promise.resolve(window.confirm(opts.message ? `${opts.title}\n\n${opts.message}` : opts.title));
}
