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

// One finished quiz (a "block") — recorded once when the user finishes or completes
// the last question, so statistics (activity calendar, per-note completion counts,
// mistake log) can be reconstructed without re-deriving them from ephemeral state.
export interface QuizAttemptSession {
	timestamp: number;
	sourceLabel: string;
	correct: number;
	incorrect: number;
	mistakes: string[];
}

// An unfinished quiz closed mid-way through. Stores the exact question set/order shown
// (not re-derived) so reopening the same source resumes precisely where it left off.
export interface PausedQuizState {
	sourceLabel: string;
	quiz: Question[];
	questionIndex: number;
	answers: (boolean | null)[];
	ratings: (number | null)[];
	timestamp: number;
}

export interface TrueFalse {
	question: string;
	answer: boolean;
	explanation?: string;
}

export interface MultipleChoice {
	question: string;
	options: string[];
	answer: number;
	explanation?: string;
}

export interface SelectAllThatApply {
	question: string;
	options: string[];
	answer: number[];
	explanation?: string;
}

export interface FillInTheBlank {
	question: string;
	answer: string[];
	explanation?: string;
}

export interface Matching {
	question: string;
	answer: {
		leftOption: string;
		rightOption: string;
	}[];
	explanation?: string;
}

export interface ShortOrLongAnswer {
	question: string;
	answer: string;
	explanation?: string;
}
