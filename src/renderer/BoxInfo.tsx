import React from "react";
import { boxWarnings, southcoPorts, type BoxDefinition } from "../shared/box";
import { Alert, Panel } from "./design-system/components";

const yesNo = (v?: boolean) =>
  v === undefined ? "Non renseigné" : v ? "Oui" : "Non";
export function SouthcoPorts({ value }: { value: string }) {
  const ports = southcoPorts(value);
  return (
    <span className="box-port-list">
      {ports?.length
        ? ports.map((p) => (
            <span key={`${p.module}:${p.port}`}>
              Module {p.module} · port {p.port}
            </span>
          ))
        : value || "Non renseignés"}
    </span>
  );
}
export function BoxInfo({ box }: { box: BoxDefinition }) {
  const m = box.metadata;
  const warnings = boxWarnings(box);
  const wired = [
    ...new Set(
      box.lockers.flatMap(
        (l) => southcoPorts(l.ports)?.map((p) => p.module) ?? [],
      ),
    ),
  ].sort((a, b) => a - b);
  const details: [string, string | number | undefined][] = [
    ["Format", m?.format],
    ["Fermeture arrière", yesNo(m?.rearClosure)],
    ["Air salin", yesNo(m?.seaAir)],
    ["Sticker", yesNo(m?.sticker)],
    ["Visite du site", yesNo(m?.siteVisit)],
    ["Colonnes déclarées", m?.columnCount],
    ["Modules de Box déclarés", m?.moduleCount],
    ["Casiers déclarés (hors IHM)", m?.lockerCount],
    ["Semaine de départ souhaitée", m?.departureWeek],
    ["Trespa · coloris 1", m?.color1],
    ["Trespa · coloris 2", m?.color2],
    ["Modules Southco déclarés", m?.southcoModules?.join(", ")],
    ["Modules Southco câblés", wired.join(", ")],
    ["Points d’attention", m?.notes],
    ...(m?.extra ?? []).map((p) => [p.label, p.value] as [string, string]),
  ];
  return (
    <Panel className="box-info">
      <dl className="box-info-summary">
        <div>
          <dt>ID Box</dt>
          <dd>
            {m?.id && /^\d+$/.test(m.id) ? (
              <a
                className="box-bo-link"
                href={`https://bo.sezaam.fr/box/${encodeURIComponent(m.id)}/detail`}
                target="_blank"
                rel="noreferrer"
                aria-label={`Ouvrir la Box ${m.id} dans le back-office`}
              >
                {m.id} ↗
              </a>
            ) : (
              m?.id || "Non renseigné"
            )}
          </dd>
        </div>
        <div className="box-info-address">
          <dt>Adresse d’installation</dt>
          <dd>{m?.address || "Non renseignée"}</dd>
        </div>
        <div>
          <dt>Encastrée</dt>
          <dd>{yesNo(m?.embedded)}</dd>
        </div>
        <div>
          <dt>Southco câblés</dt>
          <dd>{wired.length ? wired.join(", ") : "Non renseignés"}</dd>
        </div>
      </dl>
      <details>
        <summary>Informations de fabrication et câblage</summary>
        {box.source && (
          <p className="help-text">
            Fichier source : {box.source.filename}. Réimporter cette Box met à
            jour ses informations et conserve les associations des casiers
            présents.
          </p>
        )}
        <dl className="box-info-details">
          {details
            .filter(([, v]) => v !== undefined && v !== "")
            .map(([label, value], i) => (
              <React.Fragment key={`${label}-${i}`}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </React.Fragment>
            ))}
        </dl>
        <h3>Ports des serrures Southco</h3>
        <div className="box-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Casier</th>
                <th>Ports Southco</th>
              </tr>
            </thead>
            <tbody>
              {[...box.lockers]
                .sort((a, b) => a.number - b.number)
                .map((l) => (
                  <tr key={l.number}>
                    <td>
                      {l.number
                        ? `${l.kind}${l.number}`
                        : "IHM 0 · sans caméra"}
                    </td>
                    <td>
                      <SouthcoPorts value={l.ports} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
      {!!warnings.length && (
        <Alert kind="warning">
          <details className="box-import-warnings">
            <summary>
              {warnings.length} point(s) à vérifier dans la fiche
            </summary>
            <ul>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </details>
        </Alert>
      )}
    </Panel>
  );
}
