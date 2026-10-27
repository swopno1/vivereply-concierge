// Public widget keys (step 4). A key is NOT a secret and NOT an
// authentication token — it is a public identifier a site puts in its
// embed script so the widget panel knows which property to label the
// conversation with. An unknown key shows an error panel instead of a
// chat, never a guessed property.
//
// V1 limitation, stated plainly: the key only labels the conversation
// (propertyId) and titles the panel. The catalogue, Suite base URL,
// and database are still the single demo property's. Adding a key
// here does not plug in a new property's rooms or bookings.

export type WidgetProperty = {
  propertyId: string;
  title: string;
};

export const WIDGET_KEYS: Record<string, WidgetProperty> = {
  "demo-krishnachura": {
    propertyId: "krishnachura-retreat",
    title: "Krishnachura Retreat",
  },
};

export function getWidgetProperty(key: string | null): WidgetProperty | undefined {
  if (!key) return undefined;
  return WIDGET_KEYS[key];
}
