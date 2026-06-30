import { App, Component, MarkdownRenderer } from "obsidian";
import { useEffect, useMemo, useRef, useState } from "react";
import { SelectAllThatApply } from "../../utils/types";
import { shuffleArray } from "../../utils/helpers";

interface SelectAllThatApplyQuestionProps {
	app: App;
	question: SelectAllThatApply;
	onAnswered?: (correct: boolean) => void;
}

const SelectAllThatApplyQuestion = ({ app, question, onAnswered }: SelectAllThatApplyQuestionProps) => {
	const [userAnswer, setUserAnswer] = useState<number[]>([]);
	const [submitted, setSubmitted] = useState<boolean>(false);
	const questionRef = useRef<HTMLDivElement>(null);
	const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

	const shuffled = useMemo(
		() => shuffleArray(question.options.map((opt, i) => ({ opt, i }))),
		[question],
	);

	useEffect(() => {
		const component = new Component();

		question.question.split("\\n").forEach(fragment => {
			if (questionRef.current) {
				MarkdownRenderer.render(app, fragment, questionRef.current, "", component);
			}
		});

		buttonRefs.current = buttonRefs.current.slice(0, shuffled.length);
		buttonRefs.current.forEach((button, idx) => {
			if (button) {
				MarkdownRenderer.render(app, shuffled[idx].opt, button, "", component);
			}
		});
	}, [app, question, shuffled]);

	const toggleSelection = (idx: number) => {
		setUserAnswer(prev =>
			prev.includes(idx) ? prev.filter(a => a !== idx) : [...prev, idx]
		);
	};

	const getButtonClass = (idx: number) => {
		if (submitted) {
			const correct = question.answer.includes(shuffled[idx].i);
			const selected = userAnswer.includes(idx);
			if (correct && selected) return "select-all-that-apply-button-qg correct-choice-qg";
			if (correct) return "select-all-that-apply-button-qg correct-choice-qg not-selected-qg";
			if (selected) return "select-all-that-apply-button-qg incorrect-choice-qg";
		} else if (userAnswer.includes(idx)) {
			return "select-all-that-apply-button-qg selected-choice-qg";
		}
		return "select-all-that-apply-button-qg";
	};

	const handleSubmit = () => {
		setSubmitted(true);
		const selectedOriginal = userAnswer.map(idx => shuffled[idx].i).sort((a, b) => a - b);
		const correctOriginal = [...question.answer].sort((a, b) => a - b);
		onAnswered?.(JSON.stringify(selectedOriginal) === JSON.stringify(correctOriginal));
	};

	return (
		<div className="question-container-qg">
			<div className="question-qg" ref={questionRef} />
			<div className="select-all-that-apply-container-qg">
				{shuffled.map((_, idx) => (
					<button
						key={idx}
						ref={el => buttonRefs.current[idx] = el}
						className={getButtonClass(idx)}
						onClick={() => toggleSelection(idx)}
						disabled={submitted}
					/>
				))}
			</div>
			<button
				className="submit-answer-qg"
				onClick={handleSubmit}
				disabled={!userAnswer.length || submitted}
			>
				Submit
			</button>
		</div>
	);
};

export default SelectAllThatApplyQuestion;
