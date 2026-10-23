import { z } from "zod";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Query of a paginated list. It arrives as query-string text, so `limit` is coerced to a number. */
export const PageQuery = z.object({
	cursor: z.string().min(1).optional(),
	limit: z.coerce
		.number()
		.int()
		.min(1)
		.max(MAX_PAGE_SIZE)
		.default(DEFAULT_PAGE_SIZE),
});
export type PageQuery = z.infer<typeof PageQuery>;

export interface Page<Item> {
	readonly items: Item[];
	/** Cursor of the next page; null on the last one. */
	readonly nextCursor: string | null;
}

/** Response schema of a paginated list of `item`. */
export const pageOf = <Item extends z.ZodType>(item: Item) =>
	z.object({
		items: z.array(item),
		nextCursor: z.string().min(1).nullable(),
	});
