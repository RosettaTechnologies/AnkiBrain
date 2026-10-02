import "./BottomNav.css";
import { useState } from "react";
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonModal,
  IonTabBar,
  IonTabButton,
  IonTitle,
  IonToolbar,
} from "@ionic/react";
import {
  albums,
  book,
  chatbubble,
  folder,
  helpCircleOutline,
  settings,
} from "ionicons/icons";
import { PATHS } from "../../api/constants";

const NAV_ITEMS = [
  {
    path: PATHS.MAKE_CARDS,
    tab: "makeCard",
    icon: albums,
    label: "Make Cards",
  },
  {
    path: PATHS.TOPIC_EXPLANATION,
    tab: "topicExplanation",
    icon: book,
    label: "Explain",
  },
  { path: PATHS.TALK, tab: "talk", icon: chatbubble, label: "Talk" },
  { path: PATHS.IMPORT, tab: "import", icon: folder, label: "Import" },
  { path: PATHS.SETTINGS, tab: "settings", icon: settings, label: "Settings" },
];

export function BottomNav() {
  const [showHelpModal, setShowHelpModal] = useState(false);

  return (
    <>
      <IonModal
        isOpen={showHelpModal}
        onDidDismiss={() => setShowHelpModal(false)}
      >
        <IonHeader>
          <IonToolbar>
            <IonTitle>Get Help</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setShowHelpModal(false)}>
                Close
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding">
          <p>
            <strong>
              For fast support, please email{" "}
              <a href="mailto:ankibrain@rankmd.org">ankibrain@rankmd.org</a>.
            </strong>
          </p>
          <p>
            You can also visit{" "}
            <a href="https://www.reddit.com/r/ankibrain">
              https://www.reddit.com/r/ankibrain/
            </a>
          </p>
        </IonContent>
      </IonModal>

      <IonTabBar slot="bottom" className="BottomNav">
        {NAV_ITEMS.map((item) => (
          <IonTabButton key={item.tab} tab={item.tab} href={item.path}>
            <IonIcon icon={item.icon} />
            <IonLabel className="BottomNav-label">{item.label}</IonLabel>
          </IonTabButton>
        ))}
        <IonTabButton
          className="BottomNav-help"
          tab="help"
          onClick={() => setShowHelpModal(true)}
        >
          <IonIcon icon={helpCircleOutline} />
          <IonLabel className="BottomNav-label">Help</IonLabel>
        </IonTabButton>
      </IonTabBar>
    </>
  );
}
