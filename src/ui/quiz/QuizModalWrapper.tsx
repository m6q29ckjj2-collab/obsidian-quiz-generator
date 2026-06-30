import { App } from "obsidian";
import { QuizSettings } from "../../settings/config";
import { Question, QuizAttemptResult } from "../../utils/types";
import QuizModal from "./QuizModal";
import QuizSaver from "../../services/quizSaver";

interface QuizModalWrapperProps {
	app: App;
	settings: QuizSettings;
	quiz: Question[];
	quizSaver: QuizSaver;
	reviewing: boolean;
	onComplete?: (results: QuizAttemptResult[]) => Promise<void>;
	handleClose: () => void;
}

const QuizModalWrapper = ({ app, settings, quiz, quizSaver, reviewing, onComplete, handleClose }: QuizModalWrapperProps) => {
	return <QuizModal
		app={app}
		settings={settings}
		quiz={quiz}
		quizSaver={quizSaver}
		reviewing={reviewing}
		onComplete={onComplete}
		handleClose={handleClose}
	/>;
};

export default QuizModalWrapper;
