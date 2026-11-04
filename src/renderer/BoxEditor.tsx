import { t } from "../shared/i18n";
import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { boxSchema, type BoxDefinition, type BoxLocker } from "../shared/box";
import {
  Alert,
  Button,
  Field,
  Modal,
  useConfirmation,
} from "./design-system/components";

const textFields = [
  ["id", "ID de la Box"],
  ["address", "Adresse d’installation"],
  ["format", "Format"],
] as const;
const flags = [
  ["embedded", "Encastrée"],
  ["rearClosure", "Fermeture arrière"],
  ["seaAir", "Air salin"],
] as const;
type DraftLocker = {
  key: number;
  number: string;
  kind: BoxLocker["kind"];
  column: string;
  zone: string;
  ports: string;
  ip: string;
};
const draftLocker = (locker: BoxLocker, key: number): DraftLocker => ({
  ...locker,
  key,
  number: String(locker.number),
  column: String(locker.column),
  zone: String(locker.zone),
});

export function BoxEditor({
  box,
  onSave,
  onClose,
}: {
  box?: BoxDefinition;
  onSave: (box: BoxDefinition) => Promise<boolean>;
  onClose: () => void;
}) {
  const [name, setName] = useState(box?.name ?? "");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries([
      ...textFields.map(([key]) => [key, String(box?.metadata?.[key] ?? "")]),
      ...flags.map(([key]) => [
        key,
        box?.metadata?.[key] === undefined ? "" : String(box.metadata[key]),
      ]),
    ]),
  );
  const [lockers, setLockers] = useState<DraftLocker[]>(() =>
    (
      box?.lockers ?? [
        {
          number: 0,
          kind: "IHM",
          column: 1,
          zone: 1,
          ports: "1:14,2:14",
          ip: "0.0.0.0",
        },
        { number: 1, kind: "S", column: 1, zone: 2, ports: "", ip: "" },
      ]
    ).map(draftLocker),
  );
  const [tab, setTab] = useState<"info" | "lockers">("info");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { confirm, dialog } = useConfirmation();
  const change = (key: string, value: string) => {
    setDirty(true);
    setValues((v) => ({ ...v, [key]: value }));
  };
  const changeLocker = (
    key: number,
    field: keyof DraftLocker,
    value: string,
  ) => {
    setDirty(true);
    setLockers((rows) =>
      rows.map((l) => (l.key === key ? { ...l, [field]: value } : l)),
    );
  };
  const close = async () => {
    if (saving) return;
    if (
      !dirty ||
      (await confirm(t("Abandonner les modifications de la fiche Box ?")))
    )
      onClose();
  };
  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const metadata: Record<string, unknown> = { ...box?.metadata };
      for (const [key] of textFields) metadata[key] = values[key].trim();
      for (const [key] of flags)
        metadata[key] = values[key] === "" ? undefined : values[key] === "true";
      if (!values.id.trim()) throw Error(t("Renseignez l’ID de la Box."));
      const parsed = boxSchema.safeParse({
        ...box,
        name: name.trim() || `Box ${values.id.trim()}`,
        nameOrigin: name.trim() ? "manual" : "fallback",
        metadata,
        lockers: lockers.map((l, index) => {
          if (![l.number, l.column, l.zone].every((v) => /^\d+$/.test(v)))
            throw Error(
              t(
                "Ligne {0} : renseignez un numéro, une colonne et une zone entiers.",
                index + 1,
              ),
            );
          return {
            kind: l.kind,
            number: Number(l.number),
            column: Number(l.column),
            zone: Number(l.zone),
            ports: l.ports.trim(),
            ip: l.ip.trim(),
          };
        }),
      });
      if (!parsed.success)
        throw Error(
          parsed.error.issues
            .map((i) => {
              if (i.path[0] === "name")
                return t("Renseignez un nom de Box (160 caractères maximum).");
              if (i.path[0] === "lockers" && typeof i.path[1] === "number")
                return t(
                  "Ligne {0} : vérifiez {1} (numéro 0–244, IPv4 valide ou vide).",
                  i.path[1] + 1,
                  String(i.path[2]),
                );
              return i.message;
            })
            .join(" "),
        );
      if (await onSave(parsed.data)) onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <Modal
        open
        title={box ? t("Modifier la Box") : t("Créer une Box sans fichier")}
        busy={saving}
        onClose={() => void close()}
        footer={
          <>
            <Button disabled={saving} onClick={() => void close()}>
              {t("Annuler")}
            </Button>
            <Button
              variant="primary"
              loading={saving}
              onClick={() => void save()}
            >
              {t("Enregistrer la Box")}
            </Button>
          </>
        }
      >
        <div className="box-editor">
          <p className="help-text">
            {t(
              "Cette fiche décrit la Box. Son enregistrement ne change aucun réglage caméra ni serrure.",
            )}
          </p>
          <div
            className="box-tabs"
            role="group"
            aria-label={t("Formulaire de la Box")}
          >
            <Button
              aria-pressed={tab === "info"}
              onClick={() => setTab("info")}
            >
              {t("Informations")}
            </Button>
            <Button
              aria-pressed={tab === "lockers"}
              onClick={() => setTab("lockers")}
            >
              {t("Casiers et serrures ·")} {lockers.length - 1}
            </Button>
          </div>
          {error && <Alert kind="danger">{error}</Alert>}
          {tab === "info" ? (
            <div className="box-form-fields">
              <Field
                label={t("ID de la Box")}
                hint={t("Seul champ obligatoire.")}
              >
                <input
                  aria-label={t("ID de la Box")}
                  required
                  maxLength={80}
                  value={values.id}
                  onChange={(e) => change("id", e.target.value)}
                />
              </Field>
              <Field label={t("Nom de la Box")}>
                <input
                  maxLength={160}
                  value={name}
                  onChange={(e) => {
                    setDirty(true);
                    setName(e.target.value);
                  }}
                />
              </Field>
              {textFields
                .filter(([key]) => key !== "id")
                .map(([key, label]) => (
                  <Field key={key} label={t(label)}>
                    {key === "address" ? (
                      <textarea
                        rows={3}
                        maxLength={2000}
                        value={values[key]}
                        onChange={(e) => change(key, e.target.value)}
                      />
                    ) : (
                      <input
                        value={values[key]}
                        onChange={(e) => change(key, e.target.value)}
                      />
                    )}
                  </Field>
                ))}
              {flags.map(([key, label]) => (
                <Field key={key} label={t(label)}>
                  <select
                    aria-label={t(label)}
                    value={values[key]}
                    onChange={(e) => change(key, e.target.value)}
                  >
                    <option value="">{t("Non renseigné")}</option>
                    <option value="true">{t("Oui")}</option>
                    <option value="false">{t("Non")}</option>
                  </select>
                </Field>
              ))}
            </div>
          ) : (
            <>
              <p className="help-text">
                {t(
                  "Une seule IHM, numéro 0, sans caméra. Ports : module:port, séparés par des virgules. L’IP connue peut rester vide. La cible sera toujours numéro de casier + 10.",
                )}
              </p>
              <div className="box-table-scroll">
                <table className="box-editor-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>{t("Type (format)")}</th>
                      <th>Zone</th>
                      <th>{t("Colonne")}</th>
                      <th>{t("IP caméra")}</th>
                      <th>{t("Ports Southco")}</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lockers.map((l, i) => (
                      <tr key={l.key}>
                        <td>
                          <input
                            aria-label={t("Numéro ligne {0}", i + 1)}
                            type="number"
                            min={1}
                            max={244}
                            disabled={l.kind === "IHM"}
                            value={l.number}
                            onChange={(e) =>
                              changeLocker(l.key, "number", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <select
                            aria-label={t("Format ligne {0}", i + 1)}
                            disabled={l.kind === "IHM"}
                            value={l.kind}
                            onChange={(e) =>
                              changeLocker(l.key, "kind", e.target.value)
                            }
                          >
                            {(l.kind === "IHM"
                              ? ["IHM"]
                              : ["S", "M", "L", "XL", "XXL", "O", "P"]
                            ).map((k) => (
                              <option key={k}>{k}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            aria-label={t("Zone ligne {0}", i + 1)}
                            type="number"
                            min={0}
                            max={256}
                            value={l.zone}
                            onChange={(e) =>
                              changeLocker(l.key, "zone", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={t("Colonne ligne {0}", i + 1)}
                            type="number"
                            min={0}
                            max={128}
                            value={l.column}
                            onChange={(e) =>
                              changeLocker(l.key, "column", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={t("IP connue ligne {0}", i + 1)}
                            disabled={l.kind === "IHM"}
                            placeholder={t("Non renseignée")}
                            value={l.ip}
                            onChange={(e) =>
                              changeLocker(l.key, "ip", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={t("Ports Southco ligne {0}", i + 1)}
                            maxLength={128}
                            placeholder="1:1,2:1"
                            value={l.ports}
                            onChange={(e) =>
                              changeLocker(l.key, "ports", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <Button
                            aria-label={t("Supprimer la ligne {0}", i + 1)}
                            disabled={l.kind === "IHM"}
                            onClick={() => {
                              setDirty(true);
                              setLockers((rows) =>
                                rows.filter((row) => row.key !== l.key),
                              );
                            }}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                disabled={lockers.length >= 245}
                onClick={() => {
                  const number = Array.from(
                    { length: 244 },
                    (_, i) => i + 1,
                  ).find((n) => !lockers.some((l) => Number(l.number) === n));
                  if (!number) return;
                  const last = lockers.at(-1)!;
                  setDirty(true);
                  setLockers([
                    ...lockers,
                    {
                      key: Math.max(...lockers.map((l) => l.key)) + 1,
                      number: String(number),
                      kind: "S",
                      column: last.column,
                      zone: String(Number(last.zone) + 1),
                      ports: "",
                      ip: "",
                    },
                  ]);
                }}
              >
                <Plus size={16} />
                {t("Ajouter un casier")}
              </Button>
            </>
          )}
        </div>
      </Modal>
      {dialog}
    </>
  );
}
