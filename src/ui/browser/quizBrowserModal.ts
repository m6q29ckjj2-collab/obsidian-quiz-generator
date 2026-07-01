import { App, Modal, Scope, TFile } from "obsidian";
import { QuizSettings } from "../../settings/config";
import { PausedQuizState, Question, QuizAttemptResult } from "../../utils/types";
import { hashQuestion, shuffleArray } from "../../utils/helpers";
import { isDue } from "../../utils/srs";
import { parseCalloutQuestions } from "../../utils/questionParser";
import QuizReviewer from "../../services/quizReviewer";
import QuizModalLogic from "../quiz/quizModalLogic";

const QUIZ_TAG_PREFIX = "#flashquiz";

interface TreeNode {
	name: string;
	children: Map<string, TreeNode>;
	files: TFile[];
	collapsed: boolean;
}

interface FileStats {
	total: number;
	newCount: number;
	dueCount: number;
	learnedCount: number;
	questions: Question[];
}

function createNode(name: string): TreeNode {
	return { name, children: new Map(), files: [], collapsed: false };
}

export default class QuizBrowserModal extends Modal {
	private readonly settings: QuizSettings;
	private readonly saveStats: (results: QuizAttemptResult[], sourceLabel?: string) => Promise<void>;
	private readonly savePausedQuiz: (state: PausedQuizState | null) => Promise<void>;
	private readonly root: TreeNode = createNode("root");
	private fileStats = new Map<string, FileStats>();

	constructor(
		app: App,
		settings: QuizSettings,
		saveStats: (results: QuizAttemptResult[], sourceLabel?: string) => Promise<void>,
		savePausedQuiz: (state: PausedQuizState | null) => Promise<void>,
	) {
		super(app);
		this.settings = settings;
		this.saveStats = saveStats;
		this.savePausedQuiz = savePausedQuiz;
		this.scope = new Scope(this.app.scope);
		this.scope.register([], "Escape", () => this.close());
		this.modalEl.addClass("modal-qg");
		this.modalEl.addClass("modal-browser-qg");
		this.titleEl.addClass("modal-title-qg");
		this.titleEl.setText("Quiz Browser");
	}

	public onOpen(): void {
		super.onOpen();
		this.init();
	}

	public onClose(): void {
		this.contentEl.empty();
	}

	private async init(): Promise<void> {
		this.buildTree();
		await this.loadFileStats();
		this.render();
	}

	private buildTree(): void {
		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			const tags: string[] = [];
			cache?.tags?.forEach(t => tags.push(t.tag));
			const fmTags = cache?.frontmatter?.tags;
			if (Array.isArray(fmTags)) {
				fmTags.forEach(t => tags.push(typeof t === "string" && !t.startsWith("#") ? "#" + t : String(t)));
			} else if (typeof fmTags === "string") {
				tags.push(fmTags.startsWith("#") ? fmTags : "#" + fmTags);
			}

			for (const tag of tags) {
				if (!tag.toLowerCase().startsWith(QUIZ_TAG_PREFIX)) continue;
				const segments = tag.slice(QUIZ_TAG_PREFIX.length).split("/").filter(s => s.length > 0);
				let node = this.root;
				for (const seg of segments) {
					if (!node.children.has(seg)) node.children.set(seg, createNode(seg));
					node = node.children.get(seg)!;
				}
				if (!node.files.includes(file)) node.files.push(file);
			}
		}
	}

	private async loadFileStats(): Promise<void> {
		const allFiles = this.collectFiles(this.root);
		await Promise.all(allFiles.map(async file => {
			const content = await this.app.vault.cachedRead(file);
			const questions = parseCalloutQuestions(content);
			let newCount = 0, dueCount = 0, learnedCount = 0;

			for (const q of questions) {
				const hash = hashQuestion(q.question);
				const record = this.settings.questionHistory?.[hash];
				if (!record || record.seen === 0) {
					newCount++;
				} else if (record.due !== undefined) {
					const schedData = { due: record.due, interval: record.interval ?? 1, ef: record.ef ?? 2.5, reps: record.reps ?? 0 };
					if (isDue(schedData)) dueCount++; else learnedCount++;
				} else {
					dueCount++;
				}
			}

			this.fileStats.set(file.path, { total: questions.length, newCount, dueCount, learnedCount, questions });
		}));
	}

	private collectFiles(node: TreeNode): TFile[] {
		const files: TFile[] = [...node.files];
		for (const child of node.children.values()) files.push(...this.collectFiles(child));
		return files;
	}

	private render(): void {
		this.contentEl.empty();
		this.renderPausedPanel();
		this.renderErrorBank();
		this.renderDuePanel();

		const total = this.sumStat("total");
		if (total === 0 && this.collectFiles(this.root).length === 0) {
			this.contentEl.createEl("p", {
				text: "No notes with #flashquiz tag found. Add #flashquiz or #flashquiz/topic/subtopic to a note.",
				cls: "browser-empty-qg",
			});
			return;
		}

		const tree = this.contentEl.createDiv("browser-tree-qg");
		this.renderNode(tree, this.root, 0);
	}

	private renderPausedPanel(): void {
		const paused = this.settings.pausedQuiz;
		if (!paused) return;

		const panel = this.contentEl.createDiv("paused-panel-qg");
		const left = panel.createDiv("paused-panel-left-qg");
		left.createSpan({ cls: "paused-panel-icon-qg", text: "⏸" });
		const info = left.createDiv("paused-panel-info-qg");
		info.createSpan({ cls: "paused-panel-title-qg", text: `Paused: ${paused.sourceLabel}` });
		const answered = paused.answers.filter(a => a !== null).length;
		info.createSpan({
			cls: "paused-panel-count-qg",
			text: `Question ${paused.questionIndex + 1} of ${paused.quiz.length} · ${answered} answered`,
		});

		const btn = panel.createEl("button", { cls: "paused-panel-btn-qg", text: "Continue" });
		btn.addEventListener("click", async () => {
			this.close();
			const onExit = (state: { questionIndex: number; answers: (boolean | null)[]; ratings: (number | null)[] } | null) =>
				void this.savePausedQuiz(state ? { ...state, quiz: paused.quiz, sourceLabel: paused.sourceLabel, timestamp: Date.now() } : null);
			await new QuizModalLogic(
				this.app,
				this.settings,
				paused.quiz,
				[],
				results => this.saveStats(results, paused.sourceLabel),
				onExit,
				{ questionIndex: paused.questionIndex, answers: paused.answers, ratings: paused.ratings },
			).renderQuiz();
		});
	}

	private renderDuePanel(): void {
		const due = this.sumStat("dueCount");
		const newQ = this.sumStat("newCount");
		if (due === 0 && newQ === 0) return;

		const panel = this.contentEl.createDiv("due-panel-qg");
		const left = panel.createDiv("due-panel-left-qg");
		left.createSpan({ cls: "due-panel-icon-qg", text: "⏰" });
		const info = left.createDiv("due-panel-info-qg");
		info.createSpan({ cls: "due-panel-title-qg", text: "Due for Review" });
		const parts: string[] = [];
		if (due > 0) parts.push(`${due} due`);
		if (newQ > 0) parts.push(`${newQ} new`);
		info.createSpan({ cls: "due-panel-count-qg", text: parts.join(" · ") });

		const btn = panel.createEl("button", { cls: "due-panel-btn-qg", text: "Review Now" });
		btn.addEventListener("click", async () => {
			const dueQuestions = this.collectDueQuestions();
			if (!dueQuestions.length) return;
			this.close();
			await this.openAggregateQuiz("Due Review", shuffleArray(dueQuestions));
		});
	}

	private renderErrorBank(): void {
		const bank = this.settings.errorBank ?? [];
		if (bank.length === 0) return;

		const panel = this.contentEl.createDiv("error-bank-panel-qg");
		const left = panel.createDiv("error-bank-left-qg");
		left.createSpan({ cls: "error-bank-icon-qg", text: "✗" });
		const info = left.createDiv("error-bank-info-qg");
		info.createSpan({ cls: "error-bank-title-qg", text: "Error Bank" });
		info.createSpan({ cls: "error-bank-count-qg", text: `${bank.length} question${bank.length !== 1 ? "s" : ""}` });

		const btn = panel.createEl("button", { cls: "error-bank-btn-qg", text: "Practice" });
		btn.addEventListener("click", async () => {
			this.close();
			await this.openAggregateQuiz("Error Bank", shuffleArray([...bank.map(e => e.question)]));
		});
	}

	// Shared by the Due Review and Error Bank buttons: resumes a paused session for the
	// same aggregate label if one exists, otherwise starts fresh with freshQuestions.
	private async openAggregateQuiz(sourceLabel: string, freshQuestions: Question[]): Promise<void> {
		const paused = this.settings.pausedQuiz;
		const resuming = !!paused && paused.sourceLabel === sourceLabel;
		const quiz = resuming ? paused!.quiz : freshQuestions;

		const onExit = (state: { questionIndex: number; answers: (boolean | null)[]; ratings: (number | null)[] } | null) =>
			void this.savePausedQuiz(state ? { ...state, quiz, sourceLabel, timestamp: Date.now() } : null);

		await new QuizModalLogic(
			this.app,
			this.settings,
			quiz,
			[],
			results => this.saveStats(results, sourceLabel),
			onExit,
			resuming ? { questionIndex: paused!.questionIndex, answers: paused!.answers, ratings: paused!.ratings } : undefined,
		).renderQuiz();
	}

	private collectDueQuestions(): Question[] {
		const result: Question[] = [];
		for (const stats of this.fileStats.values()) {
			for (const q of stats.questions) {
				const hash = hashQuestion(q.question);
				const record = this.settings.questionHistory?.[hash];
				if (!record || record.seen === 0) {
					result.push(q);
				} else if (record.due !== undefined) {
					const sd = { due: record.due, interval: record.interval ?? 1, ef: record.ef ?? 2.5, reps: record.reps ?? 0 };
					if (isDue(sd)) result.push(q);
				} else {
					result.push(q);
				}
			}
		}
		return result;
	}

	private renderNode(container: HTMLElement, node: TreeNode, depth: number): void {
		for (const file of node.files) this.renderFile(container, file, depth);
		for (const child of node.children.values()) this.renderFolder(container, child, depth);
	}

	private renderFolder(container: HTMLElement, node: TreeNode, depth: number): void {
		const row = container.createDiv("browser-row-qg browser-folder-qg");
		row.style.paddingLeft = `${depth * 1.25}rem`;
		const toggle = row.createSpan("browser-toggle-qg");
		toggle.textContent = node.collapsed ? "▶" : "▼";
		row.createSpan("browser-name-qg").textContent = node.name;

		const badges = row.createDiv("browser-badges-qg");
		this.renderStatBadges(badges, this.folderStats(node));

		const children = container.createDiv("browser-children-qg");
		if (node.collapsed) children.hide();
		this.renderNode(children, node, depth + 1);

		row.addEventListener("click", () => {
			node.collapsed = !node.collapsed;
			toggle.textContent = node.collapsed ? "▶" : "▼";
			node.collapsed ? children.hide() : children.show();
		});
	}

	private renderFile(container: HTMLElement, file: TFile, depth: number): void {
		const row = container.createDiv("browser-row-qg browser-file-qg");
		row.style.paddingLeft = `${depth * 1.25}rem`;
		row.createSpan({ cls: "browser-file-icon-qg", text: "📄" });
		row.createSpan("browser-name-qg").textContent = file.basename;

		const stats = this.fileStats.get(file.path) ?? { total: 0, newCount: 0, dueCount: 0, learnedCount: 0, questions: [] };
		const badges = row.createDiv("browser-badges-qg");
		this.renderStatBadges(badges, stats);

		row.addEventListener("click", async () => {
			this.close();
			await new QuizReviewer(this.app, this.settings, this.saveStats, this.savePausedQuiz).openQuiz(file);
		});
	}

	private renderStatBadges(container: HTMLElement, stats: { total: number; newCount: number; dueCount: number; learnedCount: number }): void {
		if (stats.dueCount > 0) container.createSpan({ cls: "stat-badge-qg badge-due-qg", text: `${stats.dueCount} due` });
		if (stats.newCount > 0) container.createSpan({ cls: "stat-badge-qg badge-new-qg", text: `${stats.newCount} new` });
		if (stats.learnedCount > 0) container.createSpan({ cls: "stat-badge-qg badge-learned-qg", text: `${stats.learnedCount} learned` });
		if (stats.total > 0 && stats.newCount === 0 && stats.dueCount === 0 && stats.learnedCount === 0) {
			container.createSpan({ cls: "stat-badge-qg badge-total-qg", text: `${stats.total}` });
		}
	}

	private folderStats(node: TreeNode): { total: number; newCount: number; dueCount: number; learnedCount: number } {
		let total = 0, newCount = 0, dueCount = 0, learnedCount = 0;
		for (const file of this.collectFiles(node)) {
			const s = this.fileStats.get(file.path);
			if (s) { total += s.total; newCount += s.newCount; dueCount += s.dueCount; learnedCount += s.learnedCount; }
		}
		return { total, newCount, dueCount, learnedCount };
	}

	private sumStat(key: keyof FileStats): number {
		let sum = 0;
		for (const s of this.fileStats.values()) sum += s[key] as number;
		return sum;
	}
}
