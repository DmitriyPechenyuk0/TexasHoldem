import manifest from "../package.json" with { type: "json" };

describe("@holdem/shared", () => {
	// Both apps and the browser load this package; anything beyond zod would ship to every client.
	it("has no runtime dependency besides zod", () => {
		expect(Object.keys(manifest.dependencies)).toEqual(["zod"]);
		expect(manifest).not.toHaveProperty("peerDependencies");
		expect(manifest).not.toHaveProperty("optionalDependencies");
	});

	it("is side-effect free, so bundlers can drop unused contracts", () => {
		expect(manifest.sideEffects).toBe(false);
	});
});
