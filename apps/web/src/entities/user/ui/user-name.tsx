import { cn } from "@/shared/lib";

/** The nickname, and the unique `@username` after it when there is room. */
export function UserName({
	nickname,
	username,
	withUsername = false,
	className,
}: {
	readonly nickname: string;
	readonly username: string;
	readonly withUsername?: boolean;
	readonly className?: string;
}) {
	return (
		<span
			className={cn("inline-flex min-w-0 items-baseline gap-1.5", className)}
		>
			<span className="truncate">{nickname}</span>
			{withUsername && (
				<span className="truncate text-muted-foreground">@{username}</span>
			)}
		</span>
	);
}
