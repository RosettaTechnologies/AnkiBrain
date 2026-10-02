import "./App.css";
import React, { useEffect, useState } from "react";

import { Navigate, Route, useNavigate } from "react-router-dom";
import { IonPage, IonRouterOutlet, IonTabs } from "@ionic/react";
import { CardMakingScreen } from "./Components/Screens/CardMakingScreen/CardMakingScreen";
import { TalkScreen } from "./Components/Screens/TalkScreen/TalkScreen";
import { LoginModal } from "./Components/modals/LoginModal";
import { SideBar } from "./Components/SideBar/SideBar";
import { BottomNav } from "./Components/BottomNav/BottomNav";
import { TopicExplanationScreen } from "./Components/Screens/TopicExplanationScreen/TopicExplanationScreen";
import { PATHS } from "./api/constants";
import { useDispatch, useSelector } from "react-redux";
import { handlePythonDataReceived, initPythonBridge } from "./api/PythonBridge";
import { ImportScreen } from "./Components/Screens/ImportScreen/ImportScreen";
import { AuthScreen } from "./Components/Screens/AuthScreen/AuthScreen";
import { GlobalLoadingIndicator } from "./Components/GlobalLoadingIndicator";
import { setBoolGlobalLoadingIndicator } from "./api/redux/slices/bGlobalLoadingIndicator";
import { AppAlertModal } from "./Components/modals/AppAlertModal";
import { SettingsScreen } from "./Components/Screens/SettingsScreen/SettingsScreen";
import { EmailVerificationModal } from "./Components/modals/EmailVerificationModal";
import { InterprocessCommand } from "./api/PythonBridge/InterprocessCommand";
import { PROD_SERVER_URL } from "./api/server-api/networking";
import { BootReminderModal } from "./Components/modals/BootReminderModal";
import { VoiceSetupModal } from "./Components/modals/VoiceSetupModal";

/**
 * Wraps a screen in an Ionic page (router transitions + full-height layout)
 * with the padding/scroll container the screens expect.
 */
function ScreenPage({ children }) {
  return (
    <IonPage className="AppScreenPage">
      <div className="MainAppArea">{children}</div>
    </IonPage>
  );
}

function App() {
  const appDidBoot = useSelector((state) => state.appDidBoot.value);
  const [showBootReminderModalNow, setShowBootReminderModalNow] =
    useState(false);
  const showBootReminderDialog = useSelector(
    (state) => state.showBootReminderDialog.value
  );
  const showLoginModal = useSelector((state) => state.showLoginModal.value);
  const userMode = useSelector((state) => state.userMode.value);
  const user = useSelector((state) => state.user.value);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  let globalLoading = useSelector(
    (state) => state.bGlobalLoadingIndicator.value
  );

  // Server-mode gate: until a verified session exists, the whole app shell
  // (SideBar, screens, BottomNav) is replaced by the AuthScreen login/signup
  // gate. STANDALONE dev mode is exempt so the app can still be previewed
  // without an account.
  const needsAuth =
    import.meta.env.VITE_APP_ENV !== "STANDALONE" &&
    userMode === "SERVER" &&
    appDidBoot &&
    !(user && user.isVerified);

  //Function that can be called globally to render the loading screen
  useEffect(() => {
    dispatch(setBoolGlobalLoadingIndicator(true));
    initPythonBridge(window, dispatch, navigate);

    (async function () {
      // If in standalone mode
      if (import.meta.env.VITE_APP_ENV === "STANDALONE") {
        await handlePythonDataReceived(
          {
            cmd: InterprocessCommand.DID_LOAD_SETTINGS,
            data: {
              colorMode: "dark",
              currentVersion: "0.6.2",
              documents_saved: [],
              llmModel: "gpt-5.6-luna",
              temperature: 0,
              user_mode: "SERVER",
              user: null,
              devMode: false,
              canToggleDevMode: true,
              apiBaseUrl: PROD_SERVER_URL,
            },
          },
          dispatch,
          navigate
        );

        await handlePythonDataReceived(
          { cmd: InterprocessCommand.DID_FINISH_STARTUP },
          dispatch,
          navigate
        );
      }
    })();
  }, []);

  useEffect(() => {
    // showBootReminderDialog represents the option to show it at boot.
    // showBootReminderModalNow allows us to control whether it is currently shown.
    if (appDidBoot && showBootReminderDialog) {
      setShowBootReminderModalNow(true);
    }
  }, [appDidBoot]);

  return (
    <div
      className="App"
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {!needsAuth && showLoginModal && <LoginModal isOpen={showLoginModal} />}

      {globalLoading && <GlobalLoadingIndicator />}
      <AppAlertModal />
      {!needsAuth && (
        <>
          <BootReminderModal
            show={showBootReminderModalNow}
            onClose={() => {
              setShowBootReminderModalNow(false);
            }}
          />
          <EmailVerificationModal />
          <VoiceSetupModal />
        </>
      )}

      {!globalLoading && needsAuth && <AuthScreen />}

      {!globalLoading && !needsAuth && (
        <>
          <SideBar />

          <div className="AppTabsArea">
            <IonTabs>
              <IonRouterOutlet>
                <Route
                  path={PATHS.TOPIC_EXPLANATION}
                  element={
                    <ScreenPage>
                      <TopicExplanationScreen />
                    </ScreenPage>
                  }
                />
                <Route
                  path={PATHS.MAKE_CARDS}
                  element={
                    <ScreenPage>
                      <CardMakingScreen />
                    </ScreenPage>
                  }
                />
                <Route
                  path={PATHS.TALK}
                  element={
                    <ScreenPage>
                      <TalkScreen />
                    </ScreenPage>
                  }
                />
                <Route
                  path={PATHS.IMPORT}
                  element={
                    <ScreenPage>
                      <ImportScreen />
                    </ScreenPage>
                  }
                />
                <Route
                  path={PATHS.SETTINGS}
                  element={
                    <ScreenPage>
                      <SettingsScreen />
                    </ScreenPage>
                  }
                />
                <Route
                  path="*"
                  element={<Navigate to={PATHS.MAKE_CARDS} replace />}
                />
              </IonRouterOutlet>
              <BottomNav />
            </IonTabs>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
