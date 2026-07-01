import { setIcon, setTooltip } from "obsidian";

// Question text stores paragraph breaks as a literal "\n" (see questionParser.ts) so it
// stays on one line in the note. Turn it back into a real newline before rendering so
// multi-line markdown (e.g. fenced code blocks) is rendered as one coherent document
// instead of each line being rendered independently.
export const unescapeNewlines = (text: string): string => text.replace(/\\n/g, "\n");

export const shuffleArray = <T>(array: T[]): T[] => {
	const newArray = [...array];
	for (let i = newArray.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[newArray[i], newArray[j]] = [newArray[j], newArray[i]];
	}
	return newArray;
};

export const setIconAndTooltip = (element: HTMLElement, icon: string, tooltip: string): void => {
	setIcon(element, icon);
	setTooltip(element, tooltip);
};

export const countNoteTokens = (noteContents: string): number => {
	return Math.round(noteContents.length / 4);
};

export const hashQuestion = (text: string): string => {
	let hash = 5381;
	for (let i = 0; i < text.length; i++) {
		hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
	}
	return (hash >>> 0).toString(36);
};

export const cosineSimilarity = (vec1: number[], vec2: number[]): number => {
	const dotProduct = (vec1: number[], vec2: number[]): number => {
		return vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
	};
	const magnitude = (vec: number[]): number => {
		return Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
	};

	const dot = dotProduct(vec1, vec2);
	const mag1 = magnitude(vec1);
	const mag2 = magnitude(vec2);
	return dot / (mag1 * mag2);
};
