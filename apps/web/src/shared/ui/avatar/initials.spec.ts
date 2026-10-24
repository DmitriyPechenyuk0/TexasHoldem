import { initialsOf } from "./initials";

describe("initialsOf", () => {
	it.each([
		["Ada Lovelace", "AL"],
		["  doyle   texas  dolly brunson ", "DT"],
		["phil", "P"],
		["Дмитрий Иванов", "ДИ"],
		["🂡 Ace", "🂡A"],
		["", ""],
	])("%j → %j", (name, initials) => {
		expect(initialsOf(name)).toBe(initials);
	});
});
