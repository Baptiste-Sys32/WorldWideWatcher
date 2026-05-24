import { feedResponse } from "../globalFeedsRoute";

export const revalidate = 300;

export async function GET() {
    return feedResponse("power-outages");
}
