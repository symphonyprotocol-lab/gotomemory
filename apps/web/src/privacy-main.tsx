import { createRoot } from "react-dom/client";

import { PrivacyPolicy } from "./PrivacyPolicy.js";
import "./styles.css";

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(<PrivacyPolicy />);
}
