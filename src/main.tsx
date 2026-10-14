import { createRoot } from "react-dom/client";
// NOTE: index.css must be imported before App. Component stylesheets use
// @apply-extracted classes that intentionally override shadcn base utilities
// (e.g. h-10 -> h-8); equal-specificity conflicts resolve by source order,
// so the utilities layer has to come first.
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(<App />);
