import { fetchFl511Cameras } from "../fl511/fl511Fetcher";
import type { CameraAdapter } from "./types";

export const fl511Adapter: CameraAdapter = {
    id: "fl511",
    displayName: "FL511 (Florida)",
    region: "United States — Florida",
    fetch: fetchFl511Cameras,
};
