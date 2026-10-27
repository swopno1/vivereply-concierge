// Main chat page (step 4 refactor). Thin wrapper only — the chat UI
// lives in app/components/Chat.tsx so / and /widget share one component.

import Chat from "./components/Chat";

export default function Home() {
  return <Chat />;
}
