import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonModal,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from "@ionic/react";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setCustomPromptTopicExplanation } from "../../../api/redux/slices/customPrompts";
import { pyEditSetting } from "../../../api/PythonBridge/senders/pyEditSetting";

export function CustomPromptTopicExplanationModal(props) {
  const dispatch = useDispatch();
  const customPromptTopicExplanation = useSelector(
    (state) => state.customPrompts.value.topicExplanation
  );
  const [text, setText] = useState(customPromptTopicExplanation);

  const save = async () => {
    await pyEditSetting("customPromptTopicExplanation", text);
    dispatch(setCustomPromptTopicExplanation(text));
  };

  return (
    <IonModal
      isOpen={props.isOpen}
      onDidDismiss={async () => {
        // Save on every close path (backdrop / escape / buttons), matching
        // the old dialog's onClose behavior.
        await save();
        props.onClose();
      }}
    >
      <IonHeader>
        <IonToolbar>
          <IonTitle>Custom Prompt</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => props.onClose()}>Close</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding">
        <p className="CustomPromptModal-description">
          This setting allows you to specify additional instructions to the AI.
          For example, you can ask the AI to focus only on specific
          characteristics of a topic, or ask for a specific format.
        </p>
        <p className="CustomPromptModal-description">
          <b>
            This feature is currently experimental. Please send us constructive
            feedback!
          </b>
        </p>

        <IonTextarea
          className="CustomPromptModal-textarea"
          fill="solid"
          placeholder={"Enter your custom instructions..."}
          value={text}
          autoGrow={true}
          onIonInput={(e) => {
            setText(e.detail.value || "");
          }}
        />

        <IonButton
          color="accent"
          className="CustomPromptModal-saveBtn"
          onClick={() => props.onClose()}
        >
          Save
        </IonButton>
      </IonContent>
    </IonModal>
  );
}
