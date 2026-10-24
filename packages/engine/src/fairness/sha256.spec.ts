import { createHash, createHmac } from "node:crypto";
import fc from "fast-check";
import { bytesToHex, hexToBytes, utf8 } from "./bytes.js";
import { hmacSha256, sha256 } from "./sha256.js";

describe("sha256", () => {
	// FIPS 180-4 examples.
	it.each([
		["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
		["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
		[
			"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
			"248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
		],
		[
			"a".repeat(1_000_000),
			"cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
		],
	])("hashes the standard vector %#", (message, digest) => {
		expect(bytesToHex(sha256(utf8(message)))).toBe(digest);
	});

	it("matches node:crypto for any input, around every padding boundary", () => {
		fc.assert(
			fc.property(fc.uint8Array({ maxLength: 300 }), (bytes) => {
				expect(bytesToHex(sha256(bytes))).toBe(
					createHash("sha256").update(bytes).digest("hex"),
				);
			}),
		);
		for (const length of [55, 56, 63, 64, 65, 119, 120, 128]) {
			const bytes = new Uint8Array(length).fill(length);
			expect(bytesToHex(sha256(bytes))).toBe(
				createHash("sha256").update(bytes).digest("hex"),
			);
		}
	});
});

describe("hmacSha256", () => {
	// RFC 4231 test cases 1, 2 and 6 (a key longer than the block).
	it.each([
		[
			"0b".repeat(20),
			bytesToHex(utf8("Hi There")),
			"b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
		],
		[
			bytesToHex(utf8("Jefe")),
			bytesToHex(utf8("what do ya want for nothing?")),
			"5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
		],
		[
			"aa".repeat(131),
			bytesToHex(
				utf8("Test Using Larger Than Block-Size Key - Hash Key First"),
			),
			"60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54",
		],
	])("computes RFC 4231 vector %#", (key, message, mac) => {
		expect(bytesToHex(hmacSha256(hexToBytes(key), hexToBytes(message)))).toBe(
			mac,
		);
	});

	it("matches node:crypto for any key and message", () => {
		fc.assert(
			fc.property(
				fc.uint8Array({ maxLength: 150 }),
				fc.uint8Array({ maxLength: 150 }),
				(key, message) => {
					expect(bytesToHex(hmacSha256(key, message))).toBe(
						createHmac("sha256", key).update(message).digest("hex"),
					);
				},
			),
		);
	});
});
