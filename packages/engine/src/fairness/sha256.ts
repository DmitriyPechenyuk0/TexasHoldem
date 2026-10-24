import { concatBytes } from "./bytes.js";

// SHA-256 and HMAC-SHA256 (FIPS 180-4, RFC 2104) in plain TypeScript: synchronous, no platform
// crypto, so the shuffle runs and verifies identically in Node, browsers and tests.

const ROUND_CONSTANTS = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
	0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
	0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
	0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
	0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
	0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
	0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
	0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
	0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INITIAL_HASH = [
	0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
	0x1f83d9ab, 0x5be0cd19,
];

const BLOCK_BYTES = 64;

const rotateRight = (value: number, bits: number) =>
	(value >>> bits) | (value << (32 - bits));

export function sha256(message: Uint8Array): Uint8Array {
	// The message, a 1 bit, zeros, then the bit length as a 64-bit big-endian number.
	const padded = new Uint8Array(
		Math.ceil((message.length + 9) / BLOCK_BYTES) * BLOCK_BYTES,
	);
	padded.set(message);
	padded[message.length] = 0x80;
	const view = new DataView(padded.buffer);
	const bitLength = message.length * 8;
	view.setUint32(padded.length - 8, Math.floor(bitLength / 2 ** 32));
	view.setUint32(padded.length - 4, bitLength >>> 0);

	const hash = [...INITIAL_HASH];
	const schedule = Array.from({ length: 64 }, () => 0);
	const word = (index: number) => schedule[index] as number;
	for (let offset = 0; offset < padded.length; offset += BLOCK_BYTES) {
		for (let t = 0; t < 16; t++) {
			schedule[t] = view.getUint32(offset + t * 4);
		}
		for (let t = 16; t < 64; t++) {
			const w15 = word(t - 15);
			const w2 = word(t - 2);
			const s0 = rotateRight(w15, 7) ^ rotateRight(w15, 18) ^ (w15 >>> 3);
			const s1 = rotateRight(w2, 17) ^ rotateRight(w2, 19) ^ (w2 >>> 10);
			schedule[t] = (word(t - 16) + s0 + word(t - 7) + s1) | 0;
		}

		let [a, b, c, d, e, f, g, h] = hash as [
			number,
			number,
			number,
			number,
			number,
			number,
			number,
			number,
		];
		for (let t = 0; t < 64; t++) {
			const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
			const choice = (e & f) ^ (~e & g);
			const temp1 =
				(h + s1 + choice + (ROUND_CONSTANTS[t] as number) + word(t)) | 0;
			const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
			const majority = (a & b) ^ (a & c) ^ (b & c);
			const temp2 = (s0 + majority) | 0;
			h = g;
			g = f;
			f = e;
			e = (d + temp1) | 0;
			d = c;
			c = b;
			b = a;
			a = (temp1 + temp2) | 0;
		}
		[a, b, c, d, e, f, g, h].forEach((value, index) => {
			hash[index] = ((hash[index] as number) + value) | 0;
		});
	}

	const digest = new Uint8Array(32);
	const digestView = new DataView(digest.buffer);
	hash.forEach((value, index) => digestView.setUint32(index * 4, value >>> 0));
	return digest;
}

export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
	const blockKey = new Uint8Array(BLOCK_BYTES);
	blockKey.set(key.length > BLOCK_BYTES ? sha256(key) : key);
	const inner = blockKey.map((byte) => byte ^ 0x36);
	const outer = blockKey.map((byte) => byte ^ 0x5c);
	return sha256(concatBytes(outer, sha256(concatBytes(inner, message))));
}
