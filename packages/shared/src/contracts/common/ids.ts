import { z } from "zod";

// UUIDs, branded so that a TableId cannot be passed where a UserId is expected.

export const UserId = z.uuid().brand<"UserId">();
export type UserId = z.infer<typeof UserId>;

export const TableId = z.uuid().brand<"TableId">();
export type TableId = z.infer<typeof TableId>;

export const HandId = z.uuid().brand<"HandId">();
export type HandId = z.infer<typeof HandId>;
