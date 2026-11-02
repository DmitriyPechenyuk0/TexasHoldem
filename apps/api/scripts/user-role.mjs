// Gives an account a role, or takes it back: the only way to make an admin (POK-114). The app has
// no endpoint for it on purpose. Reads DATABASE_URL from the environment or apps/api/.env.
//
//   pnpm --filter api user:role <username or email> admin
//   pnpm --filter api user:role <username or email> user
//
// The role takes effect at the account's next request; the change is recorded in admin_audit.
import { randomUUID } from "node:crypto";
import pg from "pg";

const ROLES = ["user", "admin"];
const [account, role] = process.argv.slice(2);
if (!account || !ROLES.includes(role)) {
	console.error("Usage: user:role <username or email> <user|admin>");
	process.exit(2);
}
if (!process.env.DATABASE_URL) {
	console.error("DATABASE_URL is not set (apps/api/.env or the environment)");
	process.exit(2);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
	await client.query("begin");
	const { rows } = await client.query(
		`update identity_users set role = $2, updated_at = now()
		where lower(username) = lower($1) or lower(email) = lower($1)
		returning id, username`,
		[account, role],
	);
	if (rows.length !== 1) {
		await client.query("rollback");
		console.error(`No account is ${account}`);
		process.exitCode = 1;
	} else {
		const [{ id, username }] = rows;
		await client.query(
			`insert into admin_audit (id, admin_id, action, target, details, at)
			values ($1, null, 'set-role', $2, $3, now())`,
			[randomUUID(), id, JSON.stringify({ role, by: "command line" })],
		);
		await client.query("commit");
		console.log(`${username ?? account} (${id}) is now ${role}`);
	}
} catch (error) {
	await client.query("rollback").catch(() => {});
	throw error;
} finally {
	await client.end();
}
