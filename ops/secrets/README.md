Créer `portal.env` hors Git avec `PLATFORM_METRICS_TOKEN`, réservé au serveur
et associé uniquement au projet quasar dans le registre d'ingestion Platform.
Sans ce jeton, la collecte est désactivée. Aucun secret n'entre dans le HTML.
Ce runtime sert seulement `site-dist`, jamais les archives privées ni Electron.
