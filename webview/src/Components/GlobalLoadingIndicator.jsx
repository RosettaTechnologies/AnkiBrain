import "./GlobalLoadingIndicator.css";
import React from "react";
import { useSelector } from "react-redux";
import { IonSpinner } from "@ionic/react";
import "@fontsource/lato/400.css";

export function GlobalLoadingIndicator() {
  const show = useSelector((state) => state.bGlobalLoadingIndicator.value);
  const loadingText = useSelector((state) => state.loadingText.value);

  if (!show) return null;

  return (
    <div id="GlobalLoadingIndicator" className="GlobalLoadingIndicator">
      <div className="GlobalLoadingIndicator-title">AnkiBrain</div>
      <div className="GlobalLoadingIndicator-text">{loadingText}</div>
      <IonSpinner name="circular" color="primary" />
    </div>
  );
}
