# fgfprod-google-translate

Widget **Google Translate** pour applications **Next.js (App Router)** et React : sélecteur de langue personnalisable (Radix Dropdown), gestion du bandeau sticky via la variable CSS `--google-translate-banner-height`, et helpers pour **re-scanner** le DOM après contenu injecté côté client (pagination, filtres, menus en portail).

Dépôt : [github.com/fgfprod/fgfprod-google-translate-nextjs](https://github.com/fgfprod/fgfprod-google-translate-nextjs)

## Installation

```bash
npm install fgfprod-google-translate
```

Dépendances **peer** (à avoir dans le projet consommateur) :

- `react`, `react-dom` (18+ ou 19+)
- `radix-ui` (paquet unifié Radix Primitives, v1.4+)

Le package dépend aussi de `clsx` et `tailwind-merge` (installés avec le paquet).

## Feuille de styles

Import global (par ex. dans `app/layout.tsx`) **avant** votre `globals.css` si vous surchargez des tokens :

```tsx
import "fgfprod-google-translate/styles.css";
```

Cette feuille définit notamment :

- `:root { --google-translate-banner-height: 0px; }` (mise à jour par le widget)
- styles de l’indicateur « Traduction… » du rescan (`.gt-rescan-indicator__spinner`)

Votre layout peut combiner le décalage du header avec cette variable, par exemple :

```tsx
style={{
  "--site-header-sticky-offset": `calc(3rem + var(--google-translate-banner-height, 0px))`,
} as React.CSSProperties}
```

## Widget : langue de page et langues affichées

`pageLanguage` est le **code ISO** attendu par Google (ex. `fr`, `en`).  
Le tableau `languages` doit lister **toutes** les entrées du menu, **y compris** la langue d’origine :

```tsx
import {
  GoogleTranslateWidget,
  type GoogleTranslateLanguage,
} from "fgfprod-google-translate";

const languages: GoogleTranslateLanguage[] = [
  { code: "fr", shortLabel: "fr", ariaLabel: "Français (version originale)" },
  { code: "en", shortLabel: "en", ariaLabel: "English" },
  // …
];

export function HeaderBar() {
  return (
    <header className="sticky top-[var(--google-translate-banner-height,0px)]">
      {/* … */}
      <GoogleTranslateWidget pageLanguage="fr" languages={languages} />
    </header>
  );
}
```

### Personnalisation des classes (optionnel)

```tsx
<GoogleTranslateWidget
  pageLanguage="fr"
  languages={languages}
  classNames={{
    trigger: "…",
    menuContent: "…",
    menuItem: "…",
  }}
/>
```

Le widget repose sur les utilitaires Tailwind habituels (`bg-popover`, `text-white`, etc.) : votre thème Tailwind doit exposer ces tokens (comme avec shadcn).

## Alignement du header sous le bandeau Google

Le bandeau Google Translate injecte une iframe en haut de page. Le widget mesure sa hauteur et met à jour `--google-translate-banner-height`. Utilisez cette variable sur un header `sticky` :

```css
top: var(--google-translate-banner-height, 0px);
```

## Rescan après contenu dynamique

Lorsqu’une traduction est active (cookie `googtrans`), le moteur Google ne re-traduit pas toujours le HTML injecté après coup. Appelez :

```ts
import {
  requestGoogleTranslateRescan,
  requestGoogleTranslateRescanStaggered,
  isGoogleTranslationActive,
} from "fgfprod-google-translate";

// Après pagination, ouverture d’un panneau, etc. (composant client)
if (isGoogleTranslationActive()) {
  requestGoogleTranslateRescan();
}
```

- `requestGoogleTranslateRescan` : une salve de « nudges » (reflow / resize) + secours combo.
- `requestGoogleTranslateRescanStaggered` : délais plus espacés si le DOM met du temps à se stabiliser.

Les deux fonctions acceptent un paramètre optionnel `pageLanguageOverride` si la langue de page ne peut pas être lue depuis le widget (cas rare).

Le widget enregistre la langue de page via `setGoogleTranslatePageLanguage` au montage ; les helpers utilisent cette valeur pour savoir si une traduction est active.

## Publication npm

```bash
npm run build
npm publish --access public
```

(Compte npm et nom de paquet `fgfprod-google-translate` requis.)

## Développement local avec `file:`

Dans le `package.json` du consommateur :

```json
"fgfprod-google-translate": "file:../fgfprod-google-translate-nextjs"
```

Sous **Next.js 16**, le build par défaut peut utiliser Turbopack, qui ne résout pas toujours les paquets `file:`. En cas d’erreur « Module not found », lancez :

```bash
next build --webpack
```

Le script `dev` du site de référence utilise déjà `next dev --webpack`.

## Licence

MIT
