# InvestPro — Aura Nocturne + Analyse fondamentale

## Ce que contient cette livraison

Le thème noir/or de la maquette n° 6 est adapté au projet Next.js existant : accueil public, navigation fixe, cartes partagées, dashboard, présentation des pages et navigation mobile. La logique et les données existantes des pages sont conservées : ce n’est pas une copie des chiffres fictifs du prototype.

La nouvelle catégorie « Analyse fondamentale » se trouve immédiatement après « Calendrier éco ». Elle propose 29 paires, dont CHFJPY, GBPCHF et XAUUSD/GOLD, les sources officielles des deux devises et un bouton de synthèse IA. La page FinancialJuice et les widgets TradingView/Investing du prototype sont également inclus. Les anciens outils de graphique et calendrier restent accessibles sous « Outils et affichage InvestPro ».

Le prototype reste une démonstration privée : https://investpro-studio.louisiusenrick.chatgpt.site/#analyse-fondamentale
Sur Vercel, les pages sont connectées au projet Supabase existant, pas aux données de démonstration.

## 1. Installer le design sans toucher à la production

1. Télécharge `InvestPro-Aura-Fondamentale.zip`, clic droit → Extraire tout.
2. Ouvre le dépôt GitHub `Enrick95/investpro-dashboard1`.
3. Vérifie que tu es sur `main`. Ouvre la liste des branches et crée `refonte-aura` à partir de `main`.
4. Dans le dossier extrait, ouvre `A-UPLOADER`. Tu dois voir directement `app`, `components`, `lib`, `public`, `supabase`, `tests` et ce guide.
5. Sur GitHub, à la racine du dépôt, fais « Add file → Upload files ».
6. Glisse LE CONTENU de `A-UPLOADER` dans la zone d’envoi. Ne glisse pas le dossier `A-UPLOADER` lui-même et n’envoie pas le ZIP.
7. Vérifie que les chemins commencent par `app/...`, `components/...`, etc. Ne supprime pas les dossiers déjà présents : cet envoi ajoute et remplace uniquement les fichiers livrés.
8. Message du commit : `Refonte Aura Nocturne et analyse fondamentale`.
9. Enregistre le commit sur `refonte-aura`.
10. Crée une Pull Request vers `main`, mais ne fusionne pas encore. Vercel doit créer une Preview.

Base utilisée : archive du projet avec intégration Telegram, correspondant au travail fusionné dans la PR Telegram #1. Si tu as modifié les mêmes fichiers depuis, examine les différences de la Pull Request avant de fusionner. Le fichier `FICHIERS-MODIFIES.txt` liste exactement les fichiers de cette livraison.

## 2. Prévisualiser sur Vercel

1. Vercel → projet `investpro-dashboard1` → Deployments.
2. Ouvre le déploiement `Preview` de `refonte-aura` et attends `Ready`.
3. Clique sur Visit. Vérifie l’accueil, les menus, le journal, le plan, les comptes et le mobile.
4. Tes variables publiques Supabase doivent exister dans Preview : `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Garde leurs valeurs existantes. Si elles manquent, ajoute-les à Preview puis redéploie.
5. Si la connexion Supabase ou une confirmation par email te renvoie ailleurs, ajoute l’URL exacte de cette Preview aux Redirect URLs autorisées dans Supabase → Authentication → URL Configuration. Ne remplace pas l’adresse principale de production.
6. Pour vérifier Telegram, utilise le site de production habituel. Ne clique pas sur Connecter Telegram dans Preview et ne modifie pas `TELEGRAM_SITE_ORIGIN` pour une Preview.

La clé secrète Supabase et le token Telegram ne sont pas nécessaires à l’inspection visuelle du design. Il est normal que les statistiques Telegram ne soient pas lisibles en Preview si leurs variables serveur ne sont configurées qu’en Production.

## 3. Publier la refonte

Une fois la Preview validée :

1. GitHub → Pull Request `refonte-aura` → vérifie les contrôles Vercel.
2. Clique « Merge pull request », puis « Confirm merge ».
3. Vercel construit automatiquement `main` en Production. Attends `Ready / Current`.
4. Ouvre https://www.investprotrading.fr puis recharge la page (Ctrl+F5 sur ordinateur).
5. Vérifie accueil, connexion, navigation mobile, journal, plans, comptes et Performances VIP.

Toutes les routes Telegram, tous les fichiers `lib/telegram`, les tables de trading et la migration Telegram sont inchangés. Les cookies de connexion et les données Supabase ne sont pas effacés.

Pour revenir en arrière : utilise « Revert » sur la Pull Request fusionnée puis fusionne la Pull Request de retour. Vercel reconstruira la version précédente. Cela annule les fichiers de la refonte, sans effacer les données.

## 4. Activer l’analyse IA (facultatif pour publier le design)

Tant que le service n’est pas activé, la rubrique et les liens fonctionnent, mais le bouton ne produit pas de fausse analyse : il explique que l’IA n’est pas activée.

### A. Supabase

1. Ouvre le projet Supabase EXISTANT du site → SQL Editor → New query.
2. Copie l’intégralité de `supabase/migrations/20260930_fundamentals.sql` et exécute Run.
3. Le script crée deux nouvelles tables et une fonction de réservation/cache. Il ne modifie aucune table Telegram ou de trading.

### B. Clé IA et Vercel

Il faut un projet OpenAI API avec une clé serveur et la facturation API configurée. L’abonnement ChatGPT n’est pas la clé API du site. Ne colle jamais la clé dans GitHub ou dans une variable `NEXT_PUBLIC_...`.

Vercel → Environment Variables → Production :

| Nom | Valeur |
| --- | --- |
| `OPENAI_API_KEY` | Ta clé API privée, enregistrée comme secret |
| `FUNDAMENTALS_SITE_ORIGIN` | `https://www.investprotrading.fr` |
| `OPENAI_FUNDAMENTALS_MODEL` | `gpt-5-mini` (modèle par défaut, facultatif) |

Les variables `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` et `TELEGRAM_ADMIN_USER_IDS` existantes sont réutilisées. Ne les remplace pas.

Le lancement est limité aux administrateurs déjà listés dans `TELEGRAM_ADMIN_USER_IDS`. Pour un autre groupe pilote, ajoute `FUNDAMENTALS_USER_IDS` avec les UUID Supabase séparés par des virgules. Après validation, `FUNDAMENTALS_USER_IDS=*` permet l’accès à tout utilisateur connecté, quel que soit son abonnement. N’utilise pas `*` si tu veux réserver cette fonction à une offre payante : un contrôle d’abonnement doit d’abord être intégré.

Après ajout des variables : redeploie Production, connecte-toi au site, ouvre Analyse fondamentale et clique sur Analyser la paire.

### C. Fonctionnement

- La synthèse est demandée à la sélection d’une paire puis au clic. Il n’y a pas de publication quotidienne automatique ni de suivi tick par tick.
- La recherche web est obligatoire et limitée à une liste de sources primaires économiques (banques centrales, instituts statistiques, FMI, World Gold Council).
- La réponse traite les faits récents, les annonces vérifiées à venir, les facteurs des deux devises et les scénarios conditionnels. Ce n’est pas un signal BUY/SELL.
- Les citations renvoient aux publications ; la synthèse porte une date. Une réponse sans source ou incomplète n’est pas affichée.
- Une synthèse est réutilisée pendant 30 minutes. Une seule génération est réservée à la fois par paire.
- Maximum 5 nouvelles générations par utilisateur et par heure, 40 au total par jour UTC. Ces plafonds limitent les appels, pas un montant exact de facture. Les échecs après réservation comptent dans la limite.
- Seule la paire est envoyée au fournisseur IA, avec les instructions d’analyse. Ni comptes de trading, ni positions, ni messages Telegram, ni identité du client ne sont transmis.
- Le contenu reste informatif : les sources peuvent être incomplètes ou retardées et la synthèse peut se tromper. Les événements non confirmés doivent rester explicitement inconnus.

## 5. Validation réalisée et limites

- Compilation Next.js Production : réussie avec variables publiques de test non enregistrées dans le pack.
- Contrôle TypeScript : réussi.
- Tests existants Telegram : réussis (23 assertions + réception/sécurité webhook simulée).
- Tests de la nouvelle route IA : authentification, origine, absence de clé, paires admises, limites/cache, réponse citée et gestion des erreurs, avec services simulés.
- Aucun appel IA payant réel n’a été fait. La migration SQL et la génération réelle restent à vérifier dans ton Supabase et avec ta clé.
- La connexion et les données de production n’ont pas été utilisées pour tester cette refonte. La vérification visuelle dans la Preview Vercel est à effectuer avant fusion, sur ordinateur et téléphone.
- L’application mobile garde le manifest et le service worker existants. Il n’y a pas de modification de leur stockage.

Références d’implémentation : https://developers.openai.com/api/docs/guides/tools-web-search et https://developers.openai.com/api/docs/models/gpt-5-mini
