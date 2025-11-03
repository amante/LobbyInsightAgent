
# CSV → Gráficos desde GitHub (v1.2.0 · LobbyInsightAgent)

Incluye **workflow** de GitHub Actions para publicar **GitHub Pages** desde el **root** del repo.

## Cómo desplegar
1. Sube todo el contenido de este ZIP al root del repo **LobbyInsightAgent**.
2. Verifica que existe `.github/workflows/pages.yml`.
3. Entra a **Actions** y habilita workflows si te lo pide.
4. Haz un commit/push a `main` (o usa **Run workflow**).
5. Luego en **Settings → Pages** verifica el deployment `github-pages`.

**URL esperada:** `https://amante.github.io/LobbyInsightAgent/`

## Config de origen (assets/config.json)
```json
{
  "owner": "amante",
  "repo": "LobbyInsightAgent",
  "branch": "main",
  "folder": "data/csv",
  "lockFields": false
}
```

Puedes forzar por URL:
```
index.html?owner=amante&repo=LobbyInsightAgent&branch=main&folder=data/csv&lock=1
```
