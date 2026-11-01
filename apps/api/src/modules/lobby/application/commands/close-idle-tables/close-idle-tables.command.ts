import { Command } from "@nestjs/cqrs";

/** Closes the tables nobody has sat at for long enough (POK-98); answers how many it closed. */
export class CloseIdleTablesCommand extends Command<number> {}
