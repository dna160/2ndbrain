/**
 * UI primitives (docs/02 §6). Owned, ~small, no component library. Colors/spacing come from
 * CSS variables in styles/tokens.css; interactive states live in styles/app.css.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Chip({ children, tone }: { children: ReactNode; tone?: 'accent' | 'warn' | 'sensitive' }) {
  const color =
    tone === 'accent' ? 'var(--accent)' : tone === 'warn' ? 'var(--warn)' : tone === 'sensitive' ? 'var(--sensitive)' : undefined;
  return (
    <span className="chip" style={color ? { color, borderColor: color } : undefined}>
      {children}
    </span>
  );
}

const STATUS_COLOR: Record<string, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  err: 'var(--err)',
  running: 'var(--accent)',
  idle: 'var(--ink-3)',
};

export function StatusDot({ status, title }: { status: keyof typeof STATUS_COLOR | string; title?: string }) {
  return <span className="dot" title={title} style={{ background: STATUS_COLOR[status] ?? 'var(--ink-3)' }} />;
}

export function MonoBadge({ children }: { children: ReactNode }) {
  return <span className="mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-2)' }}>{children}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Well({ children }: { children: ReactNode }) {
  return <pre className="well">{children}</pre>;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}

export function Button({
  variant = 'ghost',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'ghost' | 'accent' }) {
  return (
    <button className={variant === 'accent' ? 'btn btn-accent' : 'btn'} {...rest}>
      {children}
    </button>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly T[];
  value: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={t === value}
          className="tab"
          onClick={() => onChange(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div>
        <p style={{ marginBottom: 'var(--s3)' }}>{title}</p>
        {action}
      </div>
    </div>
  );
}

export function ConfirmBar({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="confirmbar" role="alertdialog" aria-label={message}>
      <span style={{ flex: 1 }}>{message}</span>
      <Button variant="accent" onClick={onConfirm}>
        {confirmLabel}
      </Button>
      <Button onClick={onCancel}>Cancel</Button>
    </div>
  );
}
