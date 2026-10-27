// Widget panel (step 4). This is what the embed script loads inside
// its iframe: /widget?key=demo-krishnachura. Same Chat component as
// the main page, in compact mode. useSearchParams must live behind a
// Suspense boundary (Next.js requirement), hence the split below.

"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Chat from "../components/Chat";
import { getWidgetProperty } from "@/demo-config/widget-keys";

function WidgetInner() {
  const params = useSearchParams();
  const property = getWidgetProperty(params.get("key"));
  if (!property) {
    return (
      <main className="mx-auto flex min-h-screen w-full flex-col p-4">
        <h1 className="text-xl font-bold">Vivereply Concierge</h1>
        <p className="text-sm text-gray-500">
          This demo widget is not configured. Check the embed script's data-key.
        </p>
      </main>
    );
  }
  return <Chat compact propertyId={property.propertyId} title={property.title} />;
}

export default function WidgetPage() {
  return (
    <Suspense>
      <WidgetInner />
    </Suspense>
  );
}
