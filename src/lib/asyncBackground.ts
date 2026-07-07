/** Run async work after the HTTP handler returns — never await in the request path. */
export function runInBackground(label: string, task: () => Promise<void>): void {
  void task().catch((err) => console.error(`[${label}]`, err));
}
