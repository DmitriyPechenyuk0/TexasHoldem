import { eventsTable } from "@/shared/infrastructure/event-store/index.js";

/** The table streams (`table-<id>`) and the hand streams (`hand-<id>`). */
export const tableEvents = eventsTable("table");
