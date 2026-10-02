import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PATHS } from "../../../api/constants";
import { useDispatch } from "react-redux";
import { setMakeCardsText } from "../../../api/redux/slices/makeCardsText";
import { speak } from "../../../api/tts";
import {
  IonAccordion,
  IonAccordionGroup,
  IonButton,
  IonIcon,
  IonItem,
  IonLabel,
  IonPopover,
} from "@ionic/react";
import { hourglass, shareSocial, sparkles, volumeHigh } from "ionicons/icons";

export const AIMessage = (props) => {
  const [speaking, setSpeaking] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const shareTriggerId = useId();

  const sourceSnippets = props.messageData.sourceSnippets || [];

  return (
    <div className="TalkScreenMessage AIMessage">
      <IonIcon className="TalkScreenMessage-icon" icon={sparkles} />

      <div className="AIMessage-body">
        <span className="TalkScreenMessage-text">{props.messageData.text}</span>

        {sourceSnippets.length > 0 && (
          <IonAccordionGroup className="AIMessage-sources">
            <IonAccordion value="sources">
              <IonItem slot="header" lines="none">
                <IonLabel>Source Document Snippets</IonLabel>
              </IonItem>
              <div className="AIMessage-snippets" slot="content">
                {sourceSnippets.map((sourceStr, index) => (
                  <div className="AIMessage-snippet" key={index}>
                    {sourceStr.endsWith(".") ? sourceStr : sourceStr + "..."}
                  </div>
                ))}
              </div>
            </IonAccordion>
          </IonAccordionGroup>
        )}

        <div className="AIMessage-meta">
          <span>Model: {props.messageData.model}</span>
          <span>Temperature: {props.messageData.temperature}</span>
        </div>
      </div>

      <IonIcon
        id={shareTriggerId}
        className="ShareButton"
        icon={shareSocial}
        title="Share this reply"
      />
      <IonPopover trigger={shareTriggerId} triggerAction="click" dismissOnSelect>
        <div className="AIMessage-shareMenu">
          <IonButton
            color="accent"
            onClick={() => {
              dispatch(setMakeCardsText(props.messageData.text));
              navigate(PATHS.MAKE_CARDS);
            }}
          >
            Send to Make Cards
          </IonButton>
        </div>
      </IonPopover>

      <IonIcon
        className="SpeakButton"
        icon={speaking ? hourglass : volumeHigh}
        title="Listen to this reply (Kokoro Voice)"
        style={{ opacity: speaking ? 0.4 : 0.85 }}
        onClick={() => {
          if (speaking) return;
          setSpeaking(true);
          speak(props.messageData.text).finally(() => setSpeaking(false));
        }}
      />
    </div>
  );
};
