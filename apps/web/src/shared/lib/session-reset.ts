type Reset = () => void;

const resets = new Set<Reset>();

/**
 * Registers what to forget when the session ends: a store that holds anything about the viewer
 * calls it once, e.g. `onSessionEnd(() => useSeatStore.setState(useSeatStore.getInitialState(), true))`.
 * Returns the unregister function.
 */
export function onSessionEnd(reset: Reset): () => void {
	resets.add(reset);
	return () => resets.delete(reset);
}

/** Runs every registered reset; sign-out and password reset call it after clearing the query cache. */
export function endSessionState(): void {
	for (const reset of resets) {
		reset();
	}
}
