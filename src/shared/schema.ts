// Shared data contracts. Every record that crosses the IPC boundary is
// validated against these schemas in the main process before it touches
// the database. The renderer uses the same schemas for form validation.
import { z } from 'zod';

const s = (max: number) => z.string().trim().max(max);
const req = (max: number, message: string) => z.string().trim().min(1, message).max(max);

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid date');
const optDate = z.union([isoDate, z.literal('')]);
const optTime = z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24 hour time like 09:30'), z.literal('')]);
const optUrl = s(500).refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Enter a full link starting with https://');
const optEmail = s(200).refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address');
const ref = z.string().max(64);

export const CHANNEL_OPTIONS = [
  'Instagram', 'Facebook', 'TikTok', 'X', 'LinkedIn', 'YouTube', 'Threads', 'Pinterest',
  'Goodreads', 'Newsletter', 'Blog', 'Podcasts', 'Press', 'Events', 'Paid ads', 'Bookstores',
] as const;

// ---------- Books ----------
export const BOOK_STATUS = ['active', 'archived'] as const;
export const bookSchema = z.object({
  title: req(200, 'Add the book title'),
  subtitle: s(200).default(''),
  authorName: req(120, 'Add the author name'),
  genre: s(120).default(''),
  audience: s(1500).default(''),
  summary: s(8000).default(''),
  tone: s(800).default(''),
  goals: s(2500).default(''),
  channels: z.array(s(40)).max(30).default([]),
  purchaseLinks: z.array(z.object({ label: s(60), url: optUrl })).max(12).default([]),
  publicationDate: optDate.default(''),
  coverFile: z.union([z.string().regex(/^[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$/), z.literal('')]).default(''),
  status: z.enum(BOOK_STATUS).default('active'),
  isDemo: z.boolean().default(false),
});

// ---------- Campaigns and tasks ----------
export const CAMPAIGN_STATUS = ['planning', 'active', 'paused', 'completed'] as const;
export const campaignSchema = z.object({
  bookId: ref.min(1),
  name: req(160, 'Name the campaign'),
  objective: s(1500).default(''),
  audience: s(1500).default(''),
  channels: z.array(s(40)).max(30).default([]),
  startDate: optDate.default(''),
  endDate: optDate.default(''),
  budgetCents: z.number().int().min(0).max(1_000_000_000).default(0),
  spentCents: z.number().int().min(0).max(1_000_000_000).default(0),
  status: z.enum(CAMPAIGN_STATUS).default('planning'),
  notes: s(4000).default(''),
});

export const taskSchema = z.object({
  bookId: ref.min(1),
  campaignId: ref.min(1),
  title: req(240, 'Describe the task'),
  dueDate: optDate.default(''),
  done: z.boolean().default(false),
  isMilestone: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(100000).default(0),
});

// ---------- Drafts (all written content) ----------
export const DRAFT_KINDS = [
  'social_caption', 'launch_announcement', 'newsletter', 'ad_copy', 'press_release',
  'book_description', 'podcast_pitch', 'video_script', 'email', 'outreach_pitch',
  'marketing_plan', 'brand_voice', 'recommendations', 'note',
] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];
export const DRAFT_STATUS = ['draft', 'in_review', 'approved', 'archived'] as const;

export const draftSchema = z.object({
  bookId: ref.min(1),
  kind: z.enum(DRAFT_KINDS),
  title: req(240, 'Give this draft a title'),
  subject: s(300).default(''),
  preheader: s(300).default(''),
  body: z.string().max(80000).default(''),
  status: z.enum(DRAFT_STATUS).default('draft'),
  source: z.enum(['manual', 'ai']).default('manual'),
  aiProvider: s(60).default(''),
  aiModel: s(120).default(''),
  campaignId: ref.default(''),
  contactId: ref.default(''),
});

// ---------- Calendar ----------
export const CALENDAR_STATUS = ['draft', 'approved', 'posted'] as const;
export const calendarItemSchema = z.object({
  bookId: ref.min(1),
  campaignId: ref.default(''),
  draftId: ref.default(''),
  title: req(240, 'Add a title'),
  channel: s(40).default(''),
  scheduledDate: isoDate,
  scheduledTime: optTime.default(''),
  status: z.enum(CALENDAR_STATUS).default('draft'),
  notes: s(4000).default(''),
});

// ---------- Outreach ----------
export const CONTACT_TYPES = ['reviewer', 'podcast', 'media', 'bookstore', 'influencer', 'event', 'other'] as const;
export const CONTACT_STATUS = ['prospect', 'ready', 'pitched', 'follow_up', 'responded', 'booked', 'declined'] as const;
export const CONSENT = ['unknown', 'public_contact', 'opted_in', 'do_not_contact'] as const;
export const contactSchema = z.object({
  bookId: ref.min(1),
  name: req(160, 'Add a name'),
  outlet: s(200).default(''),
  type: z.enum(CONTACT_TYPES).default('reviewer'),
  email: optEmail.default(''),
  url: optUrl.default(''),
  status: z.enum(CONTACT_STATUS).default('prospect'),
  consent: z.enum(CONSENT).default('unknown'),
  lastContacted: optDate.default(''),
  nextFollowUp: optDate.default(''),
  notes: s(6000).default(''),
});

// ---------- Analytics ----------
export const METRIC_TYPES = ['units_sold', 'revenue', 'page_views', 'link_clicks', 'engagements', 'subscribers', 'reviews'] as const;
export type MetricType = (typeof METRIC_TYPES)[number];
export const METRIC_SOURCES = ['verified', 'user_entered', 'estimate'] as const;
export const metricSchema = z.object({
  bookId: ref.min(1),
  date: isoDate,
  metric: z.enum(METRIC_TYPES),
  value: z.number().finite().min(0).max(1e12),
  channel: s(60).default(''),
  source: z.enum(METRIC_SOURCES).default('user_entered'),
  origin: z.enum(['manual', 'csv']).default('manual'),
  note: s(500).default(''),
});

// ---------- Settings ----------
export const AI_PROVIDERS = ['anthropic', 'openai', 'custom'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const settingsSchema = z.object({
  onboardingComplete: z.boolean().default(false),
  activeBookId: ref.default(''),
  demoMode: z.boolean().default(false),
  author: z
    .object({
      name: s(120).default(''),
      bio: s(3000).default(''),
      website: optUrl.default(''),
      email: optEmail.default(''),
    })
    .default({ name: '', bio: '', website: '', email: '' }),
  ai: z
    .object({
      provider: z.enum(AI_PROVIDERS).default('anthropic'),
      model: s(120).default(''),
      baseUrl: s(300).default(''),
      consent: z.boolean().default(false),
    })
    .default({ provider: 'anthropic', model: '', baseUrl: '', consent: false }),
  currency: z.enum(['USD', 'GBP', 'EUR', 'CAD', 'AUD']).default('USD'),
});
export type Settings = z.infer<typeof settingsSchema>;

// ---------- Entity registry ----------
export const ENTITY_SCHEMAS = {
  books: bookSchema,
  campaigns: campaignSchema,
  tasks: taskSchema,
  drafts: draftSchema,
  calendarItems: calendarItemSchema,
  contacts: contactSchema,
  metrics: metricSchema,
} as const;
export type EntityName = keyof typeof ENTITY_SCHEMAS;
export const ENTITY_NAMES = Object.keys(ENTITY_SCHEMAS) as EntityName[];

interface Stored {
  id: string;
  createdAt: string;
  updatedAt: string;
}
export type BookInput = z.input<typeof bookSchema>;
export type Book = z.infer<typeof bookSchema> & Stored;
export type Campaign = z.infer<typeof campaignSchema> & Stored;
export type Task = z.infer<typeof taskSchema> & Stored;
export type Draft = z.infer<typeof draftSchema> & Stored;
export type CalendarItem = z.infer<typeof calendarItemSchema> & Stored;
export type Contact = z.infer<typeof contactSchema> & Stored;
export type Metric = z.infer<typeof metricSchema> & Stored;

export interface EntityMap {
  books: Book;
  campaigns: Campaign;
  tasks: Task;
  drafts: Draft;
  calendarItems: CalendarItem;
  contacts: Contact;
  metrics: Metric;
}
export type EntityInput<K extends EntityName> = z.input<(typeof ENTITY_SCHEMAS)[K]>;

export interface DraftRevision {
  id: string;
  draftId: string;
  body: string;
  createdAt: string;
}

// ---------- Labels ----------
export const DRAFT_KIND_LABELS: Record<DraftKind, string> = {
  social_caption: 'Social caption',
  launch_announcement: 'Launch announcement',
  newsletter: 'Newsletter',
  ad_copy: 'Ad draft',
  press_release: 'Press release',
  book_description: 'Book description',
  podcast_pitch: 'Podcast pitch',
  video_script: 'Short video script',
  email: 'Email',
  outreach_pitch: 'Outreach pitch',
  marketing_plan: 'Marketing plan',
  brand_voice: 'Brand voice guide',
  recommendations: 'Campaign recommendations',
  note: 'Assistant note',
};

export const METRIC_LABELS: Record<MetricType, string> = {
  units_sold: 'Copies sold',
  revenue: 'Revenue',
  page_views: 'Page views',
  link_clicks: 'Link clicks',
  engagements: 'Engagements',
  subscribers: 'New subscribers',
  reviews: 'New reviews',
};

export const STATUS_LABELS: Record<string, string> = {
  active: 'Active', archived: 'Archived', planning: 'Planning', paused: 'Paused', completed: 'Completed',
  draft: 'Draft', in_review: 'In review', approved: 'Approved', posted: 'Posted',
  prospect: 'Prospect', ready: 'Ready to pitch', pitched: 'Pitched', follow_up: 'Follow up',
  responded: 'Responded', booked: 'Booked', declined: 'Declined',
  unknown: 'Not recorded', public_contact: 'Public submission contact', opted_in: 'Opted in',
  do_not_contact: 'Do not contact',
  verified: 'Verified', user_entered: 'Entered by you', estimate: 'Estimate',
  reviewer: 'Reviewer', podcast: 'Podcast', media: 'Media', bookstore: 'Bookstore',
  influencer: 'Creator', event: 'Event', other: 'Other',
};
export const label = (key: string) => STATUS_LABELS[key] ?? key;
