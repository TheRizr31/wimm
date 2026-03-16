WIMM? — Spécification Complète de Reconstruction

Where's My Money? — Application de budget personnel
Version ~85 sessions · 10 300 lignes HTML/JS · 2 680 lignes GAS · Mars 2026

 
 
1. Présentation générale
WIMM? (Where's My Money?) est une application web de budget personnel de style YNAB (envelope budgeting). Elle est construite entièrement sur Google Apps Script (GAS) et Google Sheets, sans serveur externe. L'interface est un fichier HTML unique (~10 300 lignes) servi par GAS via doGet().
 
Philosophie budgétaire
• Zero-based budgeting : chaque euro de revenu est assigné à une catégorie (enveloppe).
• "À assigner" = différence entre revenus reçus et total budgété — toujours à ramener à zéro.
• Carry-forward cumulatif : le reliquat de chaque mois s'accumule dans la catégorie.
• Rapprochement bancaire fréquent (quotidien) : transactions pointées / verrouillées.
• Usage réel : 2 utilisateurs (compte personnel + compte joint) → architecture multi-plans.
 
Stack technique
Champ
Description / Valeurs
Langage backend
Google Apps Script (V8 runtime)
Langage frontend
HTML + CSS + JavaScript vanilla (single-file Index.html)
Hébergement
Google Sheets Web App — URL de déploiement unique GAS
Stockage
Google Sheets (10 feuilles) + PropertiesService (préférences/undo)
PWA
apple-touch-icon ×4 en base64 JPEG, theme-color #1E1F24, pas de service worker
Mobile
iOS Safari optimisé : touch targets, safe-area-inset, clavier numérique
 
2. Architecture technique
Point d'entrée GAS
function doGet() {
 return HtmlService
   .createHtmlOutputFromFile("Index")
   .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
 
Communication Frontend ↔ Backend
Toutes les requêtes frontend vers GAS utilisent google.script.run :
google.script.run
 .withSuccessHandler(callback)
 .withFailureHandler(err => console.error(err))
 .nomFonctionGAS(params);
Chaque appel est asynchrone. Le frontend ne bloque jamais. Un spinner est affiché pendant le traitement.
 
Variables globales JS critiques
Champ
Description / Valeurs
allTransactions
Array — toutes les TX du plan actif, normalisées
allPrevisions
Array — revenus attendus non-clôturés du plan actif
allProjects
Array — projets d'épargne du plan actif
allDebtors
Array — tiers (payees) du plan actif
allCategories
Array — catégories du plan actif
allBuckets
Array — groupes (buckets) du plan actif
allPeriods
Array — périodes disponibles
allPlans / _allPlans
Array — tous les plans
currentPlanId / _currentPlanId
String — ID du plan actif
_totalSavings
Number — épargne cumulée recalculée en mémoire
_savingsCatId
String — ID catégorie épargne (défaut "CAT001")
_assignCatId
String — ID catégorie "À assigner"
historyLoaded
Boolean — vrai après le premier chargement
selectedIds
Set<String> — IDs des TX sélectionnées
_sliderDraft
Object {projectId: allocated} — état draft des sliders épargne
_budgetCache
Object {period: {disponible, buckets, ts}} — cache budget
_budgetCollapsed
Object {bucketId: bool} — état déplié/replié des groupes
window._budgetCatDetails
Array — détails catégories pour la projection (depuis dernier loadBudget)
window._budgetCatPeriod
String — période correspondant au cache _budgetCatDetails
_txQueue
Array — file de saisie UI pour ajout en batch
_startupTab
String — onglet au démarrage ("budget" | "banque" | "saisie")
openMenuId
String|null — ID de la TX dont le menu contextuel est ouvert
pendingDeleteId
String|null — ID en attente de suppression
 
Convention signes — CRITIQUE
🚨 Toujours appliquer val = -amount pour afficher un montant à l'écran. Ne jamais afficher amount directement.
Champ
Description / Valeurs
Dépenses
amount POSITIF dans la feuille Banque
Revenus
amount NÉGATIF dans la feuille Banque
Affichage
val = -amount (inversion pour afficher positif à l'écran)
_totalSavings
Somme DIRECTE des amounts catégorie épargne (pas inversée)
Prévisions
amount NÉGATIF (même convention que les revenus)
 
Pipeline afterMutation
Exécuté après chaque mutation de transaction. Ordre strict :
function afterMutation(updatedData, actionLabel) {
 allTransactions = _normalizeTxList(updatedData);
 historyLoaded = true;
 computeSoldes();
 updateProjection();
 applyFilters();                          // toujours en premier
 try { _recomputeSavingsFromTx(); } catch(e) {}  // protégé, sans _renderSavings
 invalidateBudgetCache();
 // Si onglet Budget visible → recharger depuis GAS, sinon hideSpinner()
 const bs = document.getElementById("budgetSection");
 if (bs && bs.style.display !== "none") loadBudget(true);
 else hideSpinner();
 _checkUndoAvailable();
 // Afficher message succès 2,5s
 msg.textContent = actionLabel + " ✓";
 msg.style.display = "block";
 setTimeout(() => msg.style.display = "none", 2500);
}
 
_safeReturnTx — protection critique GAS
⚠ Obligatoire sur tous les return _getAllTransactions() du backend. Sans ça, les objets Date GAS non-sérialisables font retourner null silencieusement, ce qui vide l'écran.
function _safeReturnTx(transactions) {
 try { return JSON.parse(JSON.stringify(transactions)); }
 catch(e) { return []; }
}
// Utilisation : return _safeReturnTx(_getAllTransactions(categories, planId));
 
3. Feuilles Google Sheets
10 feuilles dans le Google Spreadsheet. Noms exacts (const SHEETS dans Code.gs) :
Champ
Description / Valeurs
TRANSACTIONS
"Banque"
BUDGETS
"Budgets"
CATEGORIES
"Categories"
BUCKETS
"Bucket"
PERIODS
"Periodes"
PREVISIONS
"Previsions"
DEBTORS
"Debiteurs"
META
"AppMeta"
PLANS
"Plans"
PROJECTS
"Projets"
 
Feuille Banque (Transactions)
Champ
Description / Valeurs
id
String — ex: "TX20260310123456" (prefix + timestamp + random)
date
Date GAS (ou string ISO) — date de la transaction
period
String "MM/YYYY" — ex: "03/2026"
description
String — libellé optionnel
category_id
String — ex: "CAT001"
category_name
String — dénormalisé (lecture directe sans join)
amount
Number — POSITIF = dépense, NÉGATIF = revenu
debtor
String — nom du tiers/bénéficiaire
cleared
Boolean — pointé = vu sur relevé bancaire
locked
Boolean — verrouillé après réconciliation
skip_link
Boolean — marqué "ne pas lier" à une prévision
linked_prevision_id
String — ID de la prévision liée (lettrage)
plan_id
String — ex: "PLAN001"
created_at
Date GAS — timestamp de création
Objet retourné par _getAllTransactions() :
{ id, date (dd/MM/yyyy), rawDate (timestamp ms), rawCreated (timestamp ms),
 period, description, category_id, category (nom), amount,
 debtor, cleared, locked, skip_link, linked_prevision_id }
// Tri : rawDate DESC, puis rawCreated DESC
 
Feuille Budgets
Champ
Description / Valeurs
period
String "MM/YYYY"
category_id
String
budgeted
Number — montant budgété ce mois pour cette catégorie
plan_id
String
Une ligne par (period, category_id, plan_id). Si plusieurs lignes existent, le code en fait la somme.
 
Feuille Categories
Champ
Description / Valeurs
id
String — ex: "CAT001"
name
String
bucket_id
String — ID du groupe parent (aussi lu via "group_id" dans le code)
order
Number — ordre d'affichage
active
Boolean — masqué si false
plan_id
String
Catégorie spéciale "À assigner" : détectée par pref_assignCatId_PLANID, ou par nom ("à assigner" / "a assigner"), ou par id === "CAT001". Sert de catégorie de revenus.
Catégorie épargne : configurable par plan via pref_savingsCatId_PLANID. Toutes les TX positives de cette catégorie = épargne cumulée.
 
Feuille Bucket (Groupes)
Champ
Description / Valeurs
id
String — ex: "BKT001"
name
String (aussi cherché via "label" dans le code)
order
Number
plan_id
String
 
Feuille Periodes
Champ
Description / Valeurs
id
String
period
String "MM/YYYY"
Auto-générée par _autoGeneratePeriods() : 12 mois de N−1 à maintenant + 2 mois futurs.
 
Feuille Previsions (Revenus attendus)
Champ
Description / Valeurs
id
String — ex: "PRV001"
date
Date GAS
period
String "MM/YYYY"
description
String
category_id
String
amount
Number — NÉGATIF (même convention que les revenus)
received
Boolean
linked_tx_id
String — ID de la TX qui a réglé ce revenu
plan_id
String
closed
Boolean — exclu de l'affichage si true
_getAllPrevisions() exclut les lignes avec closed=true. Retourne : { id, date (dd/MM/yyyy), rawDate, period, description, category_id, category, amount, received, linked_tx_id }
 
Feuille Debiteurs (Tiers)
Champ
Description / Valeurs
id
String — ex: "DBT001"
name
String (aussi lu via "nom")
default_category_id
String — catégorie suggérée par défaut
active
Boolean
plan_id
String
 
Feuille Plans
Champ
Description / Valeurs
id
String — ex: "PLAN001"
name
String
active
Boolean
Plan par défaut créé automatiquement : { id: "PLAN001", name: "Principal" }.
 
Feuille Projets (Épargne)
Champ
Description / Valeurs
id
String — ex: "PRJ001"
name
String
target
Number — objectif en € (0 = sans objectif)
allocated
Number — montant alloué à ce projet
plan_id
String
 
4. Code.gs — Backend Google Apps Script (~2 680 lignes)
Utilitaires de base
generateId(prefix)  → "PREFIX" + timestamp + random  ex: "TX20260310123456"
formatPeriod(date)  → "MM/YYYY" depuis un objet Date GAS
getSheet(name)      → SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name)
 
getInitialData() — Payload de démarrage
Fonction appelée une seule fois au démarrage. Retourne tout l'état initial de l'app :
{
 categories:    [...],   // catégories du plan actif
 transactions:  [...],   // TX du plan actif
 periods:       [...],   // périodes disponibles
 previsions:    [...],   // revenus attendus non-clôturés
 buckets:       [...],   // groupes du plan actif
 debtors:       [...],   // tiers du plan actif
 plans:         [...],   // tous les plans
 projects:      [...],   // projets épargne du plan actif
 currentPlanId: string,
 startupTab:    "budget" | "banque" | "saisie",
 theme:         "dark" | "zen" | "fintech",
 showProgress:  "0" | "1",
 savingsCatId:  string,  // catégorie épargne pour ce plan
 assignCatId:   string,  // catégorie "à assigner" pour ce plan
 totalSavings:  number   // épargne cumulée en €
}
// En cas de crash : retourne { _error: message }
Toutes les valeurs sont forcées dans JSON.parse(JSON.stringify(...)) avant retour. Timeout frontend : 20 secondes.
 
Système Undo/Redo
Stockage dans ScriptProperties (pas UserProperties) :
Champ
Description / Valeurs
undo_snapshot
JSON { action: string, data: {id: string}, ts: number }
redo_snapshot
Même format
Actions trackées : addTransaction, updateTransaction, deleteTransaction, deleteMultiple, duplicateMultiple, toggleCleared, toggleClearedMultiple.
Labels affichés dans l'UI : "Ajout transaction", "Modification transaction", "Suppression transaction", "Suppression multiple", "Duplication multiple", "Pointage transaction", "Pointage multiple".
 
CRUD Transactions
Champ
Description / Valeurs
addTransaction(form)
form = { date, description, category_id, amount, cleared, debtor, sense }. sense "sortie" → amount positif, "entree" → négatif. Génère ID, calcule period. Sauvegarde undo. Retourne _safeReturnTx().
addSplitTransaction(lines)
lines = [{date, description, category_id, amount, cleared, debtor}, ...]. Écrit N lignes avec même date/description.
addBatchTransactions(items)
Écrit toutes les transactions en une passe (utilisé pour la file d'attente).
updateTransaction(form)
form = { id, date, description, category_id, amount, cleared, debtor }. Sauvegarde undo.
deleteTransaction(id)
Cherche la ligne par id, la supprime. Sauvegarde undo.
toggleCleared(id)
Inverse le champ cleared. Sauvegarde undo.
toggleClearedMultiple(ids)
Inverse cleared pour chaque ID. Sauvegarde undo.
deleteMultiple(ids)
Supprime du bas vers le haut pour éviter les décalages d'index.
duplicateMultiple(ids)
Duplique avec nouvel ID et created_at = maintenant.
lockAllCleared()
Set locked=true sur toutes les TX cleared du plan actif.
lockMultiple(ids)
Set locked=true pour les IDs donnés.
unlockMultiple(ids)
Set locked=false pour les IDs donnés.
reconcileTransactions(ids)
Set cleared=true ET locked=true pour les IDs donnés.
toggleLocked(id)
Inverse locked pour un ID.
 
CRUD Budget
Champ
Description / Valeurs
getBudgetByPeriod(period)
Retourne { period, disponible, buckets: [{bucket_id, bucket_name, order, categories: [{category_id, category_name, budgeted, spent, carry, remaining}]}] }. Voir section 7 pour la logique de calcul.
saveBudget(period, category_id, amount)
Met à jour la ligne (period, category_id, plan_id). La crée si absente.
saveBudgetBatch(changes)
changes = [{period, category_id, amount}, ...]. Optimisé en une seule lecture/écriture.
resetBudgetPeriod(period)
Met budgeted=0 pour toutes les catégories de la période et du plan actif.
copyBudgetFromPrevious(period)
Copie les montants budgétés du mois précédent vers la période actuelle.
 
CRUD Prévisions
Champ
Description / Valeurs
addPrevision(form)
form = { date, description, category_id, amount, period }. received=false, closed=false.
updatePrevision(form)
form = { id, date, description, category_id, amount, period }.
deletePrevision(id)
Supprime la ligne.
markPrevisionReceived(previsionId, txId)
Set received=true, linked_tx_id=txId.
linkTransactionsToPrevision(txIds, previsionId)
Set linked_prevision_id=previsionId dans les TX.
unlinkTransactionFromPrevision(txId)
Set linked_prevision_id="" dans la TX.
unlinkPrevision(previsionId)
Set linked_tx_id="" et received=false.
setTransactionSkipLink(txId, skip)
Set skip_link=true/false dans la TX.
closePrevision(previsionId)
Set closed=true. Disparaît de l'affichage.
 
CRUD Épargne (Projets)
Champ
Description / Valeurs
getSavingsData()
Retourne { totalSavings, projects }.
addProject(name, target)
Crée une ligne dans Projets avec allocated=0.
updateProject(projectId, name, target)
Met à jour name et target.
deleteProject(projectId)
Supprime la ligne.
saveProjectAllocations(allocations)
allocations = [{id, allocated}, ...]. Met à jour allocated pour chaque projet.
withdrawFromProject(projectId, amount, desc, date)
Crée 1 TX catégorie=savingsCatId, amount=-Math.abs(amount). Réduit allocated du projet. Retourne { totalSavings, projects, transactions }.
_getTotalSavings(planId, savingsCatId)
Somme tous les amounts de savingsCatId pour le plan. (positifs car dépenses = positifs).
 
Multi-plans
Champ
Description / Valeurs
_getCurrentPlanId()
getUserProperties().getProperty("currentPlanId") || premier plan.
saveCurrentPlan(planId)
Sauvegarde dans UserProperties.
switchPlanAndLoad(planId)
Sauvegarde planId, vide les caches, retourne getInitialData() complet.
addPlan(name, copyFromPlanId)
Crée le plan. Si copyFromPlanId fourni : copie buckets, catégories, tiers (remapping d'IDs). Retourne { plans, newPlanId }.
renamePlan(id, name)
Met à jour le name.
deletePlan(id)
Supprime le plan ET toutes ses données (TX, Budgets, Previsions, Categories, Buckets, Debiteurs). Impossible si seul plan.
_migratePlanId()
Migration silencieuse au 1er chargement : ajoute plan_id=currentPlanId à toutes les lignes sans plan_id. Flag planMigrationDone dans UserProperties.
 
Paramètres — Catégories, Groupes, Tiers
Champ
Description / Valeurs
addCategory(form)
form = { name, bucket_id, plan_id }.
updateCategory(form)
form = { id, name, bucket_id }.
deleteCategory(id)
Supprime seulement si aucune TX liée.
toggleCategoryActive(id, active)
Masque/affiche la catégorie.
reorderCategories(newOrder)
newOrder = array de {id, order} ou array de strings. Met à jour les valeurs order. Déclenche renderSettings() + invalidateBudgetCache() + loadBudget(true).
addBucket / updateBucket / deleteBucket
CRUD standard groupes.
reorderBuckets(newOrder)
Même logique que reorderCategories.
addDebtor / updateDebtor / deleteDebtor
CRUD standard tiers.
 
Préférences (UserProperties)
Champ
Description / Valeurs
startupTab
"budget" | "banque" | "saisie"
theme
"dark" | "zen" | "fintech"
pref_showProgress
"0" | "1"
pref_savingsCatId_PLANID
ID catégorie épargne pour ce plan
pref_savingsCatId
Fallback global
pref_assignCatId_PLANID
ID catégorie "à assigner" pour ce plan
pref_assignCatId
Fallback global
currentPlanId
ID du plan actif
planMigrationDone
"1" si migration déjà effectuée
Undo/Redo stocké dans ScriptProperties (pas UserProperties) : clés "undo_snapshot" et "redo_snapshot".
 
5. Index.html — Structure HTML/CSS/JS (~10 300 lignes)
Structure HTML principale
<html>
 <head>
   [méta PWA, apple-touch-icon ×4 base64 JPEG, theme-color #1E1F24]
   [CSS complet inline ~2 400 lignes]
 </head>
 <body class="theme-dark">
   <div id="splashScreen">   ← Splash screen animé</div>
   <div id="appContainer" style="display:none;">
     <div class="app-header">  ← Header fixe (logo, hamburger, undo, spinner)</div>
     <div id="sideDrawer" class="drawer">  ← Drawer latéral</div>
     <div class="drawer-overlay" id="drawerOverlay">  ← Fond semi-transparent</div>
     <div class="sheet" id="mainSheet">
       <div id="transactionsSection">   ← Onglet Saisie</div>
       <div id="budgetSection">         ← Onglet Budget</div>
       <div id="historySection">        ← Onglet Banque</div>
       <div id="settingsPage">          ← Paramètres</div>
       <div id="savingsPage">           ← Épargne</div>
     </div>
     <nav class="bottom-nav" id="bottomNav">  ← Navigation bottom</nav>
     <div id="selectionBar">  ← Barre sélection multiple</div>
     [tous les modals]
   </div>
   <script>  ← JS complet inline</script>
 </body>
</html>
 
Header
• Logo WIMM depuis Imgur : https://i.imgur.com/qg3GGDc.png
• Bouton hamburger ☰ → openDrawer() / toggleDrawerState()
• Bouton Undo (↩ + label de l'action) → visible si undo disponible, via _checkUndoAvailable()
• Spinner : div id="spinnerOverlay" avec 3 points pulsants (animation CSS), couleur dorée
 
Navigation bottom (4 onglets)
Champ
Description / Valeurs
#nav-tx
+ Saisie → showTransactions()
#nav-budget
SVG camembert + Budget → showBudget()
#nav-history
SVG temple + Banque → showHistory()
#nav-savings
SVG tirelire + Épargne → showSavingsPage()
Onglet actif = classe "active" sur le bouton. Onglet au démarrage = _startupTab (préférence utilisateur).
 
Icônes SVG (nav + drawer)
Champ
Description / Valeurs
Budget (camembert)
Camembert avec 1 slice découpé, dégradé or (FBD72F → C9A800)
Banque (temple)
Colonnes de temple grec, trait or
Tiers (silhouette)
Circle head + path arc, fill FBD72F / stroke C9A800
Épargne (tirelire)
Cochon tirelire avec fente en haut, slot pour pièce, pattes, queue spirale
Paramètres (soleil)
Cercle central FBD72F avec rayons C9A800
 
Liste des Modals
Tous ouverts/fermés par classList.add/remove("active") :
• deleteModal
• bulkDeleteModal
• editModal
• addModal
• lockModal
• reconcileModal
• transfertModal
• rolloverModal
• previsionModal
• linkTxModal
• infoModal
• copyPrevModal
• resetBudgetModal
• unlockModal
• newPlanModal
• switchPlanModal
• catModal
• bucketModal
• debtorModal
• budgetCatModal
• newDebtorSuggestModal
• addProjectModal
• editProjectModal
• deleteProjectModal
• withdrawModal
 
6. Onglet Saisie (id="transactionsSection")
Segment control (3 modes)
Champ
Description / Valeurs
↑ Dépense
sense="sortie" → amount stocké POSITIF
↓ Revenu
sense="entree" → amount stocké NÉGATIF
⏳ Attendu
sense="prevision" → crée une prévision (Previsions) au lieu d'une TX
 
Formulaire principal
Champ
Description / Valeurs
#date
input[type=date] — initialisé à aujourd'hui au chargement
#debtorInput
input[type=text] — dropdown autocomplete bénéficiaire
#description
input[type=text] — optionnel
#simpleCategory
select — catégories du plan actif
#simpleAmount
input[type=text] — mode TPE activé
#txClearedBtn
Toggle bouton — classe "active-clr" = pointé
Bouton "✂️ Ventiler"
Active le mode split (ventilation)
Bouton "🗑 Effacer"
clearForm() — remet à zéro tous les champs
 
Mode Split (ventilation)
• #totalAmount : montant total saisi
• #resteBadge : badge "Reste" — vert si OK (équilibré), rouge si écart
• #splitLines : div avec les lignes dynamiques
• Bouton "＋ Catégorie" → addSplitLine() : ajoute une ligne (select catégorie + input montant + bouton ✕)
 
File d'attente (Queue)
• Bouton "＋ File d'attente" → addToQueue() : ajoute à _txQueue localement (pas d'appel GAS)
• Bouton "⚡ Direct" → saveTransaction() : sauvegarde immédiatement via addTransaction()
• #queueSection : section "📋 En attente" avec compteur #queueCount
• Bouton "✅ Soumettre tout" → submitQueue() → addBatchTransactions() (1 seul appel GAS)
• Chaque item dans la file peut être supprimé individuellement
 
Dropdown Bénéficiaire (Autocomplete)
• Filtré sur la frappe (onDebtorTyping)
• Navigation clavier : flèches ↑↓, Entrée, Échap
• Fermeture onblur avec délai 200ms (scheduleCloseDebtor)
• Si tiers inconnu : propose de créer → _openNewDebtorSuggestModal(name, defaultCatId)
• Sélectionner un tiers → remplit automatiquement la catégorie par défaut du tiers
 
Mode TPE (saisie montant) — Implémentation _initTPE(el)
Appliqué à tous les inputs montant : simpleAmount, totalAmount, montants split, et montants budget.
État interne : el._tpeCents (en centimes), el._tpeOpMode (null | + - * /),
              el._tpeOpBase (nombre avant opérateur), el._tpeOpStr (string 2e opérande)
 
Au focus : lire la valeur existante → convertir en centimes
Chiffres 0-9 : ajouter à droite (centimes)
 ex: appui 1 2 3 4 → 0.01 → 0.12 → 1.23 → 12.34
Backspace : effacer le dernier chiffre (floor / 10)
Opérateurs + - * / : passer en mode opération
Enter/Tab en mode opération : confirmer le calcul
 ex: "12.50" puis "+", puis "3", puis Enter → 15.50
Escape : annuler le mode opération
Maximum : 99 999.99€
Mobile : intercepte l'événement "input" → extrait les chiffres → recalcule
 
7. Onglet Budget (id="budgetSection")
Zone fixe en haut (.budget-sticky-top)
• Sélecteur de période : select #periodSelect avec boutons ‹ ›
• Carte "À assigner" (#disponibleCard) : jaune si positif, rouge si négatif. Title = "Revenus reçus − total budgété. Indépendant des reports de périodes." Affiche #disponibleValue.
• Carte Projection (#projectionCard) : repliable. En-tête toujours visible (titre + résultat).
• Barre d'actions : ▼ Tout déplier, ▲ Tout replier, ⚠️ Filtre dépassements, 📊 Barres de progression, 📋 Copier budget, 🗑 RAZ, ＋ Ajouter TX
 
Carte Projection (détail repliable)
Champ
Description / Valeurs
#projSoldePrev
🏦 Solde prévisionnel = pointé + non-pointé (TOUTES TX)
#projEntreesValue
➕ Revenus attendus non reçus jusqu'à fin de période
#projResteDepenser
➖ Reste à dépenser (Σ max(0, remaining) des catégories)
Projection
soldePrev + entreesAttendues − resteADepenser
 
Structure d'un groupe (bucket)
┌──────────────────────────────────────────────────────────┐
│ ▼ Nom du groupe                    [total restant groupe] │
│  Catégorie 1    [input budgété]    [X.XX€ restant] [barre]│
│  Catégorie 2    [input budgété]    [X.XX€ restant] [barre]│
│  ...                                                      │
│  [Ligne total groupe : Σbudgété / Σdépensé / Σrestant]    │
└──────────────────────────────────────────────────────────┘
 
Ligne de catégorie
• Nom : clic → openBudgetCatModal(catId, period)
• Input montant budgété : mode TPE, sauvegarde onblur ou Entrée → saveBudget()
• Affichage "Restant" (budgeted − spent + carry) : vert si >0, rouge si <0, gris si =0
• Barre de progression (si showProgress=true) : fill = spent / (budgeted + carry) × 100%
• Catégories masquées : regroupées sous "👁 X catégorie(s) masquée(s)" (bouton repliable)
 
Modal catégorie budget (budgetCatModal)
• Renommer la catégorie
• Masquer la catégorie (seulement si 0€ assigné et 0€ restant)
• Transférer le budget → openTransfertModal()
 
Modal transfert (transfertModal)
• Slider 0% à 100% du montant à transférer
• Source : catégorie cliquée, cible : select parmi autres catégories du même plan
• Validation → saveBudgetBatch([{catSource, −montant}, {catCible, +montant}])
 
8. Onglet Banque (id="historySection")
Zone fixe en haut (.history-sticky-top)
Barre de 3 soldes :
Champ
Description / Valeurs
#soldePointe
✓ Pointé = Σ(−amount) des TX cleared
#soldeNonPointe
○ Non pointé = Σ(−amount) des TX !cleared. Cliquable si négatif → active filtre "Non pointées"
#soldePrevisionnel
⟳ Prévisionnel = Pointé + Non pointé (TOUTES les TX sans distinction)
Bouton 🔒 Réconcilier → openReconcileModal().
 
Filtres disponibles
Champ
Description / Valeurs
#filterPeriod
select — filtre par période
#filterCategory
select — filtre par catégorie
#filterDebtor
select — filtre par tiers
#filterSense
select — Tous / ↓ Entrées / ↑ Sorties
#filterUncleared
checkbox — Non pointées uniquement
#filterLocked
checkbox — Masquer verrouillées (cochée par défaut)
Bouton "Tout sélect."
selectAll() — sélectionne uniquement les TX visibles après filtres
Bouton ✕
resetAllFilters() — remet tout à zéro
 
Sous-total (barre flottante)
Champ
Description / Valeurs
#subEntrees
Σ(−amount) des TX négatives visibles
#subSorties
Σ(−amount) des TX positives visibles
#subSolde
subEntrees + subSorties
 
Ligne de transaction
[☐] [icône état] [Date] [Bénéficiaire / Description] [Catégorie] [Montant]
 
États visuels :
 Normale      → fond var(--card)
 Pointée      → fond vert-soft (cleared=true)
 Verrouillée  → fond gris (locked=true), curseur not-allowed
 Sélectionnée → fond highlight doré
 
Interactions :
 Clic bref sur la ligne → toggle cleared (si non verrouillée)
 Clic long (500ms) ou bouton "⋮" → menu contextuel
 
Menu contextuel (long press ou "⋮")
Champ
Description / Valeurs
Modifier
→ openEditModal(id)
Dupliquer
→ duplicateMultiple([id])
Supprimer
→ openDeleteModal(id)
Verrouiller
→ lockMultiple([id])
Déverrouiller
→ unlockMultiple([id])
Lier à un revenu attendu
→ openLinkTxModal(previsionId ou null)
Ne pas lier
→ setTransactionSkipLink(id, true)
Délier
→ unlinkTransactionFromPrevision(id)
 
Barre de sélection multiple (#selectionBar)
• Apparaît quand ≥1 transaction sélectionnée
• Actions disponibles : Pointer, Supprimer, Dupliquer, Verrouiller, Délier
• #selectionInfo : affiche "X sélectionnée(s)"
• Se synchronise avec le drawer (left = 70px ou min(85vw, 340px) si drawer épinglé)
 
Section Revenus attendus (en bas)
• Séparateur cliquable → _togglePrevisionsSection() → déploie/replie
• Titre : "💰 Revenus attendus" + badge compteur #previsionsCount
• Masqué par défaut. Chaque ligne : date, description, catégorie, montant attendu vs reçu
• Bouton 🔗 lier → openLinkTxModal(prevId) → sélectionner TX à associer
• Bouton ✕ clôturer → closePrevision(id)
• Couleurs : vert si reçu, orange si partiel, gris si en attente
 
9. Onglet Épargne (id="savingsPage")
Structure visuelle
• #savingsTotal : montant total épargne en €
• #savingsUnallocWrap / #savingsUnalloc : montant non alloué (visible si > 0)
• #btnAssignRest : "Répartir le reste" (visible si unalloc > 0 et projets existent)
• #savingsProjectList : liste des cartes projets
• #savingsEmpty : message affiché si aucun projet
 
Carte projet
┌─────────────────────────────────────────────────────────┐
│ [Nom projet]                    [X.XX €]  [input direct]│
│ [X% de l'objectif Y.YY€ (si target > 0)]              │
│ [Barre de progression vers objectif]                    │
│ ─────────────────────────────────────────────────       │
│ [Slider ══════●══] X%                                   │
│ ─────────────────────────────────────────────────       │
│ [✏️ Modifier]  [🗑 Supprimer]  [💸 Utiliser]  [＋]     │
└─────────────────────────────────────────────────────────┘
 
Logique des sliders (zéro-sum)
• Chaque slider va de 0 à totalSavings
• Valeur locale dans _sliderDraft[projectId]
• Déplacer un slider redistribue le surplus vers les autres au prorata
• Σ _sliderDraft ne peut pas dépasser _totalSavings
• Input numérique direct disponible à côté du slider
• Bouton "＋ Ajouter" sur un projet : assigne tout l'unalloc à ce projet
• Bouton "💾 Enregistrer" → saveProjectAllocations(allProjects.map(p => ({id, allocated: _sliderDraft[p.id]})))
 
Flux retrait d'épargne (withdrawModal)
• Déclenché par "💸 Utiliser" sur une carte projet
• Champs : montant, description, date
• Backend withdrawFromProject : crée 1 TX (catégorie=savingsCatId, amount=−Math.abs(amount)), réduit allocated
• Frontend afterWithdrawal : _totalSavings = data.totalSavings, allProjects = data.projects, afterMutation(data.transactions), _renderSavings()
 
_recomputeSavingsFromTx (recalcul en mémoire)
function _recomputeSavingsFromTx() {
 let total = 0;
 allTransactions.forEach(t => {
   if (String(t.category_id) === String(_savingsCatId)) {
     total += Number(t.amount) || 0;
   }
 });
 _totalSavings = Math.round(total * 100) / 100;
}
// IMPORTANT : ne pas appeler _renderSavings() ici (risque de boucle)
// Appelé dans afterMutation, protégé par try/catch
 
10. Paramètres (id="settingsPage")
5 onglets
Champ
Description / Valeurs
stab-categories
Gestion des catégories avec boutons ↑/↓ (pas drag-and-drop)
stab-buckets
Gestion des groupes avec boutons ↑/↓
stab-debtors
Gestion des tiers (triés par catégorie par défaut puis par nom)
stab-prefs
Préférences (actif par défaut à l'ouverture)
stab-plans
Gestion des plans multi-plans
 
Panel Préférences (stab-prefs)
• Onglet de démarrage : 3 boutons Budget / Banque / Saisie → saveStartupTab(tab)
• Catégorie épargne : select #prefSavingsCat → saveSavingsCatId(catId)
• Catégorie À assigner : select #prefAssignCat → saveAssignCatId(catId)
• Barres de progression : toggle → pref_showProgress "0"/"1"
Thème visuel (3 options avec swatches colorés) :
Champ
Description / Valeurs
🌙 Dark Doré (dark)
Swatch gradient #1E1F24 / #FBD72F
🌿 Zen & Organique (zen)
Swatch gradient #FBFBF9 / #789585
⚡ Néo-Fintech (fintech)
Swatch gradient #0B0E14 / #6366F1
 
Panel Plans (stab-plans)
• Liste des plans. Plan actif marqué d'un badge.
• Bouton "＋ Nouveau plan" → _openNewPlanModal() : nom + option "Copier depuis" (select)
• Bouton Activer → switchPlanAndLoad(id) → recharge tout via getInitialData()
• Bouton Renommer → renamePlan(id, name)
• Bouton Supprimer → confirmation → deletePlan(id) (impossible si seul plan)
 
11. Drawer (id="sideDrawer")
Comportements
• S'ouvre par bouton ☰ du header → openDrawer()
• En mode non-épinglé : overlay semi-transparent (#drawerOverlay), se ferme au clic extérieur
• Peut être épinglé : togglePin() → classe "drawer-pinned-mode" sur body, margin-left sur .app
• Épinglé : drawer toujours visible à gauche, le contenu se décale de min(85vw, 340px)
• Bouton hamburger : si épinglé → dépingler + fermer ; si ouvert → fermer ; sinon → ouvrir
 
Contenu du drawer
Champ
Description / Valeurs
Header
Bouton épingle (📌) + Logo Imgur + texte "WIMM?" / "Where's my Money?"
Carte solde
#drawerSoldePrev : solde prévisionnel total
Sélecteur plan
select #planDrawerSelect (doré, 100%) → onChange = _switchPlan(planId)
Section Navigation
Budget (SVG camembert), Banque (SVG temple)
Section Gestion
Tiers (#drawerSubDebtors = nb tiers), Épargne (#drawerSubSavings = totalSavings), Paramètres (SVG engrenage)
 
12. Système de thèmes
Application via classe CSS sur <body> : "theme-dark" | "theme-zen" | "theme-fintech". Changement immédiat sans rechargement.
 
Thème Dark Doré (défaut) — body.theme-dark
Champ
Description / Valeurs
--bg
#1E1F24 (fond global)
--sheet
#16171B (fond sheet principale)
--card
#26272D (fond des cartes)
--surface
#2E2F36 (surfaces secondaires)
--segment
#303138 (bordures, séparateurs)
--text
#EEEDE8 (texte principal)
--text-muted
#8A8B8E (texte secondaire)
--text-on-primary
#111111 (texte sur fond or)
--primary
#FBD72F (or WIMM)
--primary-dark
#D4B21F
--primary-glow
rgba(251,215,47,0.14)
--red / --red-soft
#E74C3C / rgba(231,76,60,0.12)
--green / --green-soft
#2ECC71 / rgba(46,204,113,0.12)
--blue
#3B82F6
--radius-card / --radius-btn / --radius-input
18px / 14px / 10px
--font-amount
inherit (poids 700)
 
Thème Zen & Organique — body.theme-zen
Champ
Description / Valeurs
--bg
#FBFBF9 (blanc cassé chaud)
--card
#FFFFFF
--text
#2C363F (anthracite foncé)
--primary
#789585 (vert sauge)
--primary-dark
#5F7A6A
--red
#D96C5B
--green
#6A9E7F
--radius-card / --radius-btn
22px / 18px (plus arrondi)
--font-amount-weight
600
Bottom nav
fond blanc 96%, bordure segment, shadow légère
Nav item actif
gradient primaire vert, shadow glow, texte blanc
 
Thème Néo-Fintech — body.theme-fintech
Champ
Description / Valeurs
--bg
#0B0E14 (noir quasi-absolu)
--card
#111520
--surface
#161B28
--text
#E2E8F0
--text-muted
#64748B
--primary
#6366F1 (indigo électrique)
--primary-dark
#4F46E5
--red
#F43F5E
--green
#10B981
--blue
#06B6D4 (cyan)
--radius-card / --radius-btn
14px / 10px (moins arrondi)
--font-amount
'Courier New', 'Consolas', monospace (style terminal)
--shadow-card
0 0 0 1px rgba(99,102,241,0.08), 0 4px 20px rgba(0,0,0,0.5)
 
13. Splash Screen & PWA
Splash Screen (id="splashScreen")
Champ
Description / Valeurs
Position
fixed, z-index 9999, fond #141416, animation splashIn (0.6s)
Logo
300×300px, clip-path inset(9% round 20px), animation splashPulse (scale + translateY)
Halo doré
440×440px, radial-gradient jaune centré, animation splashGlow
Texte WIMM?
38px, poids 900 — le "?" en doré (#fed730)
Tagline
"WHERE'S MY MONEY?" 12px, uppercase, letter-spacing 2px, opacité 30%
Barre chargement
Animation splashFill (1.8s, gradient vert de gauche à droite)
Disparition
classList.add("hidden") après chargement — fade out CSS 0.6s puis remove()
 
PWA
• apple-touch-icon ×4 (tailles : défaut, 180×180, 152×152, 120×120) — JPEG base64 dans le <head>
• theme-color : #1E1F24
• Pas de service worker (limites GAS)
• URL du script GAS = seule URL d'accès (pas de domaine personnalisé)
 
Démarrage (init())
Champ
Description / Valeurs
Timeout
20 secondes — affiche _showInitError() si GAS ne répond pas
Vérification
google.script.run présent ? sinon erreur "ouvrir via URL GAS"
Succès
Charge toutes les données, applique thème, affiche l'onglet startupTab, cache le splash
Erreur GAS
_showInitError() : bannière rouge dans mainSheet avec bouton "↺ Réessayer"
Exception JS
Même bannière avec le message de l'exception
 
14. Système Multi-plans
Chaque plan est un univers complètement isolé. Tout est filtré par plan_id :
• Transactions (Banque)
• Catégories (Categories)
• Groupes (Bucket)
• Tiers (Debiteurs)
• Budgets (Budgets)
• Prévisions (Previsions)
• Projets d'épargne (Projets)
• Préférences catégorie épargne et "à assigner"
 
Création d'un plan avec "Copier depuis"
• Copie les buckets (remapping d'IDs)
• Copie les catégories (remapping bucket_id)
• Copie les tiers actifs
• NE copie PAS les transactions ni les budgets
 
Changement de plan (_switchPlan)
• Sauvegarde currentPlanId en UserProperties
• Affiche le spinner
• Appelle switchPlanAndLoad(planId) → retourne getInitialData() complet
• Recharge TOUTES les données, réinitialise tous les filtres Banque, ferme le drawer
 
15. Logiques de calcul critiques
Calcul "À assigner" (disponible) — dans getBudgetByPeriod()
Étape 1 : totalEntreesJusquaMois
 = −Σ(amount) TX catégorie aAssignerId pour tous les mois ≤ currentPeriod
 (négatif car revenus = négatifs dans le sheet, on inverse)
 
Étape 2 : totalAssigneJusquaMois
 = Σ(budgeted) feuille Budgets pour catégories ≠ aAssignerId,
   tous les mois ≤ currentPeriod, pour le plan actif
 
Étape 3 : totalAssigneGlobal
 = même chose TOUS les mois (sans borne temporelle)
 
Étape 4 : disponible (avec EPS = 0.005 pour arrondi centimes)
 if (totalEntrees > totalAssigneGlobal + EPS)
   disponible = totalEntrees - totalAssigneGlobal   (surplus positif)
 else if (totalEntrees >= totalAssigneJusquaMois - EPS)
   disponible = 0                                    (situation couverte)
 else
   disponible = totalEntrees - totalAssigneJusquaMois  (déficit négatif)
disponible est indépendant des carry-forwards de catégories. Il reflète uniquement revenus reçus − total budgété.
 
Carry-forward cumulatif par catégorie
Pour chaque catégorie, pour la période P :
 
carryMap[cId].budgeted = Σ budgeted[période < P]  (pour ce plan)
carryMap[cId].spent    = Σ amount TX[période < P]  (pour ce plan)
 
cat.carry     = carryMap.budgeted - carryMap.spent   (arrondi à 2 décimales)
cat.remaining = cat.budgeted - cat.spent + cat.carry  (arrondi à 2 décimales)
 
→ remaining est positif si enveloppe non épuisée, négatif si dépassement
→ Le carry peut être négatif si spending cumulé > budget cumulé
 
Calcul des soldes (computeSoldes())
allTransactions.forEach(t => {
 const val = -(Number(t.amount) || 0);   // inversion du signe
 if (t.cleared) pointe += val;
 else nonPointe += val;
 // Note : previsionnel (ancien) n'est plus utilisé dans l'UI finale
});
 
#soldePointe       = pointe
#soldeNonPointe    = nonPointe  (cliquable si < 0 → active filtre)
#soldePrevisionnel = pointe + nonPointe  (= TOUTES les TX)
 
Calcul Projection fin de période (updateProjection())
1. soldePrev = Σ(−amount) de toutes les TX (cleared ou non)
 
2. entreesAttendues = Σ max(0, amtTotal − amtReçu) des prévisions
  où amtReçu = Σ |amount| des TX liées à cette prévision
  filtrées sur period ≤ période affichée
 
3. resteADepenser = Σ max(0, remaining) par catégorie
  → depuis window._budgetCatDetails (mis à jour lors du dernier loadBudget)
  → fallback si absent : _budgetPeriodAssigned + _budgetGrandCarry
 
4. projection = soldePrev + entreesAttendues - resteADepenser
 
Normalisation des transactions (_normalizeTxList)
function _normalizeTx(tx) {
 if (!tx) return tx;
 tx.debtor = tx.debtor || tx.payee || tx.beneficiary || tx.debtorName || tx.creditor || "";
 tx.linked_prevision_id = tx.linked_prevision_id || "";
 return tx;
}
// Aussi appliqué : cleared = === true || "TRUE" || 1 (booléen forcé)
//                  locked = même chose
//                  amount = Number()
//                  Si transactions null → retourne []
 
Format des dates
Champ
Description / Valeurs
Stockage dans GAS
Objet Date GAS (natif)
Retour via _getAllTransactions()
String "dd/MM/yyyy" via Utilities.formatDate() + getScriptTimeZone()
Format période
"MM/YYYY" — ex: "03/2026"
periodToNum (comparaisons)
parseInt(année) × 100 + parseInt(mois)
Parsing frontend
date.split("/") → [jour, mois, année]
Parsing période frontend
period.split("/") → [mois, année]
 
formatEuro (affichage montants)
function formatEuro(amount) {
 const n = Number(amount);
 if (isNaN(n)) return "0,00 €";
 return n.toLocaleString("fr-FR", {
   style: "currency", currency: "EUR",
   minimumFractionDigits: 2, maximumFractionDigits: 2
 });
}
// Résultat : "1 234,56 €" (locale fr-FR)
 
16. Bugs connus & Roadmap
Bugs ouverts
🚨 Bug 1 — Crash démarrage startupTab : getUserProperties() dans saveStartupTab peut crasher. Fix partiel : try/catch dans getInitialData(). Il faut aussi ajouter un try/catch dans saveStartupTab lui-même.
🚨 Bug 2 — Drag-and-drop Paramètres : remplacé par boutons ↑/↓, mais vérifier que reorderCategories reçoit bien le bon format de payload (array de {id, order}).
 
Roadmap — Features planifiées
Champ
Description / Valeurs
1. Modals → Bottom sheets
Tous les modals doivent monter depuis le bas (style iOS). Poignée de drag, fond semi-transparent.
2. Mobile layout
Harmonisation font-sizes, padding, touch targets sur tous les onglets.
3. Bouton "Économiser"
Modal avec curseurs par catégorie (zéro-sum → épargne). Animation de célébration + rappel virement bancaire.
4. Bouton "Utiliser l'épargne"
Symétrique à Économiser. Friction volontaire. Curseurs de répartition par catégorie.
5. Notes catégories budget (💬)
Icône 💬 sur chaque ligne. Tap/hover = affiche/édite note. Stockage colonne "note" dans feuille Budgets (par mois + plan_id).
6. Report budget mensuel
Bouton "Reprendre le budget de [mois précédent]". Modal avec checkbox par catégorie → copyBudgetFromPrevious filtré.
7. Feedback haptique iOS
Sur les mutations si navigator.vibrate disponible.
8. Performance
Cache plus agressif getBudgetByPeriod, pagination transactions si grand volume.
 
17. Pièges d'implémentation — À retenir impérativement
🚨 SIGNE DES MONTANTS : Ne jamais afficher amount directement. Toujours val = −amount. Seule exception : _totalSavings = somme directe (pas inversée).
 
🚨 _safeReturnTx OBLIGATOIRE : Toutes les fonctions GAS retournant des transactions DOIVENT utiliser return _safeReturnTx(_getAllTransactions(categories, planId)).
 
🚨 PLAN_ID DANS TOUTES LES MUTATIONS : Chaque nouvelle TX, catégorie, groupe, tiers, prévision, projet DOIT avoir plan_id = _getCurrentPlanId(). Oublier = donnée visible sur tous les plans.
 
⚠ CACHE BUDGET : window._budgetCatDetails est invalidé par invalidateBudgetCache(). Ne jamais calculer le disponible côté frontend depuis ce cache. Le disponible doit venir du serveur via getBudgetByPeriod().
 
⚠ _recomputeSavingsFromTx SANS _renderSavings : Dans afterMutation, ne pas appeler _renderSavings() depuis _recomputeSavingsFromTx pour éviter une boucle infinie.
 
⚠ DATES EN GAS : Les objets Date GAS sont non-sérialisables via google.script.run. _safeReturnTx() force JSON.parse(JSON.stringify(...)). Les dates sont formatées en "dd/MM/yyyy" dans _getAllTransactions().
 
⚠ CATÉGORIE "À ASSIGNER" vs catégorie ÉPARGNE : Ces deux catégories ne sont PAS dans les enveloppes budget normales. La catégorie "À assigner" est exclue du calcul des buckets dans getBudgetByPeriod().
 
⚠ SPINNER : showSpinner() au début de chaque appel GAS. hideSpinner() est appelé dans afterMutation (pas dans loadBudget si budget visible — loadBudget gère lui-même le hideSpinner).
 
18. Checklist d'installation sur un nouveau Spreadsheet
• 1. Créer un Google Spreadsheet
• 2. Créer les 10 feuilles avec les noms exacts (voir section 3)
• 3. Ajouter les en-têtes dans chaque feuille (1ère ligne = noms des colonnes exacts)
• 4. Créer Code.gs dans Extensions → Apps Script
• 5. Créer Index.html dans le même projet GAS
• 6. Déployer : Déployer → Nouveau déploiement → Application Web → Accès : Moi
• 7. Créer le Plan par défaut : une ligne dans Plans { id: "PLAN001", name: "Principal", active: true }
• 8. Créer la catégorie "À assigner" : { id: "CAT001", name: "À assigner", active: true, plan_id: "PLAN001" }
• 9. Auto-génération des périodes : _autoGeneratePeriods() sera appelé au 1er getInitialData()
• 10. Accéder à l'URL du déploiement (pas depuis l'éditeur GAS)
 
En-têtes exactes par feuille
Champ
Description / Valeurs
Banque
id | date | period | description | category_id | category_name | amount | debtor | cleared | locked | skip_link | linked_prevision_id | plan_id | created_at
Budgets
period | category_id | budgeted | plan_id
Categories
id | name | bucket_id | order | active | plan_id
Bucket
id | name | order | plan_id
Periodes
id | period
Previsions
id | date | period | description | category_id | amount | received | linked_tx_id | plan_id | closed
Debiteurs
id | name | default_category_id | active | plan_id
Plans
id | name | active
Projets
id | name | target | allocated | plan_id
AppMeta
(vide, réservé)
 