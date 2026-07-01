import { App, TFile } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { QuizSettings } from "../../settings/config";
import { Question, QuizAttemptResult } from "../../utils/types";
import QuizSaver from "../../services/quizSaver";
import QuizModalWrapper from "./QuizModalWrapper";
import { shuffleArray } from "../../utils/helpers";

export interface QuizResumeState {
	questionIndex: number;
	answers: (boolean | null)[];
	ratings: (number | null)[];
}

interface QuizProgress extends QuizResumeState {
	view: "quiz" | "results";
}

export default class QuizModalLogic {
	private readonly app: App;
	private readonly settings: QuizSettings;
	private readonly quiz: Question[];
	private readonly quizSources: TFile[];
	private readonly quizSaver: QuizSaver;
	private readonly onComplete?: (results: QuizAttemptResult[]) => Promise<void>;
	private readonly onExit?: (state: QuizResumeState | null) => void;
	private readonly initialState?: QuizResumeState;
	private latestProgress: QuizProgress | undefined;
	private container: HTMLDivElement | undefined;
	private root: Root | undefined;
	private readonly handleEscapePressed: (event: KeyboardEvent) => void;

	constructor(
		app: App,
		settings: QuizSettings,
		quiz: Question[],
		quizSources: TFile[],
		onComplete?: (results: QuizAttemptResult[]) => Promise<void>,
		onExit?: (state: QuizResumeState | null) => void,
		initialState?: QuizResumeState,
	) {
		this.app = app;
		this.settings = settings;
		this.quiz = quiz;
		this.quizSources = quizSources;
		this.onComplete = onComplete;
		this.onExit = onExit;
		this.initialState = initialState;
		this.quizSaver = new QuizSaver(this.app, this.settings, this.quizSources);
		this.handleEscapePressed = (event: KeyboardEvent): void => {
			if (event.key === "Escape" && !(event.target instanceof HTMLInputElement)) {
				this.removeQuiz();
			}
		};
	}

	public async renderQuiz(): Promise<void> {
		// A resumed quiz keeps its saved order; otherwise apply the usual shuffle.
		const quiz = !this.initialState && this.settings.randomizeQuestions ? shuffleArray(this.quiz) : this.quiz;

		if (this.settings.autoSave && this.quizSources.length > 0) {
			await this.quizSaver.saveAllQuestions(quiz);
		}

		this.container = document.body.createDiv();
		this.root = createRoot(this.container);
		this.root.render(QuizModalWrapper({
			app: this.app,
			settings: this.settings,
			quiz: quiz,
			quizSaver: this.quizSaver,
			reviewing: this.quizSources.length === 0,
			onComplete: this.onComplete,
			handleClose: () => this.removeQuiz(),
			initialState: this.initialState,
			onProgress: (progress: QuizProgress) => { this.latestProgress = progress; },
		}));
		document.body.addEventListener("keydown", this.handleEscapePressed);
	}

	private removeQuiz(): void {
		if (this.onExit) {
			const progress = this.latestProgress;
			const hasProgress = !!progress && progress.view === "quiz" &&
				(progress.questionIndex > 0 || progress.answers.some(a => a !== null));
			this.onExit(hasProgress ? {
				questionIndex: progress!.questionIndex,
				answers: progress!.answers,
				ratings: progress!.ratings,
			} : null);
		}
		this.root?.unmount();
		this.container?.remove();
		document.body.removeEventListener("keydown", this.handleEscapePressed);
	}
}
