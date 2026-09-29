# InvestPro — installation du suivi Telegram sur Vercel

Cette version ajoute le suivi Telegram à la page existante `/dashboard/performances-vip`.
Elle conserve la saisie manuelle et les autres modules du ZIP reçu. Elle ne remplace pas le design par la maquette Aura : cette migration sera distincte.
Aucun bot n’est encore branché et aucune base distante n’a été modifiée par la préparation de ce ZIP.

## 1. Préparer Supabase

Ouvrir le projet Supabase utilisé par Investprotrading.fr > SQL Editor > New query.
Copier tout le contenu de `supabase/migrations/20260928_telegram_vip.sql`, puis Run.
Cette migration crée uniquement `investpro_telegram_events` et sa fonction d’écriture. Elle ne modifie ni ne supprime les anciennes tables. Les messages ne sont accessibles qu’au serveur ; aucune politique de lecture publique n’est créée.

Dans Authentication > Users, retrouver votre utilisateur du site et copier son UUID. Il servira à réserver le branchement à votre compte authentifié. Le cookie administrateur de l’ancien site n’est pas utilisé pour autoriser cette opération.

## 2. Variables Vercel

Projet > Settings > Environment Variables. Toutes les nouvelles variables sont côté serveur, sans préfixe NEXT_PUBLIC_. Activer Sensitive pour les secrets.

| Nom | Valeur |
| --- | --- |
| TELEGRAM_BOT_TOKEN | Token actuel de @InvestProTradingBOT ; déjà ajouté sur votre capture. |
| TELEGRAM_WEBHOOK_SECRET | Secret aléatoire distinct du token, au moins 32 caractères parmi A–Z, a–z, 0–9, _ et -. |
| TELEGRAM_VIP_CHAT_ID | Identifiant numérique du canal, commençant par -100. |
| TELEGRAM_ADMIN_USER_IDS | Votre UUID Supabase. Plusieurs administrateurs peuvent être séparés par des virgules. |
| TELEGRAM_SITE_ORIGIN | Origine HTTPS exacte utilisée pour ouvrir le site, sans chemin : par exemple https://investprotrading.fr si c’est son adresse finale, ou https://www.investprotrading.fr si le site redirige vers www. |
| SUPABASE_SERVICE_ROLE_KEY | Clé serveur service_role du même projet Supabase. Jamais la publier ni la mettre dans NEXT_PUBLIC_. |
| TELEGRAM_READER_USER_IDS | Facultatif : UUID des testeurs autorisés, séparés par des virgules. Vide = administrateurs uniquement. |

Conserver les variables existantes NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Ne pas les remplacer.
Les variables sont nécessaires dans l’environnement qui recevra les messages. Pour un essai Preview, utiliser des valeurs limitées à la branche d’essai et son origine HTTPS stable. Un bot n’a qu’un seul webhook actif ; ne pas brancher simultanément Preview et Production.

Pour créer TELEGRAM_WEBHOOK_SECRET sur Windows, ouvrir PowerShell et exécuter :

```powershell
$telegramBytes = New-Object byte[] 32
$telegramRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$telegramRng.GetBytes($telegramBytes)
$telegramRng.Dispose()
[BitConverter]::ToString($telegramBytes).Replace('-', '').ToLowerInvariant()
```

Copier le résultat directement dans Vercel et le conserver en lieu sûr. Ne pas le partager en capture.
Pour le canal privé : Telegram > clic droit sur un message > Copier le lien du message. Si le lien ressemble à `https://t.me/c/1234567890/42`, l’identifiant est `-1001234567890` (exemple fictif). Les deux nombres suivants éventuels ne font pas partie de l’identifiant du canal. Si le lien utilise un @nom public au lieu de `/c/`, demander la résolution de cet identifiant ; ne pas inventer le numéro.

## 3. Mettre le code sur une branche de test

Sur GitHub `Enrick95/investpro-dashboard1`, créer une branche `telegram-sync` à partir de la branche utilisée par Vercel. Ne pas remplacer tout le dépôt sans revue.
Décompresser le ZIP. Ajouter les fichiers suivants avec leurs dossiers à la racine du dépôt (pas un dossier investpro-dashboard1-main imbriqué) :

- `lib/telegram/engine.ts`
- `lib/telegram/server.ts`
- `app/api/telegram/webhook/route.ts`
- `app/api/telegram/stats/route.ts`
- `app/api/telegram/manage/route.ts`
- `components/telegram/VipTelegram.tsx`
- `supabase/migrations/20260928_telegram_vip.sql`
- `tests/telegram.test.mjs`
- `INSTALLATION-TELEGRAM.md`

Remplacer uniquement `app/dashboard/performances-vip/page.tsx` par sa version du ZIP (ajout de l’import et du composant Telegram). Aucune dépendance n’a été ajoutée.
Vérifier le déploiement de la branche. Après revue, intégrer les changements dans la branche de production afin que Vercel les déploie. Les variables ne prennent effet que sur un nouveau déploiement.
Ne pas téléverser node_modules, .next ou des fichiers .env.

## 4. Brancher depuis le site

Se connecter avec le compte Supabase dont l’UUID est dans TELEGRAM_ADMIN_USER_IDS.
Ouvrir `/dashboard/performances-vip`. Dans le nouveau panneau Telegram, cliquer « Connecter Telegram ».
Le serveur vérifie le nom du bot, son rôle d’administrateur, le canal et la présence de la table, puis enregistre le webhook. Il refuse de remplacer un webhook déjà configuré sur une autre adresse.

Si Vercel protège l’URL par une connexion Vercel, Telegram ne pourra pas livrer les messages. Régler l’accès au point de réception de façon ciblée avec votre configuration d’hébergement ; ne pas désactiver globalement les protections du site pour essayer. Les requêtes du bot sont authentifiées par TELEGRAM_WEBHOOK_SECRET, pas par une session utilisateur.
Un message « webhook enregistré » signifie seulement que Telegram a accepté l’adresse. Vérifier ensuite la livraison réelle.

## 5. Vérifier la réception

Publier un message ordinaire sans signal dans le canal (par exemple une annonce habituelle), puis actualiser le panneau. « Dernier message reçu » doit changer. Ce message ne crée pas de trade.
Ne pas publier de faux signal dans le VIP pour tester : utiliser un canal privé d’essai si un test complet est nécessaire, puis configurer l’identifiant du vrai canal et redéployer avant la mise en service. Les données sont séparées par canal.

Lors du prochain vrai signal au format habituel, vérifier actif, sens, entrée moyenne, SL et TP. Répondre AU MESSAGE DU SIGNAL avec « TP1 TOUCHER », « TP2 touché » ou « Stop loss touché ». Une réponse à une réponse est également rattachée si toute la chaîne a été reçue. L’interface actualise les données toutes les 30 secondes.
Comparer les chiffres manuellement avant d’autoriser les lecteurs. Aucun abonnement VIP n’est présumé : l’ouverture à la communauté exigera de relier les autorisations au véritable système d’abonnement.

## Méthode retenue

- Une entrée théorique au milieu de la zone ; SL initial comme risque de référence.
- Un signal = un trade. Le plus haut TP annoncé détermine son RR, sans somme des TP.
- Stop loss sur un signal sans TP = -1R.
- Winrate = gagnants / (gagnants + perdants). En attente et à vérifier exclus.
- Mois de publication du signal, fuseau Europe/Paris. Un TP ultérieur met à jour ce mois.
- Performance des annonces, pas gains réels des abonnés, pas rendement financier en pourcentage.
- Le suivi Telegram et les données manuelles restent distincts pour éviter les doubles comptes.

## Corrections et limites

Le stockage possède une seule version courante par message. Les livraisons répétées et éditions arrivées en retard ne dupliquent pas les résultats. Les éditions reçues recalculent les statistiques à partir de l’état courant ; ce n’est pas un registre d’audit immuable.
Les résultats contradictoires, TP inconnus et réponses sans signal sont signalés pour contrôle. Pour retirer une annonce TP/SL erronée, modifier son texte en « ANNULÉ », puis envoyer la bonne réponse au bon signal. Ne pas supprimer seulement le message : les suppressions ordinaires de canal ne sont pas signalées par ce flux Bot API.
Les signaux anciens non reçus ne sont pas importés automatiquement. Un export/import séparé sera nécessaire pour reconstituer les mois précédents.
Cette version traite les messages et légendes textuelles du canal autorisé, pas les captures sans texte, messages privés, commentaires du groupe de discussion ou transferts de signaux. BE et sorties partielles sont mis à vérifier ; aucune règle non validée n’est inventée.
Le calcul parcourt au maximum 100 000 messages ; au-delà une agrégation dédiée sera nécessaire. L’API pagine les lectures pour éviter une limite silencieuse à 1 000 lignes.
Le contrôle de tous les messages publiés dans ce canal repose sur ses administrateurs Telegram. N’y donner le droit de publication qu’aux personnes autorisées à publier les signaux.

## Journal automatique MT5 : constat séparé

`app/api/mt5/history/route.ts` pointe actuellement vers `http://127.0.0.1:5001/mt5/history`. Sur Vercel cette adresse ne joint pas votre ordinateur ni un service distant. Le journal existant stocke aussi des données localement et impose BUY à l’import. Il faut un connecteur distant, un stockage serveur par client et une normalisation des exécutions avant de prétendre à une synchronisation fiable. Aucun ordre, copie, accès broker ou endpoint MT5 n’a été activé/modifié dans cette livraison.

## Vérifications locales

`npm ci --ignore-scripts`, `node tests/telegram.test.mjs`, `npx tsc --noEmit`, puis `npm run build`.
La réception Telegram réelle et la migration sur Supabase restent à vérifier après configuration des accès. Les tests locaux ne prouvent pas une connexion active.

Résultat de la préparation : tests du moteur et du webhook réussis ; TypeScript sans erreur ; build Next.js réussi avec une URL et une clé publique Supabase factices pour le contrôle de compilation. Sans ces variables, le build initial s’arrêtait sur la page abonnement existante. Les valeurs factices ne sont pas enregistrées dans le ZIP et ne doivent pas être utilisées sur Vercel. Aucune connexion distante n’a été testée.
