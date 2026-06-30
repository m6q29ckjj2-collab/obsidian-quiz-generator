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
		parts.push(`(?:>\\s*>\\s*(${l})\\).*\\s*)?`);
	}
	return new RegExp(parts.join(""));
}

function matchingAnswerRegex(): RegExp {
	const parts: string[] = [];
	for (let i = 0; i < 13; i++) {
		parts.push(`(?:>\\s*>\\s*([a-m]\\)\\s*-+>\\s*[n-z]\\))\\s*)?`);
	}
	return new RegExp(parts.join(""));
}

export function parseCalloutQuestions(fileContents: string): Question[] {
	const quiz: Question[] = [];

	const questionCallout = />\s*\[!question][+-]?\s*(.+)\s*/;
	const answerCallout = />\s*>\s*\[!success].*\s*/;
	const choices = choicesRegex();
	const choicesAnswer = choicesAnswerRegex();

	// Multiple choice / select all that apply
	const mcRegex = new RegExp(
		questionCallout.source + choices.source + answerCallout.source + choicesAnswer.source,
		"gi",
	);
	for (const match of fileContents.matchAll(mcRegex)) {
		const options = match.slice(2, 28).filter(o => o !== undefined);
		const answer = match.slice(28).filter(a => a !== undefined);
		if (!options.length || !answer.length || answer.length > options.length) continue;
		if (answer.length === 1) {
			quiz.push({
				question: match[1],
				options,
				answer: answer[0].toLowerCase().charCodeAt(0) - 97,
			} as MultipleChoice);
		} else {
			quiz.push({
				question: match[1],
				options,
				answer: answer.map(l => l.toLowerCase().charCodeAt(0) - 97),
			} as SelectAllThatApply);
		}
	}

	// Matching
	const groupCallout = />\s*>\s*\[!example].*\s*/;
	const groupAChoices = choices.source.substring(0, choices.source.length / 2).replace(/>/g, ">\\s*>");
	const groupBChoices = choices.source.substring(choices.source.length / 2).replace(/>/g, ">\\s*>");
	const matchingAnswer = matchingAnswerRegex();
	const matchingRegex = new RegExp(
		questionCallout.source + groupCallout.source + groupAChoices +
		/>\s*/.source + groupCallout.source + groupBChoices +
		/>\s*/.source + answerCallout.source + matchingAnswer.source,
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
		quiz.push({ question: match[1], answer } as Matching);
	}

	// True/False, Fill in the blank, Short/Long answer
	const tfFibSlRegex = new RegExp(
		questionCallout.source + answerCallout.source + />\s*>\s*(.+)/.source,
		"gi",
	);
	for (const match of fileContents.matchAll(tfFibSlRegex)) {
		const ans = match[2];
		if (ans.toLowerCase() === "true" || ans.toLowerCase() === "false") {
			quiz.push({ question: match[1], answer: ans.toLowerCase() === "true" } as TrueFalse);
		} else if (/`_+`/.test(match[1])) {
			quiz.push({ question: match[1], answer: ans.split(/\s*,\s+/) } as FillInTheBlank);
		} else {
			quiz.push({ question: match[1], answer: ans } as ShortOrLongAnswer);
		}
	}

	return quiz;
}
