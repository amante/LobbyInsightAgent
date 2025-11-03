
# CSV → Gráficos desde GitHub (Static, GitHub Pages ready)

Pequeña app estática (sin build) que:
- Lista archivos **.csv** de una carpeta en un repositorio de **GitHub** (API de contenidos)
- Permite **cargar** uno o varios CSV (también arrastrar/cargar locales como alternativa)
- **Previsualiza** las primeras filas
- Construye **gráficos** con **Chart.js** (línea, barras, dispersión, torta)
- Exporta el gráfico a **PNG** y los datos combinados a **CSV**
- Guarda en `localStorage` el origen (owner/repo/branch/carpeta) para reusar

> ⚠️ Para repos **privados** puedes ingresar un **token** de solo lectura. Se usa únicamente en el navegador; **no** se guarda.

## Estructura
```
/
├─ index.html
└─ assets/
   ├─ app.js
   ├─ styles.css
   └─ favicon.svg
```

## Cómo usar en GitHub Pages
1. Crea un nuevo repo o usa uno existente.
2. Copia estos archivos en la raíz del repo (o en una carpeta y configura Pages a esa carpeta).
3. Activa GitHub Pages (Settings → Pages → Deploy from branch → `main`).
4. Abre la página de Pages y completa: **Owner, Repo, Branch, Carpeta**.
5. Clic en **Listar CSV** → Cargar → Previsualizar → Generar gráfico.

## Notas
- Este sitio usa CDNs para Tailwind, Chart.js y PapaParse para simplificar el despliegue.
- Si prefieres sin CDN, puedes descargar las librerías y referenciarlas localmente.
- No utilizamos `<script type="module">` para evitar problemas de MIME en GH Pages.
- Para datos con comas como separador decimal (`1.234,56`) activa **"Intentar convertir Y a número"**.

## Seguridad
- Si ingresas un token, se envía únicamente en el **header Authorization** de la petición a `api.github.com`.
- El token **no se persiste** (no se guarda en `localStorage`).

¡Listo! Subes, publicas y graficas tus CSV desde GitHub 🎉
