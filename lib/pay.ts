import { supabase } from "@/lib/supabaseClient";

export async function getCheckoutUrl(priceId?: string) {
  // Attach Supabase access token so the API can resolve userId from JWT
  let bearer = "";
  try {
    const { data } = await supabase.auth.getSession();
    bearer = data.session?.access_token || "";
  } catch {}
  const r = await fetch(`/api/stripe/create-session`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-csrf": "t",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(priceId ? { price_id: priceId } : {}),
  });
  if (!r.ok) throw new Error(await r.text());
  const { url } = await r.json();
  return url as string;
}
