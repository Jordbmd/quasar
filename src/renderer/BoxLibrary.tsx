import React, { useState } from "react";
import { Boxes, MapPin, Plus, Search, Pencil } from "lucide-react";
import { Button, Panel, EmptyState } from "./design-system/components";
import { BoxEditor } from "./BoxEditor";
import { BoxImport } from "./BoxImport";
import type { BoxDefinition } from "../shared/box";
import type { BoxLibrary as Library } from "./box-storage";
export function BoxLibrary({
  library,
  busy,
  onOpen,
  onSave,
}: {
  library: Library;
  busy: boolean;
  onOpen: (id: string) => void;
  onSave: (box: BoxDefinition, editingId?: string) => Promise<boolean>;
}) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>();
  const records = library.entries
    .filter((e) =>
      [e.box.name, e.box.metadata?.id, e.box.metadata?.address]
        .join(" ")
        .toLocaleLowerCase("fr")
        .includes(search.toLocaleLowerCase("fr")),
    )
    .sort((a, b) =>
      a.box.name.localeCompare(b.box.name, "fr", { numeric: true }),
    );
  return (
    <section className="box-library">
      <div className="page-heading">
        <div>
          <h2>Mes Box</h2>
          <p>
            Préparez vos interventions et retrouvez les casiers de chaque site,
            même hors connexion.
          </p>
        </div>
        <div className="button-group">
          <BoxImport
            disabled={busy}
            label="Importer une Box"
            onImport={(box) => onSave(box)}
          />
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => setEditing(null)}
          >
            <Plus size={16} />
            Créer une Box
          </Button>
        </div>
      </div>
      <label className="search-box">
        <Search size={17} />
        <input
          aria-label="Rechercher une Box"
          placeholder="Nom, ID ou adresse…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <p className="help-text">
        {library.entries.length} Box enregistrée(s) sur cet ordinateur.
        Réimporter une Box connue met à jour sa fiche ; une autre Box s’ajoute à
        la bibliothèque.
      </p>
      <div className="box-library-grid">
        {records.map((entry) => (
          <Panel key={entry.id} className="box-library-card">
            <div className="box-library-title">
              <Boxes size={20} />
              <div>
                <h3>{entry.box.name}</h3>
                <span>
                  {entry.box.metadata?.id
                    ? `ID ${entry.box.metadata.id}`
                    : "ID non renseignée"}
                </span>
              </div>
              {entry.id === library.activeId && (
                <span className="box-active-label">Active</span>
              )}
            </div>
            <p className="box-site-address">
              <MapPin size={16} />
              {entry.box.metadata?.address || "Adresse non renseignée"}
            </p>
            <p className="help-text">
              {entry.box.lockers.length - 1} casiers ·{" "}
              {
                Object.values(entry.bindings).filter((v) => v !== "unassigned")
                  .length
              }{" "}
              associations enregistrées
            </p>
            <div className="button-group">
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => onOpen(entry.id)}
              >
                Ouvrir la Box
              </Button>
              <Button
                disabled={busy}
                aria-label={`Modifier ${entry.box.name}`}
                onClick={() => setEditing(entry.id)}
              >
                <Pencil size={15} />
                Modifier
              </Button>
            </div>
          </Panel>
        ))}
      </div>
      {!records.length && (
        <EmptyState
          icon={Boxes}
          title={
            library.entries.length
              ? "Aucune Box correspondante"
              : "Préparez votre première Box"
          }
          children={
            library.entries.length
              ? "Essayez un autre nom, ID ou lieu."
              : "Importez un fichier de production ou créez une fiche manuellement."
          }
        />
      )}
      {editing !== undefined && (
        <BoxEditor
          box={library.entries.find((e) => e.id === editing)?.box}
          onClose={() => setEditing(undefined)}
          onSave={(box) => onSave(box, editing ?? undefined)}
        />
      )}
    </section>
  );
}
