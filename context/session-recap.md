# WIMM? — Récapitulatif de session

## 21/09/2026 — DÉPLOIEMENT SANS PC, DEPUIS UN IPHONE ✅

**Déploiement @662 réussi** : le mode scénario est en production.
Contenu vérifié : `Index.html` 17 246 lignes (17 245 + tampon de build), `Code.js` 3 525 lignes — conforme au commit `bb8612c`.

### Le problème
Le déploiement dépendait de `push.bat` sur le PC Windows. Sans ordinateur, impossible de publier — ça a bloqué deux fois dans la journée.

### La solution : Google Cloud Shell
Machine Linux gratuite accessible depuis Safari sur iPhone, rattachée au compte Google propriétaire du script. Node.js et clasp y tournent.

**Deux scripts ajoutés au repo :**

| Fichier | Rôle |
|---|---|
| `deploy.sh` | Clone le projet Apps Script **en ligne** (donc son vrai `appsscript.json`), remplace uniquement `Index.html` et `Code.js`, injecte le tampon de build, fait `clasp push`. Refuse de partir si `Html.txt` est tronqué ou si `Code cs.txt` n'a pas de `doGet()`. La publication reste une commande séparée. |
| `auth.sh` | Échange OAuth **sans invite interactive**. |

### Les deux obstacles rencontrés, et pourquoi
1. **Impossible de coller dans le terminal Cloud Shell** au début → résolu, le collage fonctionne en réalité.
2. **Cloud Shell coupe la session entière dès qu'on change d'application sur iPhone.** `clasp login --no-localhost` attend une réponse interactive → le processus meurt. **tmux ne suffit pas** : ce n'est pas le shell qui tombe, c'est la session.
   → D'où `auth.sh` : il fait lui-même l'échange `code → jeton` via `curl`, écrit `~/.clasprc.json`, puis enchaîne `deploy.sh`. **Aucun processus n'a besoin de survivre.** Le secret client de clasp est public, lu dans le paquet npm installé.

### Procédure pour la suite (le jeton est persistant)
```
cd ~/wimm && git pull && bash deploy.sh
```
puis coller la commande `clasp deploy` que le script affiche.

Le dossier personnel de Cloud Shell est sur disque persistant : `~/wimm` et `~/.clasprc.json` survivent aux redémarrages.

**Identifiants utiles**
- Script ID : `1EGdEgeC_MHZu1aHGHBVq-rHfiT1h0pstH-ab0mHR29cEUFZCKO9pztLG` (lié au Sheet, donc invisible dans l'API Drive)
- Déploiement production : `AKfycbxRBAggvRZgcG324NBYLa4ZBPvaf7fiVUTbYN5LMAQ6erVgN8CbA4u6cLERNuY9jSwm`
- Un second déploiement `AKfycbz-7m5Y0EtgoewvvCU0K8V8heUXzybBJNDj1ZwADCk @HEAD` existe (version de test)



## 21/09/2026 — MODE SCÉNARIO (« fantôme »)

**Demande** : « l'app fonctionne pareil mais sans écrasement, ce n'est que de la visualisation. Modifier les budgets, les revenus attendus, en ajouter. Mais pas de sauvegarder. Comme un fantôme de WIMM qui se crée et disparaît en sortant du mode. » Validation explicite ⇒ tout est enregistré.

### La découverte qui a tout simplifié
La moitié du mécanisme existait déjà : `saveBudget()` **n'écrit pas au serveur**, il accumule dans `_batchChanges` (barre « N modifications en attente », `✓ Enregistrer` / `✕ Annuler`). Manquaient : les prévisions, la navigation libre (`_lockNav()` bloquait), la persistance en mémoire (`loadBudget()` effaçait `_batchChanges`), et la propagation à Suivi.

### La couture clé
`renderSuiviTable` lit les budgets à **six endroits** (`_budgetCache`, `_budgetPeriodTotals`, `_lastBudgetData`, `_budgetCatDetails`, `getBudgetPeriods()`). Intercepter chaque lecture était impraticable.

Tout descend de **deux points d'écriture du cache** : `loadBudget()` et `_loadBudgetForPeriod()`. Le calque est donc appliqué **à l'entrée du cache** (`_scnPatchBuckets`) → Budget, projection et Suivi voient le scénario sans interception supplémentaire.

Et comme `allTransactions` n'est **jamais** touché, l'onglet Banque reste réel sans effort.

### Architecture
| État | Rôle |
|---|---|
| `window._scnMode` | mode actif |
| `window._scnBudgets` | `"MM/YYYY\|catId" -> {amount, real}` — le calque budgets |
| `window._scnPrevSnap` | copie du réel de `allPrevisions`, pour revenir en arrière |

- **Entrée** : snapshot des prévisions + `invalidateBudgetCache()`
- **Sortie** : restauration du snapshot + invalidation → le fantôme disparaît
- **Validation** : `_scnCommit()` rejoue vers le serveur **séquentiellement** (GAS n'aime pas les écritures concurrentes) — `saveBudgetBatch` puis suppressions, modifications, ajouts de prévisions. Les prévisions sont calculées par **diff** entre le snapshot et l'état courant, ce qui gère correctement « ajouter puis modifier ».

### Périmètre
Couvert : budgets, revenus attendus (création, modification, suppression).
**Exclu volontairement** : les transactions. La saisie est désactivée en mode scénario (`_scnBlockTx`) — Banque doit rester le reflet du réel.

### Propriété de sûreté vérifiée
- **443 lignes ajoutées, 2 modifiées.** Les deux : ajout de `!_scnOn() &&` dans une condition, et `const buckets` → `let buckets`.
- Les **9 greffes** dans le code existant sont toutes des branchements `if (_scnOn())` en tête ⇒ **mode désactivé = chemin d'exécution identique à avant**.
- Syntaxe validée (`node --check`), balises équilibrées, fonctions et identifiants uniques vérifiés.

### Approximation connue
`disponible` (« À assigner ») est corrigé en retranchant le delta d'assignation au chiffre serveur (`_scnDispDelta`). Le serveur applique en plus un écrêtage (min 0, logique cross-périodes) que cette correction ne reproduit pas exactement. C'est la même approximation que `_recomputeLocalBudget()` fait déjà pour l'affichage optimiste — comportement cohérent avec l'existant, mais à surveiller sur les cas limites.

### À vérifier au test
- Bouton 🎬 Scénario dans la barre d'actions Budget ; bandeau violet en haut une fois activé
- Modifier un budget : le chiffre change, **aucune barre « en attente »**, navigation libre
- Aller sur Suivi : la trésorerie doit refléter le scénario
- Prévisions (onglet Banque) : ajout/modification/suppression simulés
- Quitter → confirmation, puis retour au réel intégral
- Valider → tout est enregistré, rechargement complet


## 21/09/2026 — REBASAGE SUR `main` @661 (le vrai code live)

### Le point le plus important : où vit le code

**Le code live est à la racine du repo, PAS dans `apps-script/`.**

| Fichier | Rôle |
|---|---|
| `Html.txt` | Frontend complet (16 804 lignes) — c'est l'`Index.html` de l'Apps Script |
| `Code cs.txt` | Backend (3 525 lignes) — c'est le `Code.gs` de l'Apps Script |

C'est ce couple que le pipeline de déploiement synchronise (commits « Sync @NNN »). Le dossier `apps-script/` était un vestige de mars, jamais tenu à jour — **toute modification qui y serait faite serait perdue**. Il a été supprimé.

### Ce qui s'est passé

La branche `claude/fix-modify-code-Nv39x` descendait d'un ancêtre de mars et avait divergé de `main` de **31 commits de chaque côté**, ratant toute la série @650 → @661.

Elle a été **repointée sur `origin/main` (@661, 05/08/2026)**. Seul le dossier `context/` a été conservé ; les doublons périmés (`apps-script/*`, `preview-dashboard.html`, `icon.jpg`) ont disparu avec le rebasage — `icon.jpg` et consorts avaient d'ailleurs été volontairement supprimés sur `main`.

### Vérification de l'upload utilisateur

Les fichiers fournis le 21/09 ont été comparés à `main` @661 :

- `Code.js` → **identique bit-pour-bit** à `Code cs.txt`
- `Index.html` → identique à `Html.txt` **à une ligne près** : `<!-- build: 2026-08-05 21:27:23 -->`, tampon injecté par le pipeline au déploiement

Conclusion : l'upload était bien le dernier code, mais il était déjà sur GitHub. Rien de neuf à importer.

---

## Historique du projet

Le développement s'est fait **hors de ce repo** de mars à août 2026 : voir `context/SUIVI_MODIFICATIONS.txt`, journal de 31 sessions (2026-03-16 → 2026-07-07+), puis les commits « Sync @NNN » sur `main` jusqu'au @661.

**Fonctionnalités majeures du code actuel** : comptes bancaires multiples (`account_id`, CE/LBP/Fortunéo), virements internes (`transfer_group_id`), réconciliation + verrouillage, dashboard (KPIs, graphiques), historique d'actions et undo, garde-fous d'intégrité en écriture, aide intégrée et visites guidées, trésorerie étendue.

---

## Diagnostic du 02/08/2026 — soldes pointés inégaux (résolu)

Écart de 98,70 € entre la carte **POINTÉ** (1752,47 €) et le bandeau du tableau (1653,77 €), plan Commun.

**Cause** : la transaction `TX-826745a4-2157-4d2f-86a6-a615feb7fc09` — « Turbine », 98,70 €, 19/07/2026, Repas extérieurs — était **verrouillée mais non pointée**. Seule ligne du plan dans cet état sur 255.

Les deux affichages ne somment pas la même chose : la carte somme les **pointées**, le bandeau somme les **verrouillées**. Invisible à l'écran car « Masquer verr. » était actif.

**Piste de correctif** : si l'app permet de dépointer une transaction verrouillée sans lever le verrou, c'est un bug — le verrou est censé figer l'état pointé.

---

## Sujets ouverts

### Mobile (signalés en mars, jamais traités)
1. Zoom automatique à la saisie du champ « Bénéficiaire »
2. Onglet Budget : tableau pas en pleine largeur, caractères trop petits
3. Onglet Saisie : constat « moitié d'écran » non reproduit sur capture d'août — à re-confirmer

### Plein écran iOS (analysé, non implémenté)
Le lanceur GitHub Pages (`index.html`) redirige vers `script.google.com`. iOS **éjecte du mode standalone dès qu'on change d'origine** → barres Safari. La solution (iframe depuis `github.io`, `doGet()` ayant déjà `XFrameOptionsMode.ALLOWALL`) a été développée puis **annulée par l'utilisateur** le 16/03, jugée trop incertaine sur le scroll iOS. Jamais mise en ligne.

### Latence (analysée, décision en attente)
Objectif utilisateur explicite : réduire les latences.

`Code cs.txt` fait des centaines d'allers-retours réseau vers Sheets (~200-400 ms chacun), sans aucun `CacheService`. `getInitialData()` enchaîne une dizaine de chargeurs séquentiels.

| | Init | Une action |
|---|---|---|
| Aujourd'hui | ~5 s et plus | ~1-2 s |
| Apps Script optimisé (lectures groupées, cache) | ~1,5-2 s | ~0,5-1 s |
| Workers + D1 | <200 ms | ~20-50 ms |

Apps Script garde un plancher incompressible : démarrage à froid 1-3 s, plus 300-800 ms de transport sur chaque `google.script.run`.

L'utilisateur dispose déjà d'un compte Cloudflare actif (Workers + D1). Contrepartie d'une migration : perte du Sheet comme filet de secours manuel.

---

## Méthode de travail convenue

Après une refonte CSS de l'onglet Saisie qui a cassé l'app en mars :

1. **Une seule modification isolée à la fois**
2. Commit dédié et atomique
3. Déploiement + test iPhone par l'utilisateur
4. Validation explicite avant de passer au point suivant
5. Ne jamais transformer `.sheet` en conteneur flex — la bascule d'onglets repose sur `display:none` inline, le contexte flex la casse

## Contraintes

- Le code `.gs` live de l'Apps Script **n'est pas lisible** par l'assistant (script lié à un Sheet, invisible dans Drive, pas d'API Apps Script). Seuls les fichiers du repo sont accessibles.
- **git ne déploie pas vers Apps Script** : un push ne change rien à l'app tant que le code n'est pas repris dans l'éditeur Apps Script et redéployé.
- GitHub Pages sert `main` : le lanceur `index.html` n'est en ligne qu'une fois mergé dans `main`.
