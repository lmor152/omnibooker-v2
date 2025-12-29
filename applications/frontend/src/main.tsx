import { createRoot } from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import App from "./App";
import "./index.css";

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
const scope = import.meta.env.VITE_AUTH0_SCOPE;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

if (!domain || !clientId) {
  throw new Error("Auth0 domain and client ID must be provided via environment variables");
}

const authorizationParams: Record<string, string> = {
  redirect_uri: window.location.origin,
};

if (scope) {
  authorizationParams.scope = scope;
}

if (audience) {
  authorizationParams.audience = audience;
}

createRoot(document.getElementById("root")!).render(
  <Auth0Provider domain={domain} clientId={clientId} authorizationParams={authorizationParams}>
    <App />
  </Auth0Provider>,
);
