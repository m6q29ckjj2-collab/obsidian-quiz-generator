import { App, Component, MarkdownRenderer } from "obsidian";
import { useEffect, useRef, useState } from "react";
import { TrueFalse } from "../../utils/types";
import { unescapeNewlines } from "../../utils/helpers";

interface TrueFalseQuestionProps {
	app: App;
	question: TrueFalse;
	onAnswered?: (correct: boolean) => void;
}

const TrueFalseQuestion = ({ app, question, onAnswered }: TrueFalseQuestionProps) => {
	const [userAnswer, setUserAnswer] = useState<boolean | null>(null);
	const questionRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const component = new Component();

		if (questionRef.current) {
			MarkdownRenderer.render(app, unescapeNewlines(question.question), questionRef.current, "", component);
		}
	}, [app, question]);

	const getButtonClass = (buttonAnswer: boolean) => {
		if (userAnswer === null) return "true-false-button-qg";
		const correct = buttonAnswer === question.answer;
		const selected = buttonAnswer === userAnswer;
		if (correct && selected) return "true-false-button-qg correct-choice-qg";
		if (correct) return "true-false-button-qg correct-choice-qg not-selected-qg";
		if (selected) return "true-false-button-qg incorrect-choice-qg";
		return "true-false-button-qg";
	};

	const handleAnswer = (value: boolean) => {
		setUserAnswer(value);
		onAnswered?.(value === question.answer);
	};

	return (
		<div className="question-container-qg">
			<div className="question-qg" ref={questionRef} />
			<div className="true-false-container-qg">
				<button
					className={getButtonClass(true)}
					onClick={() => handleAnswer(true)}
					disabled={userAnswer !== null}
				>
					True
				</button>
				<button
					className={getButtonClass(false)}
					onClick={() => handleAnswer(false)}
					disabled={userAnswer !== null}
				>
					False
				</button>
			</div>
		</div>
	);
};

export default TrueFalseQuestion;
