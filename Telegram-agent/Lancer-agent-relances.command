#!/bin/bash
cd "$(dirname "$0")" || exit 1
echo "=== Agent de relance InvestPro ==="
echo "La plateforme s'ouvre dans Chrome : ton admin, onglet Agent Telegram."
echo "Laisse cette fenêtre ouverte pendant que tu relances."
echo "Si Telegram demande ton numéro, un code ou ton mot de passe 2FA, tape-les ici."
echo "Pour arrêter : ferme cette fenêtre."
echo
.venv/bin/tg-followup dashboard
