import { hasProfanity, maskProfanity } from "./profanity.js";

describe("profanity", () => {
	it.each([
		["fuck you", "**** you"],
		["FuCk!", "****!"],
		["f.u.c.k off", "******* off"],
		["fuuuuck", "*******"],
		["sh1t happens", "**** happens"],
		["what a$$hole", "what *******"],
		["f u c k this", "******* this"],
		["motherfucker", "************"],
		["bitch, please", "*****, please"],
	])("masks English disguised as %j", (text, masked) => {
		expect(maskProfanity(text)).toBe(masked);
	});

	it.each([
		["хуй", "***"],
		["ну нахуй", "ну *****"],
		["xуй с ним", "*** с ним"],
		["хyйня", "*****"],
		["х.у.й", "*****"],
		["х у й", "*****"],
		["пиздец", "******"],
		["п1здец", "******"],
		["пи3дец!", "******!"],
		["бля", "***"],
		["блядь", "*****"],
		["ёбаный стыд", "****** стыд"],
		["заебал", "******"],
		["долбоёб", "*******"],
		["сука", "****"],
		["сyка", "****"],
		["мудак", "*****"],
		["pizdec", "******"],
		["blyat", "*****"],
		["suka", "****"],
		["nahuy", "*****"],
	])("masks Russian disguised as %j", (text, masked) => {
		expect(maskProfanity(text)).toBe(masked);
	});

	it.each([
		"classic assessment of the cocktail party",
		"Scunthorpe peacock at Dickens' shiitake bar",
		"употребляй и оскорблять",
		"хлебать колебать погребальный",
		"застрахуй сукно мудрый команда",
		"небо победа обед ребёнок бляха",
		"художник хулиган",
		"nice hand, gl hf",
		"a b c",
		"",
	])("leaves plain words alone: %j", (text) => {
		expect(hasProfanity(text)).toBe(false);
		expect(maskProfanity(text)).toBe(text);
	});

	it("keeps the punctuation and spacing around a masked word", () => {
		expect(maskProfanity("  «сука»,  ok ")).toBe("  «****»,  ok ");
		expect(hasProfanity("well... shit")).toBe(true);
	});
});
