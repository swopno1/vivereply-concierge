// Chatbot → Knowledge (D1): the chatbot name/topics block, moved whole
// from settings, plus a pointer to the onboarding runs that feed the
// corpus. Same reads, same components, same verified-owner gate.

import { redirect } from "next/navigation";
import { getSession, resolvePropertyId, sessionOwnerVerified } from "@/lib/tenant";
import { getChatbotData } from "@/lib/dashboard";
import VerifyPrompt from "../../../components/VerifyPrompt";
import ChatbotProfile from "../../../components/ChatbotProfile";
import ChatbotSubnav from "../ChatbotSubnav";
import { Section } from "../_sections";

export default async function ChatbotKnowledgePage({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/chatbot/knowledge");
  if (!(await sessionOwnerVerified(session))) {
    return <VerifyPrompt email={session.email} />;
  }
  const params = (await searchParams) ?? {};
  const propertyId = await resolvePropertyId(session, params.property);
  const data = await getChatbotData(propertyId);
  if (!data) redirect("/settings");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <header className="border-b border-gray-200 pb-3">
        <h1 className="text-xl font-bold text-gray-900">Knowledge</h1>
        <p className="text-sm text-gray-500">What the chatbot knows and how it speaks for {data.propertyName}.</p>
      </header>
      <ChatbotSubnav />

      <Section
        id="chatbot"
        title="Chatbot name + topics"
        blurb="What guests see (name, greeting, tone) and what the chatbot may advise on. Saving here takes effect on the next widget load — no re-ingestion."
      >
        <ChatbotProfile
          propertyId={propertyId}
          initial={{
            assistantName: data.profile?.assistantName ?? "",
            greeting: data.profile?.greeting ?? "",
            tone: data.profile?.tone ?? "",
            suggestionSegments: data.profile?.suggestionSegments ?? [],
          }}
        />
      </Section>

      <Section
        id="runs"
        title="Ingestion runs"
        blurb="Website crawls and document uploads that feed the corpus live on the onboarding board."
      >
        <a href="/onboarding" className="text-sm font-medium text-gray-900 underline underline-offset-2">
          Open onboarding runs
        </a>
      </Section>
    </div>
  );
}
