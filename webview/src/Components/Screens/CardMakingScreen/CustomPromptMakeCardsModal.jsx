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
import { setCustomPromptMakeCards } from "../../../api/redux/slices/customPrompts";
import { pyEditSetting } from "../../../api/PythonBridge/senders/pyEditSetting";
import "./CustomPromptMakeCardsModal.css";

export function CustomPromptMakeCardsModal(props) {
  const dispatch = useDispatch();
  const customPromptMakeCards = useSelector(
    (state) => state.customPrompts.value.makeCards
  );

  const [text, setText] = useState(customPromptMakeCards);

  const save = async () => {
    await pyEditSetting("customPromptMakeCards", text);
    dispatch(setCustomPromptMakeCards(text));
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
        <p className="CustomPromptMakeCards-description">
          This setting allows you to specify additional instructions to the AI
          for making cards. Your custom prompt will be <b>in addition</b> to the
          internal formatting instructions.
        </p>
        <p className="CustomPromptMakeCards-description">
          <b>
            This feature is currently experimental. Please send us constructive
            feedback!
          </b>
        </p>

        <IonTextarea
          className="CustomPromptMakeCards-textarea"
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
          className="CustomPromptMakeCards-saveBtn"
          onClick={() => props.onClose()}
        >
          Save
        </IonButton>
      </IonContent>
    </IonModal>
  );
}
