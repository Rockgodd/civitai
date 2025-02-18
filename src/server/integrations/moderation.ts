import { env } from '~/env/server.mjs';

async function moderatePrompt(prompt: string) {
  if (!env.EXTERNAL_MODERATION_TOKEN || !env.EXTERNAL_MODERATION_ENDPOINT)
    return { flagged: false, categories: [] };
  const res = await fetch(env.EXTERNAL_MODERATION_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.EXTERNAL_MODERATION_TOKEN}`,
    },
    body: JSON.stringify({
      input: prompt,
    }),
  });
  if (!res.ok) {
    let message = `External moderation failed: ${res.status} ${res.statusText}`;
    try {
      const body = await res.text();
      message += `\n${body}`;
    } catch (err) {}
    throw new Error(message);
  }

  const { results } = await res.json();
  let flagged = results[0].flagged;
  let categories = Object.entries(results[0].categories)
    .filter(([, v]) => v as boolean)
    .map(([k]) => k);

  // If we have categories
  // Only flag if any of them are found in the results
  if (env.EXTERNAL_MODERATION_CATEGORIES) {
    categories = [];
    for (const [k, v] of Object.entries(env.EXTERNAL_MODERATION_CATEGORIES)) {
      if (results[0].categories[k]) categories.push(v ?? k);
    }
    flagged = categories.length > 0;
  }

  return { flagged, categories };
}

export const extModeration = {
  moderatePrompt,
};
