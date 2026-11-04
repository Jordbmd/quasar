import { t } from "../shared/i18n";
import type { WorkBook, WorkSheet } from "xlsx";
import { utils } from "xlsx";
import { boxSchema, southcoPorts, type BoxDefinition } from "../shared/box";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
type Metadata = NonNullable<BoxDefinition["metadata"]>;
const textFields: Record<string, keyof Metadata> = {
  adressefinaledestination: "address",
  adresse: "address",
  format: "format",
  semainedepartsiamsouhaitee: "departureWeek",
  reftrespafaceacoloris1: "color1",
  reftrespafaceacoloris2: "color2",
  pointdattention: "notes",
};
const flags: Record<string, keyof Metadata> = {
  encastree: "embedded",
  encastre: "embedded",
  fermeturearriere: "rearClosure",
  airsalin: "seaAir",
  sticker: "sticker",
  visitesite: "siteVisit",
};
const counts: Record<string, keyof Metadata> = {
  nombrecolonnes: "columnCount",
  nombremodules: "moduleCount",
  nombredecasiershorsihm: "lockerCount",
};
function pairs(sheet?: WorkSheet) {
  if (!sheet) return [];
  return utils
    .sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      range: "A1:B100",
    })
    .map(([label, value]) => ({
      label: String(label).trim(),
      value: String(value).trim(),
    }))
    .filter((p) => p.label);
}
export function readProductionInfo(
  book: WorkBook,
  base: BoxDefinition,
  filename: string,
): BoxDefinition {
  const infos = pairs(book.Sheets["Infos Box"]);
  const config = pairs(book.Sheets.Config).filter((p) =>
    /^(iddela(box|configdebox)|liendeconfigdebox|encastre|fermeturearriere|southco)/.test(
      normalize(p.label),
    ),
  );
  const values: Record<string, unknown> = {};
  const extras: { label: string; value: string }[] = [];
  const ids = new Set<string>();
  const warnings: string[] = [];
  let name: string | undefined;
  // Infos Box is the descriptive source. Config only supplies missing values.
  for (const { label, value } of [...infos, ...config]) {
    const key = normalize(label);
    if (/^(idbox|iddelabox)$/.test(key)) {
      if (value) ids.add(value);
      continue;
    }
    if (/^(nom|nombox|nomdelabox)$/.test(key)) {
      if (value) name ??= value;
      continue;
    }
    const field = textFields[key] || flags[key] || counts[key];
    if (field) {
      if (flags[key]) {
        const bool = /^(oui|yes|true|1)$/i.test(value)
          ? true
          : /^(non|no|false|0)$/i.test(value)
            ? false
            : undefined;
        if (bool === undefined) {
          if (!(field in values)) values[field] = undefined;
          if (value) extras.push({ label, value });
          continue;
        }
        if (values[field] !== undefined && values[field] !== bool)
          warnings.push(
            `${label} : Infos Box et Config diffèrent ; Infos Box est conservé.`,
          );
        values[field] ??= bool;
      } else if (counts[key]) {
        if (/^\d+$/.test(value)) values[field] ??= Number(value);
        else {
          if (!(field in values)) values[field] = undefined;
          if (value) extras.push({ label, value });
        }
      } else values[field] ??= value;
    } else if (!/^southco/.test(key) && value) extras.push({ label, value });
  }
  if (ids.size > 1)
    throw Error(
      t(
        "Les ID de Box dans Infos Box et Config sont différents. Corrigez le fichier avant l’import.",
      ),
    );
  const id = [...ids][0];
  if (id) values.id = id;
  const modules = config.filter((p) => /^southco\d+$/.test(normalize(p.label)));
  if (modules.length)
    values.southcoModules = modules
      .filter((p) => Number(p.value) > 0)
      .map((p) => Number(normalize(p.label).replace("southco", "")));
  // Compare wiring labels without treating comments or instructions as commands.
  const plan = book.Sheets["Plan de cablage"];
  if (plan) {
    const seen = new Set<string>();
    for (const [cell, entry] of Object.entries(plan)) {
      if (cell.startsWith("!") || !entry || typeof entry.v !== "string")
        continue;
      const match = /^(IHM|XXL|XL|[SMLPO])(\d*)\s+([\s\S]+)$/.exec(
        entry.v.trim(),
      );
      if (!match) {
        if (
          /attention|modifi[ée]/i.test(entry.v) &&
          !extras.some((p) => p.value === entry.v.trim())
        )
          extras.push({
            label: `Note du plan (${cell})`,
            value: entry.v.trim(),
          });
        continue;
      }
      const number = match[1] === "IHM" ? 0 : Number(match[2]);
      const ports = southcoPorts(match[3].replace(/\s+/g, ","));
      const locker = base.lockers.find((l) => l.number === number);
      const canonical = (s: ReturnType<typeof southcoPorts>) =>
        s
          ?.map((p) => `${p.module}:${p.port}`)
          .sort()
          .join(",");
      if (
        ports &&
        locker &&
        canonical(ports) !== canonical(southcoPorts(locker.ports)) &&
        !seen.has(String(number))
      ) {
        warnings.push(
          `Casier ${number} : le plan de câblage diffère de Back office ; les ports de Back office sont conservés.`,
        );
        seen.add(String(number));
      }
    }
  }
  if (infos.length || config.length || plan) values.extra = extras;
  return boxSchema.parse({
    ...base,
    name: name || (id ? `Box ${id}` : base.name),
    nameOrigin: name ? "file" : "fallback",
    metadata: values,
    source: { filename },
    importWarnings: warnings,
  });
}
