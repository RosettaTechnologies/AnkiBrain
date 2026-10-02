// Shell wiring test for the Ionic tab navigation:
//   IonReactMemoryRouter (memory routing, required under file://)
//   + IonTabs/IonRouterOutlet + the real BottomNav (IonTabBar).
// Ionic web components initialize asynchronously in jsdom, so the first
// paint of a route must be awaited.
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { store } from "../../api/redux";
import {
  IonApp,
  IonPage,
  IonRouterOutlet,
  IonTabs,
  setupIonicReact,
} from "@ionic/react";
import { IonReactMemoryRouter } from "@ionic/react-router";
import { Route, useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";

setupIonicReact({ mode: "md" });

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderShell() {
  return render(
    <IonApp>
      <Provider store={store}>
        <IonReactMemoryRouter initialEntries={["/makeCard"]}>
          <LocationProbe />
          <IonTabs>
            <IonRouterOutlet>
              <Route
                path="/makeCard"
                element={
                  <IonPage>
                    <div>MAKE CARDS PAGE</div>
                  </IonPage>
                }
              />
              <Route
                path="/topicExplanation"
                element={
                  <IonPage>
                    <div>EXPLAIN PAGE</div>
                  </IonPage>
                }
              />
              <Route
                path="/talk"
                element={
                  <IonPage>
                    <div>TALK PAGE</div>
                  </IonPage>
                }
              />
              <Route
                path="/import"
                element={
                  <IonPage>
                    <div>IMPORT PAGE</div>
                  </IonPage>
                }
              />
              <Route
                path="/settings"
                element={
                  <IonPage>
                    <div>SETTINGS PAGE</div>
                  </IonPage>
                }
              />
            </IonRouterOutlet>
            <BottomNav />
          </IonTabs>
        </IonReactMemoryRouter>
      </Provider>
    </IonApp>
  );
}

describe("BottomNav tab shell", () => {
  test("navigates between screens from the tab bar", async () => {
    renderShell();

    await waitFor(
      () => {
        expect(screen.getByText("MAKE CARDS PAGE")).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    await userEvent.click(screen.getByText("Talk"));
    await waitFor(
      () => {
        expect(screen.getByTestId("location")).toHaveTextContent("/talk");
        expect(screen.getByText("TALK PAGE")).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    await userEvent.click(screen.getByText("Settings"));
    await waitFor(
      () => {
        expect(screen.getByTestId("location")).toHaveTextContent("/settings");
        expect(screen.getByText("SETTINGS PAGE")).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  test("help entry opens the help modal instead of navigating", async () => {
    const { container } = renderShell();

    const locationBefore = screen.getByTestId("location").textContent;
    const helpButton = container.querySelector("ion-tab-button.BottomNav-help");
    expect(helpButton).toBeTruthy();
    // Wait for the web component to hydrate; clicking a not-yet-upgraded
    // custom element would be a no-op.
    await waitFor(
      () => {
        expect(helpButton.classList.contains("hydrated")).toBe(true);
      },
      { timeout: 3000 }
    );
    await userEvent.click(helpButton);

    await waitFor(
      () => {
        expect(
          document.querySelector('a[href="mailto:ankibrain@rankmd.org"]')
        ).toBeTruthy();
      },
      { timeout: 3000 }
    );

    expect(screen.getByTestId("location")).toHaveTextContent(locationBefore);
  });
});
