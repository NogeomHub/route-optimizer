import { PocError } from "../src/util.mjs";
/** Distributed storage port. Missing CAS support fails closed; no filesystem fallback. */
export class BlobsStore {
  constructor(sdk) {
    this.sdk = sdk;
  }
  async get(key) {
    const entry = await this.sdk.getWithMetadata(key, {
      type: "json",
      consistency: "strong",
    });
    if (entry && (typeof entry.etag !== "string" || !entry.etag))
      throw new PocError("BLOBS_ETAG_MISSING", "ETag absent.", 503);
    return entry ? { data: entry.data, etag: entry.etag } : null;
  }
  async put(key, data, condition = {}) {
    if (
      (condition.new && condition.etag) ||
      ("etag" in condition && !condition.etag)
    )
      throw new Error("Invalid conditional write");
    const options = condition.new
      ? { onlyIfNew: true }
      : condition.etag
        ? { onlyIfMatch: condition.etag }
        : {};
    const result = await this.sdk.setJSON(key, data, options);
    if (typeof result?.modified !== "boolean")
      throw new Error("Conditional write outcome unavailable");
    return result.modified;
  }
}
