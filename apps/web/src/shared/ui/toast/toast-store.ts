import { create } from "zustand";

export type ToastVariant = "info" | "success" | "error";

export interface ToastOptions {
	/** Already translated. */
	readonly title: string;
	readonly description?: string;
	readonly variant?: ToastVariant;
	/** How long it stays; Radix pauses the timer while the toast is hovered or focused. */
	readonly durationMs?: number;
}

export interface ToastEntry extends ToastOptions {
	readonly id: number;
	readonly open: boolean;
}

interface ToastState {
	readonly toasts: readonly ToastEntry[];
	show(options: ToastOptions): number;
	dismiss(id: number): void;
}

/** Leaves a dismissed toast mounted long enough for its exit animation. */
const EXIT_MS = 500;

let nextId = 1;

export const useToasts = create<ToastState>()((set) => ({
	toasts: [],
	show: (options) => {
		const id = nextId++;
		set((state) => ({
			toasts: [...state.toasts, { ...options, id, open: true }],
		}));
		return id;
	},
	dismiss: (id) => {
		set((state) => ({
			toasts: state.toasts.map((entry) =>
				entry.id === id ? { ...entry, open: false } : entry,
			),
		}));
		setTimeout(() => {
			set((state) => ({
				toasts: state.toasts.filter((entry) => entry.id !== id),
			}));
		}, EXIT_MS);
	},
}));

/** Shows a toast from client code (an event handler, a mutation callback). Returns its id. */
export function toast(options: ToastOptions): number {
	return useToasts.getState().show(options);
}

export function dismissToast(id: number): void {
	useToasts.getState().dismiss(id);
}
