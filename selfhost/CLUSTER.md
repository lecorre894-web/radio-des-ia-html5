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

## Extension NVIDIA DGX Spark + AMD EPYC (hypothèse de dimensionnement)

Le cluster accepte désormais des nœuds NVIDIA DGX Spark / GB10 ARM64 (20 cœurs ARM et 128 Gio de RAM unifiée dans le système standard), AMD EPYC 9006 Zen 6 x86-64 (jusqu'à 256 cœurs par socket) et EPYC 9965 (192 cœurs par socket). Le système vérifie le rapport /health réel des workers avant de compter le nœud comme disponible. Des machines différentes ne combinent pas leur RAM en une mémoire unique.

### Grand scénario ADDITIF, et non matériel installé

Le fichier topology.plan.json et le script plan_hardware.py décrivent :
- 64 DGX Spark imaginés : 64 × 128 Gio = 8192 Gio (8 Tio), répartis entre 64 machines ; 1280 cœurs CPU ARM théoriques.
- 32 serveurs EPYC 9006 à deux sockets : au maximum 32 × 2 × 256 = 16 384 cœurs x86, sous réserve de disposer effectivement de ces processeurs.
- Hypothèse de 2048 Gio de RAM DDR5 par serveur EPYC : 65 536 Gio (64 Tio) au total, répartis entre les serveurs. Ce chiffre est une hypothèse d'équipement et non une capacité constructeur garantie.
- Mémoire totale projetée = 73 728 Gio (72 Tio) répartis. Il ne s'agit PAS d'une RAM commune.
- Virtualisation projetée : 4 conteneurs ARM par Spark (256), 16 VM x86 par EPYC (512), soit 768 unités virtuelles projetées et AUCUNE créée.
- Les contraintes de mémoire réservent au moins 64 Gio sur chaque Spark pour le système et les modèles, et au moins 25 % de la RAM EPYC pour l'hôte.

Le script python3 plan_hardware.py ne fait qu'afficher ce scénario : online_nodes = 0 et usable_slots = 0. Il ne télécharge rien, ne facture rien et ne crée pas de machines. Les VM et conteneurs ne se transforment jamais en cœurs ou RAM physiques.

### Activation réelle et contrôle de ressources

Dans cluster.nodes.json, le champ optionnel hardware_family peut valoir spark-gb10, epyc-9006, epyc-9965, wsl-rtx ou auto. Un worker qui ne correspond pas au profil CPU et à l'architecture déclarés est refusé. La ressource instrumentée comprend l'architecture, les processeurs logiques vus par l'OS, MemTotal, MemAvailable et, si disponible, les GPU vus par nvidia-smi.

La demande d'inférence peut inclure hardware_family et min_available_ram_gb afin de choisir seulement un nœud réellement compatible et disposant de mémoire libre. Sans mesure RAM, il ne peut pas satisfaire une condition de mémoire.

Les DGX Spark sont des systèmes ARM64 indépendants, non des processeurs que l'on ajoute sur une carte mère EPYC. Les images de conteneurs ARM64 et x86-64 diffèrent. Le partage d'un seul grand modèle entre plusieurs DGX Spark exige une pile d'inférence distribuée compatible et un réseau ConnectX rapide ; ce cluster répartit pour le moment des requêtes indépendantes entre nœuds.

Sources constructeur :
- https://www.nvidia.com/fr-fr/products/workstations/dgx-spark/
- https://build.nvidia.com/spark/connect-multiple-sparks/overview
- https://www.amd.com/en/blogs/2026/agentic-ai-amd-epyc-9005-cpus-wins-today-epyc-9006.html
- https://www.amd.com/en/products/processors/server/epyc/9005-series/amd-epyc-9965.html

Statut : infrastructure expérimentale sur GitHub seulement, aucune machine DGX Spark ou EPYC ajoutée ni validation physique exécutée sur WSL.

## SPARKTIATES — émulateur de répartition, pas émulateur de GPU

SPARKTIATES est notre **simulation à événements discrets** du cluster Spark + EPYC. Il représente une file de requêtes fictives, leur sélection de nœuds, les slots de calcul, l'occupation de RAM par machine et la perte de serveurs. Il ne simule pas les instructions ARM, x86, CUDA ou les performances des GPU : ce serait une autre catégorie d'émulation.

Fichier : selfhost/sparktiates.py ; tests : tests/test_sparktiates.py ; console : http://127.0.0.1:8766/ puis bouton « Lancer le scénario simulé » ; endpoint local de lecture : GET /api/v1/sparktiates.

Commande WSL facultative depuis selfhost : python3 sparktiates.py. Cette commande n'a besoin ni de GPU, ni de modèle Ollama, ni d'accès réseau. Elle ne construit aucune VM, aucun CPU et aucune mémoire physique.

Par défaut, 640 tâches synthétiques sont réparties entre les 64 Spark et 32 EPYC du plan. Les durées et mémoires de ces tâches sont des **hypothèses configurables** ; elles ne proviennent d'aucun benchmark. Les slots simultanés sont volontairement inférieurs au nombre de VM/conteneurs projetés : une VM n'ajoute pas de ressource physique. La RAM est vérifiée par hôte ; une requête nécessitant 70 Gio ne peut pas être placée sur un Spark dont seuls 64 Gio sont réservés aux calculs, même si 64 autres Spark sont disponibles.

À la fin, le rapport indique toujours status=SIMULE_NON_MESURE, provisioned_hardware=false, real_models_executed=0, requests_sent_to_internet=0. Les résultats de l'émulateur ne doivent JAMAIS alimenter les indicateurs de performance mesurée du cluster.

Les futurs tests physiques compareront, sur un vrai Spark ou un vrai serveur EPYC, les latences, la saturation mémoire et le nombre de calculs simultanés ; seul cet étalonnage permettra d'améliorer les hypothèses de SPARKTIATES.

## Passerelle PowerShell Windows — couche additive sans duplication du matériel

Fichier : `selfhost/sparktiates-windows.ps1`. Ce contrôleur PowerShell 5.1/7+ fonctionne sur Windows 11 et complète les services WSL de SPARKTIATES. **Il n'ajoute aucun processeur physique ni aucune RAM : WSL et Windows se partagent les ressources du PC.** Le script ne démarre aucun service réseau public et ne change ni le Pare-feu Windows ni la Radio publique.

À exécuter depuis Windows PowerShell, dans le dossier `selfhost` de ce dépôt :

```powershell
.\sparktiates-windows.ps1 -Mode Audit
.\sparktiates-windows.ps1 -Mode Check
.\sparktiates-windows.ps1 -Mode Start
.\sparktiates-windows.ps1 -Mode Open
.\sparktiates-windows.ps1 -Mode Stop
```

`Audit` recueille seulement les données rapportées par Windows (CPU, mémoire, noms de GPU) et ne fait **aucune requête réseau**. `Check` ne consulte que `127.0.0.1:8766` et affiche les nœuds réellement opérationnels ainsi que les modèles déclarés installés ; `Start`/`Stop` pilotent les scripts Bash existants via `wsl.exe`. `Open` ouvre `http://127.0.0.1:8766/radio` seulement si le cluster répond. Si la redirection localhost WSL n'est pas disponible, aucun accès n'est simulé.

Quand le dépôt existe directement dans `/home/...` sous Ubuntu et non sur un disque Windows, ajouter `-LinuxSelfhost '/home/UTILISATEUR/radio-des-ia-html5/selfhost'` à la commande PowerShell de démarrage, d'arrêt ou de vérification. Ne pas deviner un chemin Linux réel ; l'adapter à celui du dépôt.

Installation de modèles locaux, **sur demande explicite seulement** :

```powershell
.\sparktiates-windows.ps1 -Mode ResearchCheck
.\sparktiates-windows.ps1 -Mode ResearchInstall
.\sparktiates-windows.ps1 -Mode GptOssInstall
.\sparktiates-windows.ps1 -Mode WindowsModels
.\sparktiates-windows.ps1 -Mode WindowsResearchInstall
```

`ResearchCheck` ne télécharge rien. `ResearchInstall` demande à Ollama **dans WSL** de télécharger `qwen3:14b` et `deepseek-r1:14b`; `GptOssInstall` ajoute `gpt-oss:20b` dans WSL. `WindowsModels` inspecte seulement le serveur Ollama **natif Windows** sur localhost ; `WindowsResearchInstall` télécharge les deux modèles **nativement sous Windows**, seulement si cette commande est explicitement lancée et Ollama pour Windows fonctionne déjà. Les modèles natifs Windows ne sont **pas ajoutés automatiquement comme nœuds** au cluster : ils ne deviennent disponibles qu'après vérification de l'accès réseau et de l'absence de comptage double de la RTX.

À distinguer : un second processus PowerShell ou Ollama sur le même PC ne crée pas un deuxième GPU. Les modèles restent des modèles locaux identifiés par leur véritable nom, et les huit profils « doctoraux » restent des méthodes de travail, pas une certification universitaire. Aucune adresse IP publique n'est générée.

Validation Windows dédiée : `.github/workflows/sparktiates-powershell.yml` vérifie les modes non destructifs en **PowerShell 7 et Windows PowerShell 5.1**. Cette validation ne prouve pas qu'Ollama a généré une réponse sur le vrai PC.
