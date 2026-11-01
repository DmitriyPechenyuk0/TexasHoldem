import type { QueryBus } from "@nestjs/cqrs";
import type { Clock } from "@/shared/application/clock.js";
import { MuteListRepository } from "../domain/mute-list.repository.js";
import { MutePlayerCommand } from "./commands/mute-player/mute-player.command.js";
import { MutePlayerHandler } from "./commands/mute-player/mute-player.handler.js";
import { UnmutePlayerCommand } from "./commands/unmute-player/unmute-player.command.js";
import { UnmutePlayerHandler } from "./commands/unmute-player/unmute-player.handler.js";
import { GetMutedIdsHandler } from "./queries/get-muted-ids/get-muted-ids.handler.js";
import { GetMutedIdsQuery } from "./queries/get-muted-ids/get-muted-ids.query.js";
import { GetMutesHandler } from "./queries/get-mutes/get-mutes.handler.js";
import { GetMutesQuery } from "./queries/get-mutes/get-mutes.query.js";

/** The mute list with the Postgres one's rules: idempotent both ways, latest first. */
class InMemoryMuteList extends MuteListRepository {
	readonly rows: { userId: string; mutedId: string; mutedAt: Date }[] = [];

	async mute(userId: string, mutedId: string, at: Date): Promise<void> {
		if (
			!this.rows.some((row) => row.userId === userId && row.mutedId === mutedId)
		) {
			this.rows.push({ userId, mutedId, mutedAt: at });
		}
	}

	async unmute(userId: string, mutedId: string): Promise<void> {
		const index = this.rows.findIndex(
			(row) => row.userId === userId && row.mutedId === mutedId,
		);
		if (index >= 0) this.rows.splice(index, 1);
	}

	async mutedBy(userId: string) {
		return this.rows
			.filter((row) => row.userId === userId)
			.sort((a, b) => b.mutedAt.getTime() - a.mutedAt.getTime())
			.map(({ mutedId, mutedAt }) => ({ mutedId, mutedAt }));
	}
}

function setUp() {
	const mutes = new InMemoryMuteList();
	const queryBus = {
		execute: async ({ userIds }: { userIds: string[] }) =>
			userIds
				.filter((userId) => userId !== "ghost")
				.map((userId) => ({ userId, username: userId, nickname: userId })),
	} as unknown as QueryBus;
	let now = 0;
	const clock = { now: () => new Date(++now) } as Clock;
	return {
		mutes,
		mute: new MutePlayerHandler(mutes, queryBus, clock),
		unmute: new UnmutePlayerHandler(mutes),
		list: new GetMutesHandler(mutes, queryBus),
		ids: new GetMutedIdsHandler(mutes),
	};
}

describe("mute list", () => {
	it("mutes once however often asked, latest first, and unmutes", async () => {
		const { mute, unmute, list, ids } = setUp();

		await mute.execute(new MutePlayerCommand("u-1", "u-2"));
		await mute.execute(new MutePlayerCommand("u-1", "u-3"));
		await mute.execute(new MutePlayerCommand("u-1", "u-2"));

		expect(await ids.execute(new GetMutedIdsQuery("u-1"))).toEqual([
			"u-3",
			"u-2",
		]);
		expect(await list.execute(new GetMutesQuery("u-1"))).toEqual([
			expect.objectContaining({ userId: "u-3", mutedAt: new Date(2) }),
			expect.objectContaining({ userId: "u-2", mutedAt: new Date(1) }),
		]);

		await unmute.execute(new UnmutePlayerCommand("u-1", "u-2"));
		await unmute.execute(new UnmutePlayerCommand("u-1", "u-2"));
		expect(await ids.execute(new GetMutedIdsQuery("u-1"))).toEqual(["u-3"]);
	});

	it("refuses muting oneself or nobody, and lists only players that exist", async () => {
		const { mutes, mute, list } = setUp();

		await expect(
			mute.execute(new MutePlayerCommand("u-1", "u-1")),
		).rejects.toMatchObject({ code: "chat.mute-self" });
		await expect(
			mute.execute(new MutePlayerCommand("u-1", "ghost")),
		).rejects.toMatchObject({ code: "chat.player-not-found" });
		await mutes.mute("u-1", "ghost", new Date(0));

		expect(await list.execute(new GetMutesQuery("u-1"))).toEqual([]);
	});
});
