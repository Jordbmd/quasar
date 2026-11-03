import React, { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

/** Local listbox: identical placement and keyboard behaviour on every OS. */
export function Select({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value?: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const expanded = open && !disabled;
  useEffect(() => {
    if (!expanded) return;
    list.current?.focus();
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [expanded]);
  useEffect(() => {
    if (expanded)
      document
        .getElementById(`${id}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, expanded, id]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const choose = (index: number) => {
    close();
    if (options[index]) onChange(options[index].value);
  };
  const show = () => {
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
    setOpen(true);
  };
  return (
    <div
      className="ds-select"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? id : undefined}
        disabled={disabled}
        onClick={() => (expanded ? close() : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          }
        }}
      >
        <span>
          {options.find((o) => o.value === value)?.label || "Choisir une Box"}
        </span>
        <ChevronDown size={16} />
      </button>
      {expanded && (
        <div
          id={id}
          ref={list}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          aria-activedescendant={`${id}-${active}`}
          className="ds-select-menu"
          onKeyDown={(e) => {
            if (
              [
                "ArrowDown",
                "ArrowUp",
                "Home",
                "End",
                "Enter",
                " ",
                "Escape",
              ].includes(e.key)
            )
              e.preventDefault();
            if (e.key === "Escape") close();
            else if (e.key === "Enter" || e.key === " ") choose(active);
            else if (e.key === "Home") setActive(0);
            else if (e.key === "End") setActive(options.length - 1);
            else if (e.key === "ArrowDown")
              setActive((i) => Math.min(options.length - 1, i + 1));
            else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
            else if (e.key.length === 1) {
              const match = options.findIndex((o) =>
                o.label
                  .toLocaleLowerCase()
                  .startsWith(e.key.toLocaleLowerCase()),
              );
              if (match >= 0) setActive(match);
            }
          }}
        >
          {options.map((o, i) => (
            <div
              role="option"
              aria-selected={o.value === value}
              id={`${id}-${i}`}
              key={o.value}
              className={i === active ? "highlighted" : ""}
              onPointerMove={() => setActive(i)}
              onClick={() => choose(i)}
            >
              <span>{o.label}</span>
              {o.value === value && <Check size={16} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
