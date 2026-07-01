import { App, Component, MarkdownRenderer } from "obsidian";
import { useEffect, useMemo, useRef, useState } from "react";
import { MultipleChoice } from "../../utils/types";
import { shuffleArray, unescapeNewlines } from "../../utils/helpers";

interface MultipleChoiceQuestionProps {
	app: App;
	question: MultipleChoice;
	onAnswered?: (correct: boolean) => void;
}

const MultipleChoiceQuestion = ({ app, question, onAnswered }: MultipleChoiceQuestionProps) => {
	const [userAnswer, setUserAnswer] = useState<number | null>(null);
	const questionRef = useRef<HTMLDivElement>(null);
	const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

	const shuffled = useMemo(
		() => shuffleArray(question.options.map((opt, i) => ({ opt, i }))),
		[question],
	);

	useEffect(() => {
		const component = new Component();

		if (questionRef.current) {
			MarkdownRenderer.render(app, unescapeNewlines(question.question), questionRef.current, "", component);
		}

		buttonRefs.current = buttonRefs.current.slice(0, shuffled.length);
		buttonRefs.current.forEach((button, idx) => {
			if (button) {
				MarkdownRenderer.render(app, shuffled[idx].opt, button, "", component);
			}
		});
	}, [app, question, shuffled]);

	const getButtonClass = (shuffledIdx: number) => {
		if (userAnswer === null) return "multiple-choice-button-qg";
		const correct = shuffled[shuffledIdx].i === question.answer;
		const selected = shuffledIdx === userAnswer;
		if (correct && selected) return "multiple-choice-button-qg correct-choice-qg";
		if (correct) return "multiple-choice-button-qg correct-choice-qg not-selected-qg";
		if (selected) return "multiple-choice-button-qg incorrect-choice-qg";
		return "multiple-choice-button-qg";
	};

	const handleAnswer = (shuffledIdx: number) => {
		setUserAnswer(shuffledIdx);
		onAnswered?.(shuffled[shuffledIdx].i === question.answer);
	};

	return (
		<div className="question-container-qg">
			<div className="question-qg" ref={questionRef} />
			<div className="multiple-choice-container-qg">
				{shuffled.map((_, idx) => (
					<button
						key={idx}
						ref={el => buttonRefs.current[idx] = el}
						className={getButtonClass(idx)}
						onClick={() => handleAnswer(idx)}
						disabled={userAnswer !== null}
					/>
				))}
			</div>
		</div>
	);
};

export default MultipleChoiceQuestion;
