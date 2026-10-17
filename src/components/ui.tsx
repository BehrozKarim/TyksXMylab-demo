import type { ComponentProps, HTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, ArrowRight, LoaderCircle, X } from 'lucide-react';

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  return <button className={`button button--${variant} ${className}`} {...props} />;
}
export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'violet' | 'success' | 'warning' | 'danger';
  children: ReactNode;
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
export function Panel({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`panel ${className}`} {...props} />;
}
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Select({
  label,
  id,
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; id: string }) {
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      <select id={id} {...props}>
        {children}
      </select>
    </div>
  );
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <AlertCircle size={22} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function Loading({ label = 'Loading evidence…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status" aria-busy="true">
      <LoaderCircle size={20} className="spin" />
      {label}
    </div>
  );
}
export function ErrorPanel({
  error,
  onRetry,
  title = 'Could not load evidence',
}: {
  error: Error | null;
  onRetry: () => void;
  title?: string;
}) {
  return (
    <div className="error-panel" role="alert">
      <AlertCircle size={20} />
      <div>
        <strong>{title}</strong>
        <p>{error?.message ?? 'Please try again.'}</p>
        <Button onClick={onRetry}>
          Retry <ArrowRight size={15} />
        </Button>
      </div>
    </div>
  );
}
export function RefreshNotice({
  error,
  onRetry,
  pending = false,
  title = 'Could not refresh these results',
}: {
  error: Error | null;
  onRetry: () => void;
  pending?: boolean;
  title?: string;
}) {
  if (!error) return null;
  return (
    <div className="refresh-notice" role="status">
      <AlertCircle size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>Showing the last successful snapshot. Results may be out of date.</p>
        <p className="small-note">{error.message}</p>
      </div>
      <Button disabled={pending} onClick={onRetry}>
        {pending ? 'Retrying…' : 'Retry refresh'}
      </Button>
    </div>
  );
}
export function Drawer({
  open,
  onClose,
  onClosed,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onClosed?: () => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay" />
        <Dialog.Content
          className="drawer-content"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => {
              const trigger = document.querySelector<HTMLElement>('[data-drawer-return="true"]');
              trigger?.focus();
              trigger?.removeAttribute('data-drawer-return');
              onClosed?.();
            });
          }}
        >
          <div className="drawer-heading">
            <div>
              <span className="eyebrow">Ward Evidence</span>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description className="drawer-description">{description}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" className="icon-button" aria-label="Close panel">
                <X size={21} />
              </Button>
            </Dialog.Close>
          </div>
          <div className="drawer-body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function DataTable({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
