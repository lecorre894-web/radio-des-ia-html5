# Radio des IA — cluster additif WSL (expérimental)

Ce module crée un ordonnanceur qui peut agréger plusieurs serveurs Ollama réellement installés, sans modifier le Salon Puter actuel. Les ressources logicielles ne créent pas de nouveaux cœurs physiques.

## Fichiers

- server.py : nœud WSL local, modèle Ollama, recherche Web explicitement demandée.
- cluster.py : distribution sur plusieurs nœuds, disponibilité mesurée, refus en cas de saturation, protection contre les pannes.
- cluster.example.json : premier nœud WSL, avec un seul slot de calcul pour éviter la saturation du GPU.
- cluster-console.html et cluster-console.mjs : console locale, distincte du Salon public.
- cluster-client.mjs : adaptation facultative, non branchée à la Radio publique.

## Démarrage dans WSL

Pré-requis : Python 3.10+, Ollama opérationnel, un modèle local qwen3:8b installé, pilotes NVIDIA et intégration WSL compatibles. Le modèle peut nécessiter un téléchargement explicite avec « ollama pull qwen3:8b ».

Depuis le dossier selfhost de la branche experiment/radio-additive-megacluster, exécuter :

1. Premier terminal : cp -n cluster.example.json cluster.nodes.json ; python3 server.py
2. Deuxième terminal : python3 cluster.py
3. Ouvrir http://127.0.0.1:8766/ sur le même ordinateur.

Avant démarrage, vérifier le modèle avec la commande : curl --max-time 5 http://127.0.0.1:11434/api/tags

## Ajouter des machines

Ajouter chaque serveur réellement disponible au fichier cluster.nodes.json avec un identifiant distinct, une origine HTTPS et le nombre de slots vérifié par mesure. Chaque nœud distant doit avoir un jeton fort en variable d'environnement : token_env nomme cette variable, jamais sa valeur. Un tunnel sécurisé ou VPN privé est obligatoire ; ne pas publier directement les ports 11434, 8765 ou 8766.

Le nœud distant doit être le même serveur server.py, exécuté sur un ordinateur que vous contrôlez, placé derrière une terminaison HTTPS sécurisée. Le jeton de nœud est défini par RADIO_NODE_AUTH_TOKEN sur le travailleur et par la variable référencée dans token_env sur l'ordonnanceur.

## Interfaces et sécurité

- GET /api/v1/status renvoie les ressources configurées, réellement disponibles, occupées et libres.
- POST /api/v1/chat prend message, profile, history et web; web vaut false par défaut.
- Pour chaque requête, le cluster choisit uniquement un nœud disponible et dont le modèle a été vérifié. Pas de cœur fictif ni de redémarrage automatique infini.
- Sources Web facultatives : Wikipedia et, si fourni localement, SearXNG. Les extraits ne sont pas des faits validés.
- Le contrôleur écoute 127.0.0.1 uniquement, sans CORS intersite; les secrets ne sont pas inscrits au dépôt.
- Le partage public avec le Salon sur GitHub Pages nécessitera une authentification HTTPS, une passerelle de permissions et des quotas étudiés séparément.
- Aucune modification aux fichiers du Salon actuel, ni aux conversations, favoris, documents ou modèles Puter.

## Statut et limites

Ce cluster est une architecture additive, et non le plus grand serveur du monde. Son débit réel dépend du nombre de GPU/CPU, de la VRAM, du réseau et des modèles installés. La capacité doit être mesurée sur matériel réel. Le système est expérimental et les tests automatiques ne remplacent pas des benchmarks sur WSL.
