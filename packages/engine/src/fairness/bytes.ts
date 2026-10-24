/** UTF-8 bytes of a string; a lone surrogate becomes U+FFFD, as with `TextEncoder`. */
export function utf8(text: string): Uint8Array {
	const bytes: number[] = [];
	for (const char of text) {
		let code = char.codePointAt(0) as number;
		if (code >= 0xd800 && code <= 0xdfff) {
			code = 0xfffd;
		}
		if (code < 0x80) {
			bytes.push(code);
		} else if (code < 0x800) {
			bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
		} else if (code < 0x10000) {
			bytes.push(
				0xe0 | (code >> 12),
				0x80 | ((code >> 6) & 0x3f),
				0x80 | (code & 0x3f),
			);
		} else {
			bytes.push(
				0xf0 | (code >> 18),
				0x80 | ((code >> 12) & 0x3f),
				0x80 | ((code >> 6) & 0x3f),
				0x80 | (code & 0x3f),
			);
		}
	}
	return Uint8Array.from(bytes);
}

export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
	const result = new Uint8Array(
		parts.reduce((length, part) => length + part.length, 0),
	);
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
}

/** A 32-bit unsigned integer as 4 big-endian bytes. */
export function uint32BigEndian(value: number): Uint8Array {
	const bytes = new Uint8Array(4);
	new DataView(bytes.buffer).setUint32(0, value);
	return bytes;
}

/** Its length as 4 big-endian bytes, then the bytes: fields joined this way can never be confused. */
export const lengthPrefixed = (bytes: Uint8Array): Uint8Array =>
	concatBytes(uint32BigEndian(bytes.length), bytes);

export const bytesToHex = (bytes: Uint8Array): string =>
	Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/** Reads hex in either case; throws a `RangeError` for an odd length or a non-hex character. */
export function hexToBytes(hex: string): Uint8Array {
	if (hex.length % 2 !== 0 || !/^[\da-f]*$/i.test(hex)) {
		throw new RangeError(`Not a hex string: ${JSON.stringify(hex)}`);
	}
	return Uint8Array.from({ length: hex.length / 2 }, (_, index) =>
		Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
	);
}
