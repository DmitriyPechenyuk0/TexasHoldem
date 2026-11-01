import { TableId, UserId } from "@holdem/shared";
import {
	type AcceptTableInviteResponse,
	AnswerTableInviteRequest,
	type FriendRequestsResponse,
	type FriendsResponse,
	InviteFriendRequest,
	PlayerSearchQuery,
	type PlayerSearchResponse,
	SendFriendRequestRequest,
	type SendFriendRequestResponse,
	type TableInvitesResponse,
} from "@holdem/shared/contracts/social";
import {
	Controller,
	Delete,
	Get,
	HttpCode,
	Post,
	Res,
	UseGuards,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";
import {
	RateLimiter,
	type RateLimitRule,
} from "@/shared/application/rate-limiter.js";
import type { Viewer } from "@/shared/application/viewer.js";
import { AuthGuard, CurrentUser } from "@/shared/presentation/auth.guard.js";
import { rateLimited } from "@/shared/presentation/rate-limited.js";
import { RequirePlayer } from "@/shared/presentation/require-player.guard.js";
import {
	ValidBody,
	ValidParam,
	ValidQuery,
} from "@/shared/presentation/request-validation.js";
import { AnswerFriendRequestCommand } from "../application/commands/answer-friend-request/answer-friend-request.command.js";
import { AnswerTableInviteCommand } from "../application/commands/answer-table-invite/answer-table-invite.command.js";
import { CancelFriendRequestCommand } from "../application/commands/cancel-friend-request/cancel-friend-request.command.js";
import { InviteFriendToTableCommand } from "../application/commands/invite-friend-to-table/invite-friend-to-table.command.js";
import { RemoveFriendCommand } from "../application/commands/remove-friend/remove-friend.command.js";
import { SendFriendRequestCommand } from "../application/commands/send-friend-request/send-friend-request.command.js";
import { GetFriendRequestsQuery } from "../application/queries/get-friend-requests/get-friend-requests.query.js";
import { GetFriendsQuery } from "../application/queries/get-friends/get-friends.query.js";
import { GetTableInvitesQuery } from "../application/queries/get-table-invites/get-table-invites.query.js";
import { LookUpPlayersQuery } from "../application/queries/look-up-players/look-up-players.query.js";

/** Friend requests per player: a few dozen an hour, so nobody spams the whole player base. */
export const FRIEND_REQUEST_RULE: RateLimitRule = {
	max: 30,
	windowSeconds: 60 * 60,
};

/** Searches per player: typing as you go, but not reading out every username. */
export const PLAYER_SEARCH_RULE: RateLimitRule = { max: 60, windowSeconds: 60 };

/** Invites to one friend for one table: a reminder now and then, not a flood. */
export const TABLE_INVITE_RULE: RateLimitRule = { max: 1, windowSeconds: 60 };

const asUserId = (id: string) => id as UserId;

/**
 * Friends under `/api/friends`, requests under `/api/friend-requests`, finding players to ask
 * under `/api/players/search`, and inviting friends to tables under `/api/table-invites`. Changes
 * take a verified player.
 */
@Controller()
@UseGuards(AuthGuard)
export class SocialController {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly limiter: RateLimiter,
	) {}

	@Get("friends")
	async friends(@CurrentUser() viewer: Viewer): Promise<FriendsResponse> {
		const friends = await this.queryBus.execute(
			new GetFriendsQuery(viewer.userId),
		);
		return friends.map(({ since, ...friend }) => ({
			...friend,
			userId: asUserId(friend.userId),
			since: since.toISOString(),
		}));
	}

	/** Ends the friendship for both; the other is not told. */
	@Delete("friends/:userId")
	@HttpCode(204)
	@UseGuards(RequirePlayer)
	async removeFriend(
		@CurrentUser() viewer: Viewer,
		@ValidParam("userId", UserId) friendId: string,
	): Promise<void> {
		await this.commandBus.execute(
			new RemoveFriendCommand(viewer.userId, friendId),
		);
	}

	@Get("friend-requests/incoming")
	incoming(@CurrentUser() viewer: Viewer): Promise<FriendRequestsResponse> {
		return this.requests(viewer, "incoming");
	}

	@Get("friend-requests/outgoing")
	outgoing(@CurrentUser() viewer: Viewer): Promise<FriendRequestsResponse> {
		return this.requests(viewer, "outgoing");
	}

	private async requests(
		viewer: Viewer,
		direction: "incoming" | "outgoing",
	): Promise<FriendRequestsResponse> {
		const requests = await this.queryBus.execute(
			new GetFriendRequestsQuery(viewer.userId, direction),
		);
		return requests.map(({ sentAt, ...request }) => ({
			...request,
			userId: asUserId(request.userId),
			sentAt: sentAt.toISOString(),
		}));
	}

	@Post("friend-requests")
	@HttpCode(200)
	@UseGuards(RequirePlayer)
	async send(
		@CurrentUser() viewer: Viewer,
		@ValidBody(SendFriendRequestRequest) { username }: SendFriendRequestRequest,
		@Res({ passthrough: true }) response: Response,
	): Promise<SendFriendRequestResponse> {
		const decision = await this.limiter.consume(
			`social:friend-request:${viewer.userId}`,
			FRIEND_REQUEST_RULE,
		);
		if (!decision.allowed) {
			throw rateLimited(response, decision.retryAfterSeconds);
		}
		const { userId, outcome } = await this.commandBus.execute(
			new SendFriendRequestCommand(viewer.userId, username),
		);
		return { userId: asUserId(userId), status: outcome };
	}

	@Post("friend-requests/:userId/accept")
	@HttpCode(204)
	@UseGuards(RequirePlayer)
	async accept(
		@CurrentUser() viewer: Viewer,
		@ValidParam("userId", UserId) fromId: string,
	): Promise<void> {
		await this.commandBus.execute(
			new AnswerFriendRequestCommand(viewer.userId, fromId, "accept"),
		);
	}

	/** The one who asked is not told. */
	@Post("friend-requests/:userId/decline")
	@HttpCode(204)
	@UseGuards(RequirePlayer)
	async decline(
		@CurrentUser() viewer: Viewer,
		@ValidParam("userId", UserId) fromId: string,
	): Promise<void> {
		await this.commandBus.execute(
			new AnswerFriendRequestCommand(viewer.userId, fromId, "decline"),
		);
	}

	/** Takes back the request sent to this player. */
	@Delete("friend-requests/:userId")
	@HttpCode(204)
	@UseGuards(RequirePlayer)
	async cancel(
		@CurrentUser() viewer: Viewer,
		@ValidParam("userId", UserId) toId: string,
	): Promise<void> {
		await this.commandBus.execute(
			new CancelFriendRequestCommand(viewer.userId, toId),
		);
	}

	@Get("players/search")
	@UseGuards(RequirePlayer)
	async search(
		@CurrentUser() viewer: Viewer,
		@ValidQuery(PlayerSearchQuery) { q }: PlayerSearchQuery,
		@Res({ passthrough: true }) response: Response,
	): Promise<PlayerSearchResponse> {
		const decision = await this.limiter.consume(
			`social:player-search:${viewer.userId}`,
			PLAYER_SEARCH_RULE,
		);
		if (!decision.allowed) {
			throw rateLimited(response, decision.retryAfterSeconds);
		}
		const players = await this.queryBus.execute(
			new LookUpPlayersQuery(viewer.userId, q),
		);
		return players.map((player) => ({
			...player,
			userId: asUserId(player.userId),
		}));
	}

	/** Brings a friend to a table the player may join; they are told if online. */
	@Post("table-invites")
	@HttpCode(204)
	@UseGuards(RequirePlayer)
	async invite(
		@CurrentUser() viewer: Viewer,
		@ValidBody(InviteFriendRequest) { friendId, tableId }: InviteFriendRequest,
		@Res({ passthrough: true }) response: Response,
	): Promise<void> {
		const decision = await this.limiter.consume(
			`social:table-invite:${viewer.userId}:${friendId}:${tableId}`,
			TABLE_INVITE_RULE,
		);
		if (!decision.allowed) {
			throw rateLimited(response, decision.retryAfterSeconds);
		}
		await this.commandBus.execute(
			new InviteFriendToTableCommand(viewer.userId, friendId, tableId),
		);
	}

	@Get("table-invites")
	async tableInvites(
		@CurrentUser() viewer: Viewer,
	): Promise<TableInvitesResponse> {
		const invites = await this.queryBus.execute(
			new GetTableInvitesQuery(viewer.userId),
		);
		return invites.map(({ from, table, expiresAt }) => ({
			from: { ...from, userId: asUserId(from.userId) },
			table: { ...table, tableId: table.tableId as TableId },
			expiresAt: expiresAt.toISOString(),
		}));
	}

	/** Answers the table to go to; a private one lets the player in without its password. */
	@Post("table-invites/accept")
	@HttpCode(200)
	@UseGuards(RequirePlayer)
	async acceptInvite(
		@CurrentUser() viewer: Viewer,
		@ValidBody(AnswerTableInviteRequest)
		{ inviterId, tableId }: AnswerTableInviteRequest,
	): Promise<AcceptTableInviteResponse> {
		await this.commandBus.execute(
			new AnswerTableInviteCommand(viewer.userId, inviterId, tableId, "accept"),
		);
		return { tableId };
	}

	/** Nobody is told. */
	@Post("table-invites/decline")
	@HttpCode(204)
	@UseGuards(RequirePlayer)
	async declineInvite(
		@CurrentUser() viewer: Viewer,
		@ValidBody(AnswerTableInviteRequest)
		{ inviterId, tableId }: AnswerTableInviteRequest,
	): Promise<void> {
		await this.commandBus.execute(
			new AnswerTableInviteCommand(
				viewer.userId,
				inviterId,
				tableId,
				"decline",
			),
		);
	}
}
