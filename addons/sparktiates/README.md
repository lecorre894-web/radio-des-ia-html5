# SPARKTIATES — ajout multilangage à Radio des IA

Extension **entièrement additive** et **locale** : elle ne modifie ni la Radio HTML5, ni les modèles, ni le budget Puter, ni le fil généalogique, ni QNE. Elle fournit une API de contrôle permettant de vérifier que JavaScript (Node.js), Java (11+) et PowerShell (7+) exécutent réellement le même calcul SHA-256.

## WSL Ubuntu

Depuis la racine du dépôt :

```bash
node --test addons/sparktiates/bridge.test.mjs
node addons/sparktiates/bridge.mjs
```

Dans un second terminal :

```bash
curl -s http://127.0.0.1:8787/health
curl -s -H 'Content-Type: application/json' -d '{"runtime":"javascript","text":"Radio IA"}' http://127.0.0.1:8787/sha256
# Remplacer javascript par java ou powershell pour comparer les empreintes.
```

Le diagnostic `/health` distingue les langages installés de ceux qui ne le sont pas. Pour Java, un JDK 11+ est requis pour le mode source ; pour PowerShell, le binaire `pwsh` 7+ doit exister dans WSL. **Aucune installation n'est imposée** et le fonctionnement de Radio des IA n'en dépend pas.


## 🖥️ Radio des IA : vrai moteur Ollama, sans compteur de tours

Un **second processus Node** a été ajouté : `radio-server.mjs`. Il complète le pont de test SHA-256 `bridge.mjs` sans le remplacer ni toucher aux sources QNE. Ce nouveau service relaie uniquement des requêtes authentifiées vers l'API Ollama **locale** (`127.0.0.1:11434`) et expose une liste réelle des modèles installés et un endpoint de conversation. Les modèles sont exécutés par ton matériel, **pas simulés ni générés par du code additif**.

Dans le dépôt local après `git pull --ff-only`, sur le PC WSL, démarre Ollama avec au moins un modèle déjà installé. Puis lance :

```bash
bash addons/sparktiates/start-radio.sh
```

Ce script vérifie que Node et Ollama sont disponibles, crée un jeton aléatoire de 64 caractères hexadécimaux dans `~/.config/sparktiates/radio-access-token` (permissions 0600) si nécessaire, affiche l'adresse et le jeton à saisir dans la Radio, puis démarre `http://127.0.0.1:8788`. Il ne télécharge ni n'installe de modèle et ne rend aucun port public.

### Accès depuis Android

L'adresse `127.0.0.1` sur le téléphone ne désigne **pas** le PC WSL. Il faut un tunnel HTTPS avec une adresse accessible au téléphone. Si l'utilitaire `cloudflared` est **déjà installé**, un second terminal WSL peut lancer explicitement :

```bash
bash addons/sparktiates/start-mobile-tunnel.sh
```

Le logiciel affiche une URL temporaire `https://...trycloudflare.com` que tu saisis comme **adresse SPARKTIATES** dans `tchat.html`. Le mot de passe est le jeton secret généré par le premier script. Il n'est enregistré ni sur GitHub Pages ni dans les données persistantes du navigateur. Le champ du jeton reste dans la mémoire de la page. Les routes `/v1/models` et `/v1/chat/completions` exigent son authentification ; seules les requêtes CORS de `https://lecorre894-web.github.io` ou d'un site de développement local autorisé sont acceptées par le serveur.

**Le tunnel est un outil de test**, non un service permanent. Il s'arrête avec le terminal et son URL change ; il n'offre aucune garantie de disponibilité. Toute personne connaissant cette URL peut contacter le serveur, mais la génération demeure protégée par le jeton privé. Pour la production, préférer un tunnel stable et un contrôle d'accès supplémentaire. Le serveur et Ollama doivent rester allumés.

### Limites réelles de « illimité »

- Il n'existe **aucune limite du nombre de tours programmée** dans le mode SPARKTIATES de la Radio : le débat se poursuit séquentiellement jusqu'à l'arrêt, une erreur, la fermeture de la page ou la panne du serveur.
- Chaque réponse a une limite de **1 200 tokens** et de contexte borné pour protéger la mémoire. Le modèle dépend du CPU/GPU, du stockage et de l'énergie de la machine.
- Le serveur refuse l'exécution arbitraire de programmes ; aucun modèle n'est inventé, et il n'ouvre pas de proxy Internet.
- **Pollinations garde sa propre facturation et ses plafonds de Pollen** ; le pont SPARKTIATES ne peut pas les supprimer. Ce moteur Ollama distinct, lui, ne facture aucun crédit d'API par tour.
- Une IA de 7, 14 ou 30 milliards de paramètres ne dispose pas automatiquement d'une expertise doctorale : une validation indépendante reste nécessaire.
- Aucun backend SPARKTIATES n'est déployé ou maintenu en ligne par GitHub Pages. Il faut **exécuter les scripts sur le vrai PC**. Les tests de GitHub vérifient le code et un simulateur d'API, pas une génération Ollama sur la machine de l'utilisateur.

## Périmètre et sécurité

- Écoute exclusivement sur `127.0.0.1`, port 8787 par défaut (`SPARKTIATES_PORT` peut le changer).
- API déterministe : `GET /health` et `POST /sha256` (16 Kio maximum). Aucun accès shell distant, aucun mécanisme d'exécution de code téléchargé, aucune clé.
- Pas de dépendance npm supplémentaire. Le JavaScript s'exécute dans Node ; les deux autres langages s'exécutent en processus distincts **uniquement quand leur runtime est disponible**.
- GitHub Pages est un hébergement statique : il **n'exécute pas** Java ni PowerShell, et les visiteurs ne peuvent pas utiliser directement ce pont local. Une connexion sécurisée au site public nécessiterait un backend déployé et une authentification.
- Ce module ne virtualise aucun NVIDIA SPARK, AMD EPYC, GPU, RAM ou modèle d'IA ; il ne supprime aucun abonnement, quota ou frais de fournisseur.
