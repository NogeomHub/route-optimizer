import { handlers } from "../../server/netlify/handlers.mjs";
export default (request) => handlers().background(request);
// The supported -background filename convention provides asynchronous 202 + 15-minute execution.
