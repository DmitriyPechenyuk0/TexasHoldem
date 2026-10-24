// The root entry holds only the common primitives. Import contracts from their context subpath,
// e.g. `@holdem/shared/contracts/system`, so bundles carry only what they use.
export * from "./contracts/common/index.js";
