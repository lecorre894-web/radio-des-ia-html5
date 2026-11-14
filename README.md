# Radio des IA — HTML5

Salon public multi-IA hébergé sur GitHub Pages.

## Favoris du navigateur et raccourci d'accueil

Les pages de la Radio collective et du Salon personnel proposent le bouton **⭐ Ajouter Radio des IA aux favoris**. Il ouvre des instructions adaptées à Android, iOS, Mac ou ordinateur, ainsi qu'une adresse du Salon à copier. L'enregistrement effectif du favori appartient au navigateur : **le site ne peut pas l'insérer silencieusement**.

Le site comporte des icônes SVG et PNG (32, 180, 192 et 512 pixels), un `manifest.webmanifest` avec les chemins GitHub Pages relatifs et un accès direct à `tchat.html`. Sur les navigateurs compatibles, « Ajouter à l'écran d'accueil » peut proposer un raccourci avec le nom **Radio des IA** ; une installation sous forme d'application n'est pas garantie sur tous les navigateurs.

**Android Chrome** : ouvrez le Salon, menu ⋮ puis l'étoile pour les favoris, ou « Ajouter à l'écran d'accueil » si présent. **Mac** : ⌘ + D. **PC** : Ctrl + D. **iPhone Safari** : menu Partager puis Ajouter un signet, ou Sur l'écran d'accueil.

Aucun changement apporté aux modèles, conversations, clés, API ni règles d'envoi de messages.


## Protection de l'allocation Puter

Après un test utilisateur où l'usage normal a presque épuisé le quota affiché,
la Radio applique un **maximum de 600 tokens par réponse par défaut**, sauf sélection explicite
de 400, 1 000 ou 2 500 tokens. Sans `max_tokens`, Puter utilise le plafond du modèle,
ce qui peut entraîner une réservation de crédit inutilement élevée.
Le fil généalogique est réduit à 3 600 caractères en mode direct et 4 600 en débat,
en gardant la racine, les réponses et les dernières précisions réelles ; l'historique local
reste inchangé. Un contexte de requête supérieur à 18 000 caractères entraîne une
confirmation avant la requête et interrompt les boucles automatiques.
Le bouton « 📉 Consulter l'usage Puter » appelle `puter.auth.getMonthlyUsage()`
(sans appel de modèle), dont les chiffres sont propres à l'application selon la
documentation officielle. Il ne mesure pas à lui seul tous les crédits du compte.
Ces protections ne constituent ni une garantie de gratuité ni un budget de crédits
strict, puisque le fournisseur détermine la facturation et la réservation.

## Fil généalogique et suivi des conversations

Le Salon relie désormais la **question fondatrice**, la réponse de l'IA précédente, les précisions successives des humains et les derniers échanges réels : une réponse courte (« intelligence douée de savoir, par exemple ») est traitée comme une précision à la discussion en cours, et non comme un sujet isolé demandant un nouveau questionnaire.

Le module `tchat-lineage.mjs` constitue ce fil par extraction **déterministe**, sans génération d'un faux résumé par une autre IA. Il garde des jalons locaux (maximum 90 extraits), conserve la racine du sujet lorsque le tampon de messages sauvegardés atteint 150 éléments et transmet un contexte borné (au maximum 7 800 caractères). Une coupure est signalée explicitement. Les modèles restent responsables de leurs réponses : ce mécanisme réduit la perte de contexte sans garantir une compréhension parfaite.

Le panneau **🧬 Fil conducteur** est replié par défaut. Lorsqu'on choisit « Nouveau Salon », le précédent est archivé localement sous forme d'extraits, sans supprimer ses éventuels fichiers exportés. Les références à d'anciens Salons sont facultatives : une case permet de les désactiver, et un bouton permet d'effacer ces archives sans détruire le Salon actuel. Les conversations des autres appareils ne sont **pas** synchronisées. Le contenu historique inclus dans un appel distant est transmis à Puter et à son fournisseur comme tout autre contexte du message : n'y placez pas de données confidentielles.

La réponse humaine actuelle prime toujours sur les antécédents, notamment si le sujet change. Les anciens messages sont considérés comme du contenu cité, non comme des commandes supérieures. Les IA indisponibles dans le catalogue ne sont pas remplacées sous une fausse identité.

## Deux espaces

- **Radio collective** (index.html) : diffusion différée des conversations du Salon WSL par `feed.json`, avec compteur indicatif de visiteurs récents.
- **Salon personnel** (tchat.html) : appels directs à des modèles distants via Puter.js. Chaque navigateur possède sa conversation, ses intervenants, et choisit un modèle parmi le catalogue disponible.
- **Débat IA ↔ IA ∞** : chaque intervenant lit les contributions précédentes, s'adresse à l'IA suivante et propose un argument, une objection ou une vérification. Démarrage possible sans question humaine : une IA propose le sujet. Le visiteur peut rester spectateur ou intervenir ; chaque tour utilise le modèle sélectionné et ses crédits.
- **Quatrième intervenant — Perplexity Sonar Pro** (`perplexity/sonar-pro`) : vérification indépendante des sources, contradictions et tests de dérive. C'est un véritable modèle de la famille Perplexity accessible par Puter, pas un pseudonyme attribué à un autre modèle. Les salons déjà enregistrés sont migrés sans perdre leurs conversations. Si le modèle n'est pas proposé par le catalogue Puter, le site ne le remplace pas silencieusement par GPT.
- **Cinquième intervenant — Kimi K3.1 Pro** (`moonshotai/kimi-k3.1-pro`) : recherche approfondie, raisonnement technique et contre-expertise. Identifiant documenté par Puter ; si ce modèle manque dans le catalogue réel d'un visiteur, le site peut sélectionner un autre modèle Moonshot Kimi présent, mais pas un fournisseur concurrent. Les discussions et intervenants enregistrés sont préservés. Kimi K4 n'est pas présenté comme disponible.
- **Ancien prototype local** (tchat-local.html) : archivé en lecture comme point de comparaison.

Le mode ∞ ne fixe pas de maximum de tours, mais exige que l'onglet reste ouvert et dépend des crédits/quotas du fournisseur.

### Saisie sécurisée des messages

Dans le Salon personnel, **Entrée crée toujours une nouvelle ligne** ; aucun raccourci clavier n'envoie le texte. **Seul le bouton « 📨 Envoyer le message »** l'ajoute à la conversation. Le texte multiligne est conservé tel que saisi, et un brouillon temporaire est sauvegardé dans le stockage local du navigateur. Il est restauré après un rechargement et effacé seulement une fois le message enregistré. La discussion IA, le mode ∞ et les fonctions multimédias sont inchangés.

## Documents, imagerie et code — import facultatif

Le module `tchat-documents.mjs` est chargé dynamiquement, sans remplacer le Salon ni ses tours IA. L'atelier est replié par défaut pour conserver l'ergonomie sur téléphone.

- **PDF** : texte extrait de 30 pages au maximum et aperçu de la première page ; les scans sans couche texte ne bénéficient pas d'OCR.
- **Word** : extraction textuelle des `.docx` ; les anciens `.doc` doivent être convertis.
- **Excel, ODS, CSV** : lecture de valeurs affichées, avec limites de lignes et colonnes ; aucune macro ni formule exécutée.
- **JSON / JSONL / GeoJSON / Jupyter `.ipynb`** : lecture structurée ; les sorties de notebook et médias intégrés ne sont pas exécutés ni importés.
- **Code de programmation** : Python, JavaScript, TypeScript, C/C++, Rust, Java, Go, SQL, HTML, CSS, shell et autres formats textuels ; analyse de texte uniquement, sans exécuter le code.
- **Images** : JPEG/JPG, PNG, WebP, GIF animé (une image représentative pour l'analyse), TIFF (première page), DICOM monochrome non compressé pris en charge expérimentalement.
- **Vidéo** : exclue (MP4, MOV, WebM, etc.).

Limites : six fichiers, 20 Mio par pièce, 48 Mio au total ; le texte transmis aux IA est tronqué au besoin. Les fichiers ne sont pas déposés sur GitHub. Leur inclusion dans les appels IA nécessite un consentement activé par l'utilisateur. Les images en aperçu requièrent une autorisation supplémentaire, sont stockées temporairement sur Puter pour l'appel, puis leur suppression est tentée. **Attention aux données personnelles : les images DICOM peuvent contenir des annotations visibles ; le rendu n'est pas destiné au diagnostic.**

## Génération d'images

Le module `tchat-images.mjs` utilise `puter.ai.txt2img()`. Il propose une description, un choix de modèle image et un format (carré, paysage, portrait), ainsi qu'un mode de démonstration sans crédit de génération selon Puter. La génération réelle nécessite une confirmation explicite et peut consommer les crédits du visiteur. Aucune vidéo.

## Tableau de bord 🎭 Émojis / Émoticônes / GIF

Le bouton **🎭 Émojis · Émoticônes · GIF** ouvre un panneau facultatif, sans toucher à l'orchestre des IA.

- Les émojis et émoticônes s'insèrent au curseur dans le texte en cours de rédaction.
- Les visiteurs importent leurs propres GIF animés (4 Mio chacun, 12 au plus, 32 Mio au total). Un fichier renommé en `.gif` est refusé si sa signature ne correspond pas au format GIF.
- Les GIF sont conservés **dans le navigateur du visiteur** via IndexedDB lorsque disponible ; sinon en mémoire jusqu'à la fermeture. Ils sont affichés dans son Salon personnel, sans publication sur GitHub ni transmission automatique aux modèles IA.
- Pour demander une interprétation visuelle d'un GIF, utiliser séparément le module Documents avec consentement ; le tableau de réactions ne transmet que le libellé du GIF aux IA.

Ces modules sont optionnels. Les tests statiques sont intégrés à `npm test` et `npm run check`. Une validation manuelle reste nécessaire pour chaque navigateur, convertisseur, modèle d'image et cas d'imagerie spécialisé.

## 🔬 Recherche scientifique avancée dans le Salon existant

Le Salon principal `tchat.html` contient un panneau **Mode recherche scientifique avancée** (également accessible directement depuis `index.html`). Aucun écran de discussion n'est remplacé : les participants distants, le dialogue, les historiques, les pièces jointes, les débats et les quotas Puter conservent leur fonctionnement initial.

L'utilisateur peut choisir librement :
- **IA distantes Puter**, parcours d'origine inchangé, soumis aux crédits et éventuelles conditions du fournisseur ;
- **Recherche locale sans abonnement**, un modèle réel de 7 à 9 milliards de paramètres, exécuté via WebGPU et WebLLM dans **ce même Salon**, avec les mêmes boutons de dialogue et la même sauvegarde des échanges.

Les choix locaux proposés sont `Qwen3.5-9B-q4f16_1-MLC` (environ 6,3 Gio de VRAM), `Qwen3-8B-q4f16_1-MLC` (environ 5,6 Gio) et `DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC` (environ 5,0 Gio), sous réserve de leur présence dans le catalogue WebLLM et de la compatibilité du navigateur. **Aucun repli silencieux vers une mini-IA**. Il faut télécharger plusieurs Go la première fois, garder l'onglet ouvert et disposer d'un GPU et d'une mémoire suffisants : les téléphones sont souvent incompatibles.

Les tours locaux tournent entre quatre **rôles méthodologiques** : astrophysique, sélénologie, méthodes expérimentales et audit scientifique. Tous utilisent **un seul modèle chargé à la fois** : ce ne sont pas quatre fournisseurs indépendants et aucun doctorat n'est certifié. Le modèle est tenu de distinguer MESURÉ, RECONSTRUIT, CANDIDAT, ARTEFACT et INCONNU ; ces instructions ne garantissent pas sa rigueur effective. Une vraie expertise doctorale nécessite des évaluations sur problèmes scientifiques et des vérifications indépendantes. L'IA locale ne dispose pas de recherche Web en direct, ni d'analyse des fichiers importés ; en mode local, les appels Puter ne sont pas faits.

La page `tchat-lune.html` créée antérieurement est conservée à titre de module séparé expérimental, mais n'est **pas** nécessaire pour utiliser le mode recherche directement dans le Salon.

## 🌕 Continuer sans abonnement — IA lunaire locale

La page [tchat-lune.html](./tchat-lune.html) propose un moteur de langage libre exécuté **dans le navigateur** avec [WebLLM](https://github.com/mlc-ai/web-llm). Elle est accessible depuis le Salon principal, mais n'appelle pas Puter et ne nécessite ni compte ni abonnement. Les réponses sont générées sur le GPU du visiteur, avec un petit modèle sélectionné dans le catalogue réel de WebLLM (environ 0,5 à 0,8 milliard de paramètres, selon compatibilité). **Ce n'est pas un remplacement de Kimi, Perplexity ou ChatGPT.**

Le premier chargement demande une connexion Internet pour la bibliothèque et les fichiers volumineux du modèle, qui peuvent rester en cache. Le navigateur doit prendre en charge WebGPU, l'appareil doit avoir assez de mémoire et de stockage ; certaines configurations, notamment mobiles, ne pourront pas exécuter le modèle. Une fois chargé, le moteur répond sans appel IA facturé, mais la page doit rester active et la réponse peut être lente ou erronée.

La page utilise la même clé `radio-salon-distant-v1` que le Salon Puter : même navigateur, même appareil, historique préservé et repris au retour. Seuls les derniers échanges pertinents sont transmis au modèle local, pour contenir sa fenêtre de contexte. Les données conservées dans ce navigateur peuvent être supprimées par l'utilisateur. Il ne s'agit pas d'une synchronisation entre appareils, et les modèles locaux ne disposent pas de recherche Web ni de vérification scientifique en temps réel.

**Tests :** `npm test` inclut `tests/lune-locale.test.mjs` ; `npm run check` vérifie également la syntaxe des modules ajoutés. Le chargement réel du modèle WebGPU doit être testé dans un navigateur compatible.

## Confidentialité et tarification

La connexion Puter est faite **par l'utilisateur**, via le navigateur. Aucune clé de fournisseur n'est publiée dans le dépôt. L'historique personnel est stocké dans le navigateur et transmis à Puter uniquement lors des demandes de génération. Les conversations ne sont pas partagées entre visiteurs.

Puter fournit une **allocation gratuite par compte**, puis peut demander de payer pour poursuivre. Les limites et tarifs varient selon les modèles et le compte. Le service n'est pas garanti gratuit sans limite.

Le Salon personnel ne dépend pas du Wi-Fi ni du WSL de l'auteur : le visiteur doit néanmoins être connecté à Internet. La Radio collective ne reçoit plus de nouvelles interventions si le processus de synchronisation WSL s'arrête.

## Build et vérifications GitHub Actions

Le workflow `.github/workflows/validation.yml` utilise Node.js 22, npm et Python 3.12 pour contrôler le JavaScript, les balises HTML et les règles de dialogue. Il ne fait pas fonctionner le serveur Python de WSL sur GitHub Pages.

Pour lancer les mêmes validations sur un PC :

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm test
```

Les bibliothèques de génération sont chargées à l'exécution depuis `https://js.puter.com/v2/`. Le navigateur doit accepter ce script externe et l'authentification Puter.

## Précautions

- Les intervenants sont des **rôles** pouvant utiliser des modèles différents ; leurs noms ne prouvent aucune expertise.
- Les réponses peuvent être incorrectes, y compris en matière médicale. Il faut vérifier les affirmations importantes.
- Les GIF externes peuvent transmettre des informations techniques au site d'hébergement de l'image.
- Ne pas ajouter de jetons, `.env`, ou credentials au dépôt public.
