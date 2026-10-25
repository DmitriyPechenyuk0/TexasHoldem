"use client";

import { Bell, Copy, LogOut, Settings, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "@/shared/i18n";
import {
	Avatar,
	Button,
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	Card,
	CardDescription,
	CardTitle,
	FormField,
	IconButton,
	Input,
	Label,
	LocaleSwitcher,
	PasswordInput,
	Slider,
	Spinner,
	Switch,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
	ThemeSwitcher,
	toast,
	Tooltip,
} from "@/shared/ui";

// A development tool, so its text stays in English (the i18n lint rule skips this slice).

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
			<h2 className="text-lg font-semibold">{title}</h2>
			{children}
		</section>
	);
}

function Row({ children }: { children: ReactNode }) {
	return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

const variants = ["primary", "secondary", "ghost", "danger"] as const;
const sizes = ["sm", "md", "lg"] as const;

/** Every shared/ui primitive in each state, for checking keyboard use and both themes. */
export function UiPreviewPage() {
	const [bet, setBet] = useState(40);
	const [sound, setSound] = useState(true);
	const [autoMuck, setAutoMuck] = useState(false);
	const [nickname, setNickname] = useState("");

	return (
		<main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
			<header className="flex flex-wrap items-center justify-between gap-4">
				<div>
					<h1 className="text-3xl font-semibold tracking-tight">
						UI primitives
					</h1>
					<p className="text-sm text-muted-foreground">
						Development only: this route does not exist in production builds.
					</p>
				</div>
				<div className="flex items-center gap-4">
					<LocaleSwitcher />
					<ThemeSwitcher />
				</div>
			</header>

			<Section title="Button">
				{sizes.map((size) => (
					<Row key={size}>
						{variants.map((variant) => (
							<Button key={variant} variant={variant} size={size}>
								{variant} {size}
							</Button>
						))}
					</Row>
				))}
				<Row>
					<Button loading>Saving</Button>
					<Button disabled>Disabled</Button>
					<Button variant="secondary">
						<Copy /> With icon
					</Button>
					<Button variant="ghost" asChild>
						<Link href="/">As a link</Link>
					</Button>
				</Row>
			</Section>

			<Section title="IconButton and Tooltip">
				<Row>
					{variants.map((variant) => (
						<IconButton
							key={variant}
							label={`Settings (${variant})`}
							variant={variant}
						>
							<Settings />
						</IconButton>
					))}
					<IconButton label="Notifications" size="sm">
						<Bell />
					</IconButton>
					<IconButton label="Notifications" size="lg">
						<Bell />
					</IconButton>
					<Tooltip content="A tooltip on any focusable element" side="right">
						<Button variant="secondary">Hover or focus me</Button>
					</Tooltip>
				</Row>
			</Section>

			<Section title="Form controls">
				<div className="grid gap-4 sm:grid-cols-2">
					<FormField
						label="Nickname"
						hint="3–16 characters, shown at the table."
					>
						<Input
							value={nickname}
							onChange={(event) => setNickname(event.target.value)}
							placeholder="ace_of_spades"
						/>
					</FormField>
					<FormField
						label="Email"
						error={nickname === "" ? "Enter an email address." : undefined}
					>
						<Input type="email" placeholder="you@example.com" />
					</FormField>
					<FormField label="Password">
						<PasswordInput autoComplete="new-password" />
					</FormField>
					<FormField label="Disabled">
						<Input disabled value="Read only" />
					</FormField>
				</div>
				<Row>
					<Switch id="sound" checked={sound} onCheckedChange={setSound} />
					<Label htmlFor="sound">Sound effects</Label>
					<Switch id="muck" checked={autoMuck} onCheckedChange={setAutoMuck} />
					<Label htmlFor="muck">Auto-muck losing hands</Label>
					<Switch id="off" disabled />
					<Label htmlFor="off">Disabled</Label>
				</Row>
				<div className="flex flex-col gap-2">
					<p className="text-sm">
						Bet: <span className="font-semibold tabular-nums">{bet}</span>
					</p>
					<Slider
						label="Bet amount"
						value={bet}
						onValueChange={setBet}
						min={2}
						max={200}
						step={2}
					/>
				</div>
			</Section>

			<Section title="Dialog, DropdownMenu and Toast">
				<Row>
					<Dialog>
						<DialogTrigger asChild>
							<Button variant="secondary">Open dialog</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Leave the table?</DialogTitle>
								<DialogDescription>
									Your stack goes back to your balance. You can sit down again
									any time.
								</DialogDescription>
							</DialogHeader>
							<FormField label="Leave a note for the table">
								<Input placeholder="gg" />
							</FormField>
							<DialogFooter>
								<DialogClose asChild>
									<Button variant="secondary">Stay</Button>
								</DialogClose>
								<DialogClose asChild>
									<Button variant="danger">Leave</Button>
								</DialogClose>
							</DialogFooter>
						</DialogContent>
					</Dialog>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="secondary">Open menu</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start">
							<DropdownMenuLabel>Table</DropdownMenuLabel>
							<DropdownMenuItem>
								<Copy /> Copy invite link
							</DropdownMenuItem>
							<DropdownMenuItem disabled>
								<Settings /> Settings (disabled)
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuCheckboxItem
								checked={sound}
								onCheckedChange={setSound}
							>
								Sound effects
							</DropdownMenuCheckboxItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem variant="danger">
								<LogOut /> Leave table
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>

					<Button
						variant="secondary"
						onClick={() => toast({ title: "Invite link copied" })}
					>
						Info toast
					</Button>
					<Button
						variant="secondary"
						onClick={() =>
							toast({
								title: "You won the pot",
								description: "Full house, kings full of nines.",
								variant: "success",
							})
						}
					>
						Success toast
					</Button>
					<Button
						variant="secondary"
						onClick={() =>
							toast({
								title: "Seat 3 is taken",
								description: "Someone sat down a moment before you.",
								variant: "error",
							})
						}
					>
						<Trash2 /> Error toast
					</Button>
				</Row>
			</Section>

			<Section title="Tabs">
				<Tabs defaultValue="cash">
					<TabsList>
						<TabsTrigger value="cash">Cash games</TabsTrigger>
						<TabsTrigger value="private">Private tables</TabsTrigger>
						<TabsTrigger value="soon" disabled>
							Tournaments
						</TabsTrigger>
					</TabsList>
					<TabsContent value="cash">
						<p className="text-sm text-muted-foreground">
							Open tables anyone can join.
						</p>
					</TabsContent>
					<TabsContent value="private">
						<p className="text-sm text-muted-foreground">
							Tables you were invited to.
						</p>
					</TabsContent>
				</Tabs>
			</Section>

			<Section title="Avatar and Spinner">
				<Row>
					<Avatar name="Ada Lovelace" size="sm" />
					<Avatar name="Doyle Brunson" />
					<Avatar name="Phil Ivey" size="lg" />
					<Avatar name="Broken Image" src="/missing-avatar.png" size="lg" />
					<Spinner size="sm" />
					<Spinner />
					<Spinner size="lg" />
				</Row>
			</Section>

			<Section title="Card">
				<Card className="max-w-sm">
					<CardTitle>Check your inbox</CardTitle>
					<CardDescription>
						Open the link we emailed you to finish signing up.
					</CardDescription>
					<Button>Continue</Button>
				</Card>
			</Section>
		</main>
	);
}
