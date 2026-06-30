export const enum Rating {
	Again = 0,
	Hard = 1,
	Good = 2,
	Easy = 3,
}

export const RATING_LABELS: Record<Rating, string> = {
	[Rating.Again]: "Again",
	[Rating.Hard]: "Hard",
	[Rating.Good]: "Good",
	[Rating.Easy]: "Easy",
};

export interface ScheduleData {
	due: number;      // Unix timestamp ms
	interval: number; // days until next review
	ef: number;       // ease factor 1.3–2.5
	reps: number;     // consecutive successful reviews
}

const DEFAULT_EF = 2.5;
const MIN_EF = 1.3;
const MAX_EF = 2.5;

export function scheduleNext(current: ScheduleData | undefined, rating: Rating): ScheduleData {
	const now = Date.now();
	const ef = current?.ef ?? DEFAULT_EF;
	const reps = current?.reps ?? 0;
	const interval = current?.interval ?? 0;

	let newInterval: number;
	let newEf: number;
	let newReps: number;

	if (rating === Rating.Again) {
		newInterval = 1;
		newEf = Math.max(MIN_EF, ef - 0.2);
		newReps = 0;
	} else {
		if (reps === 0) {
			// First time seeing this card
			if (rating === Rating.Hard)      newInterval = 1;
			else if (rating === Rating.Good) newInterval = 1;
			else                              newInterval = 3; // Easy: skip first step
		} else if (reps === 1) {
			// Second review
			if (rating === Rating.Hard)      newInterval = 3;
			else if (rating === Rating.Good) newInterval = 4;
			else                              newInterval = 7; // Easy
		} else {
			// Subsequent reviews — full SM-2
			if (rating === Rating.Hard) {
				newInterval = Math.max(2, Math.round(interval * 1.2));
			} else if (rating === Rating.Good) {
				newInterval = Math.max(2, Math.round(interval * ef));
			} else {
				newInterval = Math.max(4, Math.round(interval * ef * 1.3));
			}
		}

		if (rating === Rating.Hard) {
			newEf = Math.max(MIN_EF, ef - 0.15);
		} else if (rating === Rating.Easy) {
			newEf = Math.min(MAX_EF, ef + 0.15);
		} else {
			newEf = ef;
		}

		newReps = reps + 1;
	}

	return {
		due: now + newInterval * 24 * 60 * 60 * 1000,
		interval: newInterval,
		ef: newEf,
		reps: newReps,
	};
}

export function isDue(data: ScheduleData | undefined): boolean {
	if (!data) return true;
	return Date.now() >= data.due;
}

export function formatInterval(days: number): string {
	if (days < 1) return "today";
	if (days === 1) return "1 day";
	if (days < 30) return `${days} days`;
	if (days < 365) return `${Math.round(days / 30)} mo`;
	return `${(days / 365).toFixed(1)} yr`;
}
