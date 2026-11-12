import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, BookOpen, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Book } from '@shared/schema';
import { formatDate } from '@shared/domain';
import { db, errorMessage } from '../lib/api';
import { useApp } from '../lib/store';
import { Badge, Button, Card, ConfirmDialog, EmptyState, IconButton, Modal, PageHeader, Segmented } from '../components/ui';
import { Cover } from '../components/common';
import { BookFields, emptyBook, validateBook, type BookDraft, type BookErrors } from '../components/BookFields';

export function Books() {
  const { books, activeBook, reloadBooks, setActiveBook, settings, updateSettings, toast, pageParam } = useApp();
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [editing, setEditing] = useState<Book | 'new' | null>(pageParam === 'new' ? 'new' : null);
  const [deleting, setDeleting] = useState<Book | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pageParam === 'new') setEditing('new');
  }, [pageParam]);

  const shown = books.filter((b) => b.status === view);
  const archivedCount = books.filter((b) => b.status === 'archived').length;

  const toggleArchive = async (book: Book) => {
    try {
      const status = book.status === 'active' ? 'archived' : 'active';
      await db.update('books', book.id, { status });
      const list = await reloadBooks();
      if (status === 'archived' && settings?.activeBookId === book.id) {
        await updateSettings({ activeBookId: list.find((b) => b.status === 'active')?.id ?? '' });
      }
      toast(status === 'archived' ? `"${book.title}" was archived. Its data is kept.` : `"${book.title}" was restored.`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await db.remove('books', deleting.id);
      await Promise.all([reloadBooks(), updateSettings({})]);
      toast(`"${deleting.title}" and its data were deleted.`);
      setDeleting(null);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Library"
        title="My Books"
        description="Each book has its own campaigns, content, contacts and numbers. Switch between them at any time."
        actions={
          <>
            {archivedCount > 0 && (
              <Segmented
                label="Show books"
                value={view}
                onChange={setView}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'archived', label: `Archived (${archivedCount})` },
                ]}
              />
            )}
            <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
              Add book
            </Button>
          </>
        }
      />

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title={view === 'active' ? 'Your library is empty' : 'No archived books'}
            body={view === 'active' ? 'Add your first book to start planning how it reaches readers.' : 'Books you archive are kept here with all of their data.'}
            action={
              view === 'active' ? (
                <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
                  Add book
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-5">
          {shown.map((book) => {
            const isActive = activeBook?.id === book.id;
            return (
              <li key={book.id}>
                <Card as="article" className="flex h-full gap-5 p-5">
                  <Cover book={book} className="w-[104px] shrink-0 self-start" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {isActive && <Badge tone="gold">Active book</Badge>}
                      {book.isDemo && <Badge tone="warn">Sample</Badge>}
                      {book.status === 'archived' && <Badge>Archived</Badge>}
                    </div>
                    <h2 className="font-serif text-[23px] leading-tight text-ivory">{book.title}</h2>
                    {book.subtitle && <p className="mt-0.5 truncate font-serif text-[15px] italic text-ivory-dim">{book.subtitle}</p>}
                    <p className="mt-2 text-[12.5px] text-ivory-dim">
                      {book.authorName}
                      {book.genre && <span className="text-ivory-mute"> · {book.genre}</span>}
                    </p>
                    {book.publicationDate && (
                      <p className="mt-0.5 text-[12.5px] text-ivory-mute">
                        Publication {formatDate(book.publicationDate, { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    )}
                    <div className="mt-auto flex items-center gap-1 pt-4">
                      {book.status === 'active' && !isActive && (
                        <Button size="sm" icon={Check} onClick={() => void setActiveBook(book.id)}>
                          Make active
                        </Button>
                      )}
                      <span className="flex-1" />
                      <IconButton icon={Pencil} label={`Edit ${book.title}`} onClick={() => setEditing(book)} />
                      <IconButton
                        icon={book.status === 'active' ? Archive : ArchiveRestore}
                        label={book.status === 'active' ? `Archive ${book.title}` : `Restore ${book.title}`}
                        onClick={() => void toggleArchive(book)}
                      />
                      <IconButton icon={Trash2} label={`Delete ${book.title}`} onClick={() => setDeleting(book)} />
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <BookModal book={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete this book?"
          confirmLabel="Delete book and data"
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
          body={
            <>
              <p>
                <span className="text-ivory">"{deleting.title}"</span> will be permanently deleted along with its campaigns, drafts,
                calendar, contacts and analytics.
              </p>
              <p className="mt-3">This cannot be undone. To keep the data but hide the book, archive it instead.</p>
            </>
          }
        />
      )}
    </>
  );
}

export function BookModal({ book, onClose }: { book: Book | null; onClose: () => void }) {
  const { settings, reloadBooks, setActiveBook, activeBook, toast } = useApp();
  const [draft, setDraft] = useState<BookDraft>(() =>
    book
      ? {
          title: book.title, subtitle: book.subtitle, authorName: book.authorName, genre: book.genre, audience: book.audience,
          summary: book.summary, tone: book.tone, goals: book.goals, channels: book.channels,
          purchaseLinks: book.purchaseLinks, publicationDate: book.publicationDate, coverFile: book.coverFile,
        }
      : emptyBook(settings?.author.name ?? ''),
  );
  const [errors, setErrors] = useState<BookErrors>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const { data, errors: found } = validateBook(draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      if (book) {
        await db.update('books', book.id, data);
        toast('Book details saved.');
      } else {
        const created = await db.create('books', data);
        if (!activeBook) await setActiveBook(created.id);
        toast(`"${created.title}" was added to your library.`);
      }
      await reloadBooks();
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={book ? 'Edit book' : 'Add a book'}
      description="These details shape your dashboard and give the assistant its context."
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            {book ? 'Save changes' : 'Add book'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <BookFields value={draft} onChange={(next) => { setDraft(next); if (Object.keys(errors).length) setErrors({}); }} errors={errors} />
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
