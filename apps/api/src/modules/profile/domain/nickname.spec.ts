import { parseNickname } from "./nickname.js";

const codeOf = (input: string) => {
	const result = parseNickname(input);
	return result.ok ? result.value : result.error.code;
};

describe("parseNickname", () => {
	it.each([
		["Alice", "Alice"],
		["  Ace   of  Spades ", "Ace of Spades"],
		["Дмитрий", "Дмитрий"],
		["Jean-Luc O'Neil", "Jean-Luc O'Neil"],
		["player_42.v2", "player_42.v2"],
		["李", "profile.nickname-too-short"],
		["李小龍", "李小龍"],
		["नमस्ते", "नमस्ते"],
	])("turns %j into %j", (input, expected) => {
		expect(codeOf(input)).toBe(expected);
	});

	it("counts characters, not UTF-16 units, and normalises look-alikes first", () => {
		// e + combining acute: two code points that NFKC makes one.
		expect(codeOf("é")).toBe("profile.nickname-too-short");
		expect(codeOf("é".repeat(24))).toBe("é".repeat(24));
		expect(codeOf("𝓐".repeat(24))).toBe("A".repeat(24));
		expect(codeOf("ＡＣＥ")).toBe("ACE");
	});

	it.each([
		["", "profile.nickname-too-short"],
		["   x   ", "profile.nickname-too-short"],
		["x".repeat(25), "profile.nickname-too-long"],
		["ace ♠", "profile.nickname-invalid-characters"],
		["ace 🂡", "profile.nickname-invalid-characters"],
		["ad​min", "profile.nickname-invalid-characters"],
		["‮nimda", "profile.nickname-invalid-characters"],
		["<script>", "profile.nickname-invalid-characters"],
	])("refuses %j with %s", (input, code) => {
		expect(codeOf(input)).toBe(code);
	});

	it("carries the bounds for the client's message", () => {
		const short = parseNickname("x");
		const long = parseNickname("x".repeat(25));

		expect(!short.ok && short.error.params).toEqual({ min: 2 });
		expect(!long.ok && long.error.params).toEqual({ max: 24 });
	});
});
