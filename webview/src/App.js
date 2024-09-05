import "./App.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min";
import React, { useEffect, useState } from "react";

import { Route, Routes, useNavigate } from "react-router-dom";
import { CardMakingScreen } from "./Components/Screens/CardMakingScreen/CardMakingScreen";
import { TalkScreen } from "./Components/Screens/TalkScreen/TalkScreen";
import { LoginModal } from "./Components/modals/LoginModal";
import { SideBar } from "./Components/SideBar/SideBar";
import { TopicExplanationScreen } from "./Components/Screens/TopicExplanationScreen/TopicExplanationScreen";
import { PATHS } from "./api/constants";
import { useDispatch, useSelector } from "react-redux";
import { handlePythonDataReceived, initPythonBridge } from "./api/PythonBridge";
import { ImportScreen } from "./Components/Screens/ImportScreen/ImportScreen";
import { GlobalLoadingIndicator } from "./Components/GlobalLoadingIndicator";
import { setBoolGlobalLoadingIndicator } from "./api/redux/slices/bGlobalLoadingIndicator";
import { AppAlertModal } from "./Components/modals/AppAlertModal";
import { SettingsScreen } from "./Components/Screens/SettingsScreen/SettingsScreen";
import { EmailVerificationModal } from "./Components/modals/EmailVerificationModal";
import { InterprocessCommand } from "./api/PythonBridge/InterprocessCommand";
import { PROD_SERVER_URL } from "./api/server-api/networking";
import {
  ChakraProvider,
  ColorModeScript,
  extendTheme,
  useColorMode,
} from "@chakra-ui/react";
import { BootReminderModal } from "./Components/modals/BootReminderModal";

function App() {
  const appDidBoot = useSelector((state) => state.appDidBoot.value);
  const [showBootReminderModalNow, setShowBootReminderModalNow] =
    useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const showBootReminderDialog = useSelector(
    (state) => state.showBootReminderDialog.value
  );
  const showLoginModal = useSelector((state) => state.showLoginModal.value);
  const appAlertModal = useSelector((state) => state.appAlertModal.value);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  let globalLoading = useSelector(
    (state) => state.bGlobalLoadingIndicator.value
  );
  const { colorMode, toggleColorMode } = useColorMode();


  //Function that can be called globally to render the loading screen
  useEffect(() => {
    dispatch(setBoolGlobalLoadingIndicator(true));
    initPythonBridge(window, dispatch, navigate);

    (async function () {
      // If in standalone mode
      if (process.env && process.env.REACT_APP_ENV === "STANDALONE") {
        await handlePythonDataReceived(
          {
            cmd: InterprocessCommand.DID_LOAD_SETTINGS,
            data: {
              colorMode: "dark",
              currentVersion: "0.6.2",
              documents_saved: [],
              llmModel: "gpt-3.5-turbo",
              temperature: 0,
              user_mode: "SERVER",
              user: null,
              devMode: false,
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

  const theme = extendTheme({
    fonts: {
      body: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Ubuntu, 'Helvetica Neue', sans-serif",
      heading:
        "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Ubuntu, 'Helvetica Neue', sans-serif",
    },
    colors: {
      customBlack: "#1f1f1f",
      accent: "#f3ceff",
      secondary: "#afebf4",
      nightPurple: "#312244",
      customPurple: {
        50: "#f8edfc",
        100: "#ddcce8",
        200: "#c4aad4",
        300: "#aa88c3",
        400: "#8f67b1",
        500: "#734e97",
        600: "#583c76",
        700: "#3d2b55",
        800: "#271a35",
        900: "#100817",
      },
      offWhite: "rgb(250,250,250)",
    },
    styles: {
      global: (props) => ({
        body: {
          color: props.colorMode === "dark" ? "white" : "customBlack",
          bg: props.colorMode === "dark" ? "#16161d" : "white",
        },
      }),
    },
    components: {
      Button: {
        baseStyle: {
          _hover: {
            opacity: 0.5,
          },
          _focus: {
            opacity: 0.25,
          },
        },
        variants: {
          accent: {
            bg: "accent",
            color: "customBlack",
          },
          secondary: {
            bg: "secondary",
            color: "customBlack",
          },
        },
      },
      Input: {
        baseStyle: ({ colorMode }) => ({
          bg: colorMode === "dark" ? "customPurple.800" : "white",
          color: colorMode === "dark" ? "white" : "#1f1f1f",
        }),
      },
      Textarea: {
        baseStyle: ({ colorMode }) => ({
          bg: "customPurple.800",
          focusBorderColor: "accent",
          _focus: {
            borderColor: "accent",
          },
        }),
      },
    },
  });

  return (
    <>
      <ColorModeScript initialColorMode={"dark"} />
      <ChakraProvider theme={theme}>
        <div
          className="App container-fluid pt-3"
          style={{
            height: "100vh",
          }}
        >
          <div
            className={"row d-flex flex-row"}
            style={{ height: "100%", flexWrap: "nowrap", overflowX: "auto" }}
          >
            {showLoginModal && <LoginModal isOpen={showLoginModal} />}

            {globalLoading && <GlobalLoadingIndicator />}
            <AppAlertModal />
            <BootReminderModal
              show={showBootReminderModalNow}
              onClose={() => {
                setShowBootReminderModalNow(false);
              }}
            />
            <EmailVerificationModal />

            {!globalLoading && (
              <>
                <SideBar
                  loggedIn={loggedIn}
                  style={{
                    width: "155px",
                    height: "600px",
                  }}
                />

                <div
                  className={"MainAppArea"}
                  style={{
                    flex: 1,
                    height: "100%",
                    width: "100%",
                    opacity: globalLoading ? 0.1 : 1,
                  }}
                >
                  <Routes>
                    <Route
                      path={PATHS.TOPIC_EXPLANATION}
                      element={<TopicExplanationScreen />}
                    />
                    <Route
                      path={PATHS.MAKE_CARDS}
                      element={<CardMakingScreen />}
                    />
                    <Route path={PATHS.TALK} element={<TalkScreen />} />
                    <Route path={PATHS.IMPORT} element={<ImportScreen />} />
                    <Route path={PATHS.SETTINGS} element={<SettingsScreen />} />
                  </Routes>
                </div>
              </>
            )}
          </div>
        </div>
      </ChakraProvider>
    </>
  );
}

export default App;
