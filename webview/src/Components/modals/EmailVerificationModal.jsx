import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonModal,
  IonTitle,
  IonToolbar,
} from "@ionic/react";
import { useState } from "react";
import { useSelector } from "react-redux";
import { resendVerificationCode, verifyEmail } from "../../api/user";
import "./EmailVerificationModal.css";

export function EmailVerificationModal() {
  const user = useSelector((state) => state.user.value);
  const [verificationCode, setVerificationCode] = useState("");

  // Show if logged in but not verified. Not user-dismissable (the account
  // stays unverified until the code is entered); it closes itself when the
  // store flips isVerified.
  return (
    <IonModal
      isOpen={!!(user && !user.isVerified)}
      backdropDismiss={false}
      canDismiss={false}
    >
      <IonHeader>
        <IonToolbar>
          <IonTitle>Validate Email</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div className="EmailVerificationModal">
          <p>
            Please enter the verification code that was sent to your email
            address.
          </p>
          <p className="EmailVerificationModal-loud">
            If you don't see the code, <b>check your spam folder.</b>
          </p>

          <IonInput
            className="EmailVerificationModal-input"
            fill="solid"
            placeholder={"Verification code..."}
            value={verificationCode}
            onIonInput={(e) => {
              setVerificationCode(e.detail.value || "");
            }}
          />

          <IonButton
            color="accent"
            expand="block"
            onClick={async () => {
              await verifyEmail(verificationCode, user.accessToken);
            }}
          >
            Validate
          </IonButton>
          <IonButton
            className="EmailVerificationModal-resendBtn"
            color="light"
            expand="block"
            onClick={async () => {
              await resendVerificationCode(user.accessToken);
            }}
          >
            Resend verification code to my email
          </IonButton>
        </div>
      </IonContent>
    </IonModal>
  );
}
