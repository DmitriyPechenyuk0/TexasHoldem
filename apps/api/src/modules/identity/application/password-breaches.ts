/** Port: whether a new password is among those leaked in known data breaches. */
export abstract class PasswordBreaches {
	/**
	 * true when the password appears in a breach, false when it does not, null when that could not
	 * be checked. A failed check lets the password through: the outage of another service must not
	 * stop sign-ups.
	 */
	abstract isBreached(password: string): Promise<boolean | null>;
}
