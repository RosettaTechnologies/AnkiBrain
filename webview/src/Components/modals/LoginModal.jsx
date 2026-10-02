import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setShowLoginModal } from "../../api/redux";
import { login, signup } from "../../api/user";
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonModal,
  IonTitle,
  IonToolbar,
} from "@ionic/react";
import { arrowBack } from "ionicons/icons";
import { errorToast, infoToast } from "../../api/toast";
import { getAPIEndpoints } from "../../api/server-api/networking";
import { useNavigate } from "react-router-dom";
import { PATHS } from "../../api/constants";
import "./LoginModal.css";

export function LoginModal(props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signupMode, setSignupMode] = useState(false);
  const [agreedPP, setAgreedPP] = useState(false);
  const [agreedTOS, setAgreedTOS] = useState(false);

  const dispatch = useDispatch();
  const navigate = useNavigate();

  const devMode = useSelector((state) => state.devMode.value);
  const [privacyPolicyLink, setPrivacyPolicyLink] = useState(
    getAPIEndpoints().PRIVACY_POLICY
  );
  const [termsOfServiceLink, setTermsOfServiceLink] = useState(
    getAPIEndpoints().TERMS_OF_SERVICE
  );

  useEffect(() => {
    setPrivacyPolicyLink(getAPIEndpoints().PRIVACY_POLICY);
    setTermsOfServiceLink(getAPIEndpoints().TERMS_OF_SERVICE);
  }, [devMode]);

  const close = () => dispatch(setShowLoginModal(false));

  return (
    <IonModal isOpen={props.isOpen} onDidDismiss={close}>
      <IonHeader>
        <IonToolbar>
          {signupMode && (
            <IonButtons slot="start">
              <IonButton onClick={() => setSignupMode(false)}>
                <IonIcon slot="icon-only" icon={arrowBack} />
              </IonButton>
            </IonButtons>
          )}
          <IonTitle>{signupMode ? "Sign Up" : "Login or Sign Up"}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={close}>Close</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (signupMode) {
              if (!agreedPP || !agreedTOS) {
                infoToast(
                  "Info",
                  "Please agree to both the Privacy Policy and Terms of Service before registering."
                );
                return;
              }
              if (password !== confirmPassword) {
                errorToast(
                  "Passwords do not match",
                  "Make sure your password and password confirmation match."
                );
              } else {
                await signup(email, password);
              }
            } else {
              await login(email, password);
            }
          }}
        >
          <label className="LoginModal-label" htmlFor="login-email">
            Email address
          </label>
          <IonInput
            className="LoginModal-input"
            fill="solid"
            id="login-email"
            type="email"
            value={email}
            onIonInput={(event) => {
              setEmail(event.detail.value || "");
            }}
          />

          <label className="LoginModal-label" htmlFor="login-password">
            Password
          </label>
          <IonInput
            className="LoginModal-input"
            fill="solid"
            id="login-password"
            type="password"
            value={password}
            onIonInput={(event) => {
              setPassword(event.detail.value || "");
            }}
          />

          {signupMode && (
            <>
              <label className="LoginModal-label" htmlFor="login-confirm">
                Confirm Password
              </label>
              <IonInput
                className="LoginModal-input"
                fill="solid"
                id="login-confirm"
                type="password"
                value={confirmPassword}
                onIonInput={(event) => {
                  setConfirmPassword(event.detail.value || "");
                }}
              />
            </>
          )}

          {!signupMode && (
            <IonButton type="submit" color="accent" expand="block">
              Login
            </IonButton>
          )}

          {signupMode && (
            <div className="LoginModal-signupBlock">
              <IonCheckbox
                className="LoginModal-checkbox"
                checked={agreedPP}
                onIonChange={(e) => {
                  setAgreedPP(e.detail.checked);
                }}
              >
                <span className="LoginModal-checkboxLabel">
                  I have read and agree to the{" "}
                  <a
                    className="LoginModal-link"
                    href={privacyPolicyLink}
                    target={"_blank"}
                    rel="noreferrer"
                  >
                    Privacy Policy
                  </a>
                </span>
              </IonCheckbox>
              <IonCheckbox
                className="LoginModal-checkbox"
                checked={agreedTOS}
                onIonChange={(e) => {
                  setAgreedTOS(e.detail.checked);
                }}
              >
                <span className="LoginModal-checkboxLabel">
                  I have read and agree to the{" "}
                  <a
                    className="LoginModal-link"
                    href={termsOfServiceLink}
                    target={"_blank"}
                    rel="noreferrer"
                  >
                    Terms of Service
                  </a>
                </span>
              </IonCheckbox>
              <IonButton
                type="submit"
                color="accent"
                expand="block"
                className="LoginModal-confirmBtn"
              >
                Confirm
              </IonButton>
            </div>
          )}
        </form>

        {!signupMode && (
          <>
            <hr className="LoginModal-divider" />
            <div className="LoginModal-or">
              <span>OR</span>
            </div>
            <IonButton color="secondary" expand="block" onClick={() => setSignupMode(true)}>
              Sign Up
            </IonButton>
          </>
        )}

        <div className="LoginModal-forgot">
          <p>Forgot password?</p>
          <IonButton
            fill="clear"
            onClick={() => {
              dispatch(setShowLoginModal(false));
              navigate(PATHS.SETTINGS);
            }}
          >
            Reset my password
          </IonButton>
        </div>
      </IonContent>
    </IonModal>
  );
}
