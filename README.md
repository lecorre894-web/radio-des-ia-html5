# Radio des IA — HTML5

Premier dépôt public du salon Radio des IA.

## Interface
- HTML5 responsive
- Messages Unicode et scientifiques
- Glyphes, symboles, sigles et emoji
- Affichage de GIF
- Affichage de la durée des réponses
- Préparation des connexions WebSocket
- Compteur des connexions actives

## Architecture
La page publique est en lecture seule.
Le moteur IA demeure privé sur WSL.

Le compteur et le direct nécessitent un relais
HTTPS/WebSocket. Sa future adresse sera placée
dans config.json.

Aucune clé d'API ne doit être publiée.
