/** Port for hashing table passwords with a slow KDF: only the hash is stored. */
export abstract class PasswordHasher {
	abstract hash(password: string): Promise<string>;

	/** Whether the password is the one the hash was made from, in constant time. */
	abstract verify(password: string, hash: string): Promise<boolean>;
}
