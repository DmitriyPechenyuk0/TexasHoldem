import { Locale } from "@holdem/shared";
import { CommandHandler, EventBus, type ICommandHandler } from "@nestjs/cqrs";
import { UserNotFoundError } from "../../../domain/user-not-found.error.js";
import { UsernameAlreadyChosenError } from "../../../domain/username-already-chosen.error.js";
import { UsernameTakenError } from "../../../domain/username-taken.error.js";
import { UserRegistered } from "../../events/user-registered.event.js";
import { UserVerified } from "../../events/user-verified.event.js";
import { UserRepository } from "../../user.repository.js";
import { ChooseUsernameCommand } from "./choose-username.command.js";

const FAILURES = {
	taken: UsernameTakenError,
	"already-chosen": UsernameAlreadyChosenError,
	"not-found": UserNotFoundError,
} as const;

/**
 * Completes an account: only now is it announced to the other contexts, as if just registered,
 * and as verified right after when the provider had vouched for its email.
 */
@CommandHandler(ChooseUsernameCommand)
export class ChooseUsernameHandler implements ICommandHandler<ChooseUsernameCommand> {
	constructor(
		private readonly users: UserRepository,
		private readonly eventBus: EventBus,
	) {}

	async execute({ userId, username }: ChooseUsernameCommand): Promise<void> {
		const stored = username.toLowerCase();
		const outcome = await this.users.chooseUsername(userId, stored);
		if (outcome.kind !== "chosen") {
			throw new FAILURES[outcome.kind]();
		}
		this.eventBus.publish(
			new UserRegistered(
				userId,
				stored,
				Locale.catch("en").parse(outcome.locale),
			),
		);
		if (outcome.emailVerified) {
			this.eventBus.publish(new UserVerified(userId));
		}
	}
}
