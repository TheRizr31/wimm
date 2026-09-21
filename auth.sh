#!/usr/bin/env bash
# =============================================================
#  WIMM? — Authentification clasp SANS invite interactive
# =============================================================
#  Cloud Shell sur iPhone coupe la session dès qu'on change
#  d'application : impossible de garder `clasp login` en attente.
#  Ce script fait l'échange OAuth lui-même, écrit ~/.clasprc.json,
#  puis enchaîne le déploiement. Aucun processus n'a besoin de
#  survivre : tout se joue en une seule commande.
#
#  Usage :  bash auth.sh '<URL localhost:8888/?...code=...>'
#           (guillemets SIMPLES obligatoires : l'URL contient des &)
# =============================================================

set -uo pipefail

CLIENT_ID="1072944905499-vm2v2i5dvn0a0d2o4ca36i1vge8cvbn0.apps.googleusercontent.com"
CLIENT_SECRET_FALLBACK="v6V3fKV_zWU7iw1DrpO1rknX"
REDIRECT="http://localhost:8888"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say() { printf "\n\033[1;36m▶ %s\033[0m\n" "$1"; }
die() { printf "\n\033[1;31m✖ %s\033[0m\n" "$1" >&2; exit 1; }

[ $# -ge 1 ] || die "Il manque l'URL. Usage : bash auth.sh '<URL collée>'"

# --- 1. Extraire le code de l'URL ---------------------------
RAW="$*"
CODE="$(printf '%s' "$RAW" | sed -n 's/.*[?&]code=\([^&]*\).*/\1/p')"
[ -n "$CODE" ] && CODE="$(printf '%s' "$CODE" | sed 's/%2F/\//g; s/%2f/\//g')"
# L'utilisateur a pu ne coller que le code
[ -z "$CODE" ] && case "$RAW" in 4/*) CODE="$RAW";; esac
[ -n "$CODE" ] || die "Aucun code trouvé dans ce que tu as collé.
Il doit contenir '?code=4/...' ou être le code lui-même."

say "Code récupéré (${#CODE} caractères)"

# --- 2. Retrouver le secret client de clasp -----------------
# Il est public (présent dans le paquet npm). On le lit sur place
# plutôt que de le supposer, et on retombe sur la valeur connue.
CLIENT_SECRET=""
CLASP_BIN="$(command -v clasp || true)"
if [ -n "$CLASP_BIN" ]; then
  CLASP_ROOT="$(dirname "$(readlink -f "$CLASP_BIN")")/.."
  CLIENT_SECRET="$(grep -rhoE '"[A-Za-z0-9_-]{24}"' "$CLASP_ROOT" --include='*.js' 2>/dev/null \
                   | tr -d '"' | grep -m1 -E '^[A-Za-z0-9_-]{24}$' || true)"
fi
[ -n "$CLIENT_SECRET" ] || CLIENT_SECRET="$CLIENT_SECRET_FALLBACK"

# --- 3. Échanger le code contre un jeton --------------------
say "Échange du code contre un jeton"
RESP="$(curl -s -X POST https://oauth2.googleapis.com/token \
  --data-urlencode "code=$CODE" \
  --data-urlencode "client_id=$CLIENT_ID" \
  --data-urlencode "client_secret=$CLIENT_SECRET" \
  --data-urlencode "redirect_uri=$REDIRECT" \
  --data-urlencode "grant_type=authorization_code")"

jget() { printf '%s' "$RESP" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p"; }

ACCESS="$(jget access_token)"
REFRESH="$(jget refresh_token)"
SCOPE="$(jget scope)"
IDTOK="$(jget id_token)"
EXPIN="$(printf '%s' "$RESP" | sed -n 's/.*"expires_in"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p')"

if [ -z "$ACCESS" ]; then
  printf '\n\033[1;31mRéponse de Google :\033[0m\n%s\n' "$RESP"
  die "Échange refusé. Causes les plus fréquentes :
  • le code a déjà servi ou a expiré (il ne vaut qu'une dizaine de minutes)
  → refais l'autorisation et relance aussitôt cette commande."
fi
[ -n "$REFRESH" ] || die "Google n'a pas renvoyé de refresh_token.
Ajoute &prompt=consent à l'URL d'autorisation et recommence."

# --- 4. Écrire ~/.clasprc.json ------------------------------
say "Écriture de ~/.clasprc.json"
EXPIRY=$(( $(date +%s) * 1000 + ${EXPIN:-3600} * 1000 ))
umask 077
cat > "$HOME/.clasprc.json" <<JSON
{
  "token": {
    "access_token": "$ACCESS",
    "refresh_token": "$REFRESH",
    "scope": "$SCOPE",
    "token_type": "Bearer",
    "id_token": "$IDTOK",
    "expiry_date": $EXPIRY
  },
  "oauth2ClientSettings": {
    "clientId": "$CLIENT_ID",
    "clientSecret": "$CLIENT_SECRET",
    "redirectUri": "http://localhost"
  },
  "isLocalCreds": false
}
JSON
chmod 600 "$HOME/.clasprc.json"

say "Connexion établie"
clasp login --status 2>/dev/null || true

# --- 5. Enchaîner le déploiement ----------------------------
say "Lancement du déploiement"
exec bash "$HERE/deploy.sh"
