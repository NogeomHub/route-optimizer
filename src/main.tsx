import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import V3App from "./v3/V3App";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {import.meta.env.MODE === "v3" ? <V3App /> : <App />}
  </React.StrictMode>,
);
