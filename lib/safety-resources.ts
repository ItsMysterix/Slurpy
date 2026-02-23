export type SafetyAction = {
  id: "call" | "text" | "web";
  label: string;
  href: string;
};

export type SafetyResources = {
  region: string;
  lead: string;
  detail: string;
  actions: SafetyAction[];
};

function normalizeRegion(input?: string | null): string {
  return (input || "").trim().toUpperCase();
}

export function regionFromLocale(locale?: string | null): string {
  const match = (locale || "").match(/-([A-Za-z]{2})$/);
  return match ? match[1].toUpperCase() : "";
}

export function getSafetyResources(regionInput?: string | null): SafetyResources {
  const region = normalizeRegion(regionInput);

  const lead = "If you might be in immediate danger, contact local emergency services now.";

  if (region === "US") {
    return {
      region,
      lead,
      detail: "In the United States, call or text 988. You can also text HOME to 741741.",
      actions: [
        { id: "call", label: "Call 988", href: "tel:988" },
        { id: "text", label: "Text 741741", href: "sms:741741?body=HOME" },
      ],
    };
  }

  if (region === "CA") {
    return {
      region,
      lead,
      detail: "In Canada, call or text 988 for immediate crisis support.",
      actions: [{ id: "call", label: "Call 988", href: "tel:988" }],
    };
  }

  if (region === "UK") {
    return {
      region,
      lead,
      detail: "In the UK and ROI, contact Samaritans at 116 123.",
      actions: [{ id: "call", label: "Call 116 123", href: "tel:116123" }],
    };
  }

  if (region === "AU") {
    return {
      region,
      lead,
      detail: "In Australia, contact Lifeline at 13 11 14.",
      actions: [{ id: "call", label: "Call 13 11 14", href: "tel:131114" }],
    };
  }

  return {
    region: region || "GLOBAL",
    lead,
    detail: "If available in your country, contact your local crisis hotline. If unsure, call local emergency services immediately.",
    actions: [],
  };
}
