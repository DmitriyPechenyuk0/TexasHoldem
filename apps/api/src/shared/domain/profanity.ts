// A Russian and English profanity filter for what players write (chat, nicknames). A curated list
// of word roots rather than a library: those tried either missed common disguises (`f.u.c.k`,
// `fuuuck`, `п1здец`) or masked plain words (`хлебать`, `колебать`, `застрахуй`).
//
// Each word is matched in two spellings: with look-alike letters, digits and symbols read as
// Cyrillic, and read as Latin, so mixed scripts (`xуй`, `сyка`) and leetspeak (`sh1t`) are caught.
// Separators inside a word (`х.у.й`) and repeated letters (`fuuuck`) are dropped; letters typed
// apart (`f u c k`) are read together.

/** Look-alikes read as Cyrillic letters. */
const AS_CYRILLIC: Readonly<Record<string, string>> = {
	a: "а",
	b: "б",
	c: "с",
	e: "е",
	h: "н",
	k: "к",
	m: "м",
	o: "о",
	p: "р",
	t: "т",
	x: "х",
	y: "у",
	u: "и",
	"0": "о",
	"1": "и",
	"3": "з",
	"4": "ч",
	"6": "б",
	"@": "а",
	ё: "е",
};

/** Look-alikes read as Latin letters. */
const AS_LATIN: Readonly<Record<string, string>> = {
	а: "a",
	в: "b",
	е: "e",
	ё: "e",
	к: "k",
	м: "m",
	н: "h",
	о: "o",
	р: "p",
	с: "c",
	т: "t",
	у: "y",
	х: "x",
	"0": "o",
	"1": "i",
	"3": "e",
	"4": "a",
	"5": "s",
	"7": "t",
	"@": "a",
	$: "s",
	"!": "i",
	"+": "t",
};

/** Prefixes before the root `еб`: `заебал`, `отъебись`, `долбоёб`. */
const EB_PREFIXES =
	"(?:за|на|вз|от|отъ|вы|до|недо|по|про|пере|съ|разъ|въ|изъ|у|под|подъ|при|об|объ|долбо)";

/** Russian roots, on the Cyrillic reading. Anchored where a plain word would share the letters. */
const RUSSIAN: readonly RegExp[] = [
	/(?<!стра)ху[йеяюи]/u,
	/п[ие]зд/u,
	new RegExp(`^${EB_PREFIXES}?еб(?:[аоуиыелнт]|$)`, "u"),
	/^бля(?!х)|бляд/u,
	/^сук(?:а|и|е|у|ой|ам|ами|ах|ин|ины|ину)?$|^суч(?:к|ар|ен)/u,
	/^муд(?:ак|ил|оз|ач)/u,
	/^пид[оа]?р|^педик(?:и|ам|ов)?$/u,
	/^г[ао]ндон/u,
	/шлюх/u,
	/залуп/u,
	/^дроч/u,
	/^говн/u,
];

/** Russian written in Latin letters, on the Latin reading. */
const RUSSIAN_IN_LATIN: readonly RegExp[] = [
	/^(?:na|po)?[hx]u(?:y|j|i$|ya|yu|ye|ev|ec)/u,
	/p[ie]zd/u,
	/^(?:za|na|vy|do|po|pro|ot|u)?y?(?:eb|ob)(?:at|an|al|nu)/u,
	/^bl(?:ya|ia|iat|yat|yad)/u,
	/^suk(?:a|i)$|^such(?:k|ar)/u,
	/^mud(?:ak|il)|^pid[oa]?r|^g[ao]ndon|shluh|zalup/u,
];

/** English roots, on the Latin reading. */
const ENGLISH: readonly RegExp[] = [
	/fuck|^fuk|^fck|phuck|^fuq/u,
	/shit(?!ake)/u,
	/(?<!s)cunt/u,
	/bitch/u,
	/^dick(?:s|head|heads)?$/u,
	/^cock(?:s|sucker|suckers)?$/u,
	/^puss(?:y|ies)$/u,
	/^ass(?:hole|holes|es)?$|asshole/u,
	/^bastard/u,
	/^whore/u,
	/^slut/u,
	/nigg(?:er|a)/u,
	/^fag(?:got|gots|s)?$/u,
	/^twat/u,
	/^wank/u,
	/motherf/u,
];

/** Characters that may sit inside a disguised word without being part of it. */
const SEPARATORS = /[.\-_*'’"`~|,]+/gu;

const read = (word: string, as: Readonly<Record<string, string>>): string =>
	Array.from(word, (char) => as[char] ?? char).join("");

/** `fuuuck` → `fuck`: a run of one letter counts once. */
const collapsed = (word: string): string => word.replace(/(.)\1+/gu, "$1");

/** Whether one word, as typed, is profane. */
function isProfane(word: string): boolean {
	const plain = word.normalize("NFKC").toLowerCase().replace(SEPARATORS, "");
	if (plain.length < 2) {
		return false;
	}
	const cyrillic = read(plain, AS_CYRILLIC);
	const latin = read(plain, AS_LATIN);
	const matches = (patterns: readonly RegExp[], spelling: string) =>
		patterns.some(
			(pattern) => pattern.test(spelling) || pattern.test(collapsed(spelling)),
		);
	return (
		matches(RUSSIAN, cyrillic) ||
		matches(RUSSIAN_IN_LATIN, latin) ||
		matches(ENGLISH, latin)
	);
}

/** A word's core, without the punctuation around it: `"fuck!"` → `fuck`. */
const CORE = /^([^\p{L}\p{N}@$]*)(.*?)([^\p{L}\p{N}@$]*)$/su;

interface Word {
	readonly start: number;
	readonly end: number;
	readonly core: string;
}

/** The words of the text, by where their cores start and end. */
function wordsOf(text: string): Word[] {
	const words: Word[] = [];
	for (const match of text.matchAll(/\S+/gu)) {
		const [, before = "", core = ""] = CORE.exec(match[0]) ?? [];
		if (core.length > 0) {
			const start = match.index + before.length;
			words.push({ start, end: start + core.length, core });
		}
	}
	return words;
}

/** The spans to mask: each profane word, and each run of three or more letters typed apart. */
function profaneSpans(text: string): { start: number; end: number }[] {
	const words = wordsOf(text);
	const spans: { start: number; end: number }[] = [];
	for (let index = 0; index < words.length;) {
		let run = index;
		while (run < words.length && Array.from(words[run]!.core).length === 1) {
			run++;
		}
		if (run - index >= 3) {
			const together = words
				.slice(index, run)
				.map(({ core }) => core)
				.join("");
			if (isProfane(together)) {
				spans.push({ start: words[index]!.start, end: words[run - 1]!.end });
			}
			index = run;
			continue;
		}
		const word = words[index]!;
		if (isProfane(word.core)) {
			spans.push(word);
		}
		index++;
	}
	return spans;
}

/** Whether the text holds a profane word, however disguised. */
export function hasProfanity(text: string): boolean {
	return profaneSpans(text).length > 0;
}

/** The text with each profane word masked by asterisks, one per character. */
export function maskProfanity(text: string): string {
	let masked = "";
	let from = 0;
	for (const { start, end } of profaneSpans(text)) {
		masked +=
			text.slice(from, start) +
			"*".repeat(Array.from(text.slice(start, end)).length);
		from = end;
	}
	return masked + text.slice(from);
}
