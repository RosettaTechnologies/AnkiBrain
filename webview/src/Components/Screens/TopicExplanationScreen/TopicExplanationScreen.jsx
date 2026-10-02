import "./TopicExplanationScreen.css";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { PATHS } from "../../../api/constants";
import { setTopicExplanation } from "../../../api/redux/slices/topicExplanation";
import { setRequestedTopic } from "../../../api/redux/slices/requestedTopic";
import {
  IonButton,
  IonCheckbox,
  IonIcon,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonSpinner,
} from "@ionic/react";
import { star } from "ionicons/icons";
import { explainTopic } from "../../../api/explainTopic";

import {
  setLevelOfDetail,
  setLevelOfExpertise,
} from "../../../api/redux/slices/makeCardsSettings";
import { setUseDocuments } from "../../../api/documents";
import { setMakeCardsText } from "../../../api/redux/slices/makeCardsText";
import { useEffect, useState } from "react";
import { errorToast } from "../../../api/toast";
import { CustomPromptTopicExplanationModal } from "./CustomPromptTopicExplanationModal";

export function TopicExplanationScreen() {
  const levelOfExpertise = useSelector(
    (state) => state.makeCardsSettings.value.levelOfExpertise
  );

  const levelOfDetail = useSelector(
    (state) => state.makeCardsSettings.value.levelOfDetail
  );

  const useDocuments = useSelector((state) => state.useDocuments.value);
  const model = useSelector((state) => state.appSettings.ai.llmModel);
  const temperature = useSelector((state) => state.appSettings.ai.temperature);

  const requestedTopic = useSelector((state) => state.requestedTopic.value);
  const [requestedTopicWordLength, setRequestedTopicWordLength] = useState(
    requestedTopic.length
  );
  useEffect(() => {
    setRequestedTopicWordLength(requestedTopic.trim().split(/\s+/).length);
  }, [requestedTopic]);

  const topicExplanation = useSelector((state) => state.topicExplanation.value);
  const topicExplanationLoading = useSelector(
    (state) => state.topicExplanation.loading
  );
  const language = useSelector((state) => state.language.value);
  const [showCustomPromptModal, setShowCustomPromptModal] = useState(false);
  const customPromptTopicExplanation = useSelector(
    (state) => state.customPrompts.value.topicExplanation
  );
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const submitTopic = async () => {
    await explainTopic(
      requestedTopic,
      {
        customPrompt: customPromptTopicExplanation,
        levelOfDetail,
        levelOfExpertise,
        useDocuments,
        language,
      },
      dispatch
    );
  };

  return (
    <div className="TopicExplanationScreen">
      <div style={{ width: "100%" }}>
        <CustomPromptTopicExplanationModal
          isOpen={showCustomPromptModal}
          onClose={() => setShowCustomPromptModal(false)}
        />

        <div className="TopicExplanationScreen-params">
          <div className="TopicExplanationScreen-field">
            <label className="TopicExplanationScreen-fieldLabel">
              Level of Detail
            </label>
            <IonSelect
              value={levelOfDetail}
              interface="popover"
              fill="outline"
              onIonChange={(e) => {
                dispatch(setLevelOfDetail(e.detail.value));
              }}
            >
              <IonSelectOption value={"LOW"}>Low</IonSelectOption>
              <IonSelectOption value={"MEDIUM"}>Medium</IonSelectOption>
              <IonSelectOption value={"HIGH"}>High</IonSelectOption>
              <IonSelectOption value={"EXTREME"}>Extreme</IonSelectOption>
            </IonSelect>
          </div>

          <div className="TopicExplanationScreen-field">
            <label className="TopicExplanationScreen-fieldLabel">
              Level of Expertise
            </label>
            <IonSelect
              value={levelOfExpertise}
              interface="popover"
              fill="outline"
              onIonChange={(e) => {
                dispatch(setLevelOfExpertise(e.detail.value));
              }}
            >
              <IonSelectOption value={"BEGINNER"}>Beginner</IonSelectOption>
              <IonSelectOption value={"INTERMEDIATE"}>
                Intermediate
              </IonSelectOption>
              <IonSelectOption value={"ADVANCED"}>Advanced</IonSelectOption>
              <IonSelectOption value={"EXPERT"}>Expert</IonSelectOption>
            </IonSelect>
          </div>
        </div>

        <div className="TopicExplanationScreen-topicInput">
          <IonInput
            className="TopicExplanationScreen-input"
            fill="solid"
            placeholder={"Enter a topic..."}
            value={requestedTopic}
            onIonInput={(event) => {
              dispatch(setRequestedTopic(event.detail.value || ""));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (requestedTopicWordLength > 750) {
                  errorToast("Too many tokens", "");
                } else {
                  submitTopic();
                }
              } else if (requestedTopicWordLength >= 750) {
                const allowedKeys = ["Backspace"];
                if (!allowedKeys.includes(e.key)) {
                  e.preventDefault();
                }
              }
            }}
          />
          <span className="TopicExplanationScreen-charCount">
            {requestedTopicWordLength}/750
          </span>
        </div>

        <div className="TopicExplanationScreen-actions">
          <IonButton
            color="accent"
            disabled={requestedTopic === "" || topicExplanationLoading}
            onClick={() => {
              submitTopic();
            }}
          >
            {topicExplanationLoading ? (
              <IonSpinner name="crescent" />
            ) : (
              <>
                <IonIcon slot="start" icon={star} />
                Explain
              </>
            )}
          </IonButton>

          <IonCheckbox
            checked={useDocuments}
            onIonChange={(e) => {
              setUseDocuments(e.detail.checked);
            }}
          >
            Use Documents
          </IonCheckbox>
        </div>

        <div className="TopicExplanationScreen-actions">
          <IonButton
            color="light"
            onClick={() => setShowCustomPromptModal(true)}
          >
            Customize Prompt
          </IonButton>

          <IonButton
            color="light"
            onClick={() => {
              dispatch(setRequestedTopic(""));
              dispatch(setTopicExplanation(""));
            }}
            disabled={topicExplanation === "" && requestedTopic === ""}
          >
            Reset
          </IonButton>
        </div>

        <div className="TopicExplanationScreen-meta">
          <span>Model: {model}</span>
          <span>Temperature: {temperature}</span>
          <span>Language: {language}</span>
        </div>

        <div className="TopicExplanationScreen-explanation">
          {topicExplanation}
        </div>

        <IonButton
          color="light"
          className="TopicExplanationScreen-sendBtn"
          onClick={() => {
            dispatch(setMakeCardsText(topicExplanation));
            navigate(PATHS.MAKE_CARDS);
          }}
          disabled={topicExplanation === ""}
        >
          Send to Make Cards
        </IonButton>
      </div>
    </div>
  );
}
