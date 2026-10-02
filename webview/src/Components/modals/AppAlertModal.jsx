import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonModal,
  IonTitle,
  IonToolbar,
} from "@ionic/react";
import { useDispatch, useSelector } from "react-redux";
import { setAppAlertModal } from "../../api/redux/slices/appAlertModal";

export function AppAlertModal() {
  const dispatch = useDispatch();
  const appAlertModal = useSelector((state) => state.appAlertModal.value);

  const reset = () =>
    dispatch(setAppAlertModal({ show: false, header: "", alertText: "" }));

  return (
    <IonModal
      isOpen={appAlertModal.show}
      onDidDismiss={async () => {
        // Runs once on every close path (button, backdrop, escape); the
        // stored onClose callback (if any) belongs here so it can't fire
        // twice when a button also reset the store.
        reset();
        if (typeof appAlertModal.onClose === "function") {
          await appAlertModal.onClose();
        }
      }}
    >
      <IonHeader>
        <IonToolbar>
          <IonTitle>{appAlertModal.header}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={reset}>Close</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">{appAlertModal.alertText}</IonContent>
    </IonModal>
  );
}
