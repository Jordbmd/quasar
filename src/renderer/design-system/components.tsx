import React, { useEffect, useId, useRef, useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  MinusCircle,
  CircleDashed,
  LoaderCircle,
  X,
} from "lucide-react";
export function Button({
  variant,
  loading = false,
  children,
  className = "",
  disabled,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "tertiary" | "destructive";
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      type={type}
      className={`${variant === "tertiary" ? "text-button" : variant || ""} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && (
        <LoaderCircle size={16} className="spin" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
export function Panel({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return <section className={`panel ${className}`} {...props} />;
}
export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string;
}) {
  const id = useId();
  const child = React.isValidElement<React.HTMLAttributes<HTMLElement>>(
    children,
  )
    ? React.cloneElement(children, {
        "aria-describedby": hint || error ? id : undefined,
        "aria-invalid": error ? true : undefined,
      })
    : children;
  return (
    <label className={`field${error ? " field-error" : ""}`}>
      <span>{label}</span>
      {child}
      {(error || hint) && (
        <small
          id={id}
          className={error ? "field-message error" : "field-message"}
        >
          {error || hint}
        </small>
      )}
    </label>
  );
}
const icons = {
  success: CheckCircle2,
  danger: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  unsupported: MinusCircle,
  untested: CircleDashed,
  neutral: CircleDashed,
};
export function Badge({
  kind = "neutral",
  children,
}: {
  kind?: string;
  children: React.ReactNode;
}) {
  const Icon = icons[kind as keyof typeof icons] || CircleDashed;
  return (
    <span className={`status ${kind}`}>
      <Icon size={14} aria-hidden="true" />
      {children}
    </span>
  );
}
export function Alert({
  kind = "info",
  children,
  onDismiss,
}: {
  kind?: "info" | "success" | "warning" | "danger";
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const Icon = icons[kind];
  return (
    <div
      className={`banner ${kind === "danger" ? "error" : kind}`}
      role={kind === "danger" ? "alert" : "status"}
    >
      <Icon size={18} aria-hidden="true" />
      <span>{children}</span>
      {onDismiss && (
        <Button
          className="icon-button"
          aria-label={
            kind === "danger" ? "Fermer l’erreur" : "Fermer la notification"
          }
          onClick={onDismiss}
        >
          <X size={16} />
        </Button>
      )}
    </div>
  );
}
export function EmptyState({
  icon: Icon = Info,
  title,
  children,
  action,
  className = "",
}: {
  icon?: React.ElementType;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`empty-state ${className}`}>
      <Icon size={34} aria-hidden="true" />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function Loading({ label = "Chargement" }: { label?: string }) {
  return (
    <div className="operation" role="status">
      <LoaderCircle size={16} className="spin" aria-hidden="true" />
      {label}…
    </div>
  );
}
export function Skeleton({
  label = "Chargement des informations",
}: {
  label?: string;
}) {
  return (
    <div className="skeleton" role="status" aria-label={label}>
      <span />
      <span />
      <span />
    </div>
  );
}
export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  status,
  busy = false,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  status?: React.ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
      previous?.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="quasar-dialog"
      aria-labelledby={id}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const items = [
          ...e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
          ),
        ].filter((el) => el.getClientRects().length);
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id={id}>{title}</h2>
        <Button
          className="icon-button"
          aria-label="Fermer la fenêtre"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </Button>
      </header>
      {status && <div className="dialog-status">{status}</div>}
      <div className="dialog-content">{children}</div>
      {footer && <footer>{footer}</footer>}
    </dialog>
  );
}
export function useConfirmation() {
  const [message, setMessage] = useState("");
  const resolve = useRef<(v: boolean) => void>(undefined);
  const finish = (v: boolean) => {
    resolve.current?.(v);
    resolve.current = undefined;
    setMessage("");
  };
  useEffect(() => () => resolve.current?.(false), []);
  return {
    confirm: (text: string) =>
      new Promise<boolean>((r) => {
        resolve.current?.(false);
        resolve.current = r;
        setMessage(text);
      }),
    dialog: (
      <Modal
        open={!!message}
        title="Modifications non enregistrées"
        onClose={() => finish(false)}
        footer={
          <>
            <Button autoFocus onClick={() => finish(false)}>
              Continuer la modification
            </Button>
            <Button variant="destructive" onClick={() => finish(true)}>
              Abandonner les modifications
            </Button>
          </>
        }
      >
        {message}
      </Modal>
    ),
  };
}
