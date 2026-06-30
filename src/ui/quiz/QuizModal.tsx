import { App } from "obsidian";
import { useState, useEffect, useCallback } from "react";
import { QuizSettings } from "../../settings/config";
import { Question, QuizAttemptResult } from "../../utils/types";
import { Rating, scheduleNext, formatInterval } from "../../utils/srs";
import {
	isFillInTheBlank,
	isMatching,
	isMultipleChoice,
	isSelectAllThatApply,
	isShortOrLongAnswer,
	isTrueFalse,
} from "../../utils/typeGuards";
import ModalButton from "../components/ModalButton";
import { hashQuestion } from "../../utils/helpers";
import TrueFalseQuestion from "./TrueFalseQuestion";
import MultipleChoiceQuestion from "./MultipleChoiceQuestion";
import SelectAllThatApplyQuestion from "./SelectAllThatApplyQuestion";
import FillInTheBlankQuestion from "./FillInTheBlankQuestion";
import MatchingQuestion from "./MatchingQuestion";
import ShortOrLongAnswerQuestion from "./ShortOrLongAnswerQuestion";
import QuizSaver from "../../services/quizSaver";

interface QuizModalProps {
	app: App;
	settings: QuizSettings;
	quiz: Question[];
	quizSaver: QuizSaver;
	reviewing: boolean;
	onComplete?: (results: QuizAttemptResult[]) => Promise<void>;
	handleClose: () => void;
}

const PASS_THRESHOLD = 0.7;

const RATING_CONFIG = [
	{ rating: Rating.Again, label: "Again", cls: "rating-again-qg", next: (s: ReturnType<typeof scheduleNext>) => s },
	{ rating: Rating.Hard,  label: "Hard",  cls: "rating-hard-qg",  next: (s: ReturnType<typeof scheduleNext>) => s },
	{ rating: Rating.Good,  label: "Good",  cls: "rating-good-qg",  next: (s: ReturnType<typeof scheduleNext>) => s },
	{ rating: Rating.Easy,  label: "Easy",  cls: "rating-easy-qg",  next: (s: ReturnType<typeof scheduleNext>) => s },
];

const QuizModal = ({
	app,
	settings,
	quiz,
	quizSaver,
	reviewing,
	onComplete,
	handleClose,
}: QuizModalProps) => {
	const [questionIndex, setQuestionIndex] = useState(0);
	const [savedQuestions, setSavedQuestions] = useState<boolean[]>(Array(quiz.length).fill(reviewing));
	const [answers, setAnswers] = useState<(boolean | null)[]>(Array(quiz.length).fill(null));
	const [ratings, setRatings] = useState<(Rating | null)[]>(Array(quiz.length).fill(null));
	const [pendingAnswer, setPendingAnswer] = useState<boolean | null>(null);
	const [view, setView] = useState<"quiz" | "results">("quiz");

	const currentRecord = settings.questionHistory?.[hashQuestion(quiz[questionIndex]?.question ?? "")];

	const handleAnswered = (correct: boolean) => {
		setAnswers(prev => { const n = [...prev]; n[questionIndex] = correct; return n; });
		setPendingAnswer(correct);
	};

	const handleRating = useCallback(async (rating: Rating) => {
		setRatings(prev => { const n = [...prev]; n[questionIndex] = rating; return n; });
		setPendingAnswer(null);
		if (questionIndex < quiz.length - 1) {
			setQuestionIndex(questionIndex + 1);
		} else {
			// Last question — show results automatically
			const updatedAnswers = answers;
			const results: QuizAttemptResult[] = quiz
				.map((q, i) => {
					if (updatedAnswers[i] === null) return null;
					const r: QuizAttemptResult = { question: q, questionText: q.question, correct: updatedAnswers[i]! };
					const ratingVal = i === questionIndex ? rating : (ratings[i] !== null ? ratings[i]! : undefined);
					if (ratingVal !== undefined) r.rating = ratingVal;
					return r;
				})
				.filter((r): r is QuizAttemptResult => r !== null);
			if (onComplete && results.length > 0) await onComplete(results);
			setView("results");
		}
	}, [questionIndex, quiz, answers, ratings, onComplete]);

	useEffect(() => {
		if (pendingAnswer === null) return;
		const handler = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
			if (e.key === " " || e.key === "3") { e.preventDefault(); handleRating(Rating.Good); }
			else if (e.key === "1") { e.preventDefault(); handleRating(Rating.Again); }
			else if (e.key === "2") { e.preventDefault(); handleRating(Rating.Hard); }
			else if (e.key === "4") { e.preventDefault(); handleRating(Rating.Easy); }
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [pendingAnswer, handleRating]);

	const handleSaveQuestion = async () => {
		const updated = [...savedQuestions];
		updated[questionIndex] = true;
		setSavedQuestions(updated);
		await quizSaver.saveQuestion(quiz[questionIndex]);
	};

	const handleSaveAllQuestions = async () => {
		const unsaved = quiz.filter((_, i) => !savedQuestions[i]);
		setSavedQuestions(savedQuestions.map(() => true));
		await quizSaver.saveAllQuestions(unsaved);
	};

	const handleFinish = async () => {
		const results: QuizAttemptResult[] = quiz
			.map((q, i) => {
				if (answers[i] === null) return null;
				const r: QuizAttemptResult = { question: q, questionText: q.question, correct: answers[i]! };
				if (ratings[i] !== null && ratings[i] !== undefined) r.rating = ratings[i]!;
				return r;
			})
			.filter((r): r is QuizAttemptResult => r !== null);
		if (onComplete && results.length > 0) await onComplete(results);
		setView("results");
	};

	const answeredCount = answers.filter(a => a !== null).length;
	const correctCount  = answers.filter(a => a === true).length;
	const incorrectCount = answers.filter(a => a === false).length;
	const skippedCount  = quiz.length - answeredCount;
	const score  = answeredCount > 0 ? correctCount / answeredCount : 0;
	const passed = score >= PASS_THRESHOLD && answeredCount > 0;

	const getRatingNextInterval = (rating: Rating): string => {
		const existing = currentRecord
			? { due: currentRecord.due ?? 0, interval: currentRecord.interval ?? 0, ef: currentRecord.ef ?? 2.5, reps: currentRecord.reps ?? 0 }
			: undefined;
		return formatInterval(scheduleNext(existing, rating).interval);
	};

	const renderRatingButtons = () => {
		const explanation = (quiz[questionIndex] as { explanation?: string }).explanation;
		return (
			<div className="quiz-rating-qg">
				{explanation && (
					<div className={`quiz-explanation-qg ${pendingAnswer ? "explanation-correct-qg" : "explanation-incorrect-qg"}`}>
						<span className="explanation-icon-qg">💡</span>
						<span className="explanation-text-qg">{explanation}</span>
					</div>
				)}
				<div className="quiz-rating-label-qg">How well did you know this?</div>
				<div className="quiz-rating-buttons-qg">
					{RATING_CONFIG.map(({ rating, label, cls }, i) => (
						<button key={rating} className={`quiz-rating-btn-qg ${cls}`} onClick={() => handleRating(rating)}>
							<span className="rating-btn-label-qg">{label}</span>
							<span className="rating-btn-interval-qg">{getRatingNextInterval(rating)}</span>
							<span className="rating-btn-key-qg">{i + 1}{rating === Rating.Good ? " / Space" : ""}</span>
						</button>
					))}
				</div>
			</div>
		);
	};

	const renderQuestion = () => {
		const question = quiz[questionIndex];
		const onAnswered = (correct: boolean) => handleAnswered(correct);
		if (isTrueFalse(question))
			return <TrueFalseQuestion key={questionIndex} app={app} question={question} onAnswered={onAnswered} />;
		if (isMultipleChoice(question))
			return <MultipleChoiceQuestion key={questionIndex} app={app} question={question} onAnswered={onAnswered} />;
		if (isSelectAllThatApply(question))
			return <SelectAllThatApplyQuestion key={questionIndex} app={app} question={question} onAnswered={onAnswered} />;
		if (isFillInTheBlank(question))
			return <FillInTheBlankQuestion key={questionIndex} app={app} question={question} onAnswered={onAnswered} />;
		if (isMatching(question))
			return <MatchingQuestion key={questionIndex} app={app} question={question} onAnswered={onAnswered} />;
		if (isShortOrLongAnswer(question))
			return <ShortOrLongAnswerQuestion key={questionIndex} app={app} question={question} settings={settings} onAnswered={onAnswered} />;
	};

	const renderResults = () => (
		<div className="results-container-qg">
			<div className={`results-verdict-qg ${passed ? "results-pass-qg" : "results-fail-qg"}`}>
				{passed ? "✓ Passed" : "✗ Failed"}
			</div>
			<div className="results-score-qg">
				<span className="results-score-fraction-qg">{correctCount} / {answeredCount}</span>
				<span className="results-score-pct-qg">{answeredCount > 0 ? Math.round(score * 100) : 0}%</span>
			</div>
			<div className="results-stats-qg">
				<span className="results-stat-correct-qg">✓ {correctCount} correct</span>
				<span className="results-stat-incorrect-qg">✗ {incorrectCount} wrong</span>
				{skippedCount > 0 && <span className="results-stat-skipped-qg">○ {skippedCount} skipped</span>}
			</div>
			<hr className="quiz-divider-qg" />
			<div className="results-list-qg">
				{quiz.map((q, i) => (
					<div key={i} className="results-item-qg" onClick={() => { setQuestionIndex(i); setView("quiz"); }}>
						<span className={`results-item-icon-qg ${answers[i] === true ? "results-item-correct-qg" : answers[i] === false ? "results-item-incorrect-qg" : "results-item-skipped-qg"}`}>
							{answers[i] === true ? "✓" : answers[i] === false ? "✗" : "○"}
						</span>
						<span className="results-item-num-qg">{i + 1}.</span>
						<span className="results-item-text-qg">{q.question.replace(/\\n/g, " ").slice(0, 120)}{q.question.length > 120 ? "…" : ""}</span>
						{ratings[i] !== null && ratings[i] !== undefined && (
							<span className={`results-item-rating-qg rating-${["again","hard","good","easy"][ratings[i]!]}-qg`}>
								{["Again","Hard","Good","Easy"][ratings[i]!]}
							</span>
						)}
					</div>
				))}
			</div>
			<button className="results-close-btn-qg" onClick={handleClose}>Close</button>
		</div>
	);

	return (
		<div className="modal-container mod-dim">
			<div className="modal-bg" style={{ opacity: 0.85 }} onClick={handleClose} />
			<div className="modal modal-qg">
				<div className="modal-close-button" onClick={handleClose} />
				<div className="modal-header">
					<div className="modal-title modal-title-qg">
						{view === "quiz" ? `Question ${questionIndex + 1} of ${quiz.length}` : "Results"}
					</div>
				</div>
				<div className="modal-content modal-content-flex-qg">
					{view === "quiz" ? (
						<>
							<div className="modal-button-container-qg">
								<ModalButton icon="save" tooltip="Save" onClick={handleSaveQuestion} disabled={savedQuestions[questionIndex]} />
								<ModalButton icon="save-all" tooltip="Save all" onClick={handleSaveAllQuestions} disabled={!savedQuestions.includes(false)} />
								<ModalButton icon="flag" tooltip="Finish & see results" onClick={handleFinish} disabled={answeredCount === 0} />
							</div>
							<hr className="quiz-divider-qg" />
							{renderQuestion()}
							{pendingAnswer !== null
								? renderRatingButtons()
								: (
									<div className="quiz-nav-qg">
										<button className="quiz-nav-btn-qg" onClick={() => setQuestionIndex(i => Math.max(0, i - 1))} disabled={questionIndex === 0}>←</button>
										<span className="quiz-nav-label-qg">{questionIndex + 1} / {quiz.length}</span>
										<button className="quiz-nav-btn-qg" onClick={() => setQuestionIndex(i => Math.min(quiz.length - 1, i + 1))} disabled={questionIndex === quiz.length - 1}>→</button>
									</div>
								)
							}
						</>
					) : renderResults()}
				</div>
			</div>
		</div>
	);
};

export default QuizModal;
