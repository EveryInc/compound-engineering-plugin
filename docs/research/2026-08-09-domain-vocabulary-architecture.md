# Architecture canonique du vocabulaire métier dans Compound Engineering

Date de recherche : 2026-08-09  
Portée : fork `ethras/compound-engineering-orca`, baseline upstream Compound Engineering 3.21.1 (`6a2a0f9940ab0b3577ce26226ee393390470e412`)  
Statut : analyse et recommandation, aucune modification de skill

## Verdict

Le fork ne devrait pas entretenir deux systèmes canoniques concurrents — un `CONCEPTS.md` global d'un côté et un couple `CONTEXT-MAP.md` / `CONTEXT.md` de l'autre — ni offrir un réglage permanent permettant à chaque projet de choisir l'un ou l'autre.

Il devrait définir **un seul protocole Compound Engineering de documentation du domaine**, avec `CONCEPTS.md` comme point d'entrée stable :

- dans un petit dépôt ou un domaine réellement unifié, le `CONCEPTS.md` racine contient directement le glossaire ;
- dans un domaine comportant plusieurs bounded contexts, le même `CONCEPTS.md` racine devient l'index du modèle : il nomme les contextes, pointe vers leurs glossaires, décrit leurs relations et ne conserve que le vocabulaire véritablement partagé ;
- les glossaires de contexte utilisent le même contrat d'entrée que le glossaire simple, par exemple `docs/contexts/<context>/CONCEPTS.md` ;
- `CONTEXT-MAP.md` et `CONTEXT.md` sont acceptés comme **formats d'import/migration**, pas comme second état permanent.

Cette proposition garde la compatibilité conceptuelle et le point de découverte d'EveryInc tout en ajoutant la propriété essentielle de DDD qui lui manque aujourd'hui : **un mot et un modèle ne sont canoniques qu'à l'intérieur d'une frontière explicite**. Le Context Map est une information nécessaire dans un grand domaine, pas nécessairement un fichier séparé portant ce nom.

La partie intéressante des skills de Matt Pocock doit être absorbée comme comportement dans le workflow CE — surtout `ce-brainstorm`, `ce-plan`, `ce-compound` et `ce-compound-refresh` — sans copier leur orchestration ni conserver leurs conventions de fichiers.

## Résumé de la preuve

### Faits établis par les sources primaires

1. Eric Evans résume DDD par l'usage d'un ubiquitous language **dans un bounded context explicitement délimité**. Il définit le bounded context comme la frontière dans laquelle un modèle donné est défini et applicable. Il demande ensuite d'identifier les modèles en jeu, de nommer leurs contextes, de décrire leurs points de contact, traductions, partages et influences dans un Context Map. Il recommande de garder petit tout Shared Kernel. Voir le [DDD Reference d'Eric Evans](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf), notamment pp. 2-5, 28-31 dans la pagination du contenu.
2. Fowler explique qu'un grand domaine devient difficile à maintenir sous un seul modèle cohérent ; des contextes différents peuvent modéliser différemment des concepts portant le même nom et doivent expliciter leur traduction. Le Context Map sert à représenter leurs relations. Voir [Bounded Context](https://martinfowler.com/bliki/BoundedContext.html) et [Ubiquitous Language](https://martinfowler.com/bliki/UbiquitousLanguage.html).
3. Upstream Compound Engineering définit `CONCEPTS.md` comme le glossaire partagé du projet et comme un substrat pour les solutions et les instructions. Les règles actuelles imposent un fichier racine unique, autonome, opinionated, alimenté par seeding et accretion ; elles autorisent des relations, des aliases et des règles comportementales, mais ne modélisent pas l'appartenance à un bounded context ni les traductions entre contextes. Voir le [`CONCEPTS.md` officiel](https://github.com/EveryInc/compound-engineering-plugin/blob/main/CONCEPTS.md) et les [règles officielles de vocabulaire](https://github.com/EveryInc/compound-engineering-plugin/blob/main/skills/ce-compound/references/concepts-vocabulary.md).
4. Le skill officiel `domain-modeling` de Matt Pocock confronte les mots au glossaire, aiguise les termes surchargés, teste les relations par scénarios, confronte les affirmations au code, capture les termes résolus et propose des ADR avec un seuil élevé. Il choisit `CONTEXT.md` pour un contexte et `CONTEXT-MAP.md` plus plusieurs `CONTEXT.md` pour plusieurs contextes. Voir le [skill officiel](https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md) et sa [documentation officielle](https://github.com/mattpocock/skills/blob/main/docs/engineering/domain-modeling.md).
5. Le `grill-with-docs` installé localement n'est qu'un wrapper de sept lignes : il demande une session `grilling` utilisant `domain-modeling`. Le `grilling` local impose une question à la fois, la recherche des faits dans l'environnement, la propriété humaine des décisions et l'absence d'action avant compréhension partagée. Les sources exactes examinées sont `/Users/vladimirmbassi/.agents/skills/grill-with-docs/SKILL.md`, `/Users/vladimirmbassi/.agents/skills/grilling/SKILL.md` et `/Users/vladimirmbassi/.agents/skills/domain-modeling/SKILL.md`; leurs sources officielles sont [`grill-with-docs`](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md), [`grilling`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md) et [`domain-modeling`](https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md).
6. Sur le `main` actuel de Matt Pocock, `grill-with-docs` contient de nouveau directement l'interrogation et les règles de domaine, tandis que la documentation de `domain-modeling` reconnaît que l'invocation automatique/nichée est son point faible : des modèles chargent souvent le grilling et sautent le domain modeling. Voir le [`grill-with-docs` officiel actuel](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md) et la [documentation `domain-modeling`](https://github.com/mattpocock/skills/blob/main/docs/engineering/domain-modeling.md).
7. Les deux dépôts sont sous licence MIT. Réutiliser ou adapter du texte est permis à condition de conserver les mentions exigées pour les copies ou portions substantielles. Voir les licences [Matt Pocock](https://github.com/mattpocock/skills/blob/main/LICENSE) et [EveryInc](https://github.com/EveryInc/compound-engineering-plugin/blob/main/LICENSE).
8. L'ADR original de Michael Nygard vise les décisions architecturalement significatives, courtes, versionnées, avec contexte, décision, statut et conséquences ; il ne prescrit pas le test exact de Matt. Voir [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

### Inférences tirées de ces faits

- **DDD ne prescrit aucun nom de fichier.** Il prescrit des frontières de validité, un langage exercé dans ces frontières et une carte des relations. `CONTEXT-MAP.md` est donc une convention de Matt, pas une exigence DDD.
- **Un seul `CONCEPTS.md` plat fonctionne tant qu'un seul modèle reste cohérent.** Il devient incorrect, et pas seulement volumineux, lorsqu'un même terme possède des sens légitimes différents selon les contextes.
- **Deux glossaires canoniques couvrant les mêmes termes sont pires qu'un seul format imparfait.** Ils rendent l'autorité indécidable pour les agents et introduisent une dérive que ni le seeding ni le refresh ne peuvent résoudre sans règle de propriété.
- **Une méthode unique n'implique pas un fichier physique unique.** Elle implique un seul point d'entrée, un seul schéma de vocabulaire, une seule règle de résolution et une seule destination d'écriture. Le passage d'un glossaire racine à plusieurs glossaires liés est une extension progressive de la même méthode.
- **La bonne unité de canonicalité est `(bounded context, terme)`, pas seulement `terme`.** Le vocabulaire réellement partagé est l'exception gouvernée — le Shared Kernel — et non le défaut.

## Comparaison des architectures

| Option | Source de vérité | Dérive | Coût cognitif | Petits dépôts | Grands domaines | Upstream | Migration |
|---|---|---:|---:|---:|---:|---:|---:|
| `CONCEPTS.md` seul, plat | Claire et unique | Faible au début | Faible | Excellent | Faible dès que les termes deviennent polysémiques ou que les ownerships divergent | Excellente | Aucune pour CE |
| `CONTEXT-MAP.md` + `CONTEXT.md` seuls | Claire si le map est tenu à jour | Moyenne : map, glossaires et liens peuvent se désynchroniser | Moyen | Cérémonie inutile si un seul contexte | Excellent pour frontières, propriété et traductions | Faible : tous les consommateurs CE doivent être réécrits | Forte depuis CE |
| `CONCEPTS.md` + système Matt permanents | Ambiguë sauf séparation de rôles parfaite | Élevée : doublons et règles d'écriture concurrentes | Élevé | Injustifié | Correct seulement avec une discipline de propriété stricte | Moyenne | Facile à démarrer, coûteuse à maintenir |
| Abstraction configurable `concepts | context-map | hybrid` | Dépend du mode | Moyenne à élevée : plusieurs chemins comportementaux | Très élevé dans les skills, tests et support | Flexible mais surdimensionné | Flexible | Bonne en apparence, mais double durablement la surface de divergence | Facile projet par projet, coûteuse pour le fork |
| **Protocole CE unique, `CONCEPTS.md` progressif** | **Un point d'entrée et une autorité par contexte** | **Faible avec validation du graphe** | **Faible puis proportionnel à la complexité réelle** | **Excellent : fichier racine simple** | **Excellent : index + glossaires locaux + relations** | **Bonne : extension du substrat CE existant** | **Explicite, puis pas de mode legacy permanent** |

### Pourquoi ne pas garder un mode configurable permanent

Le fork ne possède aujourd'hui aucun resolver central du vocabulaire. Les chemins `CONCEPTS.md` sont inscrits en prose dans plusieurs skills et prompts secondaires. Un réglage `domain_vocabulary_mode` ne centraliserait donc rien par lui-même : il obligerait chaque lecteur et chaque rédacteur à implémenter tous les modes, et multiplierait les tests croisés.

La configuration est justifiée quand deux comportements ont une valeur durable distincte. Ici, `CONCEPTS.md` plat et des glossaires bornés représentent plutôt deux niveaux de complexité du même besoin. La structure du document peut les distinguer sans configuration : une section `Contexts` absente signifie un modèle racine unique ; sa présence signifie que le root est un index et que l'écriture doit être routée.

Le seul mode additionnel utile est **transitoire et explicite** : `ce-compound-refresh migrate-domain-docs`. Il importe les anciens formats puis disparaît de l'état quotidien du projet.

## Le protocole canonique recommandé

### Forme simple

```text
repo/
└── CONCEPTS.md
```

`CONCEPTS.md` conserve les règles utiles d'EveryInc : termes spécifiques au projet, définition concise, aliases abandonnés, relations et invariants non évidents, aucune information d'implémentation volatile.

### Forme multi-contextes

```text
repo/
├── CONCEPTS.md                         # index canonique du domaine
└── docs/
    └── contexts/
        ├── programming/
        │   └── CONCEPTS.md             # langage canonique de ce contexte
        ├── coaching/
        │   └── CONCEPTS.md
        └── billing/
            └── CONCEPTS.md
```

Le fichier racine contient quatre types d'information seulement :

1. les contextes nommés et les liens vers leur glossaire ;
2. leur responsabilité/ownership en une phrase ;
3. leurs relations, directions de dépendance et traductions significatives ;
4. un `Shared vocabulary` optionnel, petit et explicitement partagé.

Les entrées métier non partagées vivent dans exactement un glossaire de contexte. Un terme identique peut vivre dans deux contextes avec deux définitions différentes ; les lecteurs et écrivains le qualifient par son contexte. Un terme n'entre dans le vocabulaire partagé que si les contextes partagent réellement son modèle et sa gouvernance — application du principe de Shared Kernel petit d'Evans.

### Règle de résolution

1. Lire toujours le `CONCEPTS.md` racine quand le vocabulaire est pertinent.
2. S'il ne déclare aucun contexte, le root est le glossaire à lire et écrire.
3. S'il déclare des contextes, déterminer le ou les contextes touchés à partir du focus, des chemins et du dialogue.
4. Lire uniquement leurs glossaires et les relations pertinentes ; pour une tâche traversant une frontière, lire les deux côtés et leur relation.
5. Si l'ownership est ambigu, poser une question avant d'écrire. Ne jamais choisir un propriétaire uniquement parce qu'un terme existe déjà dans un fichier.
6. Lorsqu'un nouveau terme apparaît, écrire dans son contexte propriétaire. Le root n'est pas un fourre-tout.
7. Refuser un état permanent où `CONTEXT-MAP.md` / `CONTEXT.md` et le nouveau graphe définissent les mêmes termes. Demander une migration ou signaler le conflit.

### Seuil de split

Ne pas créer des bounded contexts parce qu'un fichier atteint un nombre arbitraire de lignes. Le split devient pertinent lorsqu'un glossaire déjà propre contient au moins deux modèles que le lecteur ne devrait pas devoir tenir simultanément, notamment quand :

- un même mot a des significations valides différentes ;
- des équipes ou modules possèdent des invariants différents ;
- une frontière nécessite traduction ou anticorruption ;
- les cycles de changement et les responsabilités sont réellement séparés.

Cette règle rejoint la documentation actuelle de Matt, qui recommande de nettoyer d'abord un `CONTEXT.md` gonflé puis de ne splitter que lorsqu'il couvre encore plusieurs domaines distincts ([source officielle](https://github.com/mattpocock/skills/blob/main/docs/engineering/domain-modeling.md)).

## Surface exacte du fork

Le fork au commit `8274e9c97440417c1941e9af9d17cb5850da93b1` utilise directement `CONCEPTS.md` dans les surfaces suivantes.

### Rédacteurs

| Surface | Comportement actuel | Implication du protocole |
|---|---|---|
| [`ce-brainstorm`](../../skills/ce-brainstorm/SKILL.md), lignes 354-364 | Ajoute ou affine des termes résolus, seulement si le root existe, après le Product Contract | Résoudre l'ownership puis écrire dans le glossaire propriétaire ; conserver la capture post-settlement |
| [`ce-plan`](../../skills/ce-plan/SKILL.md), lignes 755-756 | Comble silencieusement les termes manquants dans le root existant | Router le gap-fill ; ne pas inventer une appartenance ambiguë |
| [`ce-compound`](../../skills/ce-compound/SKILL.md), lignes 377-397 | Crée, seed, affine et vérifie le root | Créer la forme simple par défaut ; seed localement ; proposer un split seulement sur preuve de frontières |
| [`ce-compound-refresh`](../../skills/ce-compound-refresh/SKILL.md), lignes 43-50 et 133-149 | Bootstrap repo-wide, réconcilie et scrub le root | Devenir propriétaire de l'audit du graphe et de la migration des formats legacy |

### Lecteurs

| Surface | Comportement actuel |
|---|---|
| [`ce-brainstorm`](../../skills/ce-brainstorm/SKILL.md), ligne 220 | Grounding du dialogue, des approches et du Product Contract |
| [`ce-plan`](../../skills/ce-plan/SKILL.md), ligne 330 | Canonical names dans la planification |
| [`ce-compound`](../../skills/ce-compound/SKILL.md), ligne 171 | Passage des termes pertinents au Context Analyzer |
| [`ce-compound-refresh`](../../skills/ce-compound-refresh/SKILL.md), lignes 79-81 | Audit du vocabulaire contre les learnings et le code |
| [`ce-explain`](../../skills/ce-explain/SKILL.md), ligne 87 | Grounding d'un explainer repo-aware |
| [`ce-ideate`](../../skills/ce-ideate/SKILL.md), lignes 299-305 | Grounding du scout d'idéation |
| Learnings researchers de [`ce-code-review`](../../skills/ce-code-review/references/personas/learnings-researcher.md), [`ce-plan`](../../skills/ce-plan/references/agents/learnings-researcher.md), [`ce-ideate`](../../skills/ce-ideate/references/agents/learnings-researcher.md) et [`ce-optimize`](../../skills/ce-optimize/references/agents/learnings-researcher.md), lignes 18-22 | Canonicalise les mots-clés de recherche et la restitution |

### Règles, validation et documentation

- Les règles de vocabulaire existent en deux copies actuellement byte-identiques : [`ce-compound/references/concepts-vocabulary.md`](../../skills/ce-compound/references/concepts-vocabulary.md) et [`ce-compound-refresh/references/concepts-vocabulary.md`](../../skills/ce-compound-refresh/references/concepts-vocabulary.md). Aucun test dédié ne protège cette parité.
- [`grounding-validation.md`](../../skills/ce-compound/references/grounding-validation.md), lignes 34-50, demande à un subagent de vérifier sémantiquement les entrées écrites contre le code.
- [`tests/skills/ce-compound-headless-depth.test.ts`](../../tests/skills/ce-compound-headless-depth.test.ts), lignes 88-99, ne teste que la présence du statut de découvrabilité dans le rapport lightweight ; il ne teste ni le routage ni le contenu du glossaire.
- [`tests/orca-native-parity.test.ts`](../../tests/orca-native-parity.test.ts), lignes 253-266, protège l'ownership du controller Orca et mentionne aujourd'hui les writes `docs/` ou `CONCEPTS.md`.
- [`docs/skills/ce-compound.md`](../skills/ce-compound.md) documente le side effect `CONCEPTS.md`.
- [`AGENTS.md`](../../AGENTS.md), lignes 71-73 et 108-116, décrit `CONCEPTS.md` et impose que les changements sous `skills/` aient un hook d'intégration borné et une mise à jour de parité.
- [`src/utils/legacy-cleanup.ts`](../../src/utils/legacy-cleanup.ts), lignes 293-304 et 428-430, contient d'anciennes descriptions de skill mentionnant `CONCEPTS.md`; c'est une surface de compatibilité d'installation, pas un consommateur runtime.

### Configuration et fork overlay

- Aucune option de configuration ne pilote le vocabulaire aujourd'hui.
- Le précédent `docs_root` montre le coût complet d'une vraie option : template, exemple byte-identique, documentation centralisée, consommateurs, health check et tests. Voir [`skills/ce-setup/references/config-template.yaml`](../../skills/ce-setup/references/config-template.yaml), [`docs/skills/configuration.md`](../skills/configuration.md) et [`tests/skills/ce-setup-check-health.test.ts`](../../tests/skills/ce-setup-check-health.test.ts).
- Contre la baseline upstream épinglée 3.21.1, les différences committées de cette surface ne portent que sur des hooks Orca limités dans `ce-plan` et `ce-compound`. Le système `CONCEPTS.md` est donc essentiellement upstream, pas une invention du fork.

Cette surface invalide l'idée d'une petite substitution de nom de fichier. Une mise en œuvre correcte doit remplacer les lectures/écritures directes par un même contrat de résolution dans tous les consommateurs.

## Ce qu'il faut absorber de Matt Pocock

L'objectif est d'absorber des **comportements génériques**, pas de recopier les skills ni leurs noms de fichiers.

| Comportement | Décision | Destination CE | Précision |
|---|---|---|---|
| Une question à la fois | Conserver | `ce-brainstorm` | Déjà présent dans les Interaction Rules ; ne pas dupliquer |
| Chercher les faits dans l'environnement au lieu de les demander | Conserver | Grounding de `ce-brainstorm`, `ce-plan`, validators | Déjà plus développé dans CE |
| Les décisions appartiennent à l'utilisateur ; fournir une recommandation | Conserver | Dialogue et gates CE | Déjà compatible avec settled decisions et scope confirmation |
| Parcourir les dépendances entre décisions | Conserver de manière proportionnée | Pressure test et integration check de `ce-brainstorm` | Éviter l'exhaustivité mécanique sur les petits sujets |
| Distinguer consommation passive et changement actif du modèle | **Absorber explicitement** | Contrat partagé de vocabulaire | La lecture silencieuse n'autorise jamais une réécriture |
| Signaler immédiatement un conflit avec le glossaire | **Absorber** | Dialogue de `ce-brainstorm` | Ne pas laisser une contradiction se propager au Product Contract |
| Aiguiser un mot vague ou surchargé | **Absorber** | `ce-brainstorm`; audit `ce-compound-refresh` | Toujours qualifier par contexte avant de retirer un synonyme |
| Tester les relations avec des scénarios et edge cases | **Absorber** | Pressure test de `ce-brainstorm` | Déclenchement seulement lorsque la relation porte du sens |
| Confronter une affirmation métier au code | **Absorber/étendre** | Scout + claim verifier + grounding validator | CE possède déjà les bons mécanismes ; étendre leur scope aux relations et frontières |
| Capturer les termes résolus | Conserver avec adaptation | `ce-brainstorm`, `ce-plan`, `ce-compound` | Écrire après settlement, dans le contexte propriétaire |
| Vocabulaire opinionated et aliases `_Avoid_` | Conserver | Règles `concepts-vocabulary` | CE possède déjà `Avoid` et `Flagged ambiguities` |
| Glossaire dépourvu de détails d'implémentation | Conserver | Règles et refresh | Déjà plus détaillé dans CE |
| Créer les documents paresseusement | Conserver | `ce-compound` / refresh | Forme simple d'abord ; split sur preuve |
| Gate ADR : difficile à inverser + surprenant + réel compromis | **Absorber comme heuristique** | Fin de `ce-brainstorm` / planning architectural | Employer le format et l'emplacement ADR du projet, pas ceux de Matt |
| `CONTEXT.md` / `CONTEXT-MAP.md` comme filenames obligatoires | Abandonner | Import seulement | Convention de fichiers, pas principe DDD |
| Modifier le glossaire à chaque tour | Abandonner littéralement | Ledger de termes résolus puis write transactionnel | CE a raison d'attendre le terme final ; les termes provisoires ne doivent pas toucher la source de vérité |
| Interdire toute action jusqu'à confirmation globale | Ne pas absorber comme règle universelle | Conserver les gates CE | Incompatible avec pipeline/headless et avec les tâches déjà spécifiées |
| Interview « relentless » jusqu'à épuiser tout l'arbre | Ne pas absorber littéralement | Right-sizing CE | Le coût doit suivre l'ambiguïté et le risque |
| Format ADR minimal et emplacement imposé | Abandonner | Conventions projet | Nygard définit le but et les éléments utiles, pas un emplacement universel |
| Invocation imbriquée `grill-with-docs -> grilling + domain-modeling` | Abandonner | Comportement direct au point de décision | La documentation officielle de Matt constate que ce chargement est peu fiable |

## Où absorber ces comportements dans CE

### `ce-brainstorm` : discipline active

Ajouter au dialogue un tripwire de modelage du domaine : il se déclenche lorsqu'un terme contredit le vocabulaire, semble surchargé, définit une nouvelle entité/processus/statut, change une relation ou franchit une frontière. Le flow doit alors :

1. charger le root et le ou les glossaires pertinents ;
2. expliciter le conflit ou l'ambiguïté ;
3. proposer un terme précis avec contexte propriétaire ;
4. tester la définition par un scénario si une relation/invariant est en jeu ;
5. vérifier le code si l'utilisateur affirme un comportement existant ;
6. enregistrer la décision comme résolue, mais n'écrire qu'après le settlement et le Product Contract ;
7. évaluer le gate ADR seulement pour un compromis architectural durable.

Cela remplace entièrement `grilling` + `grill-with-docs` pour les brainstorms CE. CE possède déjà les questions unitaires, la recherche, les alternatives, les gates et le durable output ; il lui manque surtout la sensibilité active au langage.

### `ce-plan` : consommation et cohérence

Le plan doit charger les contextes touchés, employer leurs termes, et transformer une divergence code/modèle identifiée au brainstorm en travail explicite seulement si elle appartient au scope. Son gap-fill ne doit pas créer silencieusement un terme dont l'ownership est ambigu.

### `ce-compound` : accretion locale

Conserver seeding, accretion, coherence neighborhood et validation sémantique. Remplacer la cible root fixe par la cible résolue. Une learning qui traverse une frontière peut mettre à jour deux glossaires et la relation racine, mais uniquement avec preuve pour chaque changement.

### `ce-compound-refresh` : bootstrap, audit et migration

Cette skill doit devenir le propriétaire unique de :

- la création repo-wide ;
- la détection d'un besoin de split ;
- la validation du graphe root -> contextes ;
- la recherche de doublons dans un même contexte ;
- la détection de polysèmes écrasés dans un glossaire global ;
- la vérification des Shared Kernel candidates ;
- l'import de `CONTEXT-MAP.md`, `CONTEXT.md` et anciens hybrides.

Il n'est pas nécessaire de créer immédiatement un nouveau skill `ce-domain-modeling`. Un nouveau skill dupliquerait le dialogue de `ce-brainstorm`, augmenterait l'inventaire public et créerait une nouvelle frontière de routage. N'envisager un skill autonome qu'après des evals montrant un usage fréquent de modélisation pure sans requirements artifact.

## Mécanisme partagé à prévoir dans le fork

Deux couches sont nécessaires :

1. **Résolution mécanique** : une petite ressource/script self-contained par skill consommateur, gardée byte-identique par un test de parité, qui localise le root, valide les liens repo-relative et expose les contextes déclarés. Elle ne décide pas sémantiquement quel contexte possède un terme.
2. **Contrat de jugement** : une référence `domain-vocabulary.md` répliquée dans les skills concernés et gardée en parité, qui définit lecture, ownership, polysemy, write routing, shared kernel, migration conflict et ADR gate.

Cette séparation suit les conventions actuelles du dépôt : les invariants déterministes vont dans les tests ; les jugements de comportement sont évalués par `skill-creator`. Elle évite qu'une regex ou un script prétende déterminer un bounded context à la place du modèle et de l'utilisateur.

Tests minimaux attendus :

- parité byte-identique du resolver et de la référence entre consommateurs ;
- fixture simple avec un seul root ;
- fixture multi-contextes avec deux sens différents du même terme ;
- fixture cross-context qui oblige à charger deux glossaires et une relation ;
- rejet des liens absolus, traversals et symlinks hors repo ;
- détection de définition canonique dupliquée dans un même contexte ;
- état conflictuel `CONCEPTS.md` + legacy `CONTEXT*` qui bloque les writes et propose la migration ;
- migration dry-run sans écriture, puis application idempotente ;
- tests contractuels des rapports et du controller Orca ;
- evals comportementales : conflit immédiat, scénario limite, ownership ambigu, ADR accepté/refusé, retenue sur les petits sujets.

## Migration conceptuelle

La migration ne doit jamais être une fusion automatique de fichiers Markdown.

### Phase 1 — inventaire en lecture seule

- découvrir `CONCEPTS.md`, `CONTEXT-MAP.md`, tous les `CONTEXT.md`, ADRs et instructions qui les référencent ;
- extraire contextes, termes, aliases, relations et invariants ;
- relever les définitions exactes dupliquées, les définitions incompatibles et les termes sans propriétaire ;
- produire un rapport et une proposition de graphe, sans writes.

### Phase 2 — arbitrage

- attribuer chaque terme à un bounded context ;
- conserver les polysèmes comme entrées distinctes qualifiées par contexte ;
- promouvoir au Shared Kernel seulement les termes dont le modèle, les invariants et la gouvernance sont réellement partagés ;
- demander une décision pour les conflits qui ne peuvent pas être résolus par le code ou les docs ;
- conserver les ADR existants et leurs conventions, en ajoutant seulement les liens nécessaires.

### Phase 3 — matérialisation contrôlée

- générer le nouveau `CONCEPTS.md` racine et les glossaires de contexte dans un aperçu/dry-run ;
- après confirmation, écrire les nouvelles sources de vérité ;
- mettre à jour les instructions et liens consommateurs ;
- vérifier les affirmations métier contre le code ;
- valider le graphe, les paths, l'unicité intra-contexte et l'idempotence ;
- supprimer les anciens `CONTEXT*` uniquement après mise à jour de toutes leurs références et revue du diff Git.

### Phase 4 — fin de transition

Le projet ne reste pas en mode hybride. Après migration :

- `CONCEPTS.md` est le seul point d'entrée ;
- aucune définition canonique ne subsiste dans un ancien `CONTEXT.md` ;
- `ce-compound-refresh` peut relancer le même audit sans nouvelle mutation ;
- un agent qui rencontre un fichier legacy plus tard le signale comme dérive au lieu de le lire comme autorité parallèle.

## Compatibilité upstream et stratégie de fork

Cette évolution touche la sémantique upstream de `CONCEPTS.md`, pas seulement l'exécution Orca. La solution la plus saine est donc de la concevoir comme une contribution générique à EveryInc et de la porter temporairement dans le fork :

1. changements self-contained et cross-harness sous les skills upstream-owned ;
2. hooks Orca bornés uniquement là où le controller doit conserver l'ownership des writes/validations ;
3. tests de parité qui rendent la divergence explicite lors des merges upstream ;
4. proposition upstream séparée, sans chemins ni hypothèses Powerlifting Lausanne.

Si EveryInc refuse la forme multi-contextes, le fork peut la garder, mais il faut alors traiter le contrat de vocabulaire comme une feature fork explicite et non disperser des edits sans ancrage dans quatorze fichiers. Une abstraction configurable à quatre modes ne réduit pas ce coût ; elle le rend permanent.

## Licence et provenance

Les idées DDD — ubiquitous language, bounded context, context map, shared kernel — sont des principes, pas du texte à copier. Les comportements de Matt peuvent être réimplémentés avec une formulation propre et mieux adaptée à CE.

Si du texte, des exemples ou des templates de Matt sont repris substantiellement, le fork doit conserver la notice copyright et la permission MIT appropriées. Le plus propre reste :

- documenter dans la PR que la discipline comportementale est inspirée de `mattpocock/skills` ;
- ajouter une attribution dans les notices du plugin si une portion textuelle substantielle est adaptée ;
- ne pas présenter la convention résultante comme une exigence d'Eric Evans ;
- distinguer clairement les mécanismes CE originaux des comportements importés.

## Décisions recommandées avant planification

1. Adopter `CONCEPTS.md` comme **unique point d'entrée**, pas comme unique fichier physique.
2. Intégrer le Context Map comme section/contrat du root multi-contextes, et retirer `CONTEXT-MAP.md` de l'état cible.
3. Utiliser des `CONCEPTS.md` de contexte avec une autorité locale explicite ; réserver le root partagé au petit Shared Kernel.
4. Ne pas ajouter de choix permanent `concepts | context-map | hybrid` dans la configuration.
5. Étendre `ce-compound-refresh` avec une migration explicite et dry-run ; bloquer les writes lorsqu'un hybride conflictuel est détecté.
6. Absorber directement dans `ce-brainstorm` le challenge lexical, les scénarios, la confrontation au code et l'ADR gate.
7. Garder la capture CE après settlement plutôt que les writes littéralement inline de Matt.
8. Ne pas créer de nouveau skill public avant d'avoir démontré par eval qu'un flow de modélisation autonome est nécessaire.

## Conclusion

Le meilleur résultat n'est ni « garder `CONCEPTS.md` parce que CE le connaît déjà », ni « remplacer CE par les fichiers de Matt ». C'est de faire évoluer le substrat de vocabulaire de CE afin qu'il sache représenter correctement un ou plusieurs modèles sans changer de méthode.

Le fork gagne alors une propriété réutilisable sur tous les projets : **simple par défaut, borné quand le domaine l'exige, une seule autorité à chaque endroit, et aucune transition hybride permanente**.
