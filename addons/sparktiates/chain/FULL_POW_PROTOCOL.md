# SPARKTIATES FULL POW — Séquence A → B → C → D → E

**Version :** recherche regtest (15 novembre 2026). **Aucune connexion avec Bitcoin
mainnet, aucun BTC, aucune valeur financière attachée aux unités SPK-POW.**

Cette chaîne expérimentale est **indépendante** du réseau initial
\`sparktiates-regtest-v1\` à trois signatures. Le minage et la validation
utilisent uniquement la **preuve de travail SHA-256 double** dans
\`sparktiates-pow-regtest-v1\`.

## Ordre des phases demandé — obligatoire

| Étape | Commande / module | Critères de réussite |
|:---|:---|:---|
| **A : Protocoles** | \`pow-core.mjs\` | Genèse liée à sa politique, UTXO, Ed25519 pour les **transactions** uniquement, blocs à preuve de travail, chaîne distincte de celle à quorum |
| **B : Calcul protocolé** | \`pow-cli.mjs benchmark\` | Sérialisation d'en-tête 80 octets, vecteur connu du bloc genèse Bitcoin pour le **hachage seulement**, SHA256d/s réellement mesurés |
| **C : Lancement du mining** | \`pow-cli.mjs mine 2\` | Workers CPU, balayage de nonces, \`H = SHA256(SHA256(header80))\`, sauvegarde des blocs prouvés |
| **D : Concordance** | \`pow-cli.mjs correspondence\` | Hash des blocs, Merkle, transitions UTXO, récompenses, émission, travail cumulé, rejeu depuis la genèse |
| **E : Tests de difficulté APRÈS D** | \`pow-cli.mjs difficulty\` | Analyse \`nBits\` cible, seuil accepté, essais théoriques, rejets de cibles altérées, branche sélectionnée par travail cumulé |

**Il ne faut pas faire passer E avant D dans l'essai ou le rapport.**
Le workflow \`.github/workflows/sparktiates-full-pow.yml\` réalise cet
ordonnancement explicitement, avec tests dédiés par étape. Le code de test
\`tests/sparktiates-pow.test.mjs\` place les tests E en dernier.

## Paramètres miniers du laboratoire

- \`chainId\` : \`sparktiates-pow-regtest-v1\`
- Monnaie : SPK-POW **de test** ; 8 décimales ; plafond 21 000 000
  unités SPK-POW théoriques. Il ne s'agit pas de BTC.
- Récompense initiale : 50 SPK-POW, réduite tous les 210 000 blocs.
- En-tête : 80 octets, champs version, prevhash, Merkle, timestamp, bits, nonce.
- Cible \`nBits\` fixe : \`0x1f0fffff\` ; plafond autorisé
  \`0x207fffff\`. L'encodage \`nBits\` est celui de la taille d'un entier
  256 bits, mais le **réseau** n'est pas compatible avec Bitcoin.
- Difficulté relative au plafond : 2048 ; nombre moyen approximatif
  d'essais SHA256d par bloc : 4096.
- **Aucun réajustement dynamique** (\`retarget: false\`) en V1 regtest.
  L'objectif théorique de 30 s n'est pas imposé par un ordonnanceur.
- Minage CPU borné et limité à huit workers ; plafond de 2 millions de
  tentatives par appel \`mineCandidate\`, 200 000 par défaut au CLI.
- Le protocole accepte le bloc dont le hachage interprété comme entier
  256 bits est **inférieur ou égal** à sa cible et dont le corps est cohérent.
  Le cas où une recherche bornée ne trouve aucun bloc est une **absence de
  preuve**, pas un succès simulé.
- Les transactions de test utilisent Ed25519, sorties UTXO et identifiants
  propres à la chaîne SPK-POW ; les mineurs ne reçoivent pas de BTC.

## Exécution WSL/Linux, sans modifier la Radio

Dans la racine du dépôt GitHub, avec Node.js 22+ :

\`\`\`bash
# A — protocole
node --test --test-name-pattern='^A:' tests/sparktiates-pow.test.mjs

# B — vrai calcul et benchmark cryptographique
node --test --test-name-pattern='^B:' tests/sparktiates-pow.test.mjs
node addons/sparktiates/chain/pow-cli.mjs benchmark

# C — créer deux blocs réels de test, sauvegardés sur le PC
node --test --test-name-pattern='^C:' tests/sparktiates-pow.test.mjs
node addons/sparktiates/chain/pow-cli.mjs mine 2

# D — comparer toutes les preuves et l'état après minage
node --test --test-name-pattern='^D:' tests/sparktiates-pow.test.mjs
node addons/sparktiates/chain/pow-cli.mjs correspondence
node addons/sparktiates/chain/pow-cli.mjs status

# E — SEULEMENT APRÈS D : difficulté et choix par travail cumulé
node --test --test-name-pattern='^E:' tests/sparktiates-pow.test.mjs
node addons/sparktiates/chain/pow-cli.mjs difficulty
\`\`\`

Les données de cette chaîne privée se conservent sur la machine dans
\`$HOME/.sparktiates/chain/pow-private-v1\` et jamais dans le dépôt public
GitHub. Les clés Ed25519 sont conservées en fichiers privés locaux.
Un test CI utilise un répertoire temporaire et l'efface à la fin.

## Différence entre preuve, difficulté et puissance

- **Preuve de travail** : le hash réel d'un en-tête répond au seuil \`target\`.
- **Difficulté** : l'inverse d'une probabilité d'acceptation normalisée.
  Un objectif de ~4096 hachages n'oblige pas à exactement 4096 essais.
- **Travail cumulé** : somme des poids cryptographiques des blocs validés.
  Une branche avec davantage de travail validé peut être préférée à une
  branche moins travaillée. En cas de travail égal, la branche courante est
  conservée afin d'éviter les réorganisations gratuites.
- **Hashrate** : hachages SHA256d par seconde *réellement calculés* sur
  le matériel de l'exécution. Il n'est pas comparable directement à une
  horloge simulée SPARKTIATES de **110 GHz**.

## Limites de sécurité et d'architecture actuelles

- Minage privé en CPU, sans pool, sans diffusion P2P ni mineur ASIC.
- La validation de chaînes concurrentes repose sur une fonction locale de
  sélection par travail cumulé ; il n'y a pas de protocole réseau de
  synchronisation des branches déployé.
- Pas de réajustement automatique de la difficulté : tous les blocs ont le
  même \`nBits\` en regtest ; le mécanisme de sécurité d'une chaîne publique
  serait plus exigeant.
- Pas d'audit externe de la cryptographie et de la résilience de l'implémentation.
- Pas de garantie de valeur des SPK-POW, pas d'échange contre des bitcoins.
- La chaîne Full PoW, l'ancienne chaîne à quorum, la VRM et la Radio
  conservent chacun leur propre état, sans conversion automatique.

## Résultats indépendants des tests CI

Le workflow Full PoW journalise les étapes dans l'ordre
**A / B / C / D / E**, avec les preuves avant l'analyse de difficulté.

L'empreinte de genèse SPK-POW est constante avec une politique identique ;
les adresses des mineurs, nonces, hachages des blocs et performances varient
d'une exécution à l'autre.

**Prochaine évolution non réalisée :** protocole d'ajustement de la difficulté
sur un réseau de plusieurs mineurs, tests de partitions et réorganisations,
et validation formelle indépendante avant une quelconque mise en public.
