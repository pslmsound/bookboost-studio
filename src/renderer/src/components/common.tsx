// Shared display components: book cover, Markdown preview, line chart.
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { Book } from '@shared/schema';
import type { SeriesPoint } from '@shared/domain';
import { formatDate } from '@shared/domain';
import { inlineTokens, parseMarkdown } from '@shared/markdown';
import { coverUrl } from '../lib/api';
import { cx } from './ui';

// ---------- Cover ----------
export function Cover({ book, className }: { book: Pick<Book, 'title' | 'authorName' | 'coverFile'>; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [ref, width] = useWidth<HTMLDivElement>();
  useEffect(() => setFailed(false), [book.coverFile]);
  if (book.coverFile && !failed) {
    return (
      <img
        src={coverUrl(book.coverFile)}
        alt={`Cover of ${book.title}`}
        onError={() => setFailed(true)}
        className={cx('aspect-[2/3] rounded-[3px] border border-line-strong object-cover shadow-card', className)}
      />
    );
  }
  // Typographic placeholder when no cover image has been added. Text scales with the cover.
  const small = width > 0 && width < 64;
  return (
    <div
      ref={ref}
      role="img"
      aria-label={`${book.title || 'Untitled'}, no cover image`}
      className={cx(
        'flex aspect-[2/3] flex-col justify-between overflow-hidden rounded-[3px] border border-line-strong bg-gradient-to-b from-ink-750 to-ink-800 shadow-card',
        className,
      )}
      style={{ padding: Math.max(4, width * 0.1) }}
    >
      <div className="h-px bg-gold/70" style={{ width: small ? '60%' : '34%' }} />
      {small ? (
        <p className="text-center font-serif leading-none text-gold-pale" style={{ fontSize: width * 0.5 }}>
          {(book.title || 'U').trim().charAt(0).toUpperCase()}
        </p>
      ) : (
        <p className="line-clamp-4 font-serif font-medium text-ivory" style={{ fontSize: Math.max(11, width * 0.155), lineHeight: 1.08 }}>
          {book.title || 'Untitled'}
        </p>
      )}
      {small ? (
        <div className="h-px self-end bg-gold/40" style={{ width: '60%' }} />
      ) : (
        <p className="truncate uppercase text-ivory-mute" style={{ fontSize: Math.max(7, width * 0.058), letterSpacing: '0.16em' }}>
          {book.authorName}
        </p>
      )}
    </div>
  );
}

// ---------- Markdown preview ----------
function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineTokens(text).map((t, i) =>
        t.bold ? <strong key={i} className="font-semibold text-ivory">{t.text}</strong> : t.italic ? <em key={i}>{t.text}</em> : <Fragment key={i}>{t.text}</Fragment>,
      )}
    </>
  );
}

export function Markdown({ source }: { source: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  if (blocks.length === 0) return <p className="text-[13px] text-ivory-mute">Nothing to preview yet.</p>;
  return (
    <div className="prose-draft select-text">
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3';
          return (
            <Tag key={i}>
              <Inline text={block.text} />
            </Tag>
          );
        }
        if (block.type === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul';
          return (
            <Tag key={i}>
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inline text={item} />
                </li>
              ))}
            </Tag>
          );
        }
        if (block.type === 'rule') return <hr key={i} />;
        return (
          <p key={i}>
            <Inline text={block.text} />
          </p>
        );
      })}
    </div>
  );
}

// ---------- Line chart ----------
function useWidth<T extends HTMLElement>() {
  // A callback ref, so measuring starts whenever the element appears,
  // including when a component switches from an image to a placeholder.
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!node) return;
    setWidth(Math.floor(node.getBoundingClientRect().width));
    const observer = new ResizeObserver(() => setWidth(Math.floor(node.getBoundingClientRect().width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, width] as const;
}

function niceMax(value: number): number {
  if (value <= 0) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

export function LineChart({
  points,
  height = 220,
  label,
  formatValue = (v) => String(v),
}: {
  points: SeriesPoint[];
  height?: number;
  label: string;
  formatValue?: (value: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { top: 14, right: 12, bottom: 26, left: 46 };
  const innerW = Math.max(10, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(...points.map((p) => p.value), 0));
  // Sparse series read better as bars: a line would dip to zero between entries.
  const filled = points.filter((p) => p.value > 0).length;
  const bars = points.length < 3 || filled / points.length < 0.7;
  const slot = innerW / Math.max(points.length, 1);
  const barWidth = Math.max(2, Math.min(18, slot * 0.6));
  const x = (i: number) =>
    bars ? pad.left + slot * (i + 0.5) : pad.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = points.length > 1 ? `${path} L${x(points.length - 1).toFixed(1)},${pad.top + innerH} L${x(0).toFixed(1)},${pad.top + innerH} Z` : '';
  const total = points.reduce((sum, p) => sum + p.value, 0);
  const ticks = [0, 0.5, 1].map((t) => max * t);
  const xLabels = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, i) => i);
  const active = hover !== null ? points[hover] : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${label}. ${points.length} points from ${formatDate(points[0]?.date ?? '')} to ${formatDate(points[points.length - 1]?.date ?? '')}, total ${formatValue(total)}.`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left - pad.left) / innerW;
            const index = bars ? Math.floor(ratio * points.length) : Math.round(ratio * (points.length - 1));
            setHover(Math.max(0, Math.min(points.length - 1, index)));
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="#2B2A27" strokeWidth={1} />
              <text x={pad.left - 10} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#8F8A7E">
                {formatValue(t)}
              </text>
            </g>
          ))}
          {bars ? (
            points.map((p, i) =>
              p.value > 0 ? (
                <rect
                  key={p.date}
                  x={x(i) - barWidth / 2}
                  y={y(p.value)}
                  width={barWidth}
                  height={Math.max(1, pad.top + innerH - y(p.value))}
                  rx={Math.min(2, barWidth / 2)}
                  fill="#C9AE80"
                  opacity={hover === null || hover === i ? 0.85 : 0.45}
                />
              ) : null,
            )
          ) : (
            <>
              {area && <path d={area} fill="#C9AE80" opacity={0.07} />}
              <path d={path} fill="none" stroke="#C9AE80" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
            </>
          )}
          {xLabels.map((i) => (
            <text key={i} x={x(i)} y={height - 6} fontSize={11} fill="#8F8A7E" textAnchor={bars ? 'middle' : i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>
              {formatDate(points[i].date)}
            </text>
          ))}
          {active && hover !== null && (
            <g>
              {!bars && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke="#3A3935" strokeWidth={1} />}
              {!bars && <circle cx={x(hover)} cy={y(active.value)} r={4} fill="#131312" stroke="#C9AE80" strokeWidth={1.6} />}
            </g>
          )}
        </svg>
      )}
      {active && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-line-strong bg-ink-800 px-2.5 py-1.5 text-[12px] shadow-modal"
          style={{ left: Math.max(60, Math.min(width - 60, x(hover))) }}
        >
          <span className="text-ivory-mute">{formatDate(active.date)}</span>
          <span className="ml-2 font-semibold text-ivory">{formatValue(active.value)}</span>
        </div>
      )}
    </div>
  );
}
