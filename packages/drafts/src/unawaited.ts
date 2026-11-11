// automerge-repo 3's `handle.change()` mutates the doc and fires `change` at
// once, and returns a promise that settles when the change is stored. Event
// handlers that don't wait for that still have to hear about a failed save
// rather than leave the rejection unhandled, so they hand the promise here.
export function unawaited(stored: Promise<unknown>): void {
  stored.catch((err) => {
    console.error("[drafts] a change couldn't be stored:", err);
  });
}
