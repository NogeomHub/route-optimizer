import { handlers } from "../../server/netlify/handlers.mjs";
export default (request) => handlers().api(request);
export const config = {
  path: [
    "/api/session",
    "/api/about",
    "/api/geocode",
    "/api/search",
    "/api/search/*",
  ],
};
