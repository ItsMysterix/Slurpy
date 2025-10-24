export async function getCheckoutUrl(priceId?: string) {
  const r = await fetch(`/api/stripe/create-session`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf": "t" },
    body: JSON.stringify(priceId ? { price_id: priceId } : {}),
  });
  if (!r.ok) throw new Error(await r.text());
  const { url } = await r.json();
  return url as string;
}
