import React from "react";
import type { OSDOptions, OSDValues } from "../shared/osd-options";
import { osdPositionLabels, osdTextLabels } from "../shared/osd-options";
import { Field } from "./ui";
export function initialOSD(options: OSDOptions): OSDValues {
  const textType = (
    options.textTypes.includes("Plain") ? "Plain" : options.textTypes[0]
  ) as OSDValues["textType"];
  const position =
    options.positions.find((p) => p !== "Custom") || options.positions[0];
  return {
    textType,
    position,
    ...(textType === "Plain" ? { text: "Caméra" } : {}),
    ...(textType?.includes("Date") && options.dateFormats.length
      ? { dateFormat: options.dateFormats[0] }
      : {}),
    ...(textType?.includes("Time") && options.timeFormats.length
      ? { timeFormat: options.timeFormats[0] }
      : {}),
    ...(position === "Custom" ? { x: 0, y: 0 } : {}),
  };
}
export function OSDFields({
  values,
  options,
  disabled,
  onChange,
  creating = false,
}: {
  values: OSDValues;
  options?: OSDOptions;
  disabled: boolean;
  creating?: boolean;
  onChange: (patch: OSDValues) => void;
}) {
  const type = values.textType || (values.text ? "Plain" : "DateAndTime");
  return (
    <div className="osd-editor">
      {creating && (
        <Field label="Contenu de l’incrustation">
          <select
            disabled={disabled}
            value={type}
            onChange={(e) =>
              onChange({
                text: undefined,
                dateFormat: undefined,
                timeFormat: undefined,
                x: undefined,
                y: undefined,
                ...initialOSD({ ...options!, textTypes: [e.target.value] }),
              })
            }
          >
            {options?.textTypes
              .filter((t) => t in osdTextLabels)
              .map((t) => (
                <option key={t} value={t}>
                  {osdTextLabels[t]}
                </option>
              ))}
          </select>
        </Field>
      )}
      {type === "Plain" && (
        <Field label="Texte personnalisé">
          <input
            disabled={disabled}
            maxLength={128}
            value={values.text ?? ""}
            onChange={(e) => onChange({ text: e.target.value })}
          />
        </Field>
      )}
      {!!options?.positions.length && (
        <Field label="Position de l’incrustation">
          <select
            value={values.position || ""}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                position: e.target.value,
                ...(e.target.value === "Custom"
                  ? { x: values.x ?? 0, y: values.y ?? 0 }
                  : { x: undefined, y: undefined }),
              })
            }
          >
            {!options.positions.includes(values.position || "") && (
              <option value={values.position || ""}>
                {osdPositionLabels[values.position || ""] ||
                  values.position ||
                  "Position actuelle"}
              </option>
            )}
            {options.positions.map((p) => (
              <option key={p} value={p}>
                {osdPositionLabels[p] || p}
              </option>
            ))}
          </select>
        </Field>
      )}
      {values.position === "Custom" &&
        options?.positions.includes("Custom") && (
          <>
            <Field label="Position horizontale">
              <input
                type="number"
                min="-1"
                max="1"
                step="0.05"
                value={values.x ?? 0}
                disabled={disabled}
                onChange={(e) => onChange({ x: Number(e.target.value) })}
              />
            </Field>
            <Field label="Position verticale">
              <input
                type="number"
                min="-1"
                max="1"
                step="0.05"
                value={values.y ?? 0}
                disabled={disabled}
                onChange={(e) => onChange({ y: Number(e.target.value) })}
              />
            </Field>
          </>
        )}
      {type.includes("Date") && !!options?.dateFormats.length && (
        <Field label="Format de date">
          <select
            value={values.dateFormat || ""}
            disabled={disabled}
            onChange={(e) => onChange({ dateFormat: e.target.value })}
          >
            <option value="" disabled>
              Choisir un format
            </option>
            {options.dateFormats.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </Field>
      )}
      {type.includes("Time") && !!options?.timeFormats.length && (
        <Field label="Format de l’heure">
          <select
            value={values.timeFormat || ""}
            disabled={disabled}
            onChange={(e) => onChange({ timeFormat: e.target.value })}
          >
            <option value="" disabled>
              Choisir un format
            </option>
            {options.timeFormats.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </Field>
      )}
      {options?.fontSize && (
        <Field label="Taille du texte (pt)">
          <input
            type="number"
            min={options.fontSize.min}
            max={options.fontSize.max}
            value={values.fontSize ?? ""}
            placeholder="Valeur de la caméra"
            disabled={disabled}
            onChange={(e) =>
              onChange({
                fontSize:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </Field>
      )}
    </div>
  );
}
