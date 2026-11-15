# SPARKTIATES VRM — moteur de réalité virtuelle scientifique (architecture)

**Date :** 15 novembre 2026  
**Statut :** architecture additive et expérimentale. La Radio stable ne doit pas être restructurée.

## Distinction indispensable

La « réalité virtuelle » de SPARKTIATES est un **monde numérique de connaissances
et de simulations** : événements, relations, hypothèses, modèles et résultats
reproductibles. Internet et les IA sont des systèmes numériques, mais ils ne
constituent pas une réserve illimitée de calcul. Les processus s'exécutent
sur des CPU/GPU et utilisent RAM, stockage, réseau et énergie réels.

La VRM ne transforme ni les hypothèses en mesures, ni un modèle en titulaire de
doctorat, ni un serveur local en datacenter géant. Elle donne **la continuité**.

## Les phases, de la donnée au résultat

1. **CAPTURE — carburant documentaire.** Les questions, réponses, équations,
   corrections et horodatages reçoivent des identifiants reproductibles.
   IndexedDB local : opt-in. Les échanges complets restent dans le Salon.
2. **MÉMOIRE DURABLE — SPARKTIATES.** Journal append-only JSONL avec jeton
   d'accès, dédoublonnage, restauration après redémarrage. Stockage sur le PC
   réellement démarré, hors du dépôt public.
3. **MONDE VIRTUEL / JUMEAU DE CONNAISSANCES.** Projection déterministe d'un
   graphe de **citations** : nœuds = événements et intervenants ; arêtes =
   termes communs / thème explicite / voisinages, sans prétendre que deux
   assertions équivalentes sont vraies.
4. **BRIDGE — passerelle vers les IA.** Recherche d'extraits pertinents, sélection
   explicite, fenêtre de contexte bornée. L'IA d'AI Horde voit seulement les
   fragments approuvés ; les travailleurs sont des tiers.
5. **EXTRAPOLATION — espace des scénarios.** À partir des hypothèses enregistrées,
   proposer des tests réfutables et des scénarios **SIMULÉS**. Aucune valeur
   mesurée ne peut être inventée par l'extrapolation. Les sources citées restent
   attribuées ; les calculs nécessitent une méthode et des paramètres explicités.
6. **AUDIT SCIENTIFIQUE.** Unité, équations, cohérence numérique, contradictions,
   validation externe et degrés d'incertitude. Statuts autorisés :
   MESURÉ (preuve instrumentale précisée), RECONSTRUIT, CANDIDAT,
   ARTEFACT, INCONNU et SIMULÉ. Une citation IA est CANDIDAT tant
   qu'aucun contrôle indépendant n'a été réalisé.
7. **ÉVALUATION / REPRODUCTIBILITÉ.** Tester la récupération des équations
   des marées, les corrections successives, les séparations entre six
   intervenants et l'absence de fuite de l'historique sans accord.

## Environnement d'exécution réaliste

- **Navigateur Android :** VRM locale IndexedDB, mémoire des équations,
  partage désactivé par défaut à chaque ouverture.
- **SPARKTIATES sur WSL/Linux :** serveur Node.js déjà disponible dans
  \`addons/sparktiates/radio-server.mjs\`, journal
  \`$HOME/.sparktiates/radio-vrm/events.jsonl\`.
- **Pont entre Android et PC :** URL HTTPS authentifiée et réellement
  opérationnelle, sans jeton inséré dans GitHub ou dans le code du Salon.
- **Inférence locale :** Ollama seulement si installé, actif et avec un modèle
  chargé. Les calculs n'apparaissent pas parce qu'on les a « émulés ».

## Validation déjà mise en place

Les tests Node.js portent sur les équations conservées, la provenance,
le dédoublonnage et la récupération après redémarrage. Un test Chromium mobile
porte sur l'activation, la persistance IndexedDB, l'autorisation explicite
AI Horde et l'absence de partage après désactivation.

**Sauvegarde de la Radio avant changement VRM :**
branche \`backup/radio-stable-before-vrm-20261115\`.

## À ne pas annoncer comme réalisé

- Aucun processus SPARKTIATES n'a été démarré à distance depuis cette session.
- Aucune IP publique, aucun tunnel HTTPS et aucun cluster GPU n'ont été créés.
- Pas de puissance « illimitée », pas de doctorat conféré aux modèles.
- La VRM ne récupère pas magiquement les conversations d'autres appareils
  et ne remonte pas les textes perdus avant l'enregistrement local.
