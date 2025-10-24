import type { APIRequestContext } from "@playwright/test";

export async function postJSON(api: APIRequestContext, url: string, body: any) {
  return api.post(url, {
    headers: { "content-type": "application/json" },
    data: JSON.stringify(body), // force content-length
  });
}
