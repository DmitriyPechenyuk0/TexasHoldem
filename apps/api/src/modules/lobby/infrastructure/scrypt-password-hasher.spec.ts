import { ScryptPasswordHasher } from "./scrypt-password-hasher.js";

describe("ScryptPasswordHasher", () => {
	it("verifies the password a hash was made from, and no other", async () => {
		const hasher = new ScryptPasswordHasher();

		const hash = await hasher.hash("correct horse");

		expect(hash).toMatch(/^scrypt\$131072\$8\$1\$[\w-]+\$[\w-]+$/);
		expect(hash).not.toContain("correct horse");
		expect(await hasher.verify("correct horse", hash)).toBe(true);
		expect(await hasher.verify("correct horse ", hash)).toBe(false);
		expect(await hasher.verify("correct horse", "md5$whatever")).toBe(false);
		// Salted: the same password hashes differently each time.
		expect(await hasher.hash("correct horse")).not.toBe(hash);
	});
});
