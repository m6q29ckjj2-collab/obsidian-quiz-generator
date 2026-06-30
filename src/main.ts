import { Menu, MenuItem, Plugin, TAbstractFile, TFile } from "obsidian";
import { DEFAULT_SETTINGS, QuizSettings } from "./settings/config";
import SelectorModal from "./ui/selector/selectorModal";
import QuizBrowserModal from "./ui/browser/quizBrowserModal";
import QuizSettingsTab from "./settings/settings";
import QuizReviewer from "./services/quizReviewer";
import { QuizAttemptResult } from "./utils/types";
import { hashQuestion } from "./utils/helpers";
import { Rating, scheduleNext } from "./utils/srs";

export default class QuizGenerator extends Plugin {
	public settings: QuizSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		const saveStats = async (results: QuizAttemptResult[]): Promise<void> => {
			if (!this.settings.errorBank) this.settings.errorBank = [];

			const correctHashes = new Set(
				results.filter(r => r.correct).map(r => hashQuestion(r.questionText))
			);

			this.settings.errorBank = this.settings.errorBank.filter(
				e => !correctHashes.has(hashQuestion(e.question.question))
			);

			for (const result of results) {
				const hash = hashQuestion(result.questionText);
				const existing = this.settings.questionHistory[hash] ?? { seen: 0, correct: 0 };
				existing.seen++;
				if (result.correct) existing.correct++;

				// Apply SRS scheduling
				const rating = result.rating !== undefined
					? result.rating as Rating
					: result.correct ? Rating.Good : Rating.Again;

				const currentSchedule = existing.due !== undefined
					? { due: existing.due, interval: existing.interval ?? 1, ef: existing.ef ?? 2.5, reps: existing.reps ?? 0 }
					: undefined;

				const next = scheduleNext(currentSchedule, rating);
				existing.due = next.due;
				existing.interval = next.interval;
				existing.ef = next.ef;
				existing.reps = next.reps;

				this.settings.questionHistory[hash] = existing;

				// Error bank
				if (!result.correct) {
					const alreadyInBank = this.settings.errorBank.some(
						e => hashQuestion(e.question.question) === hash
					);
					if (!alreadyInBank) {
						this.settings.errorBank.push({ question: result.question, addedAt: Date.now() });
					}
				}
			}

			await this.saveSettings();
		};

		this.addCommand({
			id: "open-generator",
			name: "Open generator",
			callback: (): void => {
				new SelectorModal(this.app, this.settings).open();
			}
		});

		this.addRibbonIcon("brain-circuit", "Open generator", (): void => {
			new SelectorModal(this.app, this.settings).open();
		});

		this.addRibbonIcon("library", "Quiz Browser", (): void => {
			new QuizBrowserModal(this.app, this.settings, saveStats).open();
		});

		this.addCommand({
			id: "open-quiz-browser",
			name: "Open quiz browser",
			callback: (): void => {
				new QuizBrowserModal(this.app, this.settings, saveStats).open();
			}
		});

		this.addCommand({
			id: "open-quiz-from-active-note",
			name: "Open quiz from active note",
			callback: (): void => {
				new QuizReviewer(this.app, this.settings, saveStats).openQuiz(this.app.workspace.getActiveFile());
			}
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile): void => {
				if (file instanceof TFile && file.extension === "md") {
					menu.addItem((item: MenuItem): void => {
						item
							.setTitle("Open quiz from this note")
							.setIcon("scroll-text")
							.onClick((): void => {
								new QuizReviewer(this.app, this.settings, saveStats).openQuiz(file);
							});
					});
				}
			})
		);

		await this.loadSettings();
		this.addSettingTab(new QuizSettingsTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
