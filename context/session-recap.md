# WIMM? — Récapitulatif de session

## 21/09/2026 — FONCTIONNALITÉ « SCÉNARIO » (simulation épargne)

**Besoin exprimé** : « si je travaillais, combien je pourrais épargner en plus ? », **sans** dupliquer le plan ni recréer un profil.

### Pourquoi la duplication de plan était une fausse piste
`addPlan(name, copyFromPlanId)` ne copie que buckets, catégories et débiteurs — ni transactions, ni budgets, ni prévisions, et crée un compte vide. Un plan dupliqué part d'un solde nul : simulation sans intérêt. Et deux plans à alimenter divergeraient dès le premier jour.

### Modèle de calcul retenu
Reprend exactement les définitions du backend :
- **Revenu du mois** = transactions de la catégorie « À assigner » sur la période, négation appliquée (convention WIMM : revenu = montant négatif)
- **Budgets** = somme des `budgeted` par catégorie, hors « À assigner » (déjà exclue par `getBudgetByPeriod`) et **hors catégorie d'épargne** — celle-ci est le résultat, pas une entrée

```
Épargne possible = Revenu scénario − Budgets hors épargne (avec remplacements)
Épargne en plus  = Épargne possible − budget actuel de la catégorie épargne
```

### Implémentation
| Où | Quoi |
|---|---|
| `Code cs.txt` (fin) | `getScenarios()` / `saveScenarios(jsonStr)` + helper `_appMetaFind`. Stockage clé/valeur JSON dans **`AppMeta`**, feuille déclarée dans `SHEETS` mais jusqu'ici inutilisée. Une ligne par plan. |
| `Html.txt` | Bloc CSS préfixé `scn-`, modale `#scenarioModal`, ~250 lignes de JS, bouton 🎬 Scénario dans la barre d'actions Budget |

**Calcul 100 % côté navigateur** à partir de `allTransactions` et `window._lastBudgetData` : réponse instantanée, aucun aller-retour Apps Script. Le serveur n'est appelé que pour lire/écrire la liste des scénarios, **sur clic explicite** (conforme à « sauvegarde mais pas automatique »).

### Sécurité de la modification
- **439 lignes ajoutées, 0 supprimée** — aucune ligne existante touchée
- Aucun `.sheet`, aucune bascule d'onglet, aucun `display:flex` structurel (leçon de mars respectée)
- Classes CSS et identifiants préfixés, unicité vérifiée
- Syntaxe validée (`node --check`) sur le backend et sur le JS extrait du frontend
- Aucune écriture dans les données réelles : la simulation ne modifie ni transaction ni budget

### À vérifier au test
- Le bouton 🎬 apparaît dans la barre d'actions de l'onglet Budget
- La modale s'ouvre, le revenu est pré-rempli avec le réel du mois
- Si aucune catégorie d'épargne n'est définie dans les Réglages, un message le signale et la comparaison est neutralisée
- L'enregistrement crée bien une ligne `scenarios_<plan_id>` dans la feuille AppMeta



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
