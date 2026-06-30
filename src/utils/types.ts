export type Question = TrueFalse | MultipleChoice | SelectAllThatApply | FillInTheBlank | Matching | ShortOrLongAnswer;

export interface Quiz {
	questions: Question[];
}

export interface QuestionRecord {
	seen: number;
	correct: number;
	// SRS scheduling
	due?: number;
	interval?: number;
	ef?: number;
	reps?: number;
}

export type QuestionHistory = Record<string, QuestionRecord>;

export interface QuizAttemptResult {
	question: Question;
	questionText: string;
	correct: boolean;
	rating?: number; // Rating enum value
}

export interface ErrorEntry {
	question: Question;
	addedAt: number;
}

export interface TrueFalse {
	question: string;
	answer: boolean;
}

export interface MultipleChoice {
	question: string;
	options: string[];
	answer: number;
}

export interface SelectAllThatApply {
	question: string;
	options: string[];
	answer: number[];
}

export interface FillInTheBlank {
	question: string;
	answer: string[];
}

export interface Matching {
	question: string;
	answer: {
		leftOption: string;
		rightOption: string;
	}[];
}

export interface ShortOrLongAnswer {
	question: string;
	answer: string;
}
