import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const DEFAULT_DURATION = 3000;

export function TransientMessage({
  children,
  className = "",
  duration = DEFAULT_DURATION,
  icon = null,
  messageKey,
  onDismiss,
  role = "status",
}) {
  const hasChildren = Boolean(children);
  const resolvedMessageKey =
    messageKey ?? (typeof children === "string" ? children : hasChildren);
  const [dismissedKey, setDismissedKey] = useState(null);
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!hasChildren) return undefined;

    const timer = window.setTimeout(() => {
      setDismissedKey(resolvedMessageKey);
      dismissRef.current?.();
    }, duration);

    return () => window.clearTimeout(timer);
  }, [duration, hasChildren, resolvedMessageKey]);

  if (!hasChildren || dismissedKey === resolvedMessageKey) return null;

  function dismiss() {
    setDismissedKey(resolvedMessageKey);
    dismissRef.current?.();
  }

  return (
    <div className={`transient-message ${className}`.trim()} role={role}>
      {icon && <span className="transient-message-icon">{icon}</span>}
      <span className="transient-message-copy">{children}</span>
      <button
        type="button"
        className="transient-message-close"
        aria-label="Cerrar mensaje"
        title="Cerrar mensaje"
        onClick={dismiss}
      >
        <X size={13} />
      </button>
    </div>
  );
}
