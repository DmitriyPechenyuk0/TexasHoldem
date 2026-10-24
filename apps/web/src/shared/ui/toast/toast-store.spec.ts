import { dismissToast, toast, useToasts } from "./toast-store";

beforeEach(() => {
	vi.useFakeTimers();
	useToasts.setState({ toasts: [] });
});
afterEach(() => {
	vi.useRealTimers();
});

describe("toast", () => {
	it("queues toasts in order with their options", () => {
		const first = toast({ title: "Invite link copied" });
		const second = toast({ title: "Seat 3 is taken", variant: "error" });

		expect(second).not.toBe(first);
		expect(useToasts.getState().toasts).toEqual([
			{ id: first, open: true, title: "Invite link copied" },
			{ id: second, open: true, title: "Seat 3 is taken", variant: "error" },
		]);
	});

	it("closes a dismissed toast at once and unmounts it after its exit animation", () => {
		const id = toast({ title: "You won the pot" });
		const other = toast({ title: "Still here" });

		dismissToast(id);
		expect(useToasts.getState().toasts.map((entry) => entry.open)).toEqual([
			false,
			true,
		]);

		vi.runAllTimers();
		expect(useToasts.getState().toasts.map((entry) => entry.id)).toEqual([
			other,
		]);
	});
});
