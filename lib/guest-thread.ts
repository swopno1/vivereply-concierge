// Guest-thread auth (§2d + A2 contact endpoint): the widget token,
// verified exactly as the chat route verifies it — token validity,
// then the per-message domain re-check for widget scope. Direct-scope
// tokens verify the same way they do on the chat path; brand tokens
// carry no property and are rejected. Deliberately narrower than the
// chat POST: no kill-switch, no billing gate, no chat throttles here —
// history reads stay available and cheap; abuse is bounded by the
// polling limiter on the messages endpoint.
import { verifyChatToken } from "./auth";
import { isDomainApproved } from "./domains";

export type GuestThreadAuth =
  | { ok: true; propertyId: string }
  | { ok: false; status: number; error: string };

export async function verifyGuestThreadToken(token: string | null): Promise<GuestThreadAuth> {
  const chatToken = verifyChatToken(token);
  if (
    !chatToken ||
    !chatToken.propertyId ||
    (chatToken.scope !== "widget" && chatToken.scope !== "direct")
  ) {
    return { ok: false, status: 403, error: "Chat token expired or invalid. Please reload the page." };
  }
  if (chatToken.scope === "widget") {
    if (!chatToken.domain || !(await isDomainApproved(chatToken.propertyId, chatToken.domain))) {
      return { ok: false, status: 403, error: "This site is no longer approved to host this chat." };
    }
  }
  return { ok: true, propertyId: chatToken.propertyId };
}
