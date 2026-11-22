# Agent de relance Telegram (compte InvestPro Support)

L’agent tourne sur le Mac d’Enrick, dans `~/Documents/ChatGPT/TELEGRAM`. C’est là que le compte Telegram support est connecté : la session et les identifiants (`data/`) ne quittent jamais ce Mac et ne sont jamais dans ce dépôt.

## Utilisation

1. Double-cliquer sur `Lancer-agent-relances.command`. La fenêtre du Terminal doit rester ouverte.
2. La plateforme s’ouvre sur `http://127.0.0.1:8765`. Elle est aussi dans l’admin du site, onglet **Agent Telegram**, ouvert dans Chrome sur ce même Mac.
3. Au lancement, une analyse démarre toute seule si la dernière a plus de 12 heures. Elle parcourt toutes les conversations privées, quelle que soit leur ancienneté, puis vérifie contact par contact qui est déjà membre du groupe **InvestPro Trading VIP**. Les autres groupes (INSTALLATION, chats VIP) ne sont pas regardés.
4. Filtre « À relancer », relire le message, cliquer « Envoyer ». Rien ne part sans ce clic.

Sont écartés d’office : les membres d’InvestPro Trading VIP, les refus (« non merci », « stop »…) et les comptes qui ont bloqué le support, les liens VIP déjà envoyés, les échanges de moins de 7 jours et les relances de moins de 7 jours. Si le contrôle VIP échoue pour un contact, l’envoi reste bloqué jusqu’à une vérification à la main. Sécurité : 100 envois par jour au plus, 3 secondes minimum entre deux envois, arrêt immédiat si Telegram signale une limite anti-spam.

Le message proposé dépend de la catégorie : les plus chauds (infos broker, lien VIP, appel), les tièdes (ils ont écrit en dernier sans réponse) et les froids. Chaque message invite à écrire sur WhatsApp via `investprotrading.fr/whatsapp`, qui ouvre le WhatsApp d’Enrick avec un message déjà écrit (« je viens de ton Telegram InvestPro Support »). Les messages poussent à rejoindre le VIP (gratuit avec un broker partenaire, ou par abonnement) plutôt qu’à tester : l’essai démo n’y est plus mentionné. Chaque message propose aussi, si besoin, un petit appel pour en parler.

Les membres des chats VIP sont aussi écartés (sécurité en plus, sans appel Telegram supplémentaire). L’agent lit les 40 derniers messages de chaque conversation pour repérer qui est venu par abonnement ou par affiliation : les anciens abonnés qui ne sont plus dans le groupe forment la catégorie « Anciens abonnés », avec un message à part. Quand les règles changent (`SCAN_VERSION`), le lancement suivant refait une analyse complète.

Avant d’envoyer, l’agent écarte aussi les pseudos connus du site (`data/site-checks.json`, empreintes SHA-256 des pseudos Telegram) : demande d’accès VIP en attente, demande d’essai déjà faite, accès déjà accepté.

## Mise à jour sur le Mac

Le paquet est installé dans le venv sans mode éditable : copier `src/telegram_followup/*` à la fois dans `src/telegram_followup/` et dans `.venv/lib/python3.9/site-packages/telegram_followup/` du dossier du Mac. Le Mac utilise Python 3.9 : garder une syntaxe compatible. La base `data/followups.sqlite3` se met à jour seule au lancement.

## Tests

`python -m pytest tests` avec Telethon 1.45 disponible (dossier `libs/` à côté, ou installé). Un faux client Telegram construit avec les vrais types Telethon couvre l’analyse, le contrôle VIP, l’envoi et les routes HTTP.
