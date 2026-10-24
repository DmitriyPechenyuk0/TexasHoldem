import fc from "fast-check";
import {
	bytesToHex,
	concatBytes,
	hexToBytes,
	lengthPrefixed,
	uint32BigEndian,
	utf8,
} from "./bytes.js";

describe("bytes", () => {
	it.each([
		"",
		"hand-42",
		"Привет",
		"🂡 ace of spades",
		"a\u{10ffff}z",
		"\ud800",
		"x\udfffy",
	])("encodes %j as UTF-8 like TextEncoder", (text) => {
		expect(utf8(text)).toEqual(new TextEncoder().encode(text));
	});

	it("encodes any string as UTF-8 like TextEncoder", () => {
		fc.assert(
			fc.property(fc.string({ unit: "binary" }), (text) => {
				expect(utf8(text)).toEqual(new TextEncoder().encode(text));
			}),
		);
	});

	it("round-trips hex in either case", () => {
		fc.assert(
			fc.property(fc.uint8Array(), (bytes) => {
				const hex = bytesToHex(bytes);
				expect(hex).toMatch(/^[\da-f]*$/);
				expect(hexToBytes(hex)).toEqual(bytes);
				expect(hexToBytes(hex.toUpperCase())).toEqual(bytes);
			}),
		);
	});

	it.each(["0", "abc", "zz", "0x00", "00 "])("rejects %j as hex", (hex) => {
		expect(() => hexToBytes(hex)).toThrow(RangeError);
	});

	it("joins bytes and frames fields with a 32-bit big-endian length", () => {
		expect(
			concatBytes(Uint8Array.of(1), new Uint8Array(), Uint8Array.of(2, 3)),
		).toEqual(Uint8Array.of(1, 2, 3));
		expect(uint32BigEndian(0x01020304)).toEqual(Uint8Array.of(1, 2, 3, 4));
		expect(uint32BigEndian(2 ** 32 - 1)).toEqual(
			Uint8Array.of(255, 255, 255, 255),
		);
		expect(lengthPrefixed(Uint8Array.of(9, 9))).toEqual(
			Uint8Array.of(0, 0, 0, 2, 9, 9),
		);
	});
});
