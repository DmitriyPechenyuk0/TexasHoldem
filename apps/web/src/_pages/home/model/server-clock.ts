import { create } from "zustand";

interface ServerClockState {
	/** How far the server clock runs ahead of this device's; null until the first sync. */
	readonly offsetMs: number | null;
	/** Records a server time answer received at `receivedAt` on this device's clock. */
	sync(serverNow: string, receivedAt: number): void;
}

/**
 * The offset between the server and the device clock. Ignores the request's travel time, which is
 * fine for display; turn timers will correct for it with the socket round trip.
 */
export const useServerClock = create<ServerClockState>()((set) => ({
	offsetMs: null,
	sync: (serverNow, receivedAt) =>
		set({ offsetMs: Date.parse(serverNow) - receivedAt }),
}));
