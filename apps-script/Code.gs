
// ================= CONFIG =================
const SHEETS = {
TRANSACTIONS: "Banque",
BUDGETS:      "Budgets",
CATEGORIES:   "Categories",
BUCKETS:      "Bucket",
PERIODS:      "Periodes",
PREVISIONS:   "Previsions",
DEBTORS:      "Debiteurs",
META:         "AppMeta",
PLANS:        "Plans",
PROJECTS:     "Projets"
};

// ================= ENTRY =================
function doGet() {
return HtmlService
.createHtmlOutputFromFile("Index")
.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ⚡ TEST VERSION — À exécuter depuis l'éditeur GAS pour vérifier que ce Code.gs est actif
function getVersion() {
return "V2-OK — getInitialData / addDebtor / addCategory / addBucket présents";
}

// ================= UTILITIES =================
function getSheet(name) {
return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}
function generateId(prefix) {
return prefix + "-" + Utilities.getUuid();
}
function formatPeriod(date) {
return Utilities.formatDate(date, Session.getScriptTimeZone(), "MM/yyyy");
}
function normPeriod(val) {
if (val instanceof Date) return Utilities.formatDate(val, Session.getScriptTimeZone(), "MM/yyyy");
return String(val);
}
function _safe(fn) {
try { return fn(); } catch(e) { return { _error: e.message || String(e) }; }
}

// ================= UNDO SYSTEM =================
function _saveUndoSnapshot(action, data) {
const props = PropertiesService.getScriptProperties();
props.setProperty("undo_snapshot", JSON.stringify({ action, data, ts: Date.now() }));
props.deleteProperty("redo_snapshot");
}

function _clearUndo() {
PropertiesService.getScriptProperties().deleteProperty("undo_snapshot");
}

// ================= REDO SYSTEM =================
function _saveRedoSnapshot(action, data) {
PropertiesService.getScriptProperties()
.setProperty("redo_snapshot", JSON.stringify({ action, data, ts: Date.now() }));
}

function _clearRedo() {
PropertiesService.getScriptProperties().deleteProperty("redo_snapshot");
}

const _origSaveUndo = _saveUndoSnapshot;
function getUndoRedoInfo() {
const props = PropertiesService.getScriptProperties();
const undoSnap = props.getProperty("undo_snapshot");
const redoSnap = props.getProperty("redo_snapshot");
const labels = {
addTransaction:        "Ajout transaction",
updateTransaction:     "Modification transaction",
deleteTransaction:     "Suppression transaction",
deleteMultiple:        "Suppression multiple",
duplicateMultiple:     "Duplication multiple",
toggleCleared:         "Pointage transaction",
toggleClearedMultiple: "Pointage multiple"
};
const undoLabel = undoSnap ? (labels[JSON.parse(undoSnap).action] || "Action") : null;
const redoLabel = redoSnap ? (labels[JSON.parse(redoSnap).action] || "Action") : null;
return { undoLabel, redoLabel };
}

function redoLastAction() {
const snap = PropertiesService.getScriptProperties().getProperty("redo_snapshot");
if (!snap) return { error: "Rien à rétablir" };

const { action, data } = JSON.parse(snap);
const sheet     = getSheet(SHEETS.TRANSACTIONS);
const sheetData = sheet.getDataRange().getValues();
const headers   = sheetData[0];
const idIndex   = headers.indexOf("id");

switch (action) {
case "addTransaction": {
for (let i = sheetData.length - 1; i >= 1; i--) {
if (String(sheetData[i][idIndex]) === String(data.id)) {
sheet.deleteRow(i + 1);
break;
}
}
break;
}
case "deleteTransaction":
case "deleteMultiple": {
const ids = new Set((data.rows || []).map(r => String(r.id)));
for (let i = sheetData.length - 1; i >= 1; i--) {
if (ids.has(String(sheetData[i][idIndex]))) sheet.deleteRow(i + 1);
}
break;
}
case "toggleCleared":
case "toggleClearedMultiple": {
const clearedIndex = headers.indexOf("cleared");
// Batch: read-modify-write cleared column
const clrColRedo = sheet.getRange(2, clearedIndex + 1, sheetData.length - 1, 1).getValues();
for (let i = 1; i < sheetData.length; i++) {
const id = String(sheetData[i][idIndex]);
if (data.oldStates[id] !== undefined) {
clrColRedo[i - 1][0] = !data.oldStates[id];
}
}
sheet.getRange(2, clearedIndex + 1, clrColRedo.length, 1).setValues(clrColRedo);
break;
}
case "duplicateMultiple": {
const newIds = new Set(data.newIds.map(String));
for (let i = sheetData.length - 1; i >= 1; i--) {
if (newIds.has(String(sheetData[i][idIndex]))) sheet.deleteRow(i + 1);
}
break;
}
}

_saveUndoSnapshot(action, data);
_clearRedo();
const categories = _getCategories();
return { transactions: _getAllTransactions(categories) };
}

function getUndoInfo() {
const snap = PropertiesService.getScriptProperties().getProperty("undo_snapshot");
if (!snap) return null;
const { action } = JSON.parse(snap);
const labels = {
addTransaction:        "Ajout transaction",
updateTransaction:     "Modification transaction",
deleteTransaction:     "Suppression transaction",
deleteMultiple:        "Suppression multiple",
duplicateMultiple:     "Duplication multiple",
toggleCleared:         "Pointage transaction",
toggleClearedMultiple: "Pointage multiple",
toggleLocked:          "Verrouillage transaction",
updateBudget:          "Modification budget",
updateBudgetBatch:     "Modification budget",
reconcile:             "Réconciliation",
addPrevision:          "Ajout prévision",
updatePrevision:       "Modification prévision",
deletePrevision:       "Suppression prévision"
};
return { label: labels[action] || action };
}

function undoLastAction() {
const snap = PropertiesService.getScriptProperties().getProperty("undo_snapshot");
if (!snap) return { error: "Rien à annuler" };

const { action, data } = JSON.parse(snap);
const sheet = getSheet(SHEETS.TRANSACTIONS);
const sheetData = sheet.getDataRange().getValues();
const headers = sheetData[0];
const idIndex = headers.indexOf("id");
switch (action) {
case "addTransaction": {
for (let i = sheetData.length - 1; i >= 1; i--) {
if (String(sheetData[i][idIndex]) === String(data.id)) {
sheet.deleteRow(i + 1);
break;
}
}
break;
}
case "updateTransaction": {
for (let i = 1; i < sheetData.length; i++) {
if (String(sheetData[i][idIndex]) === String(data.id)) {
const restoredRow = headers.map(h => data.oldRow[h] !== undefined ? data.oldRow[h] : sheetData[i][headers.indexOf(h)]);
sheet.getRange(i + 1, 1, 1, restoredRow.length).setValues([restoredRow]);
const pIdx = headers.indexOf("period");
if (pIdx >= 0) sheet.getRange(i + 1, pIdx + 1).setNumberFormat("@");
break;
}
}
break;
}
case "deleteTransaction":
case "deleteMultiple": {
const rows = data.rows;
rows.forEach(oldRow => {
const row = headers.map(h => oldRow[h] !== undefined ? oldRow[h] : "");
const newIndex = sheet.getLastRow() + 1;
sheet.getRange(newIndex, 1, 1, row.length).setValues([row]);
const periodCol = headers.indexOf("period");
if (periodCol >= 0) sheet.getRange(newIndex, periodCol + 1).setNumberFormat("@");
});
break;
}
case "duplicateMultiple": {
const newIds = new Set(data.newIds.map(String));
for (let i = sheetData.length - 1; i >= 1; i--) {
if (newIds.has(String(sheetData[i][idIndex]))) {
sheet.deleteRow(i + 1);
}
}
break;
}
case "toggleCleared":
case "toggleClearedMultiple": {
const clearedIndex = headers.indexOf("cleared");
const lockedIdx2   = headers.indexOf("locked");
const oldStates = data.oldStates;
// Batch: read-modify-write cleared column
const clrColUndo = sheet.getRange(2, clearedIndex + 1, sheetData.length - 1, 1).getValues();
for (let i = 1; i < sheetData.length; i++) {
const id = String(sheetData[i][idIndex]);
if (oldStates[id] !== undefined) {
// Ne pas dépointer une transaction verrouillée
const isLocked = sheetData[i][lockedIdx2] === true || sheetData[i][lockedIdx2] === "TRUE" || sheetData[i][lockedIdx2] === 1;
if (!isLocked) {
clrColUndo[i - 1][0] = oldStates[id];
}
}
}
sheet.getRange(2, clearedIndex + 1, clrColUndo.length, 1).setValues(clrColUndo);
break;
}
case "reconcile": {
const lockedIdx = headers.indexOf("locked");
const oldStates = data.oldStates;
// Batch: read-modify-write locked column
const lckColUndo = sheet.getRange(2, lockedIdx + 1, sheetData.length - 1, 1).getValues();
for (let i = 1; i < sheetData.length; i++) {
const id = String(sheetData[i][idIndex]);
if (oldStates[id] !== undefined) {
lckColUndo[i - 1][0] = oldStates[id];
}
}
sheet.getRange(2, lockedIdx + 1, lckColUndo.length, 1).setValues(lckColUndo);
break;
}
case "toggleLocked": {
const lockedIdx    = headers.indexOf("locked");
const clearedIdx   = headers.indexOf("cleared");
for (let i = 1; i < sheetData.length; i++) {
if (String(sheetData[i][idIndex]) === String(data.id)) {
// Restaurer verrouillage
sheet.getRange(i + 1, lockedIdx + 1).setValue(data.wasLocked);
// Si on déverrouille (wasLocked=true → on remet false) et que wasCleared=true,
// le pointage reste intact — on ne le touche pas.
// Si on annule un verrouillage qui avait forcé un non-pointage : restaurer
// (cas impossible car toggleLocked ne modifie pas cleared)
break;
}
}
break;
}
case "updateBudget": {
const budgetSheet = getSheet(SHEETS.BUDGETS);
const bData = budgetSheet.getDataRange().getValues();
const bHeaders = bData[0];
const bPeriodIdx   = bHeaders.indexOf("period");
const bCatIdx      = bHeaders.indexOf("category_id");
const bBudgetIdx   = bHeaders.indexOf("budgeted");
for (let i = 1; i < bData.length; i++) {
const rawP = bData[i][bPeriodIdx];
const cellP = rawP instanceof Date
? Utilities.formatDate(rawP, Session.getScriptTimeZone(), "MM/yyyy")
: String(rawP);
if (cellP === String(data.period) && String(bData[i][bCatIdx]) === String(data.category_id)) {
budgetSheet.getRange(i + 1, bBudgetIdx + 1).setValue(Number(data.oldAmount));
break;
}
}
_clearUndo();
const cats = _getCategories();
return { budget: true, period: data.period, transactions: _getAllTransactions(cats) };
}
case "updateBudgetBatch": {
const budgetSheet = getSheet(SHEETS.BUDGETS);
const bData = budgetSheet.getDataRange().getValues();
const bHeaders = bData[0];
const bPeriodIdx = bHeaders.indexOf("period");
const bCatIdx    = bHeaders.indexOf("category_id");
const bBudgetIdx = bHeaders.indexOf("budgeted");
data.oldValues.forEach(ov => {
for (let i = 1; i < bData.length; i++) {
if (normPeriod(bData[i][bPeriodIdx]) === String(ov.period) && String(bData[i][bCatIdx]) === String(ov.category_id)) {
budgetSheet.getRange(i + 1, bBudgetIdx + 1).setValue(Number(ov.oldAmount));
break;
}
}
});
_clearUndo();
const cats = _getCategories();
return { budget: true, period: data.period, transactions: _getAllTransactions(cats) };
}
case "addPrevision": {
const ps = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.PREVISIONS);
if (ps) {
const pd = ps.getDataRange().getValues();
const ph = pd[0]; const piIdx = ph.indexOf("id");
for (let i = pd.length - 1; i >= 1; i--) {
if (String(pd[i][piIdx]) === String(data.id)) { ps.deleteRow(i + 1); break; }
}
}
_clearUndo();
{ const _ua = _getCategories(); return { previsions: _getAllPrevisions(_ua), transactions: _getAllTransactions(_ua) }; }
}
case "updatePrevision": {
const ps = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.PREVISIONS);
if (ps) {
const pd = ps.getDataRange().getValues();
const ph = pd[0]; const piIdx = ph.indexOf("id");
for (let i = 1; i < pd.length; i++) {
if (String(pd[i][piIdx]) === String(data.id)) {
// Batch: restore entire row in one call
const restoredRow = pd[i].slice();
ph.forEach((h, col) => {
if (data.oldRow[h] !== undefined) restoredRow[col] = data.oldRow[h];
});
ps.getRange(i+1, 1, 1, restoredRow.length).setValues([restoredRow]);
break;
}
}
}
_clearUndo();
{ const _uc = _getCategories(); return { previsions: _getAllPrevisions(_uc), transactions: _getAllTransactions(_uc) }; }
}
case "deletePrevision": {
const ps = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.PREVISIONS);
if (ps) {
const ph = ps.getRange(1,1,1,ps.getLastColumn()).getValues()[0];
const row = ph.map(h => data.oldRow[h] !== undefined ? data.oldRow[h] : "");
ps.appendRow(row);
}
_clearUndo();
{ const _ud = _getCategories(); return { previsions: _getAllPrevisions(_ud), transactions: _getAllTransactions(_ud) }; }
}
} // fin switch

_clearUndo();
const categories = _getCategories();
return { transactions: _getAllTransactions(categories) };
}

// ================= INITIAL DATA =================
function getInitialData() {
try {
// Migration silencieuse
try {
const props = PropertiesService.getUserProperties();
if (!props.getProperty("planMigrationDone")) {
_migratePlanId();
props.setProperty("planMigrationDone", "1");
}
} catch(e) {}

const plans        = _getPlans();
const currentPlanId = _getCurrentPlanId();
try { PropertiesService.getUserProperties().setProperty("currentPlanId", currentPlanId); } catch(e) {}
const categories   = _getCategories();
const transactions = _getAllTransactions(categories, currentPlanId);
const periods      = _getPeriods();
const previsions   = _getAllPrevisions(categories, currentPlanId);
const buckets      = _getBuckets();
const debtors      = _getDebtors();
const projects     = _getProjects(currentPlanId);

let startupTab = "budget";
let theme = "dark";
let showProgress = "1";
let savingsCatId = "CAT001";
let assignCatId  = "";
try {
  const _up = PropertiesService.getUserProperties();
  startupTab   = _up.getProperty("startupTab")        || "budget";
  theme        = _up.getProperty("theme")             || "dark";
  showProgress = _up.getProperty("pref_showProgress") || "1";
  savingsCatId = _up.getProperty("pref_savingsCatId_" + currentPlanId) || _up.getProperty("pref_savingsCatId") || "CAT001";
  assignCatId  = _up.getProperty("pref_assignCatId_"  + currentPlanId) || _up.getProperty("pref_assignCatId")  || "";
} catch(e) {}

// Calculer totalSavings directement depuis transactions déjà chargées (évite relecture du sheet Banque)
let totalSavings = 0;
transactions.forEach(function(t) {
  if (String(t.category_id || "") === String(savingsCatId)) {
    totalSavings += Number(t.amount) || 0;
  }
});
totalSavings = Math.round(totalSavings * 100) / 100;

// Sérialisation explicite — évite tout objet GAS non-sérialisable
return {
  categories:    JSON.parse(JSON.stringify(categories)),
  transactions:  JSON.parse(JSON.stringify(transactions)),
  periods:       JSON.parse(JSON.stringify(periods)),
  previsions:    JSON.parse(JSON.stringify(previsions)),
  buckets:       JSON.parse(JSON.stringify(buckets)),
  debtors:       JSON.parse(JSON.stringify(debtors)),
  plans:         JSON.parse(JSON.stringify(plans)),
  projects:      JSON.parse(JSON.stringify(projects)),
  currentPlanId: String(currentPlanId),
  startupTab:    String(startupTab),
  theme:         String(theme),
  showProgress:  String(showProgress),
  savingsCatId:  String(savingsCatId),
  assignCatId:   String(assignCatId),
  totalSavings:  Number(totalSavings) || 0
};

} catch(e) {
// En cas de crash : retourner un objet minimal avec le message d'erreur
var errMsg = e.message || String(e);
return {
_error: errMsg,
categories: [], transactions: [], periods: [], previsions: [],
buckets: [], debtors: [], plans: [{ id: "PLAN001", name: "Principal" }],
currentPlanId: "PLAN001", projects: [], totalSavings: 0,
savingsCatId: "CAT001", assignCatId: "", startupTab: "budget",
theme: "dark", showProgress: "1"
};
}
}

function saveStartupTab(tab) {
try {
PropertiesService.getUserProperties().setProperty("startupTab", tab);
} catch(e) {}
return tab;
}

function saveTheme(theme) {
try {
PropertiesService.getUserProperties().setProperty("theme", theme);
} catch(e) {}
return theme;
}

function withdrawFromProject(projectId, amount, description, date) {
const planId = _getCurrentPlanId();

let savingsCatId = "CAT001";
try { savingsCatId = _getSavingsCatId(); } catch(e) {}

const cats       = _getCategories();
const savingsCat = cats.find(c => c.id === savingsCatId);
const txSheet    = getSheet(SHEETS.TRANSACTIONS);
const txH        = txSheet.getRange(1,1,1,txSheet.getLastColumn()).getValues()[0];
const txDate     = date ? new Date(date) : new Date();
const planIdx    = txH.indexOf("plan_id");
const amt        = Math.abs(Number(amount));

// Une seule transaction : revenu sur CAT15
// Cumul épargne = dépenses CAT15 - revenus CAT15, calcul naturel
const row = new Array(txH.length).fill("");
row[txH.indexOf("id")]            = generateId("TX");
row[txH.indexOf("date")]          = txDate;
row[txH.indexOf("period")]        = formatPeriod(txDate);
row[txH.indexOf("description")]   = description || "Retrait épargne";
row[txH.indexOf("category_id")]   = savingsCatId;
row[txH.indexOf("category_name")] = savingsCat ? savingsCat.name : savingsCatId;
row[txH.indexOf("amount")]        = -amt; // revenu = négatif
row[txH.indexOf("cleared")]       = false;
row[txH.indexOf("created_at")]    = new Date();
if (planIdx >= 0) row[planIdx]    = planId;
txSheet.appendRow(row);

// Réduire allocated du projet dans la sheet Projets
try {
const projSheet = getSheet(SHEETS.PROJECTS);
if (projSheet) {
const pData = projSheet.getDataRange().getValues();
const pH = pData[0].map(String);
const pIdCol    = pH.indexOf("id");
const pAllocCol = pH.indexOf("allocated");
if (pAllocCol >= 0) {
for (let i = 1; i < pData.length; i++) {
if (String(pData[i][pIdCol]) === String(projectId)) {
const cur = Number(pData[i][pAllocCol]) || 0;
projSheet.getRange(i + 1, pAllocCol + 1).setValue(Math.max(0, cur - amt));
break;
}
}
}
}
} catch(e) {}

const categories = _getCategories();
try {
return JSON.parse(JSON.stringify({
totalSavings:  _getTotalSavings(planId, savingsCatId),
projects:      _getProjects(planId),
transactions:  _getAllTransactions(categories, planId)
}));
} catch(e) {
return { totalSavings: _getTotalSavings(planId, savingsCatId), projects: _getProjects(planId), transactions: [] };
}
}

function saveSavingsCatId(catId) {
const planId = _getCurrentPlanId();
try {
const props = PropertiesService.getUserProperties();
props.setProperty("pref_savingsCatId_" + planId, catId);
props.setProperty("pref_savingsCatId", catId);
} catch(e) {}
return { totalSavings: _getTotalSavings(planId, catId) };
}

function saveAssignCatId(catId) {
const planId = _getCurrentPlanId();
try {
const props = PropertiesService.getUserProperties();
props.setProperty("pref_assignCatId_" + planId, catId); // par plan
props.setProperty("pref_assignCatId", catId);           // fallback global
} catch(e) {}
return { assignCatId: catId };
}

function saveUserPref(key, value) {
try {
PropertiesService.getUserProperties().setProperty("pref_" + key, value);
} catch(e) {}
return value;
}

// ================= ÉPARGNE / PROJETS =================

function _getTotalSavings(planId, savingsCatId) {
// Lecture directe du sheet Banque — toutes périodes confondues
const sheet = getSheet(SHEETS.TRANSACTIONS);
if (!sheet) return 0;
const data = sheet.getDataRange().getValues();
if (data.length < 2) return 0;
const h            = data[0].map(String);
const catIdCol     = h.indexOf("category_id");
const amountCol    = h.indexOf("amount");
const planIdCol    = h.indexOf("plan_id");
const idCol        = h.indexOf("id");
const effectivePlan  = planId || _getCurrentPlanId();
const effectiveCatId = savingsCatId || _getSavingsCatId();
let total = 0;
for (let i = 1; i < data.length; i++) {
const row = data[i];
if (!row[idCol]) continue;
if (planIdCol >= 0) {
const rp = String(row[planIdCol] || "");
if (rp && rp !== String(effectivePlan)) continue;
}
if (String(row[catIdCol] || "") !== String(effectiveCatId)) continue;
total += Number(row[amountCol]) || 0;
}
return Math.round(total * 100) / 100;
}

function _getSavingsCatId() {
try {
const props = PropertiesService.getUserProperties();
const planId = _getCurrentPlanId();
return props.getProperty("pref_savingsCatId_" + planId)
|| props.getProperty("pref_savingsCatId")
|| "CAT001";
} catch(e) { return "CAT001"; }
}

function _getProjects(planId) {
const sheet = getSheet(SHEETS.PROJECTS);
if (!sheet) return [];
const data = sheet.getDataRange().getValues();
if (data.length < 2) return [];
const h = data[0].map(String);
const idCol     = h.indexOf("id");
const nameCol   = h.indexOf("name");
const targetCol = h.indexOf("target");
const allocCol  = h.indexOf("allocated");
const planCol   = h.indexOf("plan_id");
const rows = [];
for (let i = 1; i < data.length; i++) {
const r = data[i];
if (planCol >= 0 && planId && String(r[planCol]) !== String(planId)) continue;
rows.push({
id:        String(r[idCol] || ""),
name:      String(r[nameCol] || ""),
target:    Number(r[targetCol] || 0),
allocated: Number(r[allocCol] || 0)
});
}
return rows;
}

function getSavingsData() {
const planId = _getCurrentPlanId();
const cats   = _getCategories();
const txs    = _getAllTransactions(cats, planId);
let savingsCatId = "CAT001";
try { savingsCatId = _getSavingsCatId(); } catch(e) {}
return {
totalSavings: _getTotalSavings(planId, savingsCatId),
projects:     _getProjects(planId),
savingsCatId
};
}

function addProject(name, target) {
const planId = _getCurrentPlanId();
let sheet = getSheet(SHEETS.PROJECTS);
if (!sheet) {
sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEETS.PROJECTS);
sheet.getRange(1, 1, 1, 5).setValues([["id","name","target","allocated","plan_id"]]);
}
const id  = "PRJ" + Date.now();
sheet.appendRow([id, name, target || 0, 0, planId]);
return _getProjects(planId);
}

function updateProject(projectId, name, target) {
const planId = _getCurrentPlanId();
const sheet = getSheet(SHEETS.PROJECTS);
if (!sheet) return [];
const data = sheet.getDataRange().getValues();
const h = data[0].map(String);
const idCol     = h.indexOf("id");
const nameCol   = h.indexOf("name");
const targetCol = h.indexOf("target");
for (let i = 1; i < data.length; i++) {
if (String(data[i][idCol]) === String(projectId)) {
sheet.getRange(i + 1, nameCol  + 1).setValue(name);
sheet.getRange(i + 1, targetCol + 1).setValue(Number(target) || 0);
break;
}
}
return _getProjects(planId);
}

function deleteProject(projectId) {
const planId = _getCurrentPlanId();
const sheet = getSheet(SHEETS.PROJECTS);
if (!sheet) return [];
const data = sheet.getDataRange().getValues();
const h = data[0].map(String);
const idCol = h.indexOf("id");
for (let i = 1; i < data.length; i++) {
if (String(data[i][idCol]) === String(projectId)) {
sheet.deleteRow(i + 1);
break;
}
}
return _getProjects(planId);
}

function saveProjectAllocations(allocations) {
// allocations = [{ id, allocated }, …]
const planId = _getCurrentPlanId();
const sheet = getSheet(SHEETS.PROJECTS);
if (!sheet) return [];
const data = sheet.getDataRange().getValues();
const h = data[0].map(String);
const idCol    = h.indexOf("id");
const allocCol = h.indexOf("allocated");
// Batch: build a map for O(1) lookup, read-modify-write column
const allocMap = {};
allocations.forEach(({ id, allocated }) => { allocMap[String(id)] = Number(allocated); });
if (data.length > 1) {
const allocVals = sheet.getRange(2, allocCol + 1, data.length - 1, 1).getValues();
for (let i = 0; i < data.length - 1; i++) {
const rid = String(data[i + 1][idCol]);
if (allocMap[rid] !== undefined) allocVals[i][0] = allocMap[rid];
}
sheet.getRange(2, allocCol + 1, allocVals.length, 1).setValues(allocVals);
}
return _getProjects(planId);
}

// ================= PLANS =================
var _planCache = null;

function _getPlans() {
if (_planCache) return _planCache;
const sheet = getSheet(SHEETS.PLANS);
if (!sheet) { _planCache = [{ id: "PLAN001", name: "Principal", active: true }]; return _planCache; }
const data = sheet.getDataRange().getValues();
const h = data[0];
const idIdx   = h.indexOf("id");
const nameIdx = h.indexOf("name");
const actIdx  = h.indexOf("active");
_planCache = data.slice(1)
.filter(r => r[idIdx])
.map(r => ({
id:     String(r[idIdx]),
name:   String(r[nameIdx] || ""),
active: actIdx < 0 ? true : (r[actIdx] !== false && r[actIdx] !== "FALSE" && r[actIdx] !== "false")
}));
if (!_planCache.length) _planCache = [{ id: "PLAN001", name: "Principal", active: true }];
return _planCache;
}

function getPlans() { return _getPlans(); }

// Plan actif courant (stocké dans UserProperties)
function _getCurrentPlanId() {
try {
return PropertiesService.getUserProperties().getProperty("currentPlanId") || _getPlans()[0].id;
} catch(e) {
return _getPlans()[0].id;
}
}

function saveCurrentPlan(planId) {
try {
PropertiesService.getUserProperties().setProperty("currentPlanId", planId);
} catch(e) {}
_planCache = null;
return { plans: _getPlans(), currentPlanId: planId };
}

// Fusion switchPlan + getInitialData en un seul appel GAS (évite double RTT)
function switchPlanAndLoad(planId) {
try {
PropertiesService.getUserProperties().setProperty("currentPlanId", planId);
} catch(e) {}
_planCache = null;
_catCache  = null;
return getInitialData();
}

function addPlan(name, copyFromPlanId) {
// 1. Créer l'entrée dans la feuille Plans
const planSheet = getSheet(SHEETS.PLANS);
if (!planSheet) throw new Error("Feuille Plans introuvable");
const planHeaders = planSheet.getRange(1, 1, 1, planSheet.getLastColumn()).getValues()[0];
const pIdIdx   = planHeaders.indexOf("id");
const pNameIdx = planHeaders.indexOf("name");
const pActIdx  = planHeaders.indexOf("active");
const newPlanId = generateId("PLN");
const planRow = new Array(planHeaders.length).fill("");
planRow[pIdIdx]   = newPlanId;
planRow[pNameIdx] = name;
if (pActIdx >= 0) planRow[pActIdx] = true;
planSheet.appendRow(planRow);
_planCache = null;

// 2. Si copyFromPlanId fourni : copier buckets et catégories
if (copyFromPlanId) {
// Copier les buckets
const bktSheet = getSheet(SHEETS.BUCKETS);
if (bktSheet) {
const bktData = bktSheet.getDataRange().getValues();
const bh = bktData[0];
const bIdIdx   = bh.indexOf("id");
const bNameIdx = bh.findIndex((v,i) => ["name","Name","label","Label"].includes(v));
const bOrdIdx  = bh.indexOf("order");
const bPlanIdx = bh.indexOf("plan_id");
// Map ancien bucket_id -> nouveau bucket_id
const bktIdMap = {};
bktData.slice(1).forEach(r => {
if (!r[bIdIdx]) return;
if (bPlanIdx >= 0 && String(r[bPlanIdx]) !== String(copyFromPlanId)) return;
const newBktId = generateId("BKT");
bktIdMap[String(r[bIdIdx])] = newBktId;
const newRow = new Array(bh.length).fill("");
newRow[bIdIdx]   = newBktId;
if (bNameIdx >= 0) newRow[bNameIdx] = r[bNameIdx];
if (bOrdIdx >= 0)  newRow[bOrdIdx]  = r[bOrdIdx];
if (bPlanIdx >= 0) newRow[bPlanIdx] = newPlanId;
bktSheet.appendRow(newRow);
});

  // Copier les catégories en remappant bucket_id
  const catSheet = getSheet(SHEETS.CATEGORIES);
  if (catSheet) {
    const catData = catSheet.getDataRange().getValues();
    const ch = catData[0];
    const cIdIdx   = ch.indexOf("id");
    const cNameIdx = ch.indexOf("name");
    const cBktIdx  = ch.indexOf("bucket_id");
    const cOrdIdx  = ch.indexOf("order");
    const cActIdx  = ch.indexOf("active");
    const cPlanIdx = ch.indexOf("plan_id");
    catData.slice(1).forEach(r => {
      if (!r[cIdIdx]) return;
      if (cPlanIdx >= 0 && String(r[cPlanIdx]) !== String(copyFromPlanId)) return;
      const newCatId = generateId("CAT");
      const newRow = new Array(ch.length).fill("");
      newRow[cIdIdx]   = newCatId;
      newRow[cNameIdx] = r[cNameIdx];
      newRow[cBktIdx]  = bktIdMap[String(r[cBktIdx])] || r[cBktIdx];
      if (cOrdIdx >= 0)  newRow[cOrdIdx]  = r[cOrdIdx];
      if (cActIdx >= 0)  newRow[cActIdx]  = r[cActIdx];
      if (cPlanIdx >= 0) newRow[cPlanIdx] = newPlanId;
      catSheet.appendRow(newRow);
    });
  }

  // Copier les débiteurs
  const dbtSheet = getSheet(SHEETS.DEBTORS);
  if (dbtSheet) {
    const dbtData = dbtSheet.getDataRange().getValues();
    const dh = dbtData[0];
    const dIdIdx     = dh.indexOf("id");
    const dNameIdx   = (() => { for (const c of ["name","Name","nom","Nom"]) { const i=dh.indexOf(c); if(i>=0) return i; } return 1; })();
    const dCatIdx    = dh.indexOf("default_category_id");
    const dActIdx    = dh.indexOf("active");
    const dPlanIdx   = dh.indexOf("plan_id");
    dbtData.slice(1).forEach(r => {
      if (!r[dIdIdx]) return;
      if (dPlanIdx >= 0 && String(r[dPlanIdx]) !== String(copyFromPlanId)) return;
      if (r[dActIdx] === false || r[dActIdx] === "FALSE") return; // ne copier que les actifs
      const newRow = new Array(dh.length).fill("");
      newRow[dIdIdx]   = generateId("DBT");
      newRow[dNameIdx] = r[dNameIdx];
      if (dCatIdx >= 0) newRow[dCatIdx] = r[dCatIdx] || "";
      if (dActIdx >= 0) newRow[dActIdx] = true;
      if (dPlanIdx >= 0) newRow[dPlanIdx] = newPlanId;
      dbtSheet.appendRow(newRow);
    });
  }
}

}

return { plans: _getPlans(), newPlanId };
}

function renamePlan(id, name) {
const sheet = getSheet(SHEETS.PLANS);
const data = sheet.getDataRange().getValues();
const h = data[0];
const idIdx   = h.indexOf("id");
const nameIdx = h.indexOf("name");
for (let i = 1; i < data.length; i++) {
if (String(data[i][idIdx]) === String(id)) {
sheet.getRange(i + 1, nameIdx + 1).setValue(name);
break;
}
}
_planCache = null;
return _getPlans();
}

function deletePlan(id) {
// Refus de supprimer si c'est le seul plan
const plans = _getPlans();
if (plans.length <= 1) throw new Error("Impossible de supprimer le seul plan existant.");

// Supprimer toutes les lignes des feuilles liées au plan
const sheetKeys = [
SHEETS.TRANSACTIONS, SHEETS.BUDGETS, SHEETS.PREVISIONS,
SHEETS.CATEGORIES, SHEETS.BUCKETS, SHEETS.DEBTORS
];
sheetKeys.forEach(function(key) {
const sheet = getSheet(key);
if (!sheet) return;
const data = sheet.getDataRange().getValues();
const h = data[0];
const planIdx = h.indexOf("plan_id");
if (planIdx < 0) return;
// Parcourir à l'envers pour ne pas décaler les indices
for (let i = data.length - 1; i >= 1; i--) {
if (String(data[i][planIdx]) === String(id)) {
sheet.deleteRow(i + 1);
}
}
});

// Supprimer la ligne dans Plans
const planSheet = getSheet(SHEETS.PLANS);
const planData = planSheet.getDataRange().getValues();
const ph = planData[0];
const pidIdx = ph.indexOf("id");
for (let i = planData.length - 1; i >= 1; i--) {
if (String(planData[i][pidIdx]) === String(id)) {
planSheet.deleteRow(i + 1);
break;
}
}

_planCache = null;
_catCache = null;
return _getPlans();
}

// Migration : ajoute plan_id sur toutes les feuilles si colonne absente
// Assigne toutes les lignes existantes au plan par défaut
function _migratePlanId() {
const defaultPlanId = _getPlans()[0].id;
const sheetKeys = [
SHEETS.TRANSACTIONS,
SHEETS.BUDGETS,
SHEETS.PREVISIONS,
SHEETS.CATEGORIES,
SHEETS.BUCKETS,
SHEETS.DEBTORS
];
sheetKeys.forEach(function(key) {
const sheet = getSheet(key);
if (!sheet) return;
const lastRow = sheet.getLastRow();
if (lastRow < 1) return;

// Lire seulement le header (1 ligne) pour savoir si plan_id existe
const h = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
let planIdx = h.indexOf("plan_id");

if (planIdx < 0) {
  // Colonne absente — créer en en-tête + remplir toutes les lignes d'un coup
  planIdx = h.length;
  sheet.getRange(1, planIdx + 1).setValue("plan_id");
  if (lastRow > 1) {
    sheet.getRange(2, planIdx + 1, lastRow - 1, 1)
      .setValues(Array(lastRow - 1).fill([defaultPlanId]));
  }
} else if (lastRow > 1) {
  // Colonne existe — lire uniquement la colonne plan_id (pas tout le sheet)
  const colData = sheet.getRange(2, planIdx + 1, lastRow - 1, 1).getValues();
  const emptyRows = [];
  for (let i = 0; i < colData.length; i++) {
    const v = colData[i][0];
    if (v === "" || v === null || v === undefined) emptyRows.push(i + 2);
  }
  if (!emptyRows.length) return;
  // Grouper les lignes consécutives pour minimiser les appels
  let start = emptyRows[0], count = 1;
  for (let j = 1; j <= emptyRows.length; j++) {
    if (j < emptyRows.length && emptyRows[j] === emptyRows[j-1] + 1) {
      count++;
    } else {
      sheet.getRange(start, planIdx + 1, count, 1)
        .setValues(Array(count).fill([defaultPlanId]));
      if (j < emptyRows.length) { start = emptyRows[j]; count = 1; }
    }
  }
}

});
_catCache = null;
}

// ================= CATEGORIES =================
let _catCache = null;
function _getCategories(planId) {
if (_catCache && !planId) return _catCache;
const sheet = getSheet(SHEETS.CATEGORIES);
if (!sheet) { _catCache = []; return _catCache; }
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIndex    = headers.indexOf("id");
const nameIndex  = headers.indexOf("name");
const buckIdIndex = headers.indexOf("bucket_id");
const ordIndex   = headers.indexOf("order");
const actIndex   = headers.indexOf("active");
const planIndex  = headers.indexOf("plan_id");
const effectivePlanId = planId || _getCurrentPlanId();

const result = data.slice(1)
.filter(r => {
if (!r[idIndex] || !r[nameIndex]) return false;
if (planIndex < 0) return true;
const rp = r[planIndex];
return !rp || String(rp) === String(effectivePlanId);
})
.map(r => ({
id: r[idIndex], name: r[nameIndex],
bucket_id: r[buckIdIndex] || "",
order: Number(r[ordIndex] || 0),
active: actIndex < 0 ? true : (r[actIndex] !== false && r[actIndex] !== "FALSE" && r[actIndex] !== "false" && r[actIndex] !== 0),
plan_id: planIndex >= 0 ? r[planIndex] : effectivePlanId
}))
.sort((a, b) => a.order - b.order);

if (!planId) _catCache = result;
return result;
}
function getCategories() { return _getCategories(); }

// ================= PERIODS =================
function _getPeriods() {
const sheet = getSheet(SHEETS.PERIODS);
if (!sheet) return _autoGeneratePeriods();
const data = sheet.getDataRange().getValues();
if (data.length <= 1) return _autoGeneratePeriods();
const headers = data[0];
const idIndex = headers.indexOf("id");
const labelIndex = headers.indexOf("label");
data.shift();
const periods = data.filter(r => r[idIndex]).map(r => ({ id: r[idIndex], label: r[labelIndex] || r[idIndex] }));
return periods.length ? periods : _autoGeneratePeriods();
}

function _autoGeneratePeriods() {
const periods = [];
const now = new Date();
for (let i = 11; i >= 0; i--) {
const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
const mm = String(d.getMonth() + 1).padStart(2, "0");
const yyyy = d.getFullYear();
const id = mm + "/" + yyyy;
const months = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
const label = months[d.getMonth()] + " " + yyyy;
periods.push({ id, label });
}
return periods;
}
function getPeriods() { return _getPeriods(); }

// ================= ADD TRANSACTION =================
// Helper : sérialise proprement le tableau de transactions avant de le renvoyer au frontend
// Évite que des objets Date GAS non-sérialisables ne causent un retour null silencieux
function _safeReturnTx(transactions) {
try { return JSON.parse(JSON.stringify(transactions)); } catch(e) { return []; }
}

function addTransaction(form) { return _safe(function() {
const sheet = getSheet(SHEETS.TRANSACTIONS);
const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
const idIndex = headers.indexOf("id");
const dateIndex = headers.indexOf("date");
const periodIndex = headers.indexOf("period");
const descriptionIndex = headers.indexOf("description");
const categoryIdIndex = headers.indexOf("category_id");
const categoryNameIndex = headers.indexOf("category_name");
const amountIndex = headers.indexOf("amount");
const clearedIndex = headers.indexOf("cleared");
const createdIndex = headers.indexOf("created_at");
const categories = _getCategories();
const category = categories.find(c => c.id == form.category_id);
const categoryName = category ? category.name : "";
const id = generateId("TX");
const date = new Date(form.date);
const period = formatPeriod(date);
const now = new Date();
const debtorIndex = headers.indexOf("debtor");

const row = new Array(headers.length).fill("");
row[idIndex] = id;
row[dateIndex] = date;
row[periodIndex] = period;
row[descriptionIndex] = form.description || "";
row[categoryIdIndex] = form.category_id;
row[categoryNameIndex] = categoryName;
row[amountIndex] = Number(form.amount);
row[clearedIndex] = form.cleared === true || form.cleared === "true" ? true : false;
row[createdIndex] = now;
if (debtorIndex >= 0) row[debtorIndex] = form.debtor || "";
const planIdxTx = headers.indexOf("plan_id");
if (planIdxTx >= 0) row[planIdxTx] = _getCurrentPlanId();

const lastRow = sheet.getLastRow() + 1;
sheet.getRange(lastRow, 1, 1, row.length).setValues([row]);
sheet.getRange(lastRow, periodIndex + 1).setNumberFormat("@");

_saveUndoSnapshot("addTransaction", { id });
return _safeReturnTx(_getAllTransactions(categories));
}); }

// ================= ADD SPLIT TRANSACTION =================
function addSplitTransaction(lines) {
const sheet = getSheet(SHEETS.TRANSACTIONS);
const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
const idIndex       = headers.indexOf("id");
const dateIndex     = headers.indexOf("date");
const periodIndex   = headers.indexOf("period");
const descIndex     = headers.indexOf("description");
const catIdIndex    = headers.indexOf("category_id");
const catNameIndex  = headers.indexOf("category_name");
const amountIndex   = headers.indexOf("amount");
const clearedIndex  = headers.indexOf("cleared");
const createdIndex  = headers.indexOf("created_at");
const debtorIndex   = headers.indexOf("debtor");

const categories = _getCategories();
const now = new Date();
const newIds = [];

lines.forEach(line => {
const category = categories.find(c => c.id == line.category_id);
const categoryName = category ? category.name : "";
const id = generateId("TX");
const date = new Date(line.date);
const period = formatPeriod(date);

const row = new Array(headers.length).fill("");
row[idIndex]      = id;
row[dateIndex]    = date;
row[periodIndex]  = period;
row[descIndex]    = line.description || "";
row[catIdIndex]   = line.category_id;
row[catNameIndex] = categoryName;
row[amountIndex]  = Number(line.amount);
row[clearedIndex] = line.cleared === true || line.cleared === "true" ? true : false;
row[createdIndex] = now;
if (debtorIndex >= 0) row[debtorIndex] = line.debtor || "";
const planIdxSplit = headers.indexOf("plan_id");
if (planIdxSplit >= 0) row[planIdxSplit] = _getCurrentPlanId();

const lastRow = sheet.getLastRow() + 1;
sheet.getRange(lastRow, 1, 1, row.length).setValues([row]);
sheet.getRange(lastRow, periodIndex + 1).setNumberFormat("@");
newIds.push(id);

});
_saveUndoSnapshot("addTransaction", { id: newIds[0] });
return _safeReturnTx(_getAllTransactions(categories));
}

// ================= UPDATE TRANSACTION =================
function updateTransaction(form) { return _safe(function() {
const sheet = getSheet(SHEETS.TRANSACTIONS);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIndex = headers.indexOf("id");
const dateIndex = headers.indexOf("date");
const periodIndex = headers.indexOf("period");
const descriptionIndex = headers.indexOf("description");
const categoryIdIndex = headers.indexOf("category_id");
const categoryNameIndex = headers.indexOf("category_name");
const amountIndex = headers.indexOf("amount");

const categories = _getCategories();
const category = categories.find(c => c.id == form.category_id);
const categoryName = category ? category.name : "";

const lockedIdx = headers.indexOf("locked");
for (let i = 1; i < data.length; i++) {
if (data[i][idIndex] == form.id) {
if (data[i][lockedIdx] === true || data[i][lockedIdx] === "TRUE" || data[i][lockedIdx] === 1) {
return { error: "locked", transactions: _getAllTransactions(categories) };
}
const oldRow = {};
headers.forEach((h, col) => { oldRow[h] = data[i][col]; });
_saveUndoSnapshot("updateTransaction", { id: form.id, oldRow });

  const date = new Date(form.date);
  const period = formatPeriod(date);
  const debtorIdx = headers.indexOf("debtor");
  // Batch : construire la ligne complète et écrire en 1 appel
  const updatedRow = data[i].slice();
  updatedRow[dateIndex]        = date;
  updatedRow[periodIndex]      = period;
  updatedRow[descriptionIndex] = form.description || "";
  updatedRow[categoryIdIndex]  = form.category_id;
  updatedRow[categoryNameIndex]= categoryName;
  updatedRow[amountIndex]      = Number(form.amount);
  if (debtorIdx >= 0) updatedRow[debtorIdx] = form.debtor || "";
  const clearedIdxU = headers.indexOf("cleared");
  if (clearedIdxU >= 0 && form.cleared !== undefined) {
    updatedRow[clearedIdxU] = form.cleared === true || form.cleared === "true";
  }
  sheet.getRange(i + 1, 1, 1, updatedRow.length).setValues([updatedRow]);
  sheet.getRange(i + 1, periodIndex + 1).setNumberFormat("@");
  break;
}

}

return { transactions: _getAllTransactions(categories) };
}); }

// ================= DELETE TRANSACTION =================
function deleteTransaction(id) { return _safe(function() {
const sheet = getSheet(SHEETS.TRANSACTIONS);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIndex = headers.indexOf("id");

const lockedIdxD = headers.indexOf("locked");
for (let i = 1; i < data.length; i++) {
if (data[i][idIndex] == id) {
if (data[i][lockedIdxD] === true || data[i][lockedIdxD] === "TRUE" || data[i][lockedIdxD] === 1) {
return _safeReturnTx(_getAllTransactions(_getCategories()));
}
const oldRow = {};
headers.forEach((h, col) => { oldRow[h] = data[i][col]; });
_saveUndoSnapshot("deleteTransaction", { rows: [oldRow] });
sheet.deleteRow(i + 1);
break;
}
}

const categories = _getCategories();
return _safeReturnTx(_getAllTransactions(categories));
}); }

// ================= BUDGET =================
function getBudgetByPeriod(period) { return _safe(function() {
// =========================================================
// HELPERS (Sécurités de lecture)
// =========================================================
function periodToNum(p) {
if (!p) return 0;
if (p instanceof Date) return p.getFullYear() * 100 + (p.getMonth() + 1);
const s = String(p).trim();
const parts = s.split("/");
if (parts.length === 2) return parseInt(parts[1], 10) * 100 + parseInt(parts[0], 10);
return 0;
}

function parseAmount(val) {
if (!val) return 0;
if (typeof val === "number") return val;
return Number(String(val).replace(/\s/g, '').replace(',', '.')) || 0;
}

const currentPeriodNum = periodToNum(period);
const _budPlanId = _getCurrentPlanId();

// ── Catégorie "À assigner" : d'abord la préférence utilisateur, sinon recherche par nom ──
let _prefAssignCatId = "";
try {
const _props = PropertiesService.getUserProperties();
_prefAssignCatId = _props.getProperty("pref_assignCatId_" + _budPlanId) // par plan
|| _props.getProperty("pref_assignCatId")                // fallback global
|| "";
} catch(e) {}
let aAssignerId;
if (_prefAssignCatId) {
aAssignerId = _prefAssignCatId;
} else {
const _allCatsForAssign = _getCategories(_budPlanId);
const _aAssignCat = _allCatsForAssign.find(c =>
c.name && (
c.name.trim().toLowerCase() === "à assigner" ||
c.name.trim().toLowerCase() === "a assigner" ||
c.id === "CAT001"
)
);
aAssignerId = _aAssignCat ? _aAssignCat.id : "CAT001";
}

// =========================================================
// 1. CALCUL DES ENTRÉES
// =========================================================
let cumulEntrees = 0;
const allTrans = getSheet(SHEETS.TRANSACTIONS).getDataRange().getValues();
const allTransHeaders = allTrans[0];
const atCatIdx    = allTransHeaders.indexOf("category_id");
const atAmountIdx = allTransHeaders.indexOf("amount");
const atDateIdx   = allTransHeaders.indexOf("date");

const atPlanIdx = allTransHeaders.indexOf("plan_id");

for (let i = 1; i < allTrans.length; i++) {
// Filtre plan_id (si colonne présente)
if (atPlanIdx >= 0 && allTrans[i][atPlanIdx] && String(allTrans[i][atPlanIdx]) !== String(_budPlanId)) continue;
if (String(allTrans[i][atCatIdx]) === String(aAssignerId)) {
const dVal = allTrans[i][atDateIdx];
let tPeriodNum = 0;
if (dVal instanceof Date) {
tPeriodNum = dVal.getFullYear() * 100 + (dVal.getMonth() + 1);
} else if (typeof dVal === "string" && dVal.length >= 7) {
const pts = dVal.split("-");
if(pts.length >= 2) tPeriodNum = parseInt(pts[0], 10) * 100 + parseInt(pts[1], 10);
}
if (tPeriodNum > 0 && tPeriodNum <= currentPeriodNum) {
cumulEntrees += parseAmount(allTrans[i][atAmountIdx]);
}
}
}
// Revenus = amounts négatifs dans WIMM ; negate pour avoir le montant réel (+/-)
const totalEntreesJusquaMois = -cumulEntrees;

// =========================================================
// 2. CALCUL DE L'ARGENT BUDGÉTÉ
// =========================================================
const allBudgets = getSheet(SHEETS.BUDGETS).getDataRange().getValues();
const allBudHeaders = allBudgets[0];
const abPeriodIdx = allBudHeaders.indexOf("period");
const abCatIdx    = allBudHeaders.indexOf("category_id");
const abAmtIdx    = allBudHeaders.indexOf("budgeted");
const abPlanIdx   = allBudHeaders.indexOf("plan_id");
const abNoteIdx   = allBudHeaders.indexOf("note");

let totalAssigneJusquaMois = 0;
let totalAssigneGlobal = 0;

for (let i = 1; i < allBudgets.length; i++) {
// Filtre plan_id (si colonne présente)
if (abPlanIdx >= 0 && allBudgets[i][abPlanIdx] && String(allBudgets[i][abPlanIdx]) !== String(_budPlanId)) continue;
const catId = String(allBudgets[i][abCatIdx]);
if (catId === String(aAssignerId)) continue;

const amt = parseAmount(allBudgets[i][abAmtIdx]);
const bPeriodNum = periodToNum(allBudgets[i][abPeriodIdx]);

if (bPeriodNum > 0) {
  totalAssigneGlobal += amt; 
  if (bPeriodNum <= currentPeriodNum) {
    totalAssigneJusquaMois += amt; 
  }
}

}

// =========================================================
// 3. LA LOGIQUE PARFAITE DU "À ASSIGNER"
// =========================================================
// ─── LOGIQUE "À ASSIGNER" ───────────────────────────────────────
// argent = totalEntreesJusquaMois  (revenus catégorie "À assigner" jusqu'au mois affiché)
// globalBudget = totalAssigneGlobal (tout ce qui est budgété, toutes périodes)
// currentBudget = totalAssigneJusquaMois (budgété jusqu'au mois affiché inclus)
//
// • argent > globalBudget  → surplus positif  = argent - globalBudget
// • argent >= currentBudget → situation présente couverte = 0
// • argent < currentBudget  → déficit immédiat = argent - currentBudget (négatif)
const EPS = 0.005; // tolérance arrondi centimes
let disponible = 0;
if (totalEntreesJusquaMois > totalAssigneGlobal + EPS) {
disponible = Math.round((totalEntreesJusquaMois - totalAssigneGlobal) * 100) / 100;
} else if (totalEntreesJusquaMois >= totalAssigneJusquaMois - EPS) {
disponible = 0;
} else {
disponible = Math.round((totalEntreesJusquaMois - totalAssigneJusquaMois) * 100) / 100;
}

// =========================================================
// 4. CONSTRUCTION DES ENVELOPPES (Groupées pour l'interface)
// =========================================================
// On récupère les listes (supporte _getCategories ou getCategories)
const allCategoriesList = typeof _getCategories === "function" ? _getCategories() : getCategories();
const allBucketsList    = typeof _getBuckets === "function" ? _getBuckets() : getBuckets();

const bucketsMap = {};
const noBucket = { bucket_id: "", bucket_name: "Sans groupe", order: 999, categories: [] };

// Préparer les groupes
allBucketsList.forEach(b => {
bucketsMap[b.id] = { bucket_id: b.id, bucket_name: b.name, order: b.order || 0, categories: [] };
});

// Préparer les catégories
const catMap = {};
allCategoriesList.forEach(c => {
if (c.id !== aAssignerId) {
catMap[c.id] = { category_id: c.id, category_name: c.name, bucket_id: c.group_id || c.bucket_id, budgeted: 0, spent: 0, carry: 0, remaining: 0, note: "" };
}
});

// A. Assigner l'argent de ce mois (+ note de la ligne budget)
for (let i = 1; i < allBudgets.length; i++) {
if (abPlanIdx >= 0 && allBudgets[i][abPlanIdx] && String(allBudgets[i][abPlanIdx]) !== String(_budPlanId)) continue;
if (periodToNum(allBudgets[i][abPeriodIdx]) === currentPeriodNum) {
const cId = String(allBudgets[i][abCatIdx]);
if (catMap[cId]) {
catMap[cId].budgeted += parseAmount(allBudgets[i][abAmtIdx]);
if (abNoteIdx >= 0 && allBudgets[i][abNoteIdx]) {
catMap[cId].note = String(allBudgets[i][abNoteIdx]);
}
}
}
}

// B. Additionner les dépenses de ce mois
for (let i = 1; i < allTrans.length; i++) {
if (atPlanIdx >= 0 && allTrans[i][atPlanIdx] && String(allTrans[i][atPlanIdx]) !== String(_budPlanId)) continue;
const dVal = allTrans[i][atDateIdx];
let tPeriodNum = 0;
if (dVal instanceof Date) {
tPeriodNum = dVal.getFullYear() * 100 + (dVal.getMonth() + 1);
} else if (typeof dVal === "string" && dVal.length >= 7) {
const pts = dVal.split("-");
if(pts.length >= 2) tPeriodNum = parseInt(pts[0], 10) * 100 + parseInt(pts[1], 10);
}

if (tPeriodNum === currentPeriodNum) {
  const cId = String(allTrans[i][atCatIdx]);
  if (catMap[cId]) catMap[cId].spent += parseAmount(allTrans[i][atAmountIdx]);
}

}

// B2. Calcul du carry cumulatif (toutes périodes antérieures à currentPeriodNum)
//     carry[catId] = Σ (budgeted[p] - spent[p]) pour p < currentPeriodNum
const carryMap = {};
// Cumul budgété par catégorie sur périodes < current
for (let i = 1; i < allBudgets.length; i++) {
if (abPlanIdx >= 0 && allBudgets[i][abPlanIdx] && String(allBudgets[i][abPlanIdx]) !== String(_budPlanId)) continue;
const pNum = periodToNum(allBudgets[i][abPeriodIdx]);
if (pNum <= 0 || pNum >= currentPeriodNum) continue;
const cId = String(allBudgets[i][abCatIdx]);
if (!catMap[cId]) continue;
if (!carryMap[cId]) carryMap[cId] = { budgeted: 0, spent: 0 };
carryMap[cId].budgeted += parseAmount(allBudgets[i][abAmtIdx]);
}
// Cumul dépensé par catégorie sur périodes < current
for (let i = 1; i < allTrans.length; i++) {
if (atPlanIdx >= 0 && allTrans[i][atPlanIdx] && String(allTrans[i][atPlanIdx]) !== String(_budPlanId)) continue;
const dVal = allTrans[i][atDateIdx];
let tPNum = 0;
if (dVal instanceof Date) {
tPNum = dVal.getFullYear() * 100 + (dVal.getMonth() + 1);
} else if (typeof dVal === "string" && dVal.length >= 7) {
const pts = dVal.split("-");
if (pts.length >= 2) tPNum = parseInt(pts[0], 10) * 100 + parseInt(pts[1], 10);
}
if (tPNum <= 0 || tPNum >= currentPeriodNum) continue;
const cId = String(allTrans[i][atCatIdx]);
if (!catMap[cId]) continue;
if (!carryMap[cId]) carryMap[cId] = { budgeted: 0, spent: 0 };
carryMap[cId].spent += parseAmount(allTrans[i][atAmountIdx]);
}

// C. Calcul final et regroupement par Bucket
for (const cId in catMap) {
const cat = catMap[cId];
const c = carryMap[cId] || { budgeted: 0, spent: 0 };
cat.carry     = Math.round((c.budgeted - c.spent) * 100) / 100;  // report cumulatif
cat.remaining = Math.round((cat.budgeted - cat.spent + cat.carry) * 100) / 100; // disponible total

if (cat.bucket_id && bucketsMap[cat.bucket_id]) {
  bucketsMap[cat.bucket_id].categories.push(cat);
} else {
  noBucket.categories.push(cat);
}

}

// Conversion en tableau propre pour le frontend
const bucketsArray = Object.values(bucketsMap).sort((a, b) => a.order - b.order);
if (noBucket.categories.length > 0) bucketsArray.push(noBucket);

// Le format de retour exact exigé par l'interface
return {
period: period,
disponible: disponible,
buckets: bucketsArray
};
}); }

// ================= RESET BUDGET PERIOD =================
function resetBudgetPeriod(period) {
const sheet = getSheet(SHEETS.BUDGETS);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const periodIndex = headers.indexOf("period");
const budgetIndex = headers.indexOf("budgeted");
const planResetIdx = headers.indexOf("plan_id");
const _activePlanIdReset = _getCurrentPlanId();

// Batch: read budgeted column, zero matching rows, write back
const budgetCol = sheet.getRange(2, budgetIndex + 1, data.length - 1, 1).getValues();
for (let i = 1; i < data.length; i++) {
if (normPeriod(data[i][periodIndex]) !== String(period)) continue;
// Filtre plan_id — ne réinitialise que les lignes du plan courant
if (planResetIdx >= 0 && data[i][planResetIdx] && String(data[i][planResetIdx]) !== String(_activePlanIdReset)) continue;
budgetCol[i - 1][0] = 0;
}
sheet.getRange(2, budgetIndex + 1, budgetCol.length, 1).setValues(budgetCol);
return getBudgetByPeriod(period);
}

// ================= SAVE BUDGET =================
function saveBudgetBatch(changes) {
const sheet = getSheet(SHEETS.BUDGETS);
const data  = sheet.getDataRange().getValues();
const headers = data[0];
const idIdx  = headers.indexOf("id");
const perIdx = headers.indexOf("period");
const catIdx = headers.indexOf("category_id");
const budIdx = headers.indexOf("budgeted");

const planBudIdx = headers.indexOf("plan_id");
const _currentPlan = _getCurrentPlanId();
const rowMap = {};
for (let i = 1; i < data.length; i++) {
// Ne mapper que les lignes du plan courant
if (planBudIdx >= 0 && data[i][planBudIdx] && String(data[i][planBudIdx]) !== String(_currentPlan)) continue;
const key = normPeriod(data[i][perIdx]) + "|" + String(data[i][catIdx]);
rowMap[key] = i + 1;
}

const toUpdate = [];
const toAppend = [];
const catMap = {};
_getCategories().forEach(c => { catMap[c.id] = c.name; });

// Snapshot : mémoriser les anciennes valeurs AVANT toute écriture
const oldValues = [];
changes.forEach(c => {
const key = String(c.period) + "|" + String(c.category_id);
const amt = parseFloat(c.amount) || 0;
if (rowMap[key]) {
const rowIdx = rowMap[key] - 1; // index dans data (0-based)
oldValues.push({ period: c.period, category_id: c.category_id, oldAmount: data[rowIdx][budIdx] });
toUpdate.push({ row: rowMap[key], col: budIdx + 1, val: amt });
} else {
oldValues.push({ period: c.period, category_id: c.category_id, oldAmount: 0 });
const newRow = new Array(headers.length).fill("");
newRow[idIdx]  = generateId("BUD");
newRow[perIdx] = c.period;
newRow[catIdx] = c.category_id;
newRow[budIdx] = amt;
if (planBudIdx >= 0) newRow[planBudIdx] = _currentPlan;
toAppend.push({ row: newRow, period: c.period, periodCol: perIdx + 1 });
}
});

// Sauvegarder le snapshot une seule fois pour tout le batch
if (oldValues.length > 0) {
const period = changes[0].period;
_saveUndoSnapshot("updateBudgetBatch", { period, oldValues });
}

// Batch: all updates target the same column (budgeted), read-modify-write
if (toUpdate.length > 0) {
const budColBatch = sheet.getRange(2, budIdx + 1, data.length - 1, 1).getValues();
toUpdate.forEach(u => {
budColBatch[u.row - 2][0] = u.val;
});
sheet.getRange(2, budIdx + 1, budColBatch.length, 1).setValues(budColBatch);
}
toAppend.forEach(a => {
sheet.appendRow(a.row);
const newRow = sheet.getLastRow();
sheet.getRange(newRow, a.periodCol).setNumberFormat("@").setValue(a.row[perIdx]);
});
return null;
}

function saveBudget(period, category_id, amount) {
const sheet = getSheet(SHEETS.BUDGETS);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIndex = headers.indexOf("id");
const periodIndex = headers.indexOf("period");
const categoryIndex = headers.indexOf("category_id");
const budgetIndex = headers.indexOf("budgeted");

for (let i = 1; i < data.length; i++) {
const rawPeriod = data[i][periodIndex];
const cellPeriod = rawPeriod instanceof Date
? Utilities.formatDate(rawPeriod, Session.getScriptTimeZone(), "MM/yyyy")
: String(rawPeriod);
if (cellPeriod === String(period) && data[i][categoryIndex] == category_id) {
const oldAmount = data[i][budgetIndex];
_saveUndoSnapshot("updateBudget", { period, category_id, oldAmount });
sheet.getRange(i + 1, budgetIndex + 1).setValue(Number(amount));
return true;
}
}

_saveUndoSnapshot("updateBudget", { period, category_id, oldAmount: 0 });
const row = new Array(headers.length).fill("");
row[idIndex] = generateId("BUD");
row[periodIndex] = period;
row[categoryIndex] = category_id;
row[budgetIndex] = Number(amount);
const newRowIndex = sheet.getLastRow() + 1;
sheet.appendRow(row);
sheet.getRange(newRowIndex, periodIndex + 1).setNumberFormat("@").setValue(period);
return true;
}

// ================= NOTE BUDGET =================
function saveBudgetNote(period, category_id, note) {
const sheet   = getSheet(SHEETS.BUDGETS);
const data    = sheet.getDataRange().getValues();
const headers = data[0];

const idIdx   = headers.indexOf("id");
const perIdx  = headers.indexOf("period");
const catIdx  = headers.indexOf("category_id");
const budIdx  = headers.indexOf("budgeted");
const planIdx = headers.indexOf("plan_id");
const _plan   = _getCurrentPlanId();

// Colonne "note" — créée dynamiquement si absente
let noteIdx = headers.indexOf("note");
if (noteIdx < 0) {
noteIdx = headers.length;
sheet.getRange(1, noteIdx + 1).setValue("note");
}

// Chercher une ligne existante (même period + category_id + plan_id)
for (let i = 1; i < data.length; i++) {
if (planIdx >= 0 && data[i][planIdx] && String(data[i][planIdx]) !== String(_plan)) continue;
if (normPeriod(data[i][perIdx]) === String(period) && String(data[i][catIdx]) === String(category_id)) {
sheet.getRange(i + 1, noteIdx + 1).setValue(note || "");
return true;
}
}

// Pas de ligne → en créer une (budgeted = 0, juste pour stocker la note)
const newRow = new Array(Math.max(headers.length, noteIdx + 1)).fill("");
newRow[idIdx]  = generateId("BUD");
newRow[perIdx] = period;
newRow[catIdx] = category_id;
newRow[budIdx] = 0;
if (planIdx >= 0) newRow[planIdx] = _plan;
newRow[noteIdx] = note || "";
const lastRow = sheet.getLastRow() + 1;
sheet.appendRow(newRow);
sheet.getRange(lastRow, perIdx + 1).setNumberFormat("@").setValue(period);
return true;
}

// ================= HISTORIQUE =================
function _getAllTransactions(categories, planId) {
const sheet = getSheet(SHEETS.TRANSACTIONS);
if (!sheet) return [];
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIndex = headers.indexOf("id");
const dateIndex = headers.indexOf("date");
const periodIndex = headers.indexOf("period");
const descriptionIndex = headers.indexOf("description");
const categoryIdIndex = headers.indexOf("category_id");
const amountIndex = headers.indexOf("amount");
const clearedIndex = headers.indexOf("cleared");
const createdIndex = headers.indexOf("created_at");
const lockedIndex    = headers.indexOf("locked");
const skipLinkIndex    = headers.indexOf("skip_link");
const linkedPrvIndex   = headers.indexOf("linked_prevision_id");
const planIdIndex      = headers.indexOf("plan_id");
const effectivePlanId = planId || _getCurrentPlanId();

data.shift();

const categoryMap = {};
categories.forEach(c => { categoryMap[c.id] = c.name; });
const debtorIndex = headers.indexOf("debtor");

const rows = data
.filter(row => {
if (!row[idIndex]) return false;
if (planIdIndex < 0) return true;
const rp = row[planIdIndex];
// Accepter lignes sans plan_id (avant migration) ou matching
return !rp || String(rp) === String(effectivePlanId);
})
.map(row => {
const categoryId = row[categoryIdIndex];
let formattedDate = "";
let rawDate = null;
if (row[dateIndex] instanceof Date) {
rawDate = row[dateIndex].getTime();
formattedDate = Utilities.formatDate(row[dateIndex], Session.getScriptTimeZone(), "dd/MM/yyyy");
} else if (row[dateIndex]) {
// String : prendre seulement les 10 premiers caractères au cas où heure incluse
const s = String(row[dateIndex]).trim().slice(0, 10);
formattedDate = s;
rawDate = 0;
}
let rawCreated = 0;
if (row[createdIndex] instanceof Date) {
rawCreated = row[createdIndex].getTime();
}
return {
id: row[idIndex],
date: formattedDate,
rawDate,
rawCreated,
period: row[periodIndex],
description: row[descriptionIndex],
category_id: categoryId,
category: categoryMap[categoryId] || "",
amount: row[amountIndex],
debtor: debtorIndex >= 0 ? row[debtorIndex] : "",
cleared:   row[clearedIndex]   === true || row[clearedIndex]   === "TRUE" || row[clearedIndex]   === 1,
locked:    row[lockedIndex]    === true || row[lockedIndex]    === "TRUE" || row[lockedIndex]    === 1,
skip_link: skipLinkIndex >= 0 && (row[skipLinkIndex] === true || row[skipLinkIndex] === "TRUE" || row[skipLinkIndex] === 1),
linked_prevision_id: linkedPrvIndex >= 0 ? (row[linkedPrvIndex] || "") : ""
};
});
rows.sort((a, b) => {
if (b.rawDate !== a.rawDate) return b.rawDate - a.rawDate;
return b.rawCreated - a.rawCreated;
});
return rows;
}

// ================= TOGGLE CLEARED =================
function toggleCleared(id) {
const sheet = getSheet(SHEETS.TRANSACTIONS);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIndex = headers.indexOf("id");
const clearedIndex = headers.indexOf("cleared");
for (let i = 1; i < data.length; i++) {
if (data[i][idIndex] == id) {
const current = data[i][clearedIndex] === true || data[i][clearedIndex] === "TRUE" || data[i][clearedIndex] === 1;
_saveUndoSnapshot("toggleCleared", { oldStates: { [id]: current } });
sheet.getRange(i + 1, clearedIndex + 1).setValue(!current);
break;
}
}
const categories = _getCategories();
return _safeReturnTx(_getAllTransactions(categories));
}

// ================= BULK DELETE =================
function deleteMultiple(ids) { return _safe(function() {
const sheet = getSheet(SHEETS.TRANSACTIONS);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIndex = headers.indexOf("id");
const idSet = new Set(ids);

const rows = [];
data.forEach((r, i) => {
if (i > 0 && idSet.has(String(r[idIndex]))) {
const oldRow = {};
headers.forEach((h, col) => { oldRow[h] = r[col]; });
rows.push(oldRow);
}
});
_saveUndoSnapshot("deleteMultiple", { rows });

const lockedIdxM = headers.indexOf("locked");
for (let i = data.length - 1; i >= 1; i--) {
if (idSet.has(String(data[i][idIndex]))) {
const isLocked = data[i][lockedIdxM] === true || data[i][lockedIdxM] === "TRUE" || data[i][lockedIdxM] === 1;
if (!isLocked) sheet.deleteRow(i + 1);
}
}
const categories = _getCategories();
return _safeReturnTx(_getAllTransactions(categories));
}); }

// ================= BULK DUPLICATE =================
function duplicateMultiple(ids) { return _safe(function() {
const sheet = getSheet(SHEETS.TRANSACTIONS);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIndex       = headers.indexOf("id");
const dateIndex     = headers.indexOf("date");
const periodIndex   = headers.indexOf("period");
const descIndex     = headers.indexOf("description");
const catIdIndex    = headers.indexOf("category_id");
const catNameIndex  = headers.indexOf("category_name");
const amountIndex   = headers.indexOf("amount");
const clearedIndex  = headers.indexOf("cleared");
const createdIndex  = headers.indexOf("created_at");
const idSet = new Set(ids);

const rowsToDuplicate = data.filter((r, i) => i > 0 && idSet.has(String(r[idIndex])));

const newIds = [];
rowsToDuplicate.forEach(original => {
const newId = generateId("TX");
newIds.push(newId);
const row = new Array(headers.length).fill("");
row[idIndex]      = newId;
row[dateIndex]    = original[dateIndex];
row[periodIndex]  = original[periodIndex];
row[descIndex]    = original[descIndex];
row[catIdIndex]   = original[catIdIndex];
row[catNameIndex] = original[catNameIndex];
row[amountIndex]  = original[amountIndex];
row[clearedIndex] = false;
row[createdIndex] = new Date();
// Conserver le plan_id de la transaction originale
const planIdxDup = headers.indexOf("plan_id");
if (planIdxDup >= 0) row[planIdxDup] = original[planIdxDup] || _getCurrentPlanId();

const newRowIndex = sheet.getLastRow() + 1;
sheet.getRange(newRowIndex, 1, 1, row.length).setValues([row]);
sheet.getRange(newRowIndex, periodIndex + 1).setNumberFormat("@");

});
_saveUndoSnapshot("duplicateMultiple", { newIds });

const categories = _getCategories();
return _safeReturnTx(_getAllTransactions(categories));
}); }

// ================= BULK TOGGLE CLEARED =================
function toggleClearedMultiple(ids) { return _safe(function() {
const sheet = getSheet(SHEETS.TRANSACTIONS);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIndex      = headers.indexOf("id");
const clearedIndex = headers.indexOf("cleared");
const idSet = new Set(ids);

const targets = data.filter((r, i) => i > 0 && idSet.has(String(r[idIndex])));
const allCleared = targets.every(r =>
r[clearedIndex] === true || r[clearedIndex] === "TRUE" || r[clearedIndex] === 1
);
const newValue = !allCleared;

const oldStates = {};
targets.forEach(r => {
oldStates[String(r[idIndex])] = r[clearedIndex] === true || r[clearedIndex] === "TRUE" || r[clearedIndex] === 1;
});
_saveUndoSnapshot("toggleClearedMultiple", { oldStates });

// Batch: read cleared column, modify in memory, write back
const clearedCol = sheet.getRange(2, clearedIndex + 1, data.length - 1, 1).getValues();
for (let i = 0; i < data.length - 1; i++) {
if (idSet.has(String(data[i + 1][idIndex]))) {
clearedCol[i][0] = newValue;
}
}
sheet.getRange(2, clearedIndex + 1, clearedCol.length, 1).setValues(clearedCol);

const categories = _getCategories();
return _safeReturnTx(_getAllTransactions(categories));
}); }

// ================= LOCK ALL CLEARED =================
function lockAllCleared() { return _safe(function() {
const sheet = getSheet(SHEETS.TRANSACTIONS);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIndex      = headers.indexOf("id");
const clearedIndex = headers.indexOf("cleared");
const lockedIndex  = headers.indexOf("locked");

// Batch: read locked column, modify in memory, write back
const lockedCol = sheet.getRange(2, lockedIndex + 1, data.length - 1, 1).getValues();
for (let i = 1; i < data.length; i++) {
const isCleared = data[i][clearedIndex] === true || data[i][clearedIndex] === "TRUE" || data[i][clearedIndex] === 1;
const isLocked  = data[i][lockedIndex]  === true || data[i][lockedIndex]  === "TRUE" || data[i][lockedIndex]  === 1;
if (isCleared && !isLocked) {
lockedCol[i - 1][0] = true;
}
}
sheet.getRange(2, lockedIndex + 1, lockedCol.length, 1).setValues(lockedCol);

const categories = _getCategories();
return _safeReturnTx(_getAllTransactions(categories));
}); }

// ================= LOCK / UNLOCK MULTIPLE =================
function lockMultiple(ids) {
const sheet = getSheet(SHEETS.TRANSACTIONS);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIndex     = headers.indexOf("id");
const lockedIndex = headers.indexOf("locked");
const idSet = new Set(ids);

// Batch: read locked column, modify in memory, write back
const lockedColLM = sheet.getRange(2, lockedIndex + 1, data.length - 1, 1).getValues();
for (let i = 0; i < data.length - 1; i++) {
if (idSet.has(String(data[i + 1][idIndex]))) {
lockedColLM[i][0] = true;
}
}
sheet.getRange(2, lockedIndex + 1, lockedColLM.length, 1).setValues(lockedColLM);
return _safeReturnTx(_getAllTransactions(_getCategories()));
}

function unlockMultiple(ids) {
const sheet = getSheet(SHEETS.TRANSACTIONS);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIndex     = headers.indexOf("id");
const lockedIndex = headers.indexOf("locked");
const idSet = new Set(ids);

// Batch: read locked column, modify in memory, write back
const lockedColUM = sheet.getRange(2, lockedIndex + 1, data.length - 1, 1).getValues();
for (let i = 0; i < data.length - 1; i++) {
if (idSet.has(String(data[i + 1][idIndex]))) {
lockedColUM[i][0] = false;
}
}
sheet.getRange(2, lockedIndex + 1, lockedColUM.length, 1).setValues(lockedColUM);
return _safeReturnTx(_getAllTransactions(_getCategories()));
}

// ================= TOGGLE LOCKED =================
function reconcileTransactions(ids) {
const sheet = getSheet(SHEETS.TRANSACTIONS);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIndex     = headers.indexOf("id");
const lockedIndex = headers.indexOf("locked");
const idSet = new Set(ids.map(String));

// Snapshot pour undo — mémoriser l'état locked avant
const oldStates = {};
for (let i = 1; i < data.length; i++) {
if (idSet.has(String(data[i][idIndex]))) {
oldStates[String(data[i][idIndex])] = data[i][lockedIndex] === true || data[i][lockedIndex] === "TRUE" || data[i][lockedIndex] === 1;
}
}
_saveUndoSnapshot("reconcile", { oldStates });

// Batch: read locked column, modify in memory, write back
const lockedColRT = sheet.getRange(2, lockedIndex + 1, data.length - 1, 1).getValues();
for (let i = 0; i < data.length - 1; i++) {
if (idSet.has(String(data[i + 1][idIndex]))) {
lockedColRT[i][0] = true;
}
}
sheet.getRange(2, lockedIndex + 1, lockedColRT.length, 1).setValues(lockedColRT);

return _safeReturnTx(_getAllTransactions(_getCategories()));
}

function toggleLocked(id) {
const sheet = getSheet(SHEETS.TRANSACTIONS);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIndex     = headers.indexOf("id");
const lockedIndex = headers.indexOf("locked");
const clearedIndex = headers.indexOf("cleared");
for (let i = 1; i < data.length; i++) {
if (data[i][idIndex] == id) {
const currentLocked  = data[i][lockedIndex]  === true || data[i][lockedIndex]  === "TRUE" || data[i][lockedIndex]  === 1;
const currentCleared = data[i][clearedIndex] === true || data[i][clearedIndex] === "TRUE" || data[i][clearedIndex] === 1;
// Snapshot : mémorise état verrouillage ET pointage avant modif
_saveUndoSnapshot("toggleLocked", { id, wasLocked: currentLocked, wasCleared: currentCleared });
sheet.getRange(i + 1, lockedIndex + 1).setValue(!currentLocked);
break;
}
}

const categories = _getCategories();
return _safeReturnTx(_getAllTransactions(categories));
}

// ================= COPY BUDGET FROM PREVIOUS =================
function rolloverBudget(params) {
// params = { from: "MM/YYYY", to: "MM/YYYY" }
// Report des restes POSITIFS de la période "from" vers la période "to"
// Logique : pour chaque catégorie, si remaining > 0 → ajouter au budget de "to"
const { from, to } = params;
const categories = _getCategories();
const _activePlanId = _getCurrentPlanId();
const sheet = getSheet(SHEETS.BUDGETS);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIdx     = headers.indexOf("id");
const periodIdx = headers.indexOf("period");
const catIdx    = headers.indexOf("category_id");
const catNmIdx  = headers.indexOf("category_name");
const budgIdx   = headers.indexOf("budgeted");
const planBudIdx = headers.indexOf("plan_id");

// Calculer les dépenses réelles de la période "from" par catégorie
const txSheet = getSheet(SHEETS.TRANSACTIONS);
const txData  = txSheet.getDataRange().getValues();
const txH     = txData[0];
const txPerIdx = txH.indexOf("period");
const txCatIdx = txH.indexOf("category_id");
const txAmtIdx = txH.indexOf("amount");
const spent = {};
txData.slice(1).forEach(r => {
if (normPeriod(r[txPerIdx]) === from) {
const cat = String(r[txCatIdx]);
spent[cat] = (spent[cat]||0) + Math.abs(Number(r[txAmtIdx])||0);
}
});

// Budget de "from"
const fromRows = data.slice(1).filter(r =>
normPeriod(r[periodIdx]) === from &&
(planBudIdx < 0 || !r[planBudIdx] || String(r[planBudIdx]) === String(_activePlanId))
);

// Budget de "to" existant
const toRows = {};
data.slice(1).forEach((r,i) => {
if (normPeriod(r[periodIdx]) === to &&
(planBudIdx < 0 || !r[planBudIdx] || String(r[planBudIdx]) === String(_activePlanId))) {
toRows[String(r[catIdx])] = i+1;
}
});

let rolled = 0;
const catMap = {};
categories.forEach(c => { catMap[c.id] = c.name; });
// Trouver l'ID "À assigner" dynamiquement pour ce plan
const _aAssignCatRO = categories.find(c =>
c.name && (c.name.trim().toLowerCase() === "à assigner" || c.name.trim().toLowerCase() === "a assigner" || c.id === "CAT001")
);
const _aAssignerIdRO = _aAssignCatRO ? _aAssignCatRO.id : "CAT001";

fromRows.forEach(row => {
const catId = String(row[catIdx]);
if (catId === _aAssignerIdRO) return;
const budgeted = Number(row[budgIdx])||0;
const s        = spent[catId]||0;
const reste    = budgeted - s;
if (reste <= 0) return; // pas de report si dépassement ou nul

if (toRows[catId] !== undefined) {
  // Ajouter au budget existant
  const rowIdx = toRows[catId];
  const currentBudg = Number(data[rowIdx][budgIdx])||0;
  sheet.getRange(rowIdx+1, budgIdx+1).setValue(currentBudg + reste);
} else {
  // Créer une ligne budget pour "to"
  const newRow = new Array(headers.length).fill("");
  newRow[idIdx]    = generateId("BUD");
  newRow[periodIdx]= to;
  newRow[catIdx]   = catId;
  if (catNmIdx >= 0) newRow[catNmIdx] = catMap[catId]||"";
  newRow[budgIdx]  = reste;
  if (planBudIdx >= 0) newRow[planBudIdx] = _activePlanId;
  const lr = sheet.getLastRow()+1;
  sheet.appendRow(newRow);
  sheet.getRange(lr, periodIdx+1).setNumberFormat("@").setValue(to);
}
rolled++;

});

return { rolled, from, to };
}

function copyBudgetFromPrevious(period) {
function parsePeriod(p) {
const parts = String(p).split("/");
return { m: parseInt(parts[0]), y: parseInt(parts[1]) };
}
function prevPeriod(p) {
const {m, y} = parsePeriod(p);
return m === 1
? String("0" + 12).slice(-2) + "/" + (y-1)
: String("0" + (m-1)).slice(-2) + "/" + y;
}

const prev = prevPeriod(period);
const _activePlanIdCopy = _getCurrentPlanId();
const sheet = getSheet(SHEETS.BUDGETS);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIdx      = headers.indexOf("id");
const periodIdx  = headers.indexOf("period");
const catIdx     = headers.indexOf("category_id");
const budgetIdx  = headers.indexOf("budgeted");
const planCopyIdx = headers.indexOf("plan_id");
function _matchPlan(r) {
return planCopyIdx < 0 || !r[planCopyIdx] || String(r[planCopyIdx]) === String(_activePlanIdCopy);
}
const prevRows = data.slice(1).filter(r => normPeriod(r[periodIdx]) === prev && Number(r[budgetIdx]) > 0 && _matchPlan(r));
if (!prevRows.length) return { error: "Aucun budget trouvé pour " + prev };
const existingCats = new Set(
data.slice(1)
.filter(r => normPeriod(r[periodIdx]) === String(period) && _matchPlan(r))
.map(r => String(r[catIdx]))
);
let copied = 0;
prevRows.forEach(row => {
const catId = String(row[catIdx]);
if (existingCats.has(catId)) {
for (let i = 1; i < data.length; i++) {
if (normPeriod(data[i][periodIdx]) === String(period) && String(data[i][catIdx]) === catId) {
sheet.getRange(i+1, budgetIdx+1).setValue(Number(row[budgetIdx]));
break;
}
}
} else {
const newRow = new Array(headers.length).fill("");
newRow[idIdx]     = generateId("BUD");
newRow[periodIdx] = period;
newRow[catIdx]    = catId;
newRow[budgetIdx] = Number(row[budgetIdx]);
if (planCopyIdx >= 0) newRow[planCopyIdx] = _activePlanIdCopy;
const newIndex = sheet.getLastRow() + 1;
sheet.appendRow(newRow);
sheet.getRange(newIndex, periodIdx+1).setNumberFormat("@").setValue(period);
existingCats.add(catId);
}
copied++;
});

return { copied, from: prev };
}

// ================= BATCH TRANSACTIONS =================
function addBatchTransactions(items) {
const categories = _getCategories();
const sheet = getSheet(SHEETS.TRANSACTIONS);
const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
const idIdx    = headers.indexOf("id");
const dateIdx  = headers.indexOf("date");
const periodIdx = headers.indexOf("period");
const descIdx  = headers.indexOf("description");
const catIdIdx = headers.indexOf("category_id");
const catNmIdx = headers.indexOf("category_name");
const amtIdx   = headers.indexOf("amount");
const clrIdx   = headers.indexOf("cleared");
const crtIdx   = headers.indexOf("created_at");
const debtorIdx = headers.indexOf("debtor");
const now = new Date();
const catMap = {};
categories.forEach(c => { catMap[c.id] = c.name; });
const txItems = items.filter(i => i.type !== "prevision");
txItems.forEach(item => {
const f = item.form;
const date = new Date(f.date);
const period = formatPeriod(date);
const row = new Array(headers.length).fill("");
row[idIdx]    = generateId("TX");
row[dateIdx]  = date;
row[periodIdx] = period;
row[descIdx]  = f.description || "";
row[catIdIdx] = f.category_id;
row[catNmIdx] = catMap[f.category_id] || "";
row[amtIdx]   = Number(f.amount);
row[clrIdx]   = false;
row[crtIdx]   = now;
if (debtorIdx >= 0) row[debtorIdx] = f.debtor || "";
const planIdxBatch = headers.indexOf("plan_id");
if (planIdxBatch >= 0) row[planIdxBatch] = _getCurrentPlanId();
const lr = sheet.getLastRow() + 1;
sheet.getRange(lr, 1, 1, row.length).setValues([row]);
sheet.getRange(lr, periodIdx+1).setNumberFormat("@");
});
const prevItems = items.filter(i => i.type === "prevision");
if (prevItems.length) {
const ss = SpreadsheetApp.getActiveSpreadsheet();
let ps = ss.getSheetByName(SHEETS.PREVISIONS);
if (!ps) {
ps = ss.insertSheet(SHEETS.PREVISIONS);
ps.getRange(1,1,1,10).setValues([["id","date","period","description","category_id","category_name","amount","created_at","received","linked_tx_id"]]);
}
const ph = ps.getRange(1,1,1,ps.getLastColumn()).getValues()[0];
const piId=ph.indexOf("id"), piDate=ph.indexOf("date"), piPer=ph.indexOf("period"),
piDesc=ph.indexOf("description"), piCat=ph.indexOf("category_id"),
piCNm=ph.indexOf("category_name"), piAmt=ph.indexOf("amount"), piCrt=ph.indexOf("created_at");
prevItems.forEach(item => {
const f = item.form;
const date = new Date(f.date);
const period = formatPeriod(date);
const row = new Array(ph.length).fill("");
row[piId]=generateId("PRV"); row[piDate]=date; row[piPer]=period;
row[piDesc]=f.description||""; row[piCat]=f.category_id;
row[piCNm]=catMap[f.category_id]||""; row[piAmt]=Math.abs(Number(f.amount)); row[piCrt]=now;
const piPlan=ph.indexOf("plan_id"); if (piPlan>=0) row[piPlan]=_getCurrentPlanId();
const lr = ps.getLastRow()+1;
ps.getRange(lr,1,1,row.length).setValues([row]);
ps.getRange(lr,piPer+1).setNumberFormat("@");
});
}

const transactions = _getAllTransactions(categories);
const previsions   = _getAllPrevisions(categories);
return { transactions, previsions };
}

function getAllTransactions() {
return _safeReturnTx(_getAllTransactions(_getCategories()));
}

// ================= PREVISIONS =================
function _getAllPrevisions(categories, planId) {
const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.PREVISIONS);
if (!sheet) return [];
const data = sheet.getDataRange().getValues();
if (data.length < 2) return [];
const headers = data[0];
const idIndex         = headers.indexOf("id");
const dateIndex       = headers.indexOf("date");
const periodIndex     = headers.indexOf("period");
const descIndex       = headers.indexOf("description");
const catIdIndex      = headers.indexOf("category_id");
const amountIndex     = headers.indexOf("amount");
const createdIndex    = headers.indexOf("created_at");
const receivedIndex   = headers.indexOf("received");
const linkedTxIndex   = headers.indexOf("linked_tx_id");
const planIndex       = headers.indexOf("plan_id");
const effectivePlanId = planId || _getCurrentPlanId();

const catMap = {};
categories.forEach(c => { catMap[c.id] = c.name; });

const rows = [];
for (let i = 1; i < data.length; i++) {
const r = data[i];
if (!r[idIndex]) continue;
// Filtre plan_id
if (planIndex >= 0 && r[planIndex] && String(r[planIndex]) !== String(effectivePlanId)) continue;
let formattedDate = "";
let rawDate = 0;
if (r[dateIndex] instanceof Date) {
rawDate = r[dateIndex].getTime();
formattedDate = Utilities.formatDate(r[dateIndex], Session.getScriptTimeZone(), "dd/MM/yyyy");
} else {
formattedDate = r[dateIndex];
}
// Exclure les prévisions clôturées
const closedCol = headers.indexOf("closed");
if (closedCol >= 0 && (r[closedCol] === true || r[closedCol] === "TRUE" || r[closedCol] === 1)) continue;
rows.push({
id:          r[idIndex],
date:        formattedDate,
rawDate,
period:      r[periodIndex],
description: r[descIndex],
category_id: r[catIdIndex],
category:    catMap[r[catIdIndex]] || "",
amount:      r[amountIndex],
received:    r[receivedIndex] === true || r[receivedIndex] === "TRUE" || r[receivedIndex] === 1,
linked_tx_id: r[linkedTxIndex] || ""
});
}

rows.sort((a,b) => b.rawDate - a.rawDate);
return rows;
}

function getPrevisions() {
return _getAllPrevisions(_getCategories());
}

function addPrevision(form) {
const sheetName = SHEETS.PREVISIONS;
const ss = SpreadsheetApp.getActiveSpreadsheet();
let sheet = ss.getSheetByName(sheetName);
if (!sheet) {
sheet = ss.insertSheet(sheetName);
sheet.getRange(1,1,1,10).setValues([["id","date","period","description","category_id","category_name","amount","created_at","received","linked_tx_id"]]);
}

const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
const idIndex       = headers.indexOf("id");
const dateIndex     = headers.indexOf("date");
const periodIndex   = headers.indexOf("period");
const descIndex     = headers.indexOf("description");
const catIdIndex    = headers.indexOf("category_id");
const catNameIndex  = headers.indexOf("category_name");
const amountIndex   = headers.indexOf("amount");
const createdIndex  = headers.indexOf("created_at");

const categories = _getCategories();
const category = categories.find(c => c.id == form.category_id);
const id = generateId("PRV");
const date = new Date(form.date);
const period = formatPeriod(date);

const row = new Array(headers.length).fill("");
row[idIndex]      = id;
row[dateIndex]    = date;
row[periodIndex]  = period;
row[descIndex]    = form.description || "";
row[catIdIndex]   = form.category_id;
row[catNameIndex] = category ? category.name : "";
row[amountIndex]  = Math.abs(Number(form.amount));
row[createdIndex] = new Date();

const lastRow = sheet.getLastRow() + 1;
sheet.getRange(lastRow, 1, 1, row.length).setValues([row]);
sheet.getRange(lastRow, periodIndex + 1).setNumberFormat("@");

_saveUndoSnapshot("addPrevision", { id });
return _getAllPrevisions(categories);
}

function updatePrevision(form) {
const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.PREVISIONS);
if (!sheet) return [];
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIndex       = headers.indexOf("id");
const dateIndex     = headers.indexOf("date");
const periodIndex   = headers.indexOf("period");
const descIndex     = headers.indexOf("description");
const catIdIndex    = headers.indexOf("category_id");
const catNameIndex  = headers.indexOf("category_name");
const amountIndex   = headers.indexOf("amount");

const categories = _getCategories();
const category = categories.find(c => c.id == form.category_id);
for (let i = 1; i < data.length; i++) {
if (data[i][idIndex] == form.id) {
// Snapshot de l'ancienne valeur
const oldRow = {};
headers.forEach((h, j) => { oldRow[h] = data[i][j]; });
_saveUndoSnapshot("updatePrevision", { id: form.id, oldRow });
const date = new Date(form.date);
const updatedPrvRow = data[i].slice();
updatedPrvRow[dateIndex]    = date;
updatedPrvRow[periodIndex]  = formatPeriod(date);
updatedPrvRow[descIndex]    = form.description || "";
updatedPrvRow[catIdIndex]   = form.category_id;
updatedPrvRow[catNameIndex] = category ? category.name : "";
updatedPrvRow[amountIndex]  = Math.abs(Number(form.amount));
sheet.getRange(i+1, 1, 1, updatedPrvRow.length).setValues([updatedPrvRow]);
sheet.getRange(i+1, periodIndex+1).setNumberFormat("@");
break;
}
}
return _getAllPrevisions(categories);
}

function markPrevisionReceived(previsionId, txId) {
const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.PREVISIONS);
if (!sheet) return [];
const data = sheet.getDataRange().getValues();
let headers = data[0].map(String);
let receivedCol  = headers.indexOf("received");
let linkedTxCol  = headers.indexOf("linked_tx_id");
if (receivedCol < 0) {
receivedCol = headers.length;
headers.push("received");
sheet.getRange(1, receivedCol + 1).setValue("received");
}
if (linkedTxCol < 0) {
linkedTxCol = headers.length;
headers.push("linked_tx_id");
sheet.getRange(1, linkedTxCol + 1).setValue("linked_tx_id");
}

const idCol = headers.indexOf("id");
for (let i = 1; i < data.length; i++) {
if (String(data[i][idCol]) === String(previsionId)) {
sheet.getRange(i + 1, receivedCol + 1).setValue(true);
sheet.getRange(i + 1, linkedTxCol + 1).setValue(String(txId));
break;
}
}

return _getAllPrevisions(_getCategories());
}

// ── Lier plusieurs transactions à un attendu en un seul appel ──
function linkTransactionsToPrevision(txIds, previsionId) {
const sheet = getSheet(SHEETS.TRANSACTIONS);
const data  = sheet.getDataRange().getValues();
let headers = data[0].map(String);
let lnkCol  = headers.indexOf("linked_prevision_id");
if (lnkCol < 0) {
lnkCol = headers.length;
sheet.getRange(1, lnkCol + 1).setValue("linked_prevision_id");
headers.push("linked_prevision_id");
}
const idCol  = headers.indexOf("id");
const txSet  = new Set(txIds.map(String));
// Batch: read link column, modify in memory, write back
if (data.length > 1) {
const lnkColVals = sheet.getRange(2, lnkCol + 1, data.length - 1, 1).getValues();
for (let i = 0; i < data.length - 1; i++) {
if (txSet.has(String(data[i + 1][idCol]))) {
lnkColVals[i][0] = String(previsionId);
}
}
sheet.getRange(2, lnkCol + 1, lnkColVals.length, 1).setValues(lnkColVals);
}
const cats = _getCategories();
return { transactions: _getAllTransactions(cats, _getCurrentPlanId()), previsions: _getAllPrevisions(cats, _getCurrentPlanId()) };
}

// ── Lier une seule transaction (alias) ──
function linkTransactionToPrevision(txId, previsionId) {
return linkTransactionsToPrevision([txId], previsionId);
}

// ── Délier une transaction de son attendu ──
function setTransactionSkipLink(txId, skip) {
const sheet = getSheet(SHEETS.TRANSACTIONS);
const data  = sheet.getDataRange().getValues();
let headers = data[0].map(String);
let skipCol = headers.indexOf("skip_link");
if (skipCol < 0) {
skipCol = headers.length;
sheet.getRange(1, skipCol + 1).setValue("skip_link");
headers.push("skip_link");
}
const idCol = headers.indexOf("id");
for (let i = 1; i < data.length; i++) {
if (String(data[i][idCol]) === String(txId)) {
sheet.getRange(i + 1, skipCol + 1).setValue(skip ? true : false);
break;
}
}
const cats = _getCategories();
return { transactions: _getAllTransactions(cats, _getCurrentPlanId()) };
}

function unlinkTransactionFromPrevision(txId) {
const sheet = getSheet(SHEETS.TRANSACTIONS);
const data  = sheet.getDataRange().getValues();
const headers = data[0].map(String);
const lnkCol  = headers.indexOf("linked_prevision_id");
const idCol   = headers.indexOf("id");
const cats    = _getCategories();
if (lnkCol < 0) return { transactions: _getAllTransactions(cats, _getCurrentPlanId()), previsions: _getAllPrevisions(cats, _getCurrentPlanId()) };
for (let i = 1; i < data.length; i++) {
if (String(data[i][idCol]) === String(txId)) {
sheet.getRange(i + 1, lnkCol + 1).setValue("");
break;
}
}
return { transactions: _getAllTransactions(cats, _getCurrentPlanId()), previsions: _getAllPrevisions(cats, _getCurrentPlanId()) };
}

function unlinkPrevision(previsionId) {
const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.PREVISIONS);
if (!sheet) return [];
const lastCol = sheet.getLastColumn();
const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
const idCol       = headers.indexOf("id");
const receivedCol = headers.indexOf("received");
const linkedTxCol = headers.indexOf("linked_tx_id");

if (idCol < 0) return _getAllPrevisions(_getCategories());

const data = sheet.getDataRange().getValues();
for (let i = 1; i < data.length; i++) {
if (String(data[i][idCol]) === String(previsionId)) {
if (receivedCol >= 0) sheet.getRange(i+1, receivedCol+1).setValue(false);
if (linkedTxCol >= 0) sheet.getRange(i+1, linkedTxCol+1).setValue("");
break;
}
}
return _getAllPrevisions(_getCategories());
}

function closePrevision(previsionId) {
const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.PREVISIONS);
if (!sheet) return [];
const data = sheet.getDataRange().getValues();
let headers = data[0].map(String);

// S'assurer que la colonne "closed" existe
let closedCol = headers.indexOf("closed");
if (closedCol < 0) {
closedCol = headers.length;
sheet.getRange(1, closedCol + 1).setValue("closed");
headers.push("closed");
}
const idCol = headers.indexOf("id");
for (let i = 1; i < data.length; i++) {
if (String(data[i][idCol]) === String(previsionId)) {
sheet.getRange(i + 1, closedCol + 1).setValue(true);
break;
}
}
return _getAllPrevisions(_getCategories(), _getCurrentPlanId());
}

function deletePrevision(id) {
const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.PREVISIONS);
if (!sheet) return [];
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIndex = headers.indexOf("id");

for (let i = data.length - 1; i >= 1; i--) {
if (data[i][idIndex] == id) {
const oldRow = {};
headers.forEach((h, j) => { oldRow[h] = data[i][j]; });
_saveUndoSnapshot("deletePrevision", { oldRow });
sheet.deleteRow(i + 1);
break;
}
}
return _getAllPrevisions(_getCategories());
}

// ================= DEBTORS SHEET =================
function _getDebtors(planId) {
const sheet = getSheet(SHEETS.DEBTORS);
if (!sheet) return [];
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIdx = headers.indexOf("id");
const nameIdx = (() => {
const candidates = ["name", "Name", "nom", "Nom", "NAME", "NOM"];
for (const c of candidates) {
const i = headers.indexOf(c);
if (i !== -1) return i;
}
return 1;
})();
const catIdx    = headers.indexOf("default_category_id");
const activeIdx = headers.indexOf("active");
const planIdx   = headers.indexOf("plan_id");
const effectivePlanId = planId || _getCurrentPlanId();

return data.slice(1)
.filter(r => {
if (!r[idIdx] || !r[nameIdx]) return false;
if (r[activeIdx] === false || r[activeIdx] === "FALSE") return false;
if (planIdx < 0) return true;
const rp = r[planIdx];
return !rp || String(rp) === String(effectivePlanId);
})
.map(r => ({ id: r[idIdx], name: r[nameIdx], default_category_id: r[catIdx] || "" }));
}

function getDebtors() { return _getDebtors(); }

function addDebtor(form) {
const sheet = getSheet(SHEETS.DEBTORS);
if (!sheet) throw new Error("Feuille Debiteurs introuvable");
const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
const idIdx     = headers.indexOf("id");
const nameIdx   = headers.indexOf("name");
const catIdx    = headers.indexOf("default_category_id");
const activeIdx = headers.indexOf("active");
const row = new Array(headers.length).fill("");
const planDbtIdx = headers.indexOf("plan_id");
row[idIdx]     = generateId("DBT");
row[nameIdx]   = form.name;
row[catIdx]    = form.default_category_id || "";
row[activeIdx] = true;
if (planDbtIdx >= 0) row[planDbtIdx] = _getCurrentPlanId();
sheet.appendRow(row);

return _getSettingsPayload();
}

function updateDebtor(form) {
const sheet = getSheet(SHEETS.DEBTORS);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIdx   = headers.indexOf("id");
const nameIdx = headers.indexOf("name");
const catIdx  = headers.indexOf("default_category_id");
for (let i = 1; i < data.length; i++) {
if (String(data[i][idIdx]) === String(form.id)) {
sheet.getRange(i+1, nameIdx+1).setValue(form.name);
sheet.getRange(i+1, catIdx+1).setValue(form.default_category_id || "");
break;
}
}

return _getSettingsPayload();
}

function deleteDebtor(id) {
const sheet = getSheet(SHEETS.DEBTORS);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIdx     = headers.indexOf("id");
const activeIdx = headers.indexOf("active");
for (let i = 1; i < data.length; i++) {
if (String(data[i][idIdx]) === String(id)) {
sheet.getRange(i+1, activeIdx+1).setValue(false);
break;
}
}

return _getSettingsPayload();
}

// ================= CATEGORIES CRUD =================
function addCategory(form) {
const sheet = getSheet(SHEETS.CATEGORIES);
const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
const idIdx   = headers.indexOf("id");
const nameIdx = headers.indexOf("name");
const buckIdx = headers.indexOf("bucket_id");
const ordIdx  = headers.indexOf("order");
const actIdx  = headers.indexOf("active");
const planCatIdx = headers.indexOf("plan_id");
const data = sheet.getDataRange().getValues().slice(1);
const maxOrd = data.reduce((m, r) => Math.max(m, Number(r[ordIdx] || 0)), 0);
const row = new Array(headers.length).fill("");
row[idIdx]   = generateId("CAT");
row[nameIdx] = form.name;
row[buckIdx] = form.bucket_id || "";
if (ordIdx >= 0) row[ordIdx] = maxOrd + 1;
if (actIdx >= 0) row[actIdx] = true;
if (planCatIdx >= 0) row[planCatIdx] = form.plan_id || _getCurrentPlanId();
sheet.appendRow(row);
_catCache = null;

return _getSettingsPayload();
}

function toggleCategoryActive(id, active) {
const sheet = getSheet(SHEETS.CATEGORIES);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIdx  = headers.indexOf("id");
let actIdx = headers.indexOf("active");
// Créer la colonne si elle n'existe pas
if (actIdx < 0) {
actIdx = headers.length;
sheet.getRange(1, actIdx + 1).setValue("active");
if (data.length > 1) sheet.getRange(2, actIdx + 1, data.length - 1, 1).setValue(true);
}
for (let i = 1; i < data.length; i++) {
if (String(data[i][idIdx]) === String(id)) {
sheet.getRange(i + 1, actIdx + 1).setValue(active === true || active === "true");
break;
}
}
_catCache = null;
return _getSettingsPayload();
}

function updateCategory(form) {
const sheet = getSheet(SHEETS.CATEGORIES);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIdx   = headers.indexOf("id");
const nameIdx = headers.indexOf("name");
const buckIdx = headers.indexOf("bucket_id");
for (let i = 1; i < data.length; i++) {
if (String(data[i][idIdx]) === String(form.id)) {
if (nameIdx >= 0) sheet.getRange(i+1, nameIdx+1).setValue(form.name);
if (buckIdx >= 0) sheet.getRange(i+1, buckIdx+1).setValue(form.bucket_id || "");
break;
}
}
_catCache = null;

return _getSettingsPayload();
}

function deleteCategory(id) {
const sheet = getSheet(SHEETS.CATEGORIES);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIdx = headers.indexOf("id");
for (let i = data.length - 1; i >= 1; i--) {
if (String(data[i][idIdx]) === String(id)) {
sheet.deleteRow(i + 1);
break;
}
}
_catCache = null;

return _getSettingsPayload();
}

function reorderCategories(newOrder) {
const sheet = getSheet(SHEETS.CATEGORIES);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIdx  = headers.indexOf("id");
let ordIdx = headers.indexOf("order");

// Créer la colonne "order" si elle n'existe pas
if (ordIdx < 0) {
ordIdx = headers.length;
sheet.getRange(1, ordIdx + 1).setValue("order");
// Initialiser toutes les lignes existantes à 0
if (data.length > 1) {
sheet.getRange(2, ordIdx + 1, data.length - 1, 1)
.setValue(0);
}
}

// Accepte tableau de strings ["id1","id2",…] OU [{id,order}]
const orderMap = {};
if (newOrder.length && typeof newOrder[0] === "string") {
newOrder.forEach((id, i) => { orderMap[String(id)] = i + 1; });
} else {
newOrder.forEach(item => { orderMap[String(item.id)] = item.order; });
}

// Batch : collecter toutes les valeurs d'ordre et écrire en 1 appel
const orderVals = data.slice(1).map(r => {
const id = String(r[idIdx]);
return [orderMap[id] !== undefined ? orderMap[id] : (r[ordIdx] || 0)];
});
if (orderVals.length) {
sheet.getRange(2, ordIdx + 1, orderVals.length, 1).setValues(orderVals);
}
_catCache = null;
return _getSettingsPayload();
}

function reorderBuckets(newOrder) {
const sheet = getSheet(SHEETS.BUCKETS);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIdx  = headers.indexOf("id");
const ordIdx = headers.indexOf("order");
if (ordIdx < 0) return _getSettingsPayload();
// Accepte tableau de strings ["id1","id2",…] OU [{id,order}]
const orderMap = {};
if (newOrder.length && typeof newOrder[0] === "string") {
newOrder.forEach((id, i) => { orderMap[String(id)] = i + 1; });
} else {
newOrder.forEach(item => { orderMap[String(item.id)] = item.order; });
}
const bktOrderVals = data.slice(1).map(r => {
const id = String(r[idIdx]);
return [orderMap[id] !== undefined ? orderMap[id] : (r[ordIdx] || 0)];
});
if (bktOrderVals.length) {
sheet.getRange(2, ordIdx + 1, bktOrderVals.length, 1).setValues(bktOrderVals);
}
return _getSettingsPayload();
}

// ================= BUCKETS CRUD =================
function _getBuckets(planId) {
const sheet = getSheet(SHEETS.BUCKETS);
if (!sheet) return [];
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIdx   = headers.indexOf("id");
const nameIdx = (() => {
for (const c of ["name","Name","label","Label"]) {
const i = headers.indexOf(c); if (i >= 0) return i;
} return 1;
})();
const ordIdx    = headers.indexOf("order");
const planIdx   = headers.indexOf("plan_id");
const effectivePlanId = planId || _getCurrentPlanId();
return data.slice(1)
.filter(r => {
if (!r[idIdx]) return false;
if (planIdx < 0) return true;
const rp = r[planIdx];
return !rp || String(rp) === String(effectivePlanId);
})
.map(r => ({ id: r[idIdx], name: r[nameIdx], order: Number(r[ordIdx] || 0), plan_id: planIdx >= 0 ? r[planIdx] : effectivePlanId }))
.sort((a,b) => a.order - b.order);
}

function addBucket(form) {
const sheet = getSheet(SHEETS.BUCKETS);
const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
const idIdx   = headers.indexOf("id");
const nameIdx = (() => {
for (const c of ["name","Name","label","Label"]) { const i = headers.indexOf(c); if (i>=0) return i; } return 1;
})();
const ordIdx  = headers.indexOf("order");
const planBktIdx = headers.indexOf("plan_id");
const data = sheet.getDataRange().getValues().slice(1);
const maxOrd = data.reduce((m, r) => Math.max(m, Number(r[ordIdx] || 0)), 0);
const row = new Array(headers.length).fill("");
row[idIdx]   = generateId("BKT");
row[nameIdx] = form.name;
if (ordIdx >= 0) row[ordIdx] = maxOrd + 1;
if (planBktIdx >= 0) row[planBktIdx] = form.plan_id || _getCurrentPlanId();
sheet.appendRow(row);

return _getSettingsPayload();
}

function updateBucket(form) {
const sheet = getSheet(SHEETS.BUCKETS);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIdx   = headers.indexOf("id");
const nameIdx = (() => {
for (const c of ["name","Name","label","Label"]) { const i = headers.indexOf(c); if (i>=0) return i; } return 1;
})();
for (let i = 1; i < data.length; i++) {
if (String(data[i][idIdx]) === String(form.id)) {
sheet.getRange(i+1, nameIdx+1).setValue(form.name);
break;
}
}

return _getSettingsPayload();
}

function deleteBucket(id) {
const sheet = getSheet(SHEETS.BUCKETS);
const data = sheet.getDataRange().getValues();
const headers = data[0];
const idIdx = headers.indexOf("id");
for (let i = data.length - 1; i >= 1; i--) {
if (String(data[i][idIdx]) === String(id)) {
sheet.deleteRow(i + 1);
break;
}
}

return _getSettingsPayload();
}

// ================= SETTINGS PAYLOAD =================
function _getSettingsPayload() {
const categories = _getCategories();
const buckets    = _getBuckets();
const debtors    = _getDebtors();
return { categories, buckets, debtors };
}

function getSettings() {
return _getSettingsPayload();
}