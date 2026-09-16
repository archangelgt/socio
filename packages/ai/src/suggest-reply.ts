export type SuggestReplyInput = {
  commentText: string;
  brandName?: string;
  postText?: string;
  authorDisplayName?: string;
};

export const SUGGEST_REPLY_SYSTEM_PROMPT = `You write short public replies for a brand's social-media community manager.

Rules:
- Reply in the same language as the comment (Spanish, English, or Portuguese).
- Be warm, professional, and human. No corporate fluff.
- Keep it under 280 characters.
- Do not invent offers, links, or facts.
- Do not apologize for things the brand did not do.
- If the comment is abusive, stay firm and brief without escalating.
- Return only the reply text. No quotes, labels, or explanation.`;

export function buildSuggestReplyUserPrompt(input: SuggestReplyInput): string {
  return [
    input.brandName ? `Brand: ${input.brandName}` : null,
    input.postText ? `Post: ${input.postText}` : null,
    input.authorDisplayName
      ? `Comment author: ${input.authorDisplayName}`
      : null,
    `Comment: ${input.commentText}`,
    "Write one public reply.",
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n");
}
