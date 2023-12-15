import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import { MemoryRouter } from "react-router-dom";
import { PATHS } from "./api/constants";
import { Provider } from "react-redux";
import { store } from "./api/redux";
import { ChakraProvider, ColorModeScript, extendTheme } from "@chakra-ui/react";

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

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
