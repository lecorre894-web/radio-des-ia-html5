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

## Périmètre et sécurité

- Écoute exclusivement sur `127.0.0.1`, port 8787 par défaut (`SPARKTIATES_PORT` peut le changer).
- API déterministe : `GET /health` et `POST /sha256` (16 Kio maximum). Aucun accès shell distant, aucun mécanisme d'exécution de code téléchargé, aucune clé.
- Pas de dépendance npm supplémentaire. Le JavaScript s'exécute dans Node ; les deux autres langages s'exécutent en processus distincts **uniquement quand leur runtime est disponible**.
- GitHub Pages est un hébergement statique : il **n'exécute pas** Java ni PowerShell, et les visiteurs ne peuvent pas utiliser directement ce pont local. Une connexion sécurisée au site public nécessiterait un backend déployé et une authentification.
- Ce module ne virtualise aucun NVIDIA SPARK, AMD EPYC, GPU, RAM ou modèle d'IA ; il ne supprime aucun abonnement, quota ou frais de fournisseur.
