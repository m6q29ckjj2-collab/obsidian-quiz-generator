import { App, Modal, setTooltip } from "obsidian";
import { QuizSettings } from "../../settings/config";
import { QuizAttemptSession } from "../../utils/types";

const CALENDAR_WEEKS = 20;
const MAX_MISTAKES_SHOWN = 200;

export default class StatsModal extends Modal {
	private readonly settings: QuizSettings;

	constructor(app: App, settings: QuizSettings) {
		super(app);
		this.settings = settings;
		this.modalEl.addClass("modal-qg");
		this.modalEl.addClass("modal-stats-qg");
		this.titleEl.addClass("modal-title-qg");
		this.titleEl.setText("Quiz Statistics");
	}

	public onOpen(): void {
		super.onOpen();
		this.render();
	}

	public onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		this.contentEl.empty();
		const history = this.settings.attemptHistory ?? [];

		if (history.length === 0) {
			this.contentEl.createEl("p", {
				text: "No quiz attempts recorded yet. Complete a quiz to see your statistics here.",
				cls: "browser-empty-qg",
			});
			return;
		}

		const scroll = this.contentEl.createDiv("stats-scroll-qg");
		this.renderOverview(scroll, history);
		this.renderCalendar(scroll, history);
		this.renderNoteCounts(scroll, history);
		this.renderMistakes(scroll, history);
	}

	private renderOverview(container: HTMLElement, history: QuizAttemptSession[]): void {
		const totalAnswered = history.reduce((sum, s) => sum + s.correct + s.incorrect, 0);
		const totalCorrect = history.reduce((sum, s) => sum + s.correct, 0);
		const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

		const section = container.createDiv("stats-section-qg");
		const grid = section.createDiv("stats-overview-qg");
		this.renderStatCard(grid, String(history.length), "Quiz sessions");
		this.renderStatCard(grid, String(totalAnswered), "Questions answered");
		this.renderStatCard(grid, `${accuracy}%`, "Accuracy");
		this.renderStatCard(grid, String(this.computeStreak(history)), "Day streak");
	}

	private renderStatCard(container: HTMLElement, value: string, label: string): void {
		const card = container.createDiv("stats-card-qg");
		card.createDiv({ cls: "stats-card-value-qg", text: value });
		card.createDiv({ cls: "stats-card-label-qg", text: label });
	}

	private computeStreak(history: QuizAttemptSession[]): number {
		const days = new Set(history.map(s => this.dayKey(new Date(s.timestamp))));
		let streak = 0;
		const cursor = new Date();
		cursor.setHours(0, 0, 0, 0);
		while (days.has(this.dayKey(cursor))) {
			streak++;
			cursor.setDate(cursor.getDate() - 1);
		}
		return streak;
	}

	private dayKey(date: Date): string {
		return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
	}

	private renderCalendar(container: HTMLElement, history: QuizAttemptSession[]): void {
		const section = container.createDiv("stats-section-qg");
		section.createDiv({ cls: "stats-section-title-qg", text: "Activity" });

		const countsByDay = new Map<string, number>();
		for (const s of history) {
			const key = this.dayKey(new Date(s.timestamp));
			countsByDay.set(key, (countsByDay.get(key) ?? 0) + s.correct + s.incorrect);
		}

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		// Align the grid so the last column's week ends on today, first row = Sunday.
		const end = new Date(today);
		end.setDate(end.getDate() + (6 - end.getDay()));
		const start = new Date(end);
		start.setDate(start.getDate() - (CALENDAR_WEEKS * 7 - 1));

		const maxCount = Math.max(1, ...Array.from(countsByDay.values()));

		const calendar = section.createDiv("stats-calendar-qg");
		const monthsRow = calendar.createDiv("stats-calendar-months-qg");
		const grid = calendar.createDiv("stats-calendar-grid-qg");

		let lastMonth = -1;
		const cursor = new Date(start);
		for (let week = 0; week < CALENDAR_WEEKS; week++) {
			const col = grid.createDiv("stats-calendar-week-qg");
			if (cursor.getMonth() !== lastMonth) {
				monthsRow.createSpan({ cls: "stats-calendar-month-qg", text: cursor.toLocaleString(undefined, { month: "short" }) });
				lastMonth = cursor.getMonth();
			} else {
				monthsRow.createSpan({ cls: "stats-calendar-month-qg" });
			}

			for (let day = 0; day < 7; day++) {
				const count = countsByDay.get(this.dayKey(cursor)) ?? 0;
				const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / maxCount) * 4));
				const cell = col.createDiv(`stats-calendar-day-qg stats-calendar-level-${level}-qg`);
				if (cursor > today) cell.addClass("stats-calendar-future-qg");
				setTooltip(cell, `${cursor.toDateString()}: ${count} question${count !== 1 ? "s" : ""}`);
				cursor.setDate(cursor.getDate() + 1);
			}
		}
	}

	private renderNoteCounts(container: HTMLElement, history: QuizAttemptSession[]): void {
		const section = container.createDiv("stats-section-qg");
		section.createDiv({ cls: "stats-section-title-qg", text: "Completions by note" });

		const counts = new Map<string, { count: number; correct: number; total: number }>();
		for (const s of history) {
			const entry = counts.get(s.sourceLabel) ?? { count: 0, correct: 0, total: 0 };
			entry.count++;
			entry.correct += s.correct;
			entry.total += s.correct + s.incorrect;
			counts.set(s.sourceLabel, entry);
		}

		const sorted = Array.from(counts.entries()).sort((a, b) => b[1].count - a[1].count);
		const list = section.createDiv("stats-notes-list-qg");
		for (const [label, stat] of sorted) {
			const row = list.createDiv("stats-notes-row-qg");
			row.createSpan({ cls: "stats-notes-name-qg", text: label });
			const accuracy = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
			row.createSpan({ cls: "stats-notes-meta-qg", text: `${accuracy}% avg` });
			row.createSpan({ cls: "stats-notes-count-qg", text: `${stat.count}×` });
		}
	}

	private renderMistakes(container: HTMLElement, history: QuizAttemptSession[]): void {
		const mistakes: { text: string; timestamp: number; source: string }[] = [];
		for (const s of history) {
			for (const m of s.mistakes) mistakes.push({ text: m, timestamp: s.timestamp, source: s.sourceLabel });
		}
		mistakes.sort((a, b) => b.timestamp - a.timestamp);

		const section = container.createDiv("stats-section-qg");
		section.createDiv({ cls: "stats-section-title-qg", text: `Mistakes (${mistakes.length})` });

		if (mistakes.length === 0) {
			section.createEl("p", { cls: "browser-empty-qg", text: "No mistakes recorded — nice work!" });
			return;
		}

		const list = section.createDiv("stats-mistakes-list-qg");
		for (const m of mistakes.slice(0, MAX_MISTAKES_SHOWN)) {
			const row = list.createDiv("stats-mistake-row-qg");
			row.createSpan({ cls: "stats-mistake-date-qg", text: new Date(m.timestamp).toLocaleString() });
			row.createSpan({ cls: "stats-mistake-source-qg", text: m.source });
			row.createSpan({
				cls: "stats-mistake-text-qg",
				text: m.text.replace(/\\n/g, " ").slice(0, 160),
			});
		}
		if (mistakes.length > MAX_MISTAKES_SHOWN) {
			section.createEl("p", {
				cls: "stats-mistakes-more-qg",
				text: `Showing the ${MAX_MISTAKES_SHOWN} most recent mistakes of ${mistakes.length} total.`,
			});
		}
	}
}
