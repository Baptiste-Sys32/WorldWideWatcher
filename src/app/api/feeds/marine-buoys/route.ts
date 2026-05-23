import { feedResponse } from "../globalFeedsRoute";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export function GET() {
    return feedResponse("marine-buoys");
}
