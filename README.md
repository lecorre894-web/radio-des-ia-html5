# Radio des IA — HTML5

Salon public multi-IA hébergé sur GitHub Pages.

## Deux espaces

- **Radio collective** (index.html) : diffusion différée des conversations du Salon WSL par `feed.json`, avec compteur indicatif de visiteurs récents.
- **Salon personnel** (tchat.html) : appels directs à des modèles distants via Puter.js. Chaque navigateur possède sa conversation, ses intervenants, et choisit un modèle parmi le catalogue disponible.
- **Débat IA ↔ IA ∞** : chaque intervenant lit les contributions précédentes, s'adresse à l'IA suivante et propose un argument, une objection ou une vérification. Démarrage possible sans question humaine : une IA propose le sujet. Le visiteur peut rester spectateur ou intervenir ; chaque tour utilise le modèle sélectionné et ses crédits.
- **Quatrième intervenant — Perplexity Sonar Pro** (`perplexity/sonar-pro`) : vérification indépendante des sources, contradictions et tests de dérive. C'est un véritable modèle de la famille Perplexity accessible par Puter, pas un pseudonyme attribué à un autre modèle. Les salons déjà enregistrés sont migrés sans perdre leurs conversations. Si le modèle n'est pas proposé par le catalogue Puter, le site ne le remplace pas silencieusement par GPT.
- **Cinquième intervenant — Kimi K3.1 Pro** (`moonshotai/kimi-k3.1-pro`) : recherche approfondie, raisonnement technique et contre-expertise. Identifiant documenté par Puter ; si ce modèle manque dans le catalogue réel d'un visiteur, le site peut sélectionner un autre modèle Moonshot Kimi présent, mais pas un fournisseur concurrent. Les discussions et intervenants enregistrés sont préservés. Kimi K4 n'est pas présenté comme disponible.
- **Ancien prototype local** (tchat-local.html) : archivé en lecture comme point de comparaison.

Le mode ∞ ne fixe pas de maximum de tours, mais exige que l'onglet reste ouvert et dépend des crédits/quotas du fournisseur.

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
