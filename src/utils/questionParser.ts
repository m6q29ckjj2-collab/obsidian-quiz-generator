import {
	FillInTheBlank,
	Matching,
	MultipleChoice,
	Question,
	SelectAllThatApply,
	ShortOrLongAnswer,
	TrueFalse,
} from "./types";

function choicesRegex(): RegExp {
	const parts: string[] = [];
	for (let i = 0; i < 26; i++) {
		const l = String.fromCharCode(97 + i);
		parts.push(`(?:>\\s*${l}\\)\\s*(.+)\\s*)?`);
	}
	return new RegExp(parts.join(""));
}

function choicesAnswerRegex(): RegExp {
	const parts: string[] = [];
	for (let i = 0; i < 26; i++) {
		const l = String.fromCharCode(97 + i);
		parts.push(`(?:>(?:\\s*>)+\\s*(${l})\\).*\\s*)?`);
	}
	return new RegExp(parts.join(""));
}

function matchingAnswerRegex(): RegExp {
	const parts: string[] = [];
	for (let i = 0; i < 13; i++) {
		parts.push(`(?:>(?:\\s*>)+\\s*([a-m]\\)\\s*-+>\\s*[n-z]\\))\\s*)?`);
	}
	return new RegExp(parts.join(""));
}

// Question text may span multiple real blockquote lines (e.g. a fenced code block).
// Join them with a literal "\n" so the field stays on one line in the note; the UI
// unescapes it back to a real newline before rendering the whole thing as one markdown
// document (see unescapeNewlines in utils/helpers.ts).
// Strips each continuation line's leading ">" marker.
function joinMultilineField(raw: string): string {
	const lines = raw
		.split(/\r?\n/)
		.map((line, i) => (i === 0 ? line.trim() : line.replace(/^>\s*/, "").trimEnd()));
	while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
	return lines.join("\\n");
}

// Collects all "> >" (or deeper-nested ">>> ...") lines after matchEnd as the
// explanation, skipping a standalone "Explanation:" label line if present.
function extractExplanation(fileContents: string, matchEnd: number): string | undefined {
	const remaining = fileContents.slice(matchEnd);
	const lines: string[] = [];
	for (const raw of remaining.split(/\r?\n|\r/)) {
		const inner = raw.match(/^>(?:\s*>)+(.*)/);
		if (!inner) break;
		const content = inner[1].trim();
		if (!content) continue;
		if (/^Explanation:\s*$/i.test(content)) continue;
		lines.push(content);
	}
	return lines.length > 0 ? lines.join("\n") : undefined;
}

export function parseCalloutQuestions(fileContents: string): Question[] {
	const quiz: Question[] = [];

	// Obsidian inserts blank connector lines (bare ">", possibly repeated deeper e.g.
	// ">>") between a callout's content and a nested callout so it renders as nested.
	// They carry no content, but their extra ">" throws off the fixed ">"-count patterns
	// below, so allow (and skip) them at every transition into a nested callout instead
	// of assuming they're absent.
	const blankConnector = "(?:(?:>[ \\t]*)+\\r?\\n)*";

	// Group 1 captures the first line plus any real continuation lines (e.g. a fenced code
	// block, or a blank line used as a paragraph break) that aren't a choice option
	// ("a) ...") or a nested callout (">> ..."). The lookaheads only check the current
	// line (using [ \t], not \s, so they don't cross into the next line) so a blank "> "
	// paragraph break doesn't get mistaken for the start of a nested callout.
	const questionCallout = />\s*\[!question][+-]?\s*(.+(?:\r?\n>(?![ \t]*>)(?![ \t]*[a-z]\)).*)*)\s*/;
	// Users (and Obsidian's own nesting UI) don't always land on exactly one extra ">"
	// for a nested callout, so accept two or more instead of requiring exactly two.
	const answerCallout = />(?:\s*>)+\s*\[!success].*\s*/;
	const choices = choicesRegex();
	const choicesAnswer = choicesAnswerRegex();

	// Multiple choice / select all that apply
	// Groups: [1]=question, [2..27]=options, [28..53]=answers
	const mcRegex = new RegExp(
		questionCallout.source + choices.source + blankConnector + answerCallout.source + choicesAnswer.source,
		"gi",
	);
	for (const match of fileContents.matchAll(mcRegex)) {
		const options = match.slice(2, 28).filter(o => o !== undefined);
		const answer = match.slice(28).filter(a => a !== undefined);
		if (!options.length || !answer.length || answer.length > options.length) continue;
		const explanation = extractExplanation(fileContents, (match.index ?? 0) + match[0].length);
		const question = joinMultilineField(match[1]);
		if (answer.length === 1) {
			quiz.push({
				question,
				options,
				answer: answer[0].toLowerCase().charCodeAt(0) - 97,
				...(explanation ? { explanation } : {}),
			} as MultipleChoice);
		} else {
			quiz.push({
				question,
				options,
				answer: answer.map(l => l.toLowerCase().charCodeAt(0) - 97),
				...(explanation ? { explanation } : {}),
			} as SelectAllThatApply);
		}
	}

	// Matching
	// Groups: [1]=question, [2..14]=leftOptions, [15..27]=rightOptions, [28..40]=answers
	const groupCallout = />(?:\s*>)+\s*\[!example].*\s*/;
	const groupAChoices = choices.source.substring(0, choices.source.length / 2).replace(/>/g, ">(?:\\s*>)+");
	const groupBChoices = choices.source.substring(choices.source.length / 2).replace(/>/g, ">(?:\\s*>)+");
	const matchingAnswer = matchingAnswerRegex();
	const matchingRegex = new RegExp(
		questionCallout.source + blankConnector + groupCallout.source + groupAChoices +
		blankConnector + groupCallout.source + groupBChoices +
		blankConnector + answerCallout.source + matchingAnswer.source,
		"gi",
	);
	for (const match of fileContents.matchAll(matchingRegex)) {
		const leftOptions = match.slice(2, 15).filter(o => o !== undefined);
		const rightOptions = match.slice(15, 28).filter(o => o !== undefined);
		const answer: { leftOption: string; rightOption: string }[] = [];
		match.slice(28).filter(o => o !== undefined).forEach(pair => {
			const [left, right] = pair.split(/\s*-+>\s*/);
			const li = left.toLowerCase().charCodeAt(0) - 97;
			const ri = right.toLowerCase().charCodeAt(0) - "n".charCodeAt(0);
			answer.push({ leftOption: leftOptions[li], rightOption: rightOptions[ri] });
		});
		if (!leftOptions.length || !rightOptions.length || !answer.length) continue;
		if (leftOptions.length !== rightOptions.length || leftOptions.length !== answer.length) continue;
		const explanation = extractExplanation(fileContents, (match.index ?? 0) + match[0].length);
		quiz.push({
			question: joinMultilineField(match[1]),
			answer,
			...(explanation ? { explanation } : {}),
		} as Matching);
	}

	// True/False, Fill in the blank, Short/Long answer
	// Groups: [1]=question, [2]=answer
	const tfFibSlRegex = new RegExp(
		questionCallout.source + blankConnector + answerCallout.source + />(?:\s*>)+\s*(.+)/.source,
		"gi",
	);
	for (const match of fileContents.matchAll(tfFibSlRegex)) {
		const ans = match[2];
		const question = joinMultilineField(match[1]);
		const explanation = extractExplanation(fileContents, (match.index ?? 0) + match[0].length);
		if (ans.toLowerCase() === "true" || ans.toLowerCase() === "false") {
			quiz.push({
				question,
				answer: ans.toLowerCase() === "true",
				...(explanation ? { explanation } : {}),
			} as TrueFalse);
		} else if (/`_+`/.test(question)) {
			quiz.push({
				question,
				answer: ans.split(/\s*,\s+/),
				...(explanation ? { explanation } : {}),
			} as FillInTheBlank);
		} else {
			quiz.push({
				question,
				answer: ans,
				...(explanation ? { explanation } : {}),
			} as ShortOrLongAnswer);
		}
	}

	return quiz;
}
