import { identicon } from "../model/identicon";

/** The generated avatar: decorative, the avatar around it carries the name. */
export function Identicon({ seed }: { readonly seed: string }) {
	const { hue, cells } = identicon(seed);

	return (
		<svg
			viewBox={`-1 -1 ${cells.length + 2} ${cells.length + 2}`}
			aria-hidden="true"
			className="size-full"
			style={{ backgroundColor: `hsl(${hue} 45% 92%)` }}
		>
			{cells.flatMap((row, y) =>
				row.map((filled, x) =>
					filled ? (
						<rect
							// The grid never changes shape, so the position is a stable key.
							key={`${x}-${y}`}
							x={x}
							y={y}
							width={1.02}
							height={1.02}
							fill={`hsl(${hue} 55% 42%)`}
						/>
					) : null,
				),
			)}
		</svg>
	);
}
