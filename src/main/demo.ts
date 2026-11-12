// Demo mode. Creates one clearly fictional book with sample activity so a
// new user can explore the app. Every record belongs to a book flagged
// isDemo, the interface labels it as sample data, and turning demo mode off
// deletes all of it.
import type { Repository } from './repository';
import { addDays, todayISO } from '@shared/domain';

export function enableDemo(repo: Repository): string {
  const existing = repo.list('books').find((b) => b.isDemo);
  if (existing) {
    repo.updateSettings({ demoMode: true, activeBookId: existing.id });
    return existing.id;
  }
  const today = todayISO();
  const d = (offset: number) => addDays(today, offset);

  return repo.database.transaction(() => {
    const book = repo.create('books', {
      title: 'The Salt Road',
      subtitle: 'A Novel (sample book)',
      authorName: 'Sample Author',
      genre: 'Literary historical fiction',
      audience: 'Readers of character driven historical fiction, book clubs, and fans of quiet coastal settings.',
      summary:
        'In 1911, a lighthouse keeper\'s daughter inherits a ledger of debts owed to her family by half the town. As she decides which to collect and which to forgive, she uncovers the bargain that built the harbor. This is sample text for demonstration only.',
      tone: 'Warm, observant and unhurried. Plain language with the occasional lyrical line. Never salesy.',
      goals: 'Build a newsletter list before launch, secure early reviews, and book three podcast conversations.',
      channels: ['Instagram', 'Newsletter', 'Podcasts', 'Goodreads'],
      purchaseLinks: [],
      publicationDate: d(42),
      isDemo: true,
    });

    const launch = repo.create('campaigns', {
      bookId: book.id,
      name: 'Launch season',
      objective: 'Reach launch week with early reviews and an engaged newsletter list.',
      audience: 'Historical fiction readers and book clubs',
      channels: ['Instagram', 'Newsletter', 'Goodreads'],
      startDate: d(-21),
      endDate: d(56),
      budgetCents: 120000,
      spentCents: 38500,
      status: 'active',
    });
    const podcast = repo.create('campaigns', {
      bookId: book.id,
      name: 'Podcast conversations',
      objective: 'Book three guest appearances on shows about books and history.',
      audience: 'Podcast listeners who enjoy author interviews',
      channels: ['Podcasts'],
      startDate: d(-7),
      endDate: d(70),
      budgetCents: 0,
      status: 'planning',
    });

    const tasks: [string, string, number, boolean, boolean][] = [
      [launch.id, 'Finalize cover reveal graphics', -14, true, false],
      [launch.id, 'Send advance copies to early readers', -9, true, true],
      [launch.id, 'Write three launch week newsletters', 5, false, false],
      [launch.id, 'Update retailer book description', -1, false, false],
      [launch.id, 'Launch day', 42, false, true],
      [podcast.id, 'Shortlist ten suitable shows', -3, true, false],
      [podcast.id, 'Draft a pitch for each shortlisted show', 6, false, false],
      [podcast.id, 'First conversation booked', 28, false, true],
    ];
    tasks.forEach(([campaignId, title, offset, done, isMilestone], i) =>
      repo.create('tasks', { bookId: book.id, campaignId, title, dueDate: d(offset), done, isMilestone, sortOrder: i }),
    );

    const caption = repo.create('drafts', {
      bookId: book.id,
      kind: 'social_caption',
      title: 'Cover reveal caption',
      body: 'Some stories begin with a storm. This one begins with a ledger.\n\nThe cover for The Salt Road is here, and I could not be happier with it. More soon.\n\n(Sample draft for demonstration.)',
      status: 'approved',
      campaignId: launch.id,
    });
    repo.create('drafts', {
      bookId: book.id,
      kind: 'newsletter',
      title: 'Newsletter: why I wrote this book',
      subject: 'The ledger that started it all',
      body: 'Dear reader,\n\nA few years ago I found an old account book in a harbor museum...\n\n(Sample draft for demonstration.)',
      status: 'in_review',
      campaignId: launch.id,
    });
    repo.create('drafts', {
      bookId: book.id,
      kind: 'book_description',
      title: 'Retailer description, version 2',
      body: 'She inherited a lighthouse, a ledger, and every debt in town.\n\n(Sample draft for demonstration.)',
      status: 'draft',
    });

    const calendar: [string, string, number, 'draft' | 'approved' | 'posted', string][] = [
      ['Cover reveal', 'Instagram', -6, 'posted', caption.id],
      ['Behind the research: harbor archives', 'Instagram', 2, 'approved', ''],
      ['Newsletter: why I wrote this book', 'Newsletter', 4, 'draft', ''],
      ['Goodreads giveaway announcement', 'Goodreads', 9, 'draft', ''],
      ['Preorder reminder', 'Instagram', 16, 'draft', ''],
    ];
    for (const [title, channel, offset, status, draftId] of calendar) {
      repo.create('calendarItems', {
        bookId: book.id,
        campaignId: launch.id,
        draftId,
        title,
        channel,
        scheduledDate: d(offset),
        scheduledTime: '09:00',
        status,
      });
    }

    const contacts: Parameters<Repository['create']>[1][] = [
      { bookId: book.id, name: 'Sample Reviewer', outlet: 'Harbor Light Reviews (fictional)', type: 'reviewer', status: 'pitched', consent: 'public_contact', lastContacted: d(-5), nextFollowUp: d(3), notes: 'Sample contact. Accepts historical fiction through a public submission form.' },
      { bookId: book.id, name: 'Sample Host', outlet: 'Pages and Tides Podcast (fictional)', type: 'podcast', status: 'ready', consent: 'public_contact', notes: 'Sample contact.' },
      { bookId: book.id, name: 'Sample Bookseller', outlet: 'Lantern Street Books (fictional)', type: 'bookstore', status: 'responded', consent: 'opted_in', lastContacted: d(-2), notes: 'Sample contact. Interested in a launch week event.' },
      { bookId: book.id, name: 'Sample Journalist', outlet: 'Coastal Weekly (fictional)', type: 'media', status: 'prospect', consent: 'unknown', notes: 'Sample contact.' },
      { bookId: book.id, name: 'Sample Club Organizer', outlet: 'Tidewater Book Club (fictional)', type: 'other', status: 'booked', consent: 'opted_in', lastContacted: d(-10), notes: 'Sample contact. Visit confirmed.' },
    ];
    for (const contact of contacts) repo.create('contacts', contact as never);

    // Sample numbers. They are recorded as estimates so nothing reads as verified.
    for (let i = 27; i >= 0; i--) {
      const wave = Math.round(8 + 6 * Math.sin(i / 3) + (27 - i) * 0.6);
      repo.create('metrics', { bookId: book.id, date: d(-i), metric: 'link_clicks', value: wave * 3, channel: 'Instagram', source: 'estimate', note: 'Sample data' });
      if (i % 2 === 0) {
        repo.create('metrics', { bookId: book.id, date: d(-i), metric: 'subscribers', value: Math.max(1, Math.round(wave / 4)), channel: 'Newsletter', source: 'estimate', note: 'Sample data' });
      }
      if (i % 3 === 0) {
        repo.create('metrics', { bookId: book.id, date: d(-i), metric: 'units_sold', value: Math.max(1, Math.round(wave / 3)), channel: 'Preorders', source: 'estimate', note: 'Sample data' });
      }
    }

    repo.updateSettings({ demoMode: true, activeBookId: book.id });
    return book.id;
  });
}

export function disableDemo(repo: Repository): void {
  repo.database.transaction(() => {
    for (const book of repo.list('books')) if (book.isDemo) repo.delete('books', book.id);
    const settings = repo.getSettings();
    const remaining = repo.list('books').filter((b) => b.status === 'active');
    const stillValid = remaining.some((b) => b.id === settings.activeBookId);
    repo.updateSettings({ demoMode: false, activeBookId: stillValid ? settings.activeBookId : (remaining[0]?.id ?? '') });
  });
}
