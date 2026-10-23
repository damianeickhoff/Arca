import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getVapidKeys } from "@/lib/push";

/** The server's VAPID public key, for PushManager.subscribe (made on the first call).
 *  The private key never leaves the server. */
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  const { publicKey } = await getVapidKeys();
  return NextResponse.json({ publicKey });
}
