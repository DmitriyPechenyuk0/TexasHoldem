import type { EventBus } from "@nestjs/cqrs";
import { PresenceChanged } from "../../events/presence-changed.event.js";
import { InMemoryPresence } from "../../in-memory-presence.js";
import type { PresenceSettler } from "../../presence-settler.js";
import { DisconnectFromSocialCommand } from "../disconnect-from-social/disconnect-from-social.command.js";
import { DisconnectFromSocialHandler } from "../disconnect-from-social/disconnect-from-social.handler.js";
import { ConnectToSocialCommand } from "./connect-to-social.command.js";
import { ConnectToSocialHandler } from "./connect-to-social.handler.js";

describe("ConnectToSocialHandler and DisconnectFromSocialHandler", () => {
	it("tell of the first connection only, and leave going offline to the settler", async () => {
		const presence = new InMemoryPresence();
		const published: unknown[] = [];
		const eventBus = {
			publish: (event: unknown) => published.push(event),
		} as unknown as EventBus;
		const later = vi.fn();
		const connect = new ConnectToSocialHandler(presence, eventBus);
		const disconnect = new DisconnectFromSocialHandler(presence, {
			later,
		} as unknown as PresenceSettler);

		await connect.execute(new ConnectToSocialCommand("u-1", "a"));
		await connect.execute(new ConnectToSocialCommand("u-1", "b"));
		await disconnect.execute(new DisconnectFromSocialCommand("u-1", "a"));

		expect(published).toEqual([new PresenceChanged("u-1")]);
		expect(presence.connections.get("u-1")).toEqual(new Set(["b"]));
		expect(later).toHaveBeenCalledWith("u-1");
	});
});
