import { Inject } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/** The Drizzle client. Repositories and query handlers receive it through `@InjectDatabase()`. */
export type Database = NodePgDatabase;

export const DATABASE = Symbol("Database");

export const InjectDatabase = (): ParameterDecorator => Inject(DATABASE);
