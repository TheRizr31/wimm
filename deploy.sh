#!/usr/bin/env bash
# =============================================================
#  WIMM? — Déploiement depuis Google Cloud Shell
# =============================================================
#  Permet de déployer sans PC : Cloud Shell tourne dans le
#  navigateur, y compris sur iPhone.
#
#  Usage :  bash deploy.sh
#
#  Ce script ne suppose RIEN sur l'état local : il récupère
#  d'abord le projet Apps Script tel qu'il est en ligne (donc
#  son appsscript.json réel), puis remplace uniquement les deux
#  fichiers de code. Le manifeste n'est jamais réécrit à
#  l'aveugle — c'est ce qui rend l'opération sûre.
# =============================================================

set -euo pipefail

SCRIPT_ID="1EGdEgeC_MHZu1aHGHBVq-rHfiT1h0pstH-ab0mHR29cEUFZCKO9pztLG"
DEPLOY_ID="AKfycbxRBAggvRZgcG324NBYLa4ZBPvaf7fiVUTbYN5LMAQ6erVgN8CbA4u6cLERNuY9jSwm"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Publication automatique : --publish, ou variable CI (GitHub Actions)
PUBLISH=0
case "${1:-}" in --publish|-p) PUBLISH=1;; esac
[ "${CI:-}" = "true" ] && PUBLISH=1
WORK="$HOME/wimm-deploy"

say() { printf "\n\033[1;36m▶ %s\033[0m\n" "$1"; }
die() { printf "\n\033[1;31m✖ %s\033[0m\n" "$1" >&2; exit 1; }

# --- 0. Vérifications ---------------------------------------
[ -f "$REPO_DIR/Html.txt" ]     || die "Html.txt introuvable. Lance le script depuis le dossier du repo."
[ -f "$REPO_DIR/Code cs.txt" ]  || die "'Code cs.txt' introuvable. Lance le script depuis le dossier du repo."

# Le HTML doit être complet : un fichier tronqué casserait l'app en ligne.
grep -q "</html>" "$REPO_DIR/Html.txt" || die "Html.txt semble tronqué (pas de </html>). Déploiement annulé."
grep -q "function doGet" "$REPO_DIR/Code cs.txt" || die "'Code cs.txt' ne contient pas doGet(). Déploiement annulé."

# --- 1. clasp ------------------------------------------------
if ! command -v clasp >/dev/null 2>&1; then
  say "Installation de clasp (une seule fois)"
  npm install -g @google/clasp@2.4.2 >/dev/null 2>&1 || die "Installation de clasp échouée."
fi

if [ ! -f "$HOME/.clasprc.json" ]; then
  say "Connexion à Google"
  echo "Une URL va s'afficher. Ouvre-la, autorise l'accès, puis recopie le code ici."
  echo "Si ça refuse : active l'API Apps Script sur https://script.google.com/home/usersettings"
  clasp login --no-localhost || die "Connexion échouée."
fi

# --- 2. Récupérer le projet en ligne (préserve appsscript.json) ---
say "Récupération du projet Apps Script en ligne"
rm -rf "$WORK"
mkdir -p "$WORK"
cd "$WORK"
clasp clone "$SCRIPT_ID" >/dev/null 2>&1 || die "Clone échoué. Vérifie l'ID du script et tes droits."
[ -f "appsscript.json" ] || die "appsscript.json absent après le clone — on s'arrête pour ne rien casser."

# --- 3. Remplacer UNIQUEMENT les deux fichiers de code -------
say "Mise en place du nouveau code"
cp "$REPO_DIR/Html.txt"    "$WORK/Index.html"
cp "$REPO_DIR/Code cs.txt" "$WORK/Code.js"

# clasp ignore un push si le hash est identique : on force un contenu
# différent à chaque run, comme le fait push.bat sur le PC.
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"
printf '<!-- build: %s -->\n' "$STAMP" | cat - "$WORK/Index.html" > "$WORK/.tmp" && mv "$WORK/.tmp" "$WORK/Index.html"

printf "   Index.html : %s lignes\n" "$(wc -l < "$WORK/Index.html")"
printf "   Code.js    : %s lignes\n" "$(wc -l < "$WORK/Code.js")"

# --- 4. Envoi ------------------------------------------------
say "Envoi vers Apps Script"
clasp push --force || die "Push échoué. Rien n'a été publié."

# --- 5. Publication ------------------------------------------
if [ "$PUBLISH" = "1" ]; then
  say "Publication du déploiement $DEPLOY_ID"
  clasp deploy --deploymentId "$DEPLOY_ID" --description "${DEPLOY_DESC:-auto}" \
    || die "Publication échouée. Le code est envoyé mais l'ancienne version reste en ligne."
  say "En ligne. Recharge l'app (vide le cache Safari si besoin)."
else
  say "Déploiements existants"
  clasp deployments || true
  cat <<TXT

Le code est envoyé, mais PAS ENCORE PUBLIÉ.
Pour publier maintenant :

    cd $WORK && clasp deploy --deploymentId $DEPLOY_ID --description "manuel"

Ou relance en publiant directement :   bash deploy.sh --publish
TXT
fi
