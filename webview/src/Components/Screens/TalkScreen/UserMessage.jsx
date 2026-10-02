import { IonIcon } from "@ionic/react";
import { person } from "ionicons/icons";

export const UserMessage = (props) => {
  return (
    <div className="TalkScreenMessage UserMessage">
      <IonIcon className="TalkScreenMessage-icon" icon={person} />

      <span className="TalkScreenMessage-text">{props.messageData.text}</span>
    </div>
  );
};
