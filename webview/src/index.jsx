import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { MemoryRouter } from "react-router-dom";
import { PATHS } from "./api/constants";
import { Provider } from "react-redux";
import { store } from "./api/redux";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <MemoryRouter initialEntries={[PATHS.TOPIC_EXPLANATION]}>
        <App />
      </MemoryRouter>
    </Provider>
  </React.StrictMode>
);
