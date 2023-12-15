import { sendPythonCommand } from "../index";
import { InterprocessCommand } from "../InterprocessCommand";

export function pyExplainTopic(
  topic,
  options = {
    customPrompt: "",
    levelOfDetail: "EXTREME",
    levelOfExpertise: "EXPERT",
    useDocuments: false,
    language: "English",
  }
) {
  sendPythonCommand(InterprocessCommand.EXPLAIN_TOPIC, {
    topic,
    options: {
      custom_prompt: options.customPrompt,
      level_of_detail: options.levelOfDetail,
      level_of_expertise: options.levelOfExpertise,
      use_documents: options.useDocuments,
      language: options.language,
    },
  });
}
