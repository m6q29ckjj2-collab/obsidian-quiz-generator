import { App, Notice, TFile } from "obsidian";
import { QuizSettings } from "../settings/config";
import {
	FillInTheBlank,
	Matching,
	MultipleChoice,
	PausedQuizState,
	Question,
	QuizAttemptResult,
	SelectAllThatApply,
	ShortOrLongAnswer,
	TrueFalse,
} from "../utils/types";
import QuizModalLogic from "../ui/quiz/quizModalLogic";

export default class QuizReviewer {
	private readonly app: App;
	private readonly settings: QuizSettings;
	private readonly quiz: Question[] = [];
	private readonly onComplete?: (results: QuizAttemptResult[], sourceLabel?: string) => Promise<void>;
	private readonly onExit?: (state: PausedQuizState | null) => Promise<void>;

	constructor(
		app: App,
		settings: QuizSettings,
		onComplete?: (results: QuizAttemptResult[], sourceLabel?: string) => Promise<void>,
		onExit?: (state: PausedQuizState | null) => Promise<void>,
	) {
		this.app = app;
		this.settings = settings;
		this.onComplete = onComplete;
		this.onExit = onExit;
	}

	public async openQuiz(file: TFile | null): Promise<void> {
		if (!(file instanceof TFile)) {
			new Notice("No active file");
			return;
		}

		const fileContents = await this.app.vault.cachedRead(file);
		this.calloutParser(fileContents);
		this.spacedRepetitionParser(fileContents);

		const paused = this.settings.pausedQuiz;
		const resuming = !!paused && paused.sourceLabel === file.basename;
		const quiz = resuming ? paused!.quiz : this.quiz;

		if (quiz.length > 0) {
			const onComplete = this.onComplete
				? (results: QuizAttemptResult[]) => this.onComplete!(results, file.basename)
				: undefined;
			const onExit = this.onExit
				? (state: { questionIndex: number; answers: (boolean | null)[]; ratings: (number | null)[] } | null) =>
					void this.onExit!(state ? { ...state, quiz, sourceLabel: file.basename, timestamp: Date.now() } : null)
				: undefined;
			await new QuizModalLogic(
				this.app,
				this.settings,
				quiz,
				[],
				onComplete,
				onExit,
				resuming ? { questionIndex: paused!.questionIndex, answers: paused!.answers, ratings: paused!.ratings } : undefined,
			).renderQuiz();
			if (resuming) new Notice(`Resumed quiz from question ${paused!.questionIndex + 1}`);
		} else {
			new Notice("No questions in this note");
		}
	}

	private calloutParser(fileContents: string): void {
		// Obsidian inserts blank connector lines (bare ">", possibly repeated deeper e.g.
		// ">>") between a callout's content and a nested callout so it renders as nested.
		// They carry no content, but their extra ">" throws off the fixed ">"-count
		// patterns below, so allow (and skip) them at every transition into a nested
		// callout instead of assuming they're absent.
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

		const choices = this.generateCalloutChoicesRegex();
		const choicesAnswer = this.generateCalloutChoicesAnswerRegex();
		const multipleChoiceSelectAllThatApplyRegex = new RegExp(
			questionCallout.source +
				choices.source +
				blankConnector +
				answerCallout.source +
				choicesAnswer.source,
			"gi",
		);
		this.matchMultipleChoiceSelectAllThatApply(
			fileContents,
			multipleChoiceSelectAllThatApplyRegex,
			fileContents,
		);

		const groupCallout = />(?:\s*>)+\s*\[!example].*\s*/;
		const groupAChoices = choices.source
			.substring(0, choices.source.length / 2)
			.replace(/>/g, ">(?:\\s*>)+");
		const groupBChoices = choices.source
			.substring(choices.source.length / 2)
			.replace(/>/g, ">(?:\\s*>)+");
		const matchingAnswer = this.generateCalloutMatchingAnswerRegex();
		const matchingRegex = new RegExp(
			questionCallout.source +
				blankConnector +
				groupCallout.source +
				groupAChoices +
				blankConnector +
				groupCallout.source +
				groupBChoices +
				blankConnector +
				answerCallout.source +
				matchingAnswer.source,
			"gi",
		);
		this.matchMatching(fileContents, matchingRegex, fileContents);

		const trueFalseFillInTheBlankShortOrLongAnswer = />(?:\s*>)+\s*(.+)/;
		const trueFalseFillInTheBlankShortOrLongAnswerRegex = new RegExp(
			questionCallout.source +
				blankConnector +
				answerCallout.source +
				trueFalseFillInTheBlankShortOrLongAnswer.source,
			"gi",
		);
		this.matchTrueFalseFillInTheBlankShortOrLongAnswer(
			fileContents,
			trueFalseFillInTheBlankShortOrLongAnswerRegex,
			fileContents,
		);
	}

	private spacedRepetitionParser(fileContents: string): void {
		const inlineSeparator = this.escapeSpecialCharacters(
			this.settings.inlineSeparator,
		);
		const multilineSeparator = this.escapeSpecialCharacters(
			this.settings.multilineSeparator,
		);

		const choices = this.generateSpacedRepetitionChoicesRegex();
		const choicesAnswer = this.generateSpacedRepetitionChoicesAnswerRegex();
		const multipleChoiceSelectAllThatApply =
			/[*_]{0,3}(?:multiple\s*choice|select\s*all\s*that\s*apply):[*_]{0,3}\s*(.+)\s*/;
		const multipleChoiceRegex = new RegExp(
			multipleChoiceSelectAllThatApply.source +
				choices.source +
				multilineSeparator.source +
				"\\s*" +
				choicesAnswer.source,
			"gi",
		);
		this.matchMultipleChoiceSelectAllThatApply(
			fileContents,
			multipleChoiceRegex,
		);

		const matching = /[*_]{0,3}matching:[*_]{0,3}\s*(.+)\s*/;
		const groupHeader = /.+\s*/;
		const groupAChoices = choices.source.substring(
			0,
			choices.source.length / 2,
		);
		const groupBChoices = choices.source.substring(
			choices.source.length / 2,
		);
		const matchingAnswer =
			this.generateSpacedRepetitionMatchingAnswerRegex();
		const matchingRegex = new RegExp(
			matching.source +
				groupHeader.source +
				groupAChoices +
				groupHeader.source +
				groupBChoices +
				multilineSeparator.source +
				"\\s*" +
				matchingAnswer.source,
			"gi",
		);
		this.matchMatching(fileContents, matchingRegex);

		const trueFalseFillInTheBlankShortOrLong =
			/[*_]{0,3}(?:true\s*or\s*false|fill\s*in\s*the\s*blank|(?:short|long)\s*answer):[*_]{0,3}\s*(.+)\s*/;
		const trueFalseFillInTheBlankShortOrLongAnswer = /\s*(.+)/;
		const trueFalseFillInTheBlankShortOrLongRegex = new RegExp(
			trueFalseFillInTheBlankShortOrLong.source +
				inlineSeparator.source +
				trueFalseFillInTheBlankShortOrLongAnswer.source,
			"gi",
		);
		this.matchTrueFalseFillInTheBlankShortOrLongAnswer(
			fileContents,
			trueFalseFillInTheBlankShortOrLongRegex,
		);
	}

	private generateCalloutChoicesRegex(): RegExp {
		const choices: string[] = [];
		for (let i = 0; i < 26; i++) {
			const letter = String.fromCharCode(97 + i);
			choices.push(`(?:>\\s*${letter}\\)\\s*(.+)\\s*)?`);
		}
		return new RegExp(choices.join(""));
	}

	private generateCalloutChoicesAnswerRegex(): RegExp {
		const choices: string[] = [];
		for (let i = 0; i < 26; i++) {
			const letter = String.fromCharCode(97 + i);
			choices.push(`(?:>(?:\\s*>)+\\s*(${letter})\\).*\\s*)?`);
		}
		return new RegExp(choices.join(""));
	}

	private generateCalloutMatchingAnswerRegex(): RegExp {
		const pairs: string[] = [];
		for (let i = 0; i < 13; i++) {
			pairs.push(`(?:>(?:\\s*>)+\\s*([a-m]\\)\\s*-+>\\s*[n-z]\\))\\s*)?`);
		}
		return new RegExp(pairs.join(""));
	}

	private generateSpacedRepetitionChoicesRegex(): RegExp {
		const choices: string[] = [];
		for (let i = 0; i < 26; i++) {
			const letter = String.fromCharCode(97 + i);
			choices.push(`(?:${letter}\\)\\s*(.+)\\s*)?`);
		}
		return new RegExp(choices.join(""));
	}

	private generateSpacedRepetitionChoicesAnswerRegex(): RegExp {
		const choices: string[] = [];
		for (let i = 0; i < 26; i++) {
			const letter = String.fromCharCode(97 + i);
			choices.push(`(?:(${letter})\\).*\\s*)?`);
		}
		return new RegExp(choices.join(""));
	}

	private generateSpacedRepetitionMatchingAnswerRegex(): RegExp {
		const pairs: string[] = [];
		for (let i = 0; i < 13; i++) {
			pairs.push(`(?:([a-m]\\)\\s*-+>\\s*[n-z]\\))\\s*)?`);
		}
		return new RegExp(pairs.join(""));
	}

	private matchMultipleChoiceSelectAllThatApply(
		fileContents: string,
		pattern: RegExp,
		sourceText?: string,
	): void {
		const matches = fileContents.matchAll(pattern);
		for (const match of matches) {
			const options = match
				.slice(2, 28)
				.filter((option) => typeof option !== "undefined");
			const answer = match
				.slice(28)
				.filter((letter) => typeof letter !== "undefined");
			if (
				options.length === 0 ||
				answer.length === 0 ||
				answer.length > options.length
			)
				continue;
			const explanation = sourceText
				? this.extractExplanation(sourceText, (match.index ?? 0) + match[0].length)
				: undefined;
			const question = this.joinMultilineField(match[1]);
			if (answer.length === 1) {
				this.quiz.push({
					question,
					options: options,
					answer:
						answer[0].toLowerCase().charCodeAt(0) -
						"a".charCodeAt(0),
					...(explanation ? { explanation } : {}),
				} as MultipleChoice);
			} else {
				this.quiz.push({
					question,
					options: options,
					answer: answer.map(
						(letter) =>
							letter.toLowerCase().charCodeAt(0) -
							"a".charCodeAt(0),
					),
					...(explanation ? { explanation } : {}),
				} as SelectAllThatApply);
			}
		}
	}

	private matchMatching(fileContents: string, pattern: RegExp, sourceText?: string): void {
		const matches = fileContents.matchAll(pattern);
		for (const match of matches) {
			const leftOptions = match
				.slice(2, 15)
				.filter((option) => typeof option !== "undefined");
			const rightOptions = match
				.slice(15, 28)
				.filter((option) => typeof option !== "undefined");
			const answer: { leftOption: string; rightOption: string }[] = [];
			match
				.slice(28)
				.filter((option) => typeof option !== "undefined")
				.forEach((pair) => {
					const [left, right] = pair.split(/\s*-+>\s*/);
					const leftIndex =
						left.toLowerCase().charCodeAt(0) - "a".charCodeAt(0);
					const rightIndex =
						right.toLowerCase().charCodeAt(0) - "n".charCodeAt(0);
					answer.push({
						leftOption: leftOptions[leftIndex],
						rightOption: rightOptions[rightIndex],
					});
				});

			const leftLength = leftOptions.length;
			const rightLength = rightOptions.length;
			if (leftLength === 0 || rightLength === 0 || answer.length === 0)
				continue;
			if (
				leftLength !== rightLength ||
				leftLength !== answer.length ||
				rightLength !== answer.length
			)
				continue;

			const explanation = sourceText
				? this.extractExplanation(sourceText, (match.index ?? 0) + match[0].length)
				: undefined;
			this.quiz.push({
				question: this.joinMultilineField(match[1]),
				answer: answer,
				...(explanation ? { explanation } : {}),
			} as Matching);
		}
	}

	private matchTrueFalseFillInTheBlankShortOrLongAnswer(
		fileContents: string,
		pattern: RegExp,
		sourceText?: string,
	): void {
		const matches = fileContents.matchAll(pattern);
		for (const match of matches) {
			const explanation = sourceText
				? this.extractExplanation(sourceText, (match.index ?? 0) + match[0].length)
				: undefined;
			const question = this.joinMultilineField(match[1]);
			if (
				match[2].toLowerCase() === "true" ||
				match[2].toLowerCase() === "false"
			) {
				this.quiz.push({
					question,
					answer: match[2].toLowerCase() === "true",
					...(explanation ? { explanation } : {}),
				} as TrueFalse);
			} else if (/`_+`/.test(question)) {
				this.quiz.push({
					question,
					answer: match[2].split(/\s*,\s+/),
					...(explanation ? { explanation } : {}),
				} as FillInTheBlank);
			} else {
				this.quiz.push({
					question,
					answer: match[2],
					...(explanation ? { explanation } : {}),
				} as ShortOrLongAnswer);
			}
		}
	}

	// Question text may span multiple real blockquote lines (e.g. a fenced code block).
	// Join them with a literal "\n" so the field stays on one line in the note; the UI
	// unescapes it back to a real newline before rendering the whole thing as one markdown
	// document (see unescapeNewlines in utils/helpers.ts).
	// Strips each continuation line's leading ">" marker.
	private joinMultilineField(raw: string): string {
		const lines = raw
			.split(/\r?\n/)
			.map((line, i) => (i === 0 ? line.trim() : line.replace(/^>\s*/, "").trimEnd()));
		while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
		return lines.join("\\n");
	}

	private extractExplanation(fileContents: string, matchEnd: number): string | undefined {
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

	private escapeSpecialCharacters(pattern: string): RegExp {
		const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return new RegExp(escapedPattern);
	}
}
