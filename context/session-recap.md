# WIMM? — Récapitulatif de session

## Session du 16/03/2026

### Ce qui a été fait
- Lecture complète du fichier `context.md` (spécification de reconstruction WIMM?)
- Création du dossier `context/` pour centraliser la documentation
- Déplacement de `context.md` dans `context/`
- Création de ce fichier de récapitulatif de session
- Audit complet du CSS mobile de `apps-script/Index.html` (~2 930 lignes de CSS)
- Analyse de la capture iPhone réelle de l'onglet Saisie
- Refonte CSS Saisie mobile appliquée (commit `a8e8b3a`) — **ANNULÉE**, voir section « Revert » ci-dessous

---

### Audit UX Mobile — Résumé

#### Ce qui va bien
- Meta viewport correct (device-width, no-scale, viewport-fit cover)
- Hauteur dynamique (100dvh/100svh avec fallbacks)
- Safe-area-inset partout (notch + barre Home)
- Bottom nav flottante pill avec backdrop-filter blur
- Modals en bottom sheet sur mobile (slideUp)
- Inputs forcés à 16px pour empêcher le zoom iOS
- Momentum scroll (-webkit-overflow-scrolling: touch)
- Touch feedback (scale) sur les boutons

#### Problèmes identifiés (audit initial)
1. **Fonts trop petites** : 11-12px sur dates, descriptions, bénéficiaires, labels budget, en-têtes tableau
2. **Touch targets < 44px** : btn-fold (28px), period select (36px), checkboxes (20px), boutons actions budget
3. **Budget inputs** : font-size 14px mobile risque de passer sous le fix 16px global (spécificité CSS)
4. **Tableau HTML pour les transactions** : rendu tableur, pas app-like
5. **Pas de overscroll-behavior: none** : bounce Safari → **CORRIGÉ**
6. **Pas de -webkit-text-size-adjust: 100%** → **CORRIGÉ**
7. **Paddings trop serrés** (3-5px) au lieu de 16px minimum latéral → **CORRIGÉ (saisie)**

---

### Capture iPhone Saisie — Analyse (16/03/2026)

**Appareil** : iPhone, Safari, mode sombre, 5G
**URL** : script.google.com (Google Apps Script WebApp)

#### Constat visuel (AVANT modifs)
- Le formulaire de saisie occupait **~35-40% de l'écran** seulement
- **~60% de l'écran = vide noir** sous les boutons "File d'attente / Direct"
- Les cards (.group) séparées par le fond sombre → effet "îlots flottants"
- Le bloc montant "0,00 €" prenait un gros espace visuel mais champ minuscule

---

### Refonte Saisie mobile — CHANGEMENTS APPLIQUÉS

**Commit** : `a8e8b3a`
**Branche** : `claude/fix-modify-code-Nv39x`
**Fichier** : `apps-script/Index.html`
**Statut** : ❌ **REVERTÉ** (commit `a064586`) — le contenu ci-dessous est conservé à titre d'archive uniquement, il n'est plus dans le code.

#### Détail des modifications CSS (pour rollback si besoin)

##### 1. Media query `@media (max-width: 1023px)` — Section APP SHELL (~ligne 2770)
**AVANT** :
```css
.sheet {
  padding: 0 !important;
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 90px) !important;
}
```
**APRÈS** :
```css
.sheet {
  padding: 0 !important;
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 90px) !important;
  display: flex !important;
  flex-direction: column !important;
}
#budgetSection, #historySection, #settingsSection, #epargneSection {
  flex: 0 0 auto !important;
}
```
**Pourquoi** : `.sheet` doit être flex container pour que `#transactionsSection` puisse utiliser `flex: 1` et remplir la hauteur. Les autres sections sont protégées avec `flex: 0 0 auto` pour garder leur scroll naturel.
**Risque rollback** : si les onglets Budget/Banque/Réglages ont un affichage cassé, retirer `display: flex` et `flex-direction: column` sur `.sheet`.

##### 2. Media query `@media (max-width: 1023px)` — Section SAISIE (~ligne 2805)
**AVANT** :
```css
#transactionsSection { padding: 0 12px; }
#transactionsSection .group { border-radius: 14px; padding: 14px; }
.segment { border-radius: 10px !important; padding: 3px !important; gap: 3px !important; }
.segment button { border-radius: 8px !important; padding: 9px 4px !important; font-size: 15px !important; font-weight: 600 !important; }
#simpleAmount {
  font-size: 38px !important; font-weight: 700 !important;
  letter-spacing: -1px; font-variant-numeric: tabular-nums;
}
.input-euro-suffix { font-size: 26px !important; font-weight: 600 !important; }
#simpleCategory { border-radius: 12px !important; padding: 12px !important; font-size: 16px !important; }
.form-actions .btn-primary {
  border-radius: 12px !important; padding: 14px !important;
  font-size: 17px !important; font-weight: 600 !important;
}
.form-actions .btn-dark { border-radius: 12px !important; font-size: 15px !important; }
```
**APRÈS** — remplacement complet par :
```css
/* #transactionsSection : flex:1 plein écran, padding 0 */
/* .group : transparent, border-radius 0, padding 10px 16px */
/* #simpleFormBlock : flex:1, sa .group justify-content:center */
/* .segment : border-radius 12px, margin 0 16px, boutons min-height 44px */
/* .input-euro-wrap : padding 16px 20px, min-height 70px */
/* #simpleAmount : font-size 42px (était 38px) */
/* .input-euro-suffix : font-size 28px (était 26px) */
/* #simpleCategory : min-height 50px, padding 14px 12px */
/* Tous inputs saisie : min-height 50px */
/* .btn-secondary/.btn-ghost : min-height 44px */
/* #txClearedBtn : min-height 44px */
/* .form-actions : margin-top auto (colle en bas), padding 8px 16px */
/* .btn-primary : min-height 54px, padding 16px, font-weight 700 */
/* .btn-dark : min-height 54px, font-size 16px */
/* #queueSection : transparent, radius 0 */
/* inputs/selects transactionsSection : touch-action manipulation */
```
**Risque rollback** : si le formulaire est trop étalé ou les éléments mal positionnés, remettre l'ancien bloc CSS ci-dessus.

##### 3. Media query `@media (max-width: 1023px)` — première instance (~ligne 1272)
**AVANT** :
```css
#transactionsSection {
  display: flex; flex-direction: column; gap: 0;
}
```
**APRÈS** :
```css
#transactionsSection {
  display: flex; flex-direction: column; gap: 0;
  flex: 1; min-height: 0;
}
```
**Pourquoi** : `flex: 1` dupliqué ici car cette media query s'applique aussi. `min-height: 0` évite le bug flex-overflow.

##### 4. Media query `@media (max-width: 1023px)` — Section INPUTS (~ligne 2963)
**AVANT** :
```css
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
select, textarea { font-size: 16px !important; }
```
**APRÈS** :
```css
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
select, textarea {
  font-size: 16px !important;
  touch-action: manipulation !important;
}
body { overscroll-behavior: none !important; -webkit-text-size-adjust: 100% !important; }
```
**Pourquoi** : `touch-action: manipulation` empêche le double-tap zoom iOS. `overscroll-behavior: none` empêche le bounce Safari. `-webkit-text-size-adjust: 100%` empêche l'agrandissement auto en paysage.

---

---

### ⛔ REVERT — Retour arrière complet (16/03/2026)

**Commit de revert** : `a064586` — *Revert "feat: refonte Saisie mobile - layout plein écran app-like"*

#### Ce qui s'est passé
Retour utilisateur après déploiement :
> « Il faut rétro pédaler, plus rien ne va, l'onglet saisie n'a plus aucun sens, de plus il empiète sur tous les autres onglets en fond. »

#### Cause racine identifiée
Le `display: flex; flex-direction: column` ajouté sur `.sheet` (modif n°1) combiné au `flex: 1` sur `#transactionsSection` (modif n°3) a cassé le mécanisme de bascule d'onglets.
Les sections non actives sont masquées par un `style="display:none"` **inline** — mais le contexte flex du parent a provoqué un recalcul de layout qui a fait déborder `#transactionsSection` par-dessus les autres sections.

**Leçon** : ne jamais transformer `.sheet` en conteneur flex tant que la bascule d'onglets repose sur `display:none` inline.

#### État après revert
- `apps-script/Index.html` : CSS strictement identique à l'état pré-`a8e8b3a`
- Working tree propre, revert poussé sur `origin/claude/fix-modify-code-Nv39x`
- ⚠️ **Le revert n'est visible dans l'app qu'après redéploiement manuel** dans l'éditeur Apps Script (git ne déploie pas vers Google).

#### Nouvelle méthode de travail (validée avec l'utilisateur)
> « On va faire étape par étape. »

1. **Une seule modification isolée à la fois**
2. Commit dédié et atomique (revert trivial)
3. Déploiement + test iPhone par l'utilisateur
4. Validation explicite avant de passer au point suivant
5. Ne jamais toucher au layout structurel (`.sheet`, bascule d'onglets) — rester sur du cosmétique ciblé

---

---

### 🖥️ Plein écran standalone iOS (16/03/2026) — commit `080439f` → ❌ **ANNULÉ** (`9da095d`)

> **Décision utilisateur** : annulation avant tout déploiement. La solution reposait sur une iframe, dont le comportement de scroll sur iOS n'était pas garanti sans test réel. Jugée trop risquée au regard du bénéfice.
>
> **Rien n'a jamais été mis en ligne** : le commit n'a pas été mergé dans `main`, donc GitHub Pages n'a jamais servi cette version. Le lanceur en production n'a pas bougé.
>
> `index.html` est bit-pour-bit identique à son état d'origine, `manifest.json` supprimé.
>
> Le contenu ci-dessous est conservé comme archive technique — le diagnostic reste valable si le sujet est repris un jour.

**Demande** : lancer l'app sans la barre de domaine en haut ni la barre Safari en bas.

#### Diagnostic
Le lanceur GitHub Pages (`index.html` à la racine, servi sur `therizr31.github.io/wimm/`) était **correctement** configuré en standalone (`apple-mobile-web-app-capable`, `apple-touch-icon` perso). Mais il exécutait `window.location.replace(APP_URL)` vers `script.google.com`.

**iOS éjecte du mode standalone dès qu'on navigue vers une autre origine.** → bascule en vue Safari embarquée avec barre de domaine + barre d'outils. Limitation système, aucun réglage ne la contourne.

#### Solution appliquée
Ne plus quitter l'origine `github.io` : l'app est embarquée dans une **iframe plein écran**.

| Changement | Fichier | Raison |
|---|---|---|
| Redirection → iframe `#appFrame` | `index.html` | Reste sur github.io, garde le mode standalone |
| `viewport-fit=cover` ajouté au meta viewport | `index.html` | Sans lui `env(safe-area-inset-*)` vaut 0 |
| `safe-area-inset` en padding sur `#appShell` | `index.html` | **En iframe, `env()` vaut 0 côté app** → l'encoche et l'indicateur Home doivent être réservés par la page parente |
| `manifest.json` créé | racine | Standalone Android/Chrome |
| Échappatoire `?direct=1` | `index.html` | Force l'ancienne redirection si l'iframe pose problème → jamais bloqué hors de l'app |
| Timeout 12 s + lien de secours | `index.html` | Si l'iframe ne charge pas, sortie manuelle proposée |

**Prérequis déjà satisfait** : `doGet()` utilise `HtmlService.XFrameOptionsMode.ALLOWALL` (Code.gs:19) — sans ça l'iframe serait bloquée.

#### ⚠️ Déploiement
GitHub Pages sert la branche **`main`**. Le commit est sur `claude/fix-modify-code-Nv39x` → **il faut merger dans `main`** pour que ça prenne effet. Aucun redéploiement Apps Script nécessaire (Code.gs et Index.html non modifiés).

#### Risque résiduel à tester
Scroll interne dans une iframe sur iOS : historiquement capricieux. L'app utilise un shell `100dvh; overflow:hidden` avec scroller interne (`.sheet`), ce qui devrait passer. À valider sur l'iPhone.

#### Rollback
`git revert 080439f` — modification totalement isolée du code de l'app (`apps-script/Index.html` non touché).

---

### Fichiers modifiés
| Fichier | Action | Commit |
|---|---|---|
| `context.md` | Déplacé vers `context/context.md` | — |
| `context/session-recap.md` | Créé puis mis à jour | `d657bce`, `b4dc6a0`, `f39d022` |
| `apps-script/Index.html` | Refonte CSS Saisie mobile | `a8e8b3a` |
| `apps-script/Index.html` | **Revert de la refonte** | `a064586` |
| `index.html` (lanceur GitHub Pages) | Plein écran standalone via iframe | `080439f` |
| `manifest.json` | Créé (PWA standalone) | `080439f` |

### Décisions prises
- Dossier `context/` choisi pour regrouper le contexte projet et les récaps de session
- Le fichier `context.md` sert de référence principale pour toute intervention sur le code
- Audit UX mobile réalisé AVANT toute modification
- **Priorité 1 : refonte de l'onglet Saisie** (validé par l'utilisateur via capture)
- Approche : CSS-only dans la media query mobile, pas de modif HTML

### Points en suspens / À faire

#### Bloquant immédiat
- [ ] **Redéployer** `Index.html` dans l'éditeur Apps Script pour que le revert prenne effet
- [ ] Confirmer que l'app est revenue à un état fonctionnel
- ~~Merger `080439f` dans `main`~~ → **abandonné**, plein écran annulé (`9da095d`)

#### Contrainte utilisateur
- Pas d'accès à un ordinateur → **impossible de déployer sur Apps Script** pour le moment. Toute correction de `Index.html` ou `Code.gs` est en attente.

#### Les 3 problèmes utilisateur — toujours non traités
1. [ ] **Zoom automatique** à la saisie du champ « Bénéficiaire »
2. [ ] **Onglet Budget** : le tableau ne prend pas la largeur totale + caractères trop petits
3. [ ] **Onglet Saisie** : seule la moitié de l'écran est utilisée

#### Plus tard
- [ ] Banque : tableau → cards (à planifier)

#### Contrainte technique connue
- Le code `.gs` live de l'Apps Script lié au Sheet **n'est pas lisible** par l'assistant (script container-bound, invisible dans Drive, pas d'API Apps Script). Seuls `apps-script/Code.gs` et `apps-script/Index.html` du repo sont accessibles. Si le live diverge du repo, il faut synchroniser manuellement (clasp ou copier-coller).
