// Prompt construction for AI assisted writing. Pure and unit tested.
// Nothing here calls a network. The main process sends the result to
// the provider the author has configured.
import type { Book, Contact, DraftKind, Settings } from './schema';

export const SYSTEM_PROMPT = [
  'You are an experienced book publicist and marketing copywriter working privately with one author.',
  'Write for real readers in the brand voice described. Be specific, warm and credible.',
  'Hard rules:',
  '1. Never invent reviews, endorsements, awards, bestseller claims, sales figures, statistics or quotes.',
  '2. When a fact is missing, write a clear placeholder in square brackets, for example [publication date].',
  '3. Do not promise results. Do not use hype, clickbait or pressure tactics.',
  '4. Do not use emojis or hashtags unless the brief asks for them.',
  '5. Return only the requested piece, ready to edit. No preamble and no closing commentary.',
].join('\n');

const line = (labelText: string, value: string) => (value.trim() ? `${labelText}: ${value.trim()}` : '');

export function bookContext(book: Book, author: Settings['author']): string {
  const links = book.purchaseLinks
    .filter((l) => l.url)
    .map((l) => `${l.label || 'Link'} ${l.url}`)
    .join('; ');
  return [
    'BOOK DETAILS',
    line('Title', book.title),
    line('Subtitle', book.subtitle),
    line('Author', book.authorName),
    line('Genre', book.genre),
    line('Publication date', book.publicationDate),
    line('Target readers', book.audience),
    line('Summary', book.summary),
    line('Brand voice and tone', book.tone),
    line('Marketing goals', book.goals),
    line('Channels in use', book.channels.join(', ')),
    line('Where to buy', links),
    line('About the author', author.bio),
    line('Author website', author.website),
  ]
    .filter(Boolean)
    .join('\n');
}

interface KindGuide {
  instruction: string;
  placeholder: string;
}

export const CONTENT_GUIDES: Partial<Record<DraftKind, KindGuide>> = {
  social_caption: {
    instruction:
      'Write three distinct social captions for the channel named in the brief. Each should open with a strong first line, stay within the norms of that channel, and end with one clear, low pressure call to action. Separate the options with a line containing only three dashes.',
    placeholder: 'Channel, the angle or moment to highlight, and anything to mention.',
  },
  launch_announcement: {
    instruction:
      'Write a launch announcement of 150 to 250 words that tells readers what the book is, who it is for, why it matters now, and where to get it.',
    placeholder: 'Launch date, any launch offer or event, and where this will be published.',
  },
  newsletter: {
    instruction:
      'Write a newsletter issue with a subject line, a preview line, and a body of 250 to 400 words. Use a personal, first person voice from the author. Include one primary call to action.',
    placeholder: 'What this issue is about and the one action you want readers to take.',
  },
  ad_copy: {
    instruction:
      'Write four ad variations. For each give a headline of 40 characters or fewer, primary text of 125 characters or fewer, and a call to action. Label each variation. Keep every claim factual and verifiable.',
    placeholder: 'Ad platform, the reader you want to reach, and the offer if there is one.',
  },
  press_release: {
    instruction:
      'Write a press release in standard format: headline, dateline, lead paragraph, two to three body paragraphs, an "About the author" section and media contact placeholders. Use placeholders for any quote rather than inventing one.',
    placeholder: 'The news hook, release date, and media contact details.',
  },
  book_description: {
    instruction:
      'Write a retailer book description of 150 to 220 words with a compelling hook line, a clear sense of the stakes or promise, and a closing line that invites the reader in. Do not reveal major spoilers.',
    placeholder: 'Any comparable titles, key themes or elements to emphasize.',
  },
  podcast_pitch: {
    instruction:
      'Write a concise podcast guest pitch email of 150 to 200 words with a subject line, a specific reason this show fits, three proposed talking points and a courteous close. Leave a placeholder for a detail about a recent episode so the author can personalize it.',
    placeholder: 'The show name, its audience, and topics the author can speak on.',
  },
  video_script: {
    instruction:
      'Write a short form vertical video script of 30 to 45 seconds. Provide a hook for the first three seconds, then numbered beats with spoken lines and brief on screen text suggestions, then a closing call to action.',
    placeholder: 'The idea for the video, the platform, and the tone.',
  },
  email: {
    instruction:
      'Write a marketing email to the author\'s own subscriber list. Start with "Subject:" and "Preview:" lines, then the body of 180 to 320 words with one primary call to action and a plain sign off.',
    placeholder: 'Purpose of the email, the audience segment, and the action you want.',
  },
  outreach_pitch: {
    instruction:
      'Write a personal, respectful pitch email of 130 to 190 words with a subject line. Be specific about why this person or outlet is a fit, state the ask plainly, and make it easy to decline. Leave a bracketed placeholder for one personal detail the author should add.',
    placeholder: 'What you are asking for, such as a review copy, an interview or coverage.',
  },
};

export function contentPrompt(input: {
  book: Book;
  author: Settings['author'];
  kind: DraftKind;
  brief: string;
  contact?: Pick<Contact, 'name' | 'outlet' | 'type' | 'notes'>;
}): string {
  const guide = CONTENT_GUIDES[input.kind];
  const parts = [bookContext(input.book, input.author), '', 'TASK', guide?.instruction ?? 'Write the requested marketing copy.'];
  if (input.contact) {
    parts.push(
      '',
      'RECIPIENT',
      line('Name', input.contact.name),
      line('Outlet', input.contact.outlet),
      line('Type', input.contact.type),
      line('Notes from the author', input.contact.notes),
    );
  }
  if (input.brief.trim()) parts.push('', 'BRIEF FROM THE AUTHOR', input.brief.trim());
  return parts.filter((p, i, all) => p !== '' || all[i - 1] !== '').join('\n');
}

export const ASSISTANT_TEMPLATES = {
  marketing_plan: {
    label: 'Marketing plan',
    description: 'A phased plan with goals, channels, weekly actions and measures.',
    kind: 'marketing_plan' as DraftKind,
    instruction:
      'Create a structured 90 day book marketing plan in Markdown. Use these sections: Positioning (two or three sentences), Target readers, Goals (specific and measurable, using placeholders where numbers are unknown), Channel strategy (one short paragraph per channel in use), Phase 1 Foundation (weeks 1 to 4), Phase 2 Launch or push (weeks 5 to 8), Phase 3 Sustain (weeks 9 to 13) each with a weekly checklist, Budget guidance by tier, and What to measure. Keep it realistic for a single author without a team.',
  },
  brand_voice: {
    label: 'Brand voice guide',
    description: 'Voice principles, vocabulary and examples to keep copy consistent.',
    kind: 'brand_voice' as DraftKind,
    instruction:
      'Create a brand voice guide in Markdown for this author and book. Include: Voice in one sentence, Three to four voice principles each with a "sounds like" and "does not sound like" example, Vocabulary to favor and to avoid, Tone adjustments by channel in use, and Three sample lines written in the voice.',
  },
  recommendations: {
    label: 'Campaign recommendations',
    description: 'Three campaign ideas matched to the book, audience and goals.',
    kind: 'recommendations' as DraftKind,
    instruction:
      'Recommend three distinct marketing campaigns for this book in Markdown. For each give: a name, the objective, the audience, the channels, a four to six step outline, an effort estimate (low, medium or high), a suggested budget range and how to judge whether it worked. Order them by expected value for the effort.',
  },
  question: {
    label: 'Ask a question',
    description: 'Get focused advice on a specific marketing question.',
    kind: 'note' as DraftKind,
    instruction:
      'Answer the author\'s question with practical, specific advice for this book. Use short Markdown sections. If the answer depends on facts you do not have, say what to check.',
  },
} as const;
export type AssistantTemplate = keyof typeof ASSISTANT_TEMPLATES;

export function assistantPrompt(input: {
  book: Book;
  author: Settings['author'];
  template: AssistantTemplate;
  question: string;
}): string {
  const template = ASSISTANT_TEMPLATES[input.template];
  const parts = [bookContext(input.book, input.author), '', 'TASK', template.instruction];
  if (input.question.trim()) {
    parts.push('', input.template === 'question' ? 'QUESTION' : 'ADDITIONAL DIRECTION FROM THE AUTHOR', input.question.trim());
  }
  return parts.join('\n');
}

export function revisePrompt(input: { book: Book; author: Settings['author']; body: string; instruction: string }): string {
  return [
    bookContext(input.book, input.author),
    '',
    'TASK',
    'Revise the draft below according to the author\'s instruction. Keep everything that already works, preserve the format, and return the full revised draft only.',
    '',
    'INSTRUCTION',
    input.instruction.trim(),
    '',
    'CURRENT DRAFT',
    input.body,
  ].join('\n');
}
