import { t } from "../shared/i18n";
import React from "react";
import { Info } from "lucide-react";
import type { Feature } from "../shared/types";
export const arr = (x: any): any[] =>
  x == null ? [] : Array.isArray(x) ? x : [x];
export const tok = (x: any) => String(x?.$?.token ?? x?.token ?? "");
export { Field, Badge as Status } from "./design-system/components";
export function Capability({ feature }: { feature?: Feature }) {
  return (
    <p className="capability">
      <Info size={15} />
      {(feature?.message && t(feature.message)) ||
        (feature?.state === "loading"
          ? t("Lecture en cours…")
          : feature?.state === "unsupported"
            ? t("Non pris en charge par cette caméra.")
            : feature?.state === "error"
              ? t("Lecture impossible. Relisez la caméra.")
              : t("Connectez une caméra pour lire ses capacités."))}
    </p>
  );
}
export type Run = <T>(
  label: string,
  work: () => Promise<T>,
) => Promise<T | undefined>;
