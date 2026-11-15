# SPARKTIATES CHAIN — protocole privé expérimental V0.1

**Indépendant du réseau Bitcoin et du logiciel Bitcoin Core.** Le ticker SPK
désigne des unités de test internes, sans valeur financière annoncée. Il n'y a
ni vente, ni paiement commercial, ni connexion au mainnet, ni fonds réels.

## Ce qui est réellement réalisé

- 3 validateurs HTTP séparés sur des ports du **loopback 127.0.0.1**, sur **une
  seule machine et dans un seul processus Node**. Ils communiquent par de
  véritables requêtes TCP/HTTP. Il ne s'agit PAS de 3 machines indépendantes,
  et ces nœuds n'ont pas de diffusion P2P Internet.
- Génération de 3 paires Ed25519 locales, conservation des clés privées en
  fichiers permissions 0600, et création d'une genèse liée aux clés publiques.
- Blocs JSON canoniques, empreintes SHA-256, racine Merkle des identifiants
  de transactions et engagement sur l'état UTXO.
- Transactions multi-entrées et multi-sorties, autorisées par signatures
  Ed25519 ; référence UTXO anti-double-dépense, montants **entiers atomiques**.
- Émission de monnaie contrôlée, frais de transaction, récompense au proposeur.
- Proposeur tournant, certificat de 2 votes signés sur 3 validateurs,
  verrou persistant **par hauteur** avant signature.
- Journal/snapshot des blocs et des verrouillages avec écriture atomique,
  réexamen de toutes les signatures au redémarrage.
- Tests automatisés et démonstration réelle de deux blocs et d'un transfert
  sur GitHub Actions. Les serveurs du test CI s'arrêtent après le test.

## Paramètres canoniques de l'expérience (pas un réseau financier)

| Paramètre | Valeur |
| --- | --- |
| Identifiant de chaîne | \`sparktiates-regtest-v1\` |
| Monnaie | SPK |
| Unité atomique | 10⁻⁸ SPK |
| Offre plafond | 21 000 000 SPK / 2 100 000 000 000 000 unités |
| Quantité initiale (genèse) | 0 SPK |
| Récompense premier bloc | 50 SPK |
| Division programmée | Tous les 210 000 blocs |
| Intervalle cible théorique | 30 s (non imposé par la V0.1) |
| Nombre de validateurs | 3 |
| Proposeur | Alternance alphabétique alpha → beta → gamma |
| Seuil de signature | 2 signatures sur 3 (tous les 3 votent dans la démonstration) |
| Modèle d'état | UTXO |
| Signatures | Ed25519 (Node.js natif) |
| Hachages | SHA-256, domaine séparé par type |
| Ordonnancement | JSON canonique ; clés triées |
| Limites | 100 transactions/bloc, 32 entrées et 32 sorties/transaction |
| Accès réseau | \`127.0.0.1\` uniquement |
| Port des 3 validateurs | 19401, 19402 et 19403 (service persistant) |
| Portefeuille | 3 identités de test gérées localement |

### Monnaie

On travaille en unités atomiques entières :

\`\`\`text
1 SPK = 100 000 000 unités
Recompense(h) = plancher[5 000 000 000 / 2^plancher(h / 210 000)]
Frais = somme(entrees UTXO) − somme(sorties UTXO)
Monnaie créée par un bloc = Recompense(h)
Sortie pour le proposeur = Recompense(h) + Frais
Offre circulante <= 2 100 000 000 000 000 unités
\`\`\`

Ce modèle reproduit des principes de comptabilité UTXO, mais il **n'est pas**
une copie du protocole Bitcoin : signatures, politique de consensus,
format des en-têtes et mécanismes de réseau sont différents.

### Structure du bloc

- \`version\`, \`chainId\`, \`height\`, \`previousHash\`, \`timestamp\`, \`proposer\`.
- \`transactions\` : données signées avec \`id\` cryptographiquement vérifié.
- \`merkleRoot\` : racine d'arbre construite sur les identifiants des transactions.
- \`coinbase\` : sortie du proposeur (récompense + frais).
- \`stateRoot\` : engagement cryptographique déterministe sur l'ensemble UTXO.
- Identifiant du bloc : SHA-256 sur les champs ci-dessus, sérialisés
  canoniquement et avec séparation de domaine \`SPK/block/v1\`.
- Certificat : 2 signatures Ed25519 d'identités de validateurs distinctes.

La genèse (hauteur zéro, 0 SPK) est calculée avec la liste ordonnée de clés
publiques des validateurs. Elle est **reproductible avec la même configuration**,
mais une première installation locale génère de nouvelles clés et donc une
empreinte de genèse propre à cette installation.

## Fonctionnement du consensus expérimental

1. Le proposeur désigné génère une structure de bloc sur la tête validée.
2. Chaque validateur vérifie signatures des transactions, UTXO, récompense,
   racines et continuité.
3. Avant de signer, il persiste un verrou \`(height, hash)\` sur son disque.
4. Le coordinateur recueille les signatures ; une validation locale exige au
   moins 2 signatures distinctes.
5. Chaque nœud vérifie indépendamment le certificat et applique l'état.
6. Après redémarrage, chaque nœud rejoue les blocs et revalide les certificats.

**Ceci n'est pas CometBFT, HotStuff ni un consensus BFT certifié.** Un
quorum de 2 sur 3 permet des certificats contradictoires si un signataire
byzantin double-signe. Il manque les tours de vue, mécanismes de récupération,
gestion des partitions, propagation P2P, preuves d'équivoque, tests de
reconfiguration et audit formel. L'essai utilise un seul ordinateur et n'est
pas destiné aux fonds ou au réseau public.

## Lancer un test sans modifier la Radio

Pré-requis : Node.js 22+ et le dépôt à jour. Depuis la racine du dépôt :

\`\`\`bash
node addons/sparktiates/chain/demo.mjs
\`\`\`

La démonstration génère les clés dans un dossier temporaire, ouvre trois ports
locaux, crée deux blocs, transfère 12,5 SPK de test avec 1 000 unités de frais,
vérifie les soldes puis **rejette une seconde dépense**. Les serveurs sont
fermés et le dossier temporaire supprimé après le test.

### Réseau local persistant (deux terminaux)

Dans le premier terminal :

\`\`\`bash
node addons/sparktiates/chain/start-private.mjs
\`\`\`

Dans le second terminal :

\`\`\`bash
node addons/sparktiates/chain/client.mjs status
node addons/sparktiates/chain/client.mjs forge
node addons/sparktiates/chain/client.mjs transfer alpha beta 12.5
node addons/sparktiates/chain/client.mjs status
\`\`\`

Les clés et blocs persistent dans
\`$HOME/.sparktiates/chain/private-regtest-v1/\`, **en dehors du dépôt GitHub**.
Ne pas envoyer ce dossier ni ses clés privées à d'autres personnes. Ctrl+C
arrête les serveurs mais garde le journal intact.

Aucun lien Internet, torrent ou adresse publique n'est créé. Pour des appareils
distincts il faudra un canal privé authentifié, une configuration de pairs,
de vrais processus indépendants et des règles anti-partition.

## SPARKTIATES HYBRID / VRM : couche additive future

La blockchain ne doit pas conserver automatiquement les conversations :
la **VRM est distincte de l'état de consensus**.

- **SPARKTIATES HYBRID** : à terme, distribuer calcul de vérification, audits et
  benchmarks sur des CPU réels ; chaque nœud revalide tout bloc localement.
- **VRM** : garder les preuves d'expérimentation, paramètres et rapports.
  Éventuellement créer des engagements cryptographiques de rapports sans y
  inscrire le texte ni les secrets. Rien de cela n'est activé en V0.1.
- **Horloge virtuelle 110 GHz** : simulation de temps logique seulement,
  **aucun gain de fréquence physique** ni capacité de minage.
- **Radio des IA** : interface inchangée ; aucun mot de passe, historique ou
  portefeuille SPK ne lui est automatiquement partagé.

## Phases à développer avant toute ambition publique

1. **V0.1 (réalisé)** : genèse, clés, UTXO, 3 API locales, quorum signé, tests.
2. **V0.2** : validateur par processus/machine, communication chiffrée mTLS,
   découverte privée, catch-up après partitions.
3. **V0.3** : consensus formel à seuil de sûreté documenté, p. ex. 4
   validateurs avec un protocole BFT éprouvé tolérant une faute.
4. **V0.4** : wallets sécurisés, formats versionnés, sauvegarde hors ligne,
   scripts plus élaborés, restauration de clés.
5. **V0.5** : mesure multi-machine, réseau de validation, simulation
   d'attaques, audits externes, gouvernance et règles de migration.

**Les SPK expérimentaux ne sont ni des BTC ni des fonds transférables par
les protocoles Bitcoin.** Aucun « 110 GHz » n'est revendiqué physiquement.
