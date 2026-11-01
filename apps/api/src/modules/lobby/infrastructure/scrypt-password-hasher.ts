import {
	randomBytes,
	type ScryptOptions,
	scrypt,
	timingSafeEqual,
} from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PasswordHasher } from "../application/password-hasher.js";

/** OWASP's scrypt settings: N = 2^17, r = 8, p = 1, a 32-byte key from a 16-byte salt. */
const PARAMS = { N: 2 ** 17, r: 8, p: 1 } as const;
const KEY_BYTES = 32;
const MAX_MEMORY = 256 * 1024 * 1024;

const derive = (password: string, salt: Buffer, params: ScryptOptions) =>
	new Promise<Buffer>((resolve, reject) => {
		scrypt(
			password.normalize("NFKC"),
			salt,
			KEY_BYTES,
			{ ...params, maxmem: MAX_MEMORY },
			(error, key) => (error ? reject(error) : resolve(key)),
		);
	});

/** Table passwords hashed with scrypt, stored as `scrypt$<N>$<r>$<p>$<salt>$<key>` (base64url). */
@Injectable()
export class ScryptPasswordHasher extends PasswordHasher {
	async hash(password: string): Promise<string> {
		const salt = randomBytes(16);
		const key = await derive(password, salt, PARAMS);
		return [
			"scrypt",
			PARAMS.N,
			PARAMS.r,
			PARAMS.p,
			salt.toString("base64url"),
			key.toString("base64url"),
		].join("$");
	}

	async verify(password: string, hash: string): Promise<boolean> {
		const [scheme, n, r, p, salt, key] = hash.split("$");
		if (scheme !== "scrypt" || !salt || !key) {
			return false;
		}
		const expected = Buffer.from(key, "base64url");
		const actual = await derive(password, Buffer.from(salt, "base64url"), {
			N: Number(n),
			r: Number(r),
			p: Number(p),
		});
		return (
			actual.length === expected.length && timingSafeEqual(actual, expected)
		);
	}
}
