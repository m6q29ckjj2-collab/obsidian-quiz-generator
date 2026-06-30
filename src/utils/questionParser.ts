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

// Optional explanation line inside [!success]: "> > explanation text"
const explanationCapture = /(?:\s*>\s*>\s*([^\n\r]+))?/;

export function parseCalloutQuestions(fileContents: string): Question[] {
	const quiz: Question[] = [];

	const questionCallout = />\s*\[!question][+-]?\s*(.+)\s*/;
	const answerCallout = />\s*>\s*\[!success].*\s*/;
	const choices = choicesRegex();
	const choicesAnswer = choicesAnswerRegex();

	// Multiple choice / select all that apply
	// Groups: [1]=question, [2..27]=options, [28..53]=answers, [54]=explanation
	const mcRegex = new RegExp(
		questionCallout.source + choices.source + answerCallout.source + choicesAnswer.source + explanationCapture.source,
		"gi",
	);
	for (const match of fileContents.matchAll(mcRegex)) {
		const options = match.slice(2, 28).filter(o => o !== undefined);
		const answer = match.slice(28, 54).filter(a => a !== undefined);
		const explanation = match[54] ?? undefined;
		if (!options.length || !answer.length || answer.length > options.length) continue;
		if (answer.length === 1) {
			quiz.push({
				question: match[1],
				options,
				answer: answer[0].toLowerCase().charCodeAt(0) - 97,
				...(explanation ? { explanation } : {}),
			} as MultipleChoice);
		} else {
			quiz.push({
				question: match[1],
				options,
				answer: answer.map(l => l.toLowerCase().charCodeAt(0) - 97),
				...(explanation ? { explanation } : {}),
			} as SelectAllThatApply);
		}
	}

	// Matching
	// Groups: [1]=question, [2..14]=leftOptions, [15..27]=rightOptions, [28..40]=answers, [41]=explanation
	const groupCallout = />\s*>\s*\[!example].*\s*/;
	const groupAChoices = choices.source.substring(0, choices.source.length / 2).replace(/>/g, ">\\s*>");
	const groupBChoices = choices.source.substring(choices.source.length / 2).replace(/>/g, ">\\s*>");
	const matchingAnswer = matchingAnswerRegex();
	const matchingRegex = new RegExp(
		questionCallout.source + groupCallout.source + groupAChoices +
		/>\s*/.source + groupCallout.source + groupBChoices +
		/>\s*/.source + answerCallout.source + matchingAnswer.source + explanationCapture.source,
		"gi",
	);
	for (const match of fileContents.matchAll(matchingRegex)) {
		const leftOptions = match.slice(2, 15).filter(o => o !== undefined);
		const rightOptions = match.slice(15, 28).filter(o => o !== undefined);
		const explanation = match[41] ?? undefined;
		const answer: { leftOption: string; rightOption: string }[] = [];
		match.slice(28, 41).filter(o => o !== undefined).forEach(pair => {
			const [left, right] = pair.split(/\s*-+>\s*/);
			const li = left.toLowerCase().charCodeAt(0) - 97;
			const ri = right.toLowerCase().charCodeAt(0) - "n".charCodeAt(0);
			answer.push({ leftOption: leftOptions[li], rightOption: rightOptions[ri] });
		});
		if (!leftOptions.length || !rightOptions.length || !answer.length) continue;
		if (leftOptions.length !== rightOptions.length || leftOptions.length !== answer.length) continue;
		quiz.push({
			question: match[1],
			answer,
			...(explanation ? { explanation } : {}),
		} as Matching);
	}

	// True/False, Fill in the blank, Short/Long answer
	// Groups: [1]=question, [2]=answer, [3]=explanation
	const tfFibSlRegex = new RegExp(
		questionCallout.source + answerCallout.source + />\s*>\s*(.+)/.source + explanationCapture.source,
		"gi",
	);
	for (const match of fileContents.matchAll(tfFibSlRegex)) {
		const ans = match[2];
		const explanation = match[3] ?? undefined;
		if (ans.toLowerCase() === "true" || ans.toLowerCase() === "false") {
			quiz.push({
				question: match[1],
				answer: ans.toLowerCase() === "true",
				...(explanation ? { explanation } : {}),
			} as TrueFalse);
		} else if (/`_+`/.test(match[1])) {
			quiz.push({
				question: match[1],
				answer: ans.split(/\s*,\s+/),
				...(explanation ? { explanation } : {}),
			} as FillInTheBlank);
		} else {
			quiz.push({
				question: match[1],
				answer: ans,
				...(explanation ? { explanation } : {}),
			} as ShortOrLongAnswer);
		}
	}

	return quiz;
}
