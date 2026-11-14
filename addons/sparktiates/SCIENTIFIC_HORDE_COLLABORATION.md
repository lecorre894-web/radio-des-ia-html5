# SPARKTIATES × AI Horde — coordination scientifique distribuée (proposition à participation volontaire)

## État actuel, vérifié le 14 novembre 2026

La **Radio des IA** sait appeler AI Horde (réseau de travailleurs communautaires) et, séparément, un serveur personnel **SPARKTIATES/Ollama** dans le même Salon. Ce sont **deux moteurs distincts**. GitHub Pages ne fournit pas de calcul GPU ; l'installation d'un exécutable SPARKTIATES sur une machine distante **n'a pas eu lieu**.

Les opérateurs AI Horde possèdent et contrôlent leurs PC. Les requêtes de génération ne permettent pas d'installer, de lancer ou d'augmenter un programme sur un travailleur. Nous n'essayons pas d'utiliser la file de génération comme vecteur d'exécution de code.

**Documentation officielle :** https://aihorde.net/contribute/workers/ et https://github.com/Haidra-Org/AI-Horde

## Architecture scientifique réellement possible

```text
       Radio des IA : question scientifique, observations, hypothèses
                             |
               SPARKTIATES : plan d'analyse
                    /                   \
         AI Horde (API)            Ollama personnel
         Workers autonomes        CPU/GPU du propriétaire
                    \                   /
               Contrôles indépendants
                             |
             MESURÉ / RECONSTRUIT / CANDIDAT /
                 ARTEFACT / INCONNU
```

1. Radio des IA formule un **problème mesurable** et construit un dossier de preuve (données, unités, provenance).
2. L'API d'AI Horde sollicite un travailleur volontaire déjà présent. Le serveur SPARKTIATES n'est **pas installé chez ce travailleur** ; celui-ci sert seulement son modèle.
3. Si un modèle Ollama existe réellement sur la machine personnelle autorisée, SPARKTIATES peut calculer un deuxième avis local. Le **modèle** compte : un rôle affiché ne donne pas de doctorat et ne crée pas de contre-expertise indépendante.
4. Un audit distinct compare les résultats, refait les calculs avec outils déterministes et signale toute divergence. Les réponses des modèles ne sont jamais présentées comme « mesurées » sans source instrumentale.

Le **temps de file d'attente** AI Horde ne disparaît pas. Pour accélérer de manière honnête : sélectionner un modèle avec capacité disponible, limiter la longueur des sorties, utiliser un compte gratuit enregistré avec priorité *kudos* selon les règles du réseau, ou servir son propre modèle sur une machine autorisée.

## Ajouter SPARKTIATES sur d'autres PC : uniquement volontairement

Chaque propriétaire intéressé doit choisir d'installer et de configurer son **propre** worker AI Horde et son backend de génération (p. ex. KoboldCpp, Aphrodite ou autre backend compatible). La documentation officielle explique comment le worker interroge la file, prend une tâche, génère puis renvoie un résultat. Les propriétaires décident des modèles servis, des budgets de calcul et des horaires. Aucune installation automatique n'est déclenchée depuis Radio des IA.

SPARKTIATES pourrait être rendu disponible sous la forme d'une **extension open source facultative d'audit scientifique**, à installer explicitement par un opérateur, après revue de code. Cette extension n'existe pas encore et n'a **pas** été déployée sur le réseau. Les frontières réseau, le consentement et la protection des machines ne sont pas supprimés.

## Premier cas scientifique reproductible : les marées lunaires

Avec la masse lunaire `M_L ≈ 7,342×10²² kg`, le rayon terrestre `R_T ≈ 6,371×10⁶ m`, la distance moyenne `d ≈ 3,844×10⁸ m` et `G ≈ 6,67430×10⁻¹¹ m³ kg⁻¹ s⁻²`, estimer l'accélération différentielle de marée :

```text
a_tidal ≈ 2 × G × M_L × R_T / d³
```

* **MESURÉ / DONNÉES DE RÉFÉRENCE** : constantes astronomiques, définies avec provenance à ajouter lors d'un véritable protocole de publication.
* **RECONSTRUIT** : `a_tidal` est une approximation analytique au premier ordre ; ce n'est pas une mesure d'amplitude de marée marine locale.
* **CANDIDAT** : hypothèses physiques sur l'amplification hydrodynamique locale à tester avec bathymétrie, rotation, résonances et conditions aux limites.
* **ARTEFACT** : erreurs de conversion d'unités, confusions entre accélération de marée et hauteur d'eau, ou alignement de référentiels.
* **INCONNU** : précision locale si l'on n'a pas les mesures et un modèle hydrodynamique validé.

La Radio encourage cette analyse dès un simple « Bonjour/Bonsoir » pour éviter des pages de présentations et obtenir un problème quantitatif. **Cette fonctionnalité ne garantit pas un raisonnement doctoral** ; c'est le protocole d'évaluation qu'il faut construire.
