import React from "react";
import ReactDOM from "react-dom/client";

/* Core CSS required for Ionic components to work properly. */
import "@ionic/react/css/core.css";

/* Basic CSS for apps built with Ionic. */
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";

/* Optional CSS utils that can be commented out. */
import "@ionic/react/css/padding.css";
import "@ionic/react/css/float-elements.css";
import "@ionic/react/css/text-alignment.css";
import "@ionic/react/css/text-transformation.css";
import "@ionic/react/css/flex-utils.css";
import "@ionic/react/css/display.css";

/* Ionic dark palette, toggled by the `.ion-palette-dark` class on <html>
   (see src/theme/colorMode.js). */
import "@ionic/react/css/palettes/dark.class.css";

import "./index.css";
import "./theme/variables.css";

import { IonApp } from "@ionic/react";
import { IonReactMemoryRouter } from "@ionic/react-router";
import App from "./App";
import { PATHS } from "./api/constants";
import { Provider } from "react-redux";
import { store } from "./api/redux";
import { setupIonicReact } from "@ionic/react";
import { initIonColorMode } from "./theme/colorMode";

// Use the Material design language everywhere: the panel is a desktop
// QtWebEngine widget, so device-detected iOS styling would be misleading
// (Ionic detects desktop platforms as "md" already, this pins it).
setupIonicReact({ mode: "md" });

// Keep the Ionic dark palette class in sync with the persisted Redux state.
initIonColorMode(store);

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <IonApp>
      <Provider store={store}>
        {/* Memory routing (not BrowserRouter) because Anki's QtWebEngine
            loads the bundle over file:// — see SidePanel.py. */}
        <IonReactMemoryRouter initialEntries={[PATHS.MAKE_CARDS]}>
          <App />
        </IonReactMemoryRouter>
      </Provider>
    </IonApp>
  </React.StrictMode>
);
