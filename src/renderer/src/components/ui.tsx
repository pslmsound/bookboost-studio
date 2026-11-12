// Shared interface primitives. Everything is keyboard reachable and uses
// the design tokens from tailwind.config.cjs.
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Loader2, X, type LucideIcon } from 'lucide-react';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

// ---------- Buttons ----------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  icon?: LucideIcon;
  loading?: boolean;
}
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-gold text-ink-950 hover:bg-gold-pale font-semibold',
  secondary: 'border border-line-strong text-ivory hover:border-gold/60 hover:bg-ink-800',
  ghost: 'text-ivory-dim hover:text-ivory hover:bg-ink-800',
  danger: 'border border-danger/40 text-danger hover:bg-danger/10',
};
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, loading, children, className, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'h-8 px-3 text-[12.5px]' : 'h-9 px-4 text-[13px]',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="animate-spin" aria-hidden /> : Icon ? <Icon size={15} strokeWidth={1.75} aria-hidden /> : null}
      {children}
    </button>
  );
});

export function IconButton({
  icon: Icon,
  label,
  className,
  ...rest
}: { icon: LucideIcon; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ivory-mute transition-colors hover:bg-ink-800 hover:text-ivory disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

// ---------- Form fields ----------
export function Field({
  label,
  hint,
  error,
  children,
  className,
  optional,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
  className?: string;
  optional?: boolean;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-[12.5px] font-medium text-ivory-dim">
        <span>{label}</span>
        {optional && <span className="text-[11.5px] font-normal text-ivory-mute">Optional</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-[12px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[12px] leading-5 text-ivory-mute">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx('field-input h-9', rest['aria-invalid'] && 'border-danger/60', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 4, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cx('field-input resize-y leading-6', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cx('field-input h-9 cursor-pointer appearance-none bg-no-repeat py-0 pr-8', className)} style={SELECT_ARROW} {...rest}>
      {children}
    </select>
  );
});
const SELECT_ARROW = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238F8A7E' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundPosition: 'right 10px center',
};

export function Chips({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = value.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? value.filter((v) => v !== option) : [...value, option])}
            className={cx(
              'h-8 rounded-full border px-3 text-[12.5px] transition-colors',
              active ? 'border-gold/70 bg-gold/10 text-gold-pale' : 'border-line text-ivory-dim hover:border-line-strong hover:text-ivory',
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Surfaces ----------
export function Card({ children, className, as: Tag = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cx('card', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, action, eyebrow }: { title: string; action?: ReactNode; eyebrow?: string }) {
  return (
    <header className="flex items-center justify-between gap-4 px-5 pb-3 pt-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-0.5">{eyebrow}</p>}
        <h2 className="truncate text-[13.5px] font-semibold tracking-wide text-ivory">{title}</h2>
      </div>
      {action}
    </header>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 max-w-2xl">
        <p className="eyebrow mb-2">{eyebrow}</p>
        <h1 className="font-serif text-[34px] font-medium leading-none tracking-tight text-ivory">{title}</h1>
        {description && <p className="mt-3 text-[13.5px] leading-6 text-ivory-dim">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const TONES = {
  neutral: 'border-line-strong text-ivory-dim',
  gold: 'border-gold/40 text-gold-pale bg-gold/[0.07]',
  olive: 'border-olive/40 text-olive-pale bg-olive/[0.08]',
  ok: 'border-ok/40 text-ok bg-ok/[0.07]',
  warn: 'border-warn/40 text-warn bg-warn/[0.07]',
  danger: 'border-danger/40 text-danger bg-danger/[0.07]',
} as const;
export type Tone = keyof typeof TONES;
export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cx('inline-flex h-[22px] items-center whitespace-nowrap rounded-full border px-2.5 text-[11.5px] font-medium', TONES[tone], className)}>
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<string, Tone> = {
  active: 'ok', planning: 'gold', paused: 'warn', completed: 'olive', archived: 'neutral',
  draft: 'neutral', in_review: 'warn', approved: 'gold', posted: 'ok',
  prospect: 'neutral', ready: 'gold', pitched: 'olive', follow_up: 'warn', responded: 'ok', booked: 'ok', declined: 'neutral',
  verified: 'ok', user_entered: 'neutral', estimate: 'warn',
  unknown: 'neutral', public_contact: 'olive', opted_in: 'ok', do_not_contact: 'danger',
};

export function EmptyState({ icon: Icon, title, body, action, compact }: { icon: LucideIcon; title: string; body: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx('flex flex-col items-center justify-center text-center', compact ? 'px-6 py-8' : 'px-8 py-16')}>
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-line-strong text-gold">
        <Icon size={18} strokeWidth={1.5} aria-hidden />
      </div>
      <h3 className={cx('font-serif text-ivory', compact ? 'text-[19px]' : 'text-[24px]')}>{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13px] leading-6 text-ivory-dim">{body}</p>
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2.5 py-14 text-[13px] text-ivory-mute">
      <Loader2 size={16} className="animate-spin text-gold" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-4 rounded-md border border-danger/30 bg-danger/[0.06] px-4 py-3 text-[13px] text-danger">
      <span>{message}</span>
      {onRetry && (
        <Button size="sm" variant="ghost" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Notice({ children, tone = 'gold', icon: Icon }: { children: ReactNode; tone?: 'gold' | 'olive' | 'warn'; icon?: LucideIcon }) {
  const tones = { gold: 'border-gold/25 bg-gold/[0.05] text-ivory-dim', olive: 'border-olive/30 bg-olive/[0.06] text-ivory-dim', warn: 'border-warn/30 bg-warn/[0.06] text-ivory-dim' };
  return (
    <div className={cx('flex items-start gap-3 rounded-md border px-4 py-3 text-[12.5px] leading-5', tones[tone])}>
      {Icon && <Icon size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-gold" aria-hidden />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ProgressBar({ percent, tone = 'gold', label }: { percent: number; tone?: 'gold' | 'olive' | 'danger'; label: string }) {
  const fill = { gold: 'bg-gold', olive: 'bg-olive', danger: 'bg-danger' }[tone];
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100} className="h-1 w-full overflow-hidden rounded-full bg-ink-700">
      <div className={cx('h-full rounded-full transition-[width] duration-500', fill)} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-ink-900 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-7 rounded px-3 text-[12.5px] transition-colors',
            value === o.value ? 'bg-ink-700 text-ivory' : 'text-ivory-mute hover:text-ivory',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Modal ----------
const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
  dismissable = true,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  dismissable?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = panel.current;
    const first = node?.querySelector<HTMLElement>('[data-autofocus]') ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab' && node) {
        const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
        if (items.length === 0) return;
        const firstItem = items[0];
        const lastItem = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstItem) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && document.activeElement === lastItem) {
          e.preventDefault();
          firstItem.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [dismissable]);

  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/65" onClick={dismissable ? onClose : undefined} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx('animate-rise relative flex max-h-full w-full flex-col rounded-xl border border-line-strong bg-ink-850 shadow-modal outline-none', width)}
      >
        <header className="flex items-start justify-between gap-6 border-b border-line px-6 pb-4 pt-5">
          <div>
            <h2 id={titleId} className="font-serif text-[24px] leading-tight text-ivory">
              {title}
            </h2>
            {description && <p className="mt-1 text-[13px] leading-5 text-ivory-dim">{description}</p>}
          </div>
          {dismissable && <IconButton icon={X} label="Close" onClick={onClose} className="-mr-2 -mt-1" />}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = true,
  busy,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} data-autofocus>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[13.5px] leading-6 text-ivory-dim">{body}</div>
    </Modal>
  );
}
