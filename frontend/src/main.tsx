import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Plausible analytics — loaded at runtime only when VITE_PLAUSIBLE_DOMAIN
// is set. Zero cost locally, zero DOM footprint, no cookies, GDPR-safe.
// Strictly observational: no UI and no behavioural change.
const plausibleDomain = import.meta.env.VITE_PLAUSIBLE_DOMAIN as string | undefined;
if (plausibleDomain) {
  const s = document.createElement("script");
  s.defer = true;
  s.setAttribute("data-domain", plausibleDomain);
  s.src = "https://plausible.io/js/script.js";
  document.head.appendChild(s);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
