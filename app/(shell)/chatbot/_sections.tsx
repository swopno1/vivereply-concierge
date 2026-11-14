// Shared section chrome for the Chatbot pages (moved verbatim from the
// settings page in D1 — same Section/Snippet markup and styling).

import CopyButton from "../../components/CopyButton";

export function Section({
  title,
  blurb,
  children,
  id,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-3">
      <header className="border-b border-gray-200 pb-2">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500">{blurb}</p>
      </header>
      {children}
    </section>
  );
}

export function Snippet({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <CopyButton text={text} label={label} />
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-gray-900 px-3 py-2 font-mono text-xs leading-relaxed text-gray-100">
        {text}
      </pre>
    </div>
  );
}
