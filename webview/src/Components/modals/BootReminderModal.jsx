import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonTitle,
  IonToolbar,
} from "@ionic/react";
import { gift, happy, heart, star } from "ionicons/icons";
import { setShowBootReminderDialog } from "../../api/redux/slices/showBootReminderDialog";
import { pyEditSetting } from "../../api/PythonBridge/senders/pyEditSetting";
import React from "react";
import { useDispatch, useSelector } from "react-redux";
import "./BootReminderModal.css";

export function BootReminderModal(props) {
  const dispatch = useDispatch();
  const showBootReminderDialog = useSelector(
    (state) => state.showBootReminderDialog.value
  );

  return (
    <IonModal isOpen={props.show} onDidDismiss={props.onClose}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>AnkiBrain</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={props.onClose}>Close</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="BootReminderModal">
          <h2 className="BootReminderModal-title">
            Hi there! Sorry for the interruption...
          </h2>
          <p>
            If you enjoy using AnkiBrain, please consider leaving a review on
            AnkiWeb or donating to help keep the lights on! Thank you so much!{" "}
          </p>
          <div className="BootReminderModal-icons">
            <IonIcon icon={happy} />
            <IonIcon icon={heart} style={{ color: "red" }} />
          </div>

          <IonButton
            color="accent"
            className="BootReminderModal-btn"
            href={"https://donate.stripe.com/8x25kx8ZM7dx66RcMa7N600"}
          >
            <IonIcon slot="start" icon={gift} />
            Donate
          </IonButton>
          <IonButton
            color="light"
            className="BootReminderModal-btn"
            href={"https://ankiweb.net/shared/info/1915225457"}
          >
            <IonIcon slot="start" icon={star} />
            Review on AnkiWeb
          </IonButton>
          <IonCheckbox
            className="BootReminderModal-checkbox"
            checked={showBootReminderDialog}
            onIonChange={async (e) => {
              dispatch(setShowBootReminderDialog(e.detail.checked));
              await pyEditSetting(
                "showBootReminderDialog",
                e.detail.checked
              );
            }}
          >
            Show this reminder when AnkiBrain starts
          </IonCheckbox>
        </div>
      </IonContent>
    </IonModal>
  );
}
