# SPARKTIATES BATON V3 — registre unique, 2 048 relais et Bitcoin regtest

**État (15 novembre 2026) : prototype privé réellement testé en CI.**
Bitcoin / SPK ne sont pas interchangeables. Aucun BTC réel n'est créé.

## Correction d'architecture fondamentale

Les **2 048 réseaux** désignent des **relais ou canaux d'acheminement logiques**,
et non 2 048 blockchains indépendantes.

- **Une seule genèse partagée** : elle est empruntée à l'état PoW V2
  \`spk-net-0001\` avec des règles de routage V3 supplémentaires (donc
  **pas compatible avec des blocs PoW V2 ordinaires**).
- **Une seule chaîne de blocs** : chaque bloc est lié à la même tête de chaîne
  par \`previousHash\` et une preuve PoW SHA256d réellement calculée.
- **Le relais tourne** de \`spk-net-0001\` à \`spk-net-2048\`, puis repart
  de \`spk-net-0001\` au cycle suivant, **sans nouvelle genèse**.
- **Le sommet 3D tourne indépendamment** : A, B, C, A, B, C, etc. Le
  passage du relais 2048 au relais 1 ne remet pas la rotation A/B/C à zéro.
- **Le bloc engage le relais et le sommet** cryptographiquement dans
  son corps, lequel est inclus dans la racine Merkle de son en-tête miné.
  Un bloc au mauvais relais est rejeté avant son enregistrement.
- **Un seul état monétaire global UTXO**. La subvention est créée **une
  fois par bloc**, pas une fois par relais ni par copie du registre.
- **Trois copies du même registre** (A, B et C), sur les nœuds de test ;
  chaque copie est recalculée indépendamment à partir de la genèse.
  Il ne s'agit pas de 2 048 bases monétaires.

### Champs enregistrés par bloc

\`height\`, \`previousHash\`, \`hash\`, \`relayId\`, \`relayCycle\`,
\`triangleVertex\`, \`difficultyBits\`, \`proofHash\`,
\`cumulativeWork\`, \`stateRoot\` et \`supply\`.

Le snapshot inclut également la chaîne canonique complète, l'empreinte de la
genèse, le nombre de relais, une empreinte SHA-256 de l'enveloppe et la
racine d'état UTXO. Les **clés privées des mineurs sont stockées dans des
fichiers séparés en permissions 0600**, jamais dans le registre.

Ce journal est un **instantané atomique** (fichier temporaire, fsync,
rename), pas encore une base de données transactionnelle conçue pour
des milliers de mineurs distants. Un checksum non signé protège contre
la corruption fortuite ; il ne protège pas à lui seul contre un attaquant
capable de réécrire tout le disque. Les preuves PoW, signatures des
transactions et transitions UTXO sont revérifiées à la lecture.

## Protocoles d'essai

1. **A — Identité et calendrier** : 2 048 relais, une seule genèse,
   progression séquentielle, rotation triangulaire sans remise à zéro.
2. **B — Calcul** : en-tête 80 octets et SHA-256 double réels.
3. **C — Minage** : le sommet désigné génère un bloc PoW.
4. **D — Concordance / registre** : les deux autres sommets revalident
   le bloc complet, l'UTXO, l'émission, le hash parent et sauvegardent
   la même chaîne sur leur propre disque.
5. **E — Difficulté** : réajustement selon la fenêtre V2, uniquement
   après validation des blocs et de la concordance.
6. **F — Full Duplex** : les trois liens TCP A↔B, B↔C, C↔A
   transmettent les annonces de tête et la synchronisation à deux sens.
7. **Redémarrage** : arrêt des trois processus, relecture des copies,
   vérification du même hash de tête et du même travail cumulé.

### Réalisé en CI

- Un calendrier de **2 048 relais** a été construit et vérifié.
- **9 blocs** ont été réellement minés, pas 2 048.
- **3 processus Node.js** (sur une seule machine temporaire GitHub Actions)
  ont échangé leurs blocs sur **3 connexions TCP loopback Full Duplex**.
- Les **9 blocs** ont été conservés dans les **3 copies vérifiées** du registre.
- Après arrêt et redémarrage, les copies ont retrouvé la même tête, sans
  émission supplémentaire.
- Les tests vérifient la corruption de la copie, la continuité des relais
  et le refus d'une genèse différente.

Le registre du réseau de test GitHub Actions est éphémère et supprimé après
le test ; le **code peut conserver des copies durables dans un répertoire
réel** lorsque les trois processus sont lancés localement avec ce répertoire.

## Mode Bitcoin regtest : essai séparé

Le fichier \`bitcoin-regtest-reference.mjs\` reproduit la genèse officielle
de Bitcoin Core regtest :

- timestamp : \`1296688602\`
- nonce : \`2\`
- bits : \`0x207fffff\`
- hash attendu :
  \`0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206\`.

Le code calcule réellement le SHA256d de l'en-tête de 80 octets et compare
le hash attendu. Il trouve aussi une preuve sur un **en-tête Bitcoin
synthétique relié à cette genèse**.

**Important :** cet en-tête synthétique ne contient pas de véritable
transaction coinbase construite selon les règles Bitcoin Core.
Ce test **ne prétend pas que Bitcoin Core a accepté un bloc**.
Pour tester un véritable bloc Bitcoin Core, il faudra démarrer
\`bitcoind -regtest\` et vérifier ses RPC dans un environnement distinct.
Le registre Bitcoin reste séparé de SPARKTIATES BATON V3.

## Exécuter les validations (Node.js 22+)

Depuis la racine du dépôt :

\`\`\`bash
node --test tests/sparktiates-baton-v3.test.mjs
node addons/sparktiates/chain/baton-v3-demo.mjs
node addons/sparktiates/chain/bitcoin-regtest-reference.mjs
\`\`\`

Le protocole est **privé et expérimental** : pas de transport TLS pour
Internet, pas de découverte distante de 2 048 machines, pas de puissance CPU
créée par virtualisation et pas de synchronisation à des blockchains Bitcoin.
La **Radio des IA reste inchangée**.
