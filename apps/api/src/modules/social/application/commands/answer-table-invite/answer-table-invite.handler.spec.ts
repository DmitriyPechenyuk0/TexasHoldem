import { type CommandBus } from "@nestjs/cqrs";
import type { Clock } from "@/shared/application/clock.js";
import { GrantTableAccessCommand } from "@/shared/application/table-invitations.js";
import { NOW } from "../../in-memory-friendships.js";
import { InMemoryTableInvites } from "../../in-memory-table-invites.js";
import { AnswerTableInviteCommand } from "./answer-table-invite.command.js";
import { AnswerTableInviteHandler } from "./answer-table-invite.handler.js";

async function setUp() {
	const invites = new InMemoryTableInvites();
	await invites.add("u-2", "u-1", "t-1", new Date(NOW.getTime() + 1));
	await invites.add("u-2", "u-1", "t-2", NOW);
	const sent: unknown[] = [];
	const handler = new AnswerTableInviteHandler(
		invites,
		{
			execute: async (command: unknown) => {
				sent.push(command);
			},
		} as unknown as CommandBus,
		{ now: () => NOW } as Clock,
	);
	return { invites, sent, handler };
}

describe("AnswerTableInviteHandler", () => {
	it("lets the player into the table on accepting, once", async () => {
		const { sent, handler } = await setUp();

		await expect(
			handler.execute(
				new AnswerTableInviteCommand("u-2", "u-1", "t-1", "accept"),
			),
		).resolves.toBe("t-1");
		expect(sent).toEqual([new GrantTableAccessCommand("t-1", "u-2")]);

		await expect(
			handler.execute(
				new AnswerTableInviteCommand("u-2", "u-1", "t-1", "accept"),
			),
		).rejects.toMatchObject({ code: "social.invite-not-found" });
	});

	it("drops a declined invite without granting anything, and refuses one that ran out", async () => {
		const { invites, sent, handler } = await setUp();

		await handler.execute(
			new AnswerTableInviteCommand("u-2", "u-1", "t-1", "decline"),
		);
		expect(sent).toEqual([]);
		expect(await invites.pending("u-2", new Date(0))).toHaveLength(1);
		await expect(
			handler.execute(
				new AnswerTableInviteCommand("u-2", "u-1", "t-2", "accept"),
			),
		).rejects.toMatchObject({ code: "social.invite-not-found" });
	});
});
