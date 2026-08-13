# RFC — `DOMAIN.md` comme spécification métier vivante dans Compound Engineering

Date de recherche : 2026-08-13
Portée : fork `ethras/compound-engineering-orca`, `main` à `f980bcbf` (upstream synchronisé à `a27aa2af`, version 3.21.4)
Statut : évaluation et recommandation, aucune modification de skill
Précède : `docs/research/2026-08-09-domain-vocabulary-architecture.md` (protocole de vocabulaire progressif, livré en 3.21.4-orca.4)

Méthode : trois flux d'évidence indépendants — (1) lecture exhaustive du cas d'étude Powerlifting Lausanne (corpus `docs/contexts/`, conventions, migration), (2) audit de la surface d'intégration du fork skill par skill avec ancres `fichier:ligne`, (3) re-vérification des sources primaires (Evans, Cucumber/BDD, OMG DMN, Nygard, `mattpocock/skills`, upstream EveryInc). Les positions du débat antérieur ont été traitées comme des hypothèses ; le verdict ci-dessous en diffère sur un point matériel (voir §1.1).

---

## 1. Verdict gradué : **EXPÉRIMENTER** (borné, réversible)

Sur l'échelle adopter / expérimenter / reporter / rejeter :

- **Rejeter « adopter »** — faire de `DOMAIN.md` une convention générique du plugin aujourd'hui. L'évidence d'usage est n=1, le corpus de référence a trois jours et zéro cycle de mise à jour, et il viole déjà ses propres interdits dès son commit initial (§3.2). Le précédent le plus proche (`mattpocock/skills`) a délibérément *refusé* un document de règles vivant, et Nygard est un contre-précédent explicite sur les documents mutables de synthèse.
- **Rejeter « rejeter »** — l'audit du fork a révélé un défaut objectif qui existe indépendamment de toute conviction sur `DOMAIN.md` : la route de migration `migrate-domain-docs` est destructrice par construction pour le contenu métier non lexical (§2.1). Ce défaut doit être corrigé, et le correctif *est* la version minimale de l'expérimentation.
- **« Reporter » est insuffisant** — reporter sans corriger la migration laisse une perte de données silencieuse dans une route livrée.

**L'expérimentation retenue** : le fork ne reconnaît `DOMAIN.md` que comme (a) destination d'import du contenu non lexical pendant la migration, (b) fichier frère non porteur de vocabulaire que le resolver sait distinguer d'une seconde autorité lexicale, (c) claims vérifiables par le validateur de grounding existant. **Toutes les règles de lecture et de mise à jour restent portées par les instructions du projet** (comme Powerlifting Lausanne le fait déjà via son `AGENTS.md`), pas par une capacité du plugin. Les hooks de lecture (`ce-brainstorm`, `ce-plan`, `ce-work`), le scaffolding (`ce-setup`), toute clé de configuration et tout reviewer dédié sont **différés** derrière les critères de généralisation du §13.

### 1.1 Contrôle du biais d'ancrage

La position de départ de la session précédente était « ne rien ajouter au fork maintenant ». L'évidence a déplacé ce verdict : la découverte que `domain-migration.md` supprime les fichiers legacy sans destination pour leur contenu non lexical (fait vérifiable, §2.1) rend une inaction totale indéfendable. Inversement, l'évidence a aussi affaibli la proposition maximaliste : le corpus PL démontre que le contrat prescrit est violé sans mécanisme d'application (§3.2), ce qui disqualifie une adoption par simple prose de convention. Le verdict n'est donc la validation d'aucune des deux positions initiales.

---

## 2. Problèmes concrets résolus, coûts ajoutés

### 2.1 Problème n°1 (défaut avéré du fork) : la migration est destructrice pour le contenu non lexical

**Faits.** `skills/ce-compound-refresh/references/domain-migration.md` : l'étape 1 n'extrait que « the terms, aliases, relations, and invariants » (`:27`) ; la barrière de sécurité de l'étape 5 n'accepte que « a canonical glossary path or an explicitly approved reference-update target » (`:63`) ; les fichiers legacy sont supprimés après application (`:71`) ; aucune étape ne nomme une destination pour le récit métier non lexical. Le contrat lexical `concepts-vocabulary.md:29-37` interdit à ce contenu d'entrer dans `CONCEPTS.md`. Le cas réel existe : les six `CONTEXT.md` de Powerlifting Lausanne portaient `## State machine`, `## Relationships`, `## Example dialogue`, `## ADRs` en plus de `## Language` (billing : 1711 lignes).

**Résolu par** : une classe de destination « contenu non lexical » dans le manifeste de migration, avec `DOMAIN.md` de contexte comme destination proposée par défaut, arbitrage utilisateur (conserver / rediriger vers ADR / abandonner avec justification), et précondition de suppression étendue.

### 2.2 Problème n°2 : un état légal du monde est aujourd'hui indistinguable d'un état bloquant

**Faits.** `domain-vocabulary.md:75` définit « vocabulary-bearing » : « A legacy file is vocabulary-bearing when it actually defines at least one term. » Un `DOMAIN.md` frère qui ne définit aucun terme n'est donc *pas* une seconde autorité — mais rien ne le dit explicitement, et `domain-graph.py` ne le reconnaît pas. Un projet qui adopte la forme PL s'expose à ce qu'un agent prudent traite le fichier comme suspect, ou pire, qu'une évolution future du contrat le classe dual-canonical.

**Résolu par** : une clarification d'une phrase dans le contrat de routage + la reconnaissance mécanique dans le resolver (finding uniquement si le `DOMAIN.md` définit des termes).

### 2.3 Problème n°3 (différé) : aucun agent ne lit la vérité métier avant d'implémenter

**Faits.** `ce-work/SKILL.md` ne contient aucune occurrence de `CONCEPTS`, `vocabulary`, `glossary` ou `domain` ; `lfg` ne compose aucun skill conscient du vocabulaire. Le seul canal vocabulaire d'un run autonome est `ce-plan:342` (lecture) et `ce-plan:768` (gap-fill silencieux).

**Non résolu par cette expérimentation** — délibérément. Les instructions projet (`AGENTS.md` de PL : « Lis l'index puis les deux fichiers du contexte concerné avant toute tâche non triviale ») couvrent le besoin pendant la phase de preuve. Un hook `ce-work` est la modification la plus utile *et* la plus coûteuse (fichier byte-identique à upstream, 5e consommateur de parité) ; il n'est justifié que si la phase de preuve montre que la règle projet ne suffit pas.

### 2.4 Coûts ajoutés par l'expérimentation

- Édition synchronisée des 4 copies de `domain-vocabulary.md` + mise à jour du test de parité (mécanique, testée).
- Extension de `domain-graph.py` (fork-only) : reconnaissance des `DOMAIN.md` frères + 1 finding nouveau + fixtures.
- Extension de `domain-migration.md` (fork-only) : inventaire, manifeste, arbitrage, précondition de suppression.
- +1 ligne dans `grounding-validation.md:36` (fichier déjà divergé, +1/−1 aujourd'hui).
- **Aucune** divergence nouvelle dans un fichier upstream propre. **Aucune** clé de configuration. **Aucun** nouveau skill, persona ou fichier toujours-chargé.

Coût différé si adoption (chiffré au §8.2) : hooks de lecture dans 3-4 SKILL.md upstream-owned dont deux aujourd'hui byte-identiques, et la question gouvernance-sensible d'un reviewer de cohérence docs/code dans `ce-code-review` (interdit par `AGENTS.md` : « Do not add fork-only personas to make an upstream role mismatch pass » — un persona fork-only volontaire reste possible mais contesté).

---

## 3. Audit de l'état actuel

### 3.1 Le fork (faits, `main` à `f980bcbf`)

- **Contrat de routage** : `domain-vocabulary.md` (canonique dans `ce-compound-refresh`, byte-identique dans `ce-compound`, `ce-brainstorm`, `ce-plan` ; MD5 vérifié). Config-free par design (`:5` « Nothing configures this: the root file's own structure decides »), pinné négativement par `tests/domain-vocabulary-parity.test.ts` (`not.toContain("domain_vocabulary_mode")`). États bloquants : dual-canonical (`:79`), legacy-only (`:80`) ; hybride = « a migration that has not happened yet, not a supported configuration » (`:82`). Le test « vocabulary-bearing » (`:75`) est l'échappatoire structurelle d'un `DOMAIN.md` non lexical.
- **Contrat lexical** : `concepts-vocabulary.md` (upstream-owned, fork +5/−1). Exclusions `:29-37` : chemins, noms de classes, signatures, statuts, exemples, valeurs de config, liens volatils. `## Flagged ambiguities` (`:59-61`) = piste d'audit des résolutions lexicales, une ligne par résolution.
- **Validateur de grounding** : `grounding-validation.md` (upstream-owned, fork +1/−1). Le subagent sémantique traite déjà les entrées de glossaire et les relations de contextes comme des code-behavior claims (`:36`). Invoqué **uniquement** depuis `ce-compound/SKILL.md:404` (et mécanique seul en lightweight `:564`).
- **Resolver mécanique** : `domain-graph.py` (1172 lignes, fork-only, lecture seule, JSON déterministe). Sa sous-commande `validate` n'a **aucun appelant de routine** — la seule invocation pinnée est `domain-migration.md:16` ; `ce-compound-refresh/SKILL.md:156` décrit la réconciliation des findings sans bloc de commande.
- **`lfg`** compose `ce-plan → ce-work → ce-simplify-code → ce-code-review → ce-commit-push-pr → ce-babysit-pr` ; jamais `ce-compound`, `ce-compound-refresh` ni `ce-brainstorm`.
- **Frontière upstream** : tout le protocole vocabulaire est fork-only ou fork-diff dans des fichiers déjà divergés. `ce-work/SKILL.md`, `ce-setup/SKILL.md`, `config-template.yaml`, `docs/skills/configuration.md` sont **byte-identiques à upstream**.

### 3.2 Le cas d'étude Powerlifting Lausanne (faits)

- **Structure** : 6 contextes, 12 fichiers (2452 lignes), template `DOMAIN.md` rigoureusement uniforme (`# Domaine — <Contexte>` ; bandeau d'autorité ; `## Invariants et règles par concept` ; `## Relationships` ; `## ADRs associés` ; `## State machine` dans capture-vbt seul). **Aucune duplication de définition** entre CONCEPTS et DOMAIN observée sur les 6 paires. Routage du non-implémenté vers les ADR fonctionnel (booking/ADR-0021). Migration depuis `CONTEXT.md` fonctionnellement complète (0 fichier legacy, 0 référence hors le prompt de mission).
- **Contenu** : 0 Mermaid, 0 table Markdown, 0 identifiant de règle, 0 exemple (conforme au ban), 0 TODO. Machines à états en listes/ASCII.
- **Violations du contrat dès le commit initial** (`domain.md:27` interdit « UI composition, implementation details, delivery status and examples ») : couplage implémentation jusqu'à des références `fichier:lignes` (`capture-vbt/DOMAIN.md:166` cite `exercise-row-computation.service.ts:309-358`), composition UI (`capture-vbt/DOMAIN.md:44-51`), 18 puces de statut de livraison dans billing (« premier palier », « hors scope initial », « Objectif cible » `billing/DOMAIN.md:102`).
- **Le template craque sous volume** : `billing/DOMAIN.md` = une liste `## Relationships` de 186 puces dont beaucoup sont des règles, pas des relations ; `booking/DOMAIN.md` livre une section Invariants vide.
- **Fraîcheur** : les 12 fichiers ont exactement 1 commit chacun (2026-08-10, dernier commit du repo). **Zéro cycle de mise à jour observé.** Traçabilité vers les tests : 0 identifiant, 0 test citant un contexte ; un unique backlink code→doc (`alignment-state.ts:24-27`), déjà partiellement dérivé (hystérésis `EXIT=4/7`, lissage et échantillonnage absents du doc).
- **Le projet se prononce lui-même** : « N'introduire une convention de plugin pour `DOMAIN.md` que si la même forme réapparaît dans plusieurs projets et qu'un contrat stable émerge » (`docs/solutions/documentation-gaps/separate-domain-vocabulary-from-current-domain-truth.md:62`).

**Inférence.** Le cas prouve la *séparabilité* (deux autorités exclusives tiennent sans duplication) mais pas la *tenue* (aucune preuve empirique que « update the owning DOMAIN.md in the same work » survit à un vrai cycle de changement). Et il prouve qu'un contrat prescrit par prose seule est violé immédiatement — trois interdits sur quatre enfreints dans l'artefact fondateur, produit par un agent qui venait de lire le contrat.

### 3.3 Les sources primaires (faits, re-vérifiés 2026-08-13)

- **Evans (DDD Reference)** : le modèle s'exprime d'abord dans le code (« The code becomes an expression of the model »). Deux artefacts documentaires étroits existent — Domain Vision Statement (~1 page) et **Highlighted Core** (« three to seven sparse pages » décrivant le core domain et ses interactions primaires, avec contrat de notification à chaque changement) — mais « they do not actually modify the model or the code itself ». DDD ne prescrit ni catalogue de règles ni nom de fichier.
- **Cucumber/BDD** : depuis Gherkin v6, `Rule:` « represent[s] one business rule » et « should contain one or more scenarios that illustrate the particular rule » — règles et exemples sont structurellement liés, pas alternatifs. La garantie anti-staleness du living documentation vient spécifiquement de l'*exécutabilité* : « the automated examples will help us to understand what the system is currently doing ».
- **OMG DMN** : CL1 (notation seule, jamais tenue d'interpréter les expressions) bénit l'usage documentaire des tables de décision ; le spec admet lui-même (Clause 9.1) que les modèles réels exigent presque toujours FEEL complet — adopter « DMN proprement » = moteur d'exécution + XML, pas une habitude documentaire.
- **Nygard (ADR, 2011)** : records immuables, un par décision, « If a decision is reversed, we will keep the old one around, but mark it as superseded ». Sa réponse aux gros documents qui pourrissent est d'arrêter de les écrire, pas d'en maintenir un vivant. Aucun artefact d'état courant proposé.
- **`mattpocock/skills`** (actif, commits du 2026-08-13) : `CONTEXT.md` = « It is a glossary and nothing else » ; les règles vont dans les ADR (gate à trois conditions) ou le code. **Aucun document de règles vivant — rôle considéré et refusé.** Toujours sur `CONTEXT.md`/`CONTEXT-MAP.md` ; aucun abandon.
- **Upstream EveryInc** : `CONCEPTS.md` est né upstream (PR #838, 2026-06-02) avec la frontière « Glossary only, not a spec or catch-all » dans le préambule même. **0 occurrence de `DOMAIN.md`** sur `main` ; aucun mouvement (issues/PRs) vers un spec métier. Le territoire est adjacent, non revendiqué, et upstream a explicitement choisi de ne pas y faire croître `CONCEPTS.md`.

---

## 4. Contrat documentaire proposé

Ce contrat est la **cible de l'expérimentation** (à éprouver dans PL puis un second projet), pas une règle du plugin aujourd'hui. Il révise le contrat PL sur trois points, chacun motivé par l'évidence (§4.3).

### 4.1 Table d'autorité

| Artefact | Autorité exclusive | Mutation |
|---|---|---|
| `CONCEPTS.md` (racine ou contexte) | Ce que les mots signifient dans leur contexte ; synonymes retirés ; ambiguïtés résolues (une ligne) | Lente, par accretion post-settlement |
| `DOMAIN.md` (frère du glossaire de son contexte) | Ce que le produit fait toujours / jamais / conditionnellement **aujourd'hui** | Dans le même changement que le comportement métier |
| Plan/spec actif | Le delta proposé par rapport au domaine actuel | Vie du changement |
| Tests | Preuves exécutables des règles et exemples | Avec le code |
| Code | L'implémentation | — |
| ADR | Pourquoi une décision significative a été prise ; **designs cibles non implémentés** | Append-only, superseded |
| Solution Compound | Comment un problème résolu sera évité/résolu plus vite | Post-résolution |

**Règle de non-lexicalité (structurelle, mécanisable)** : `DOMAIN.md` ne définit aucun terme — il *emploie* les termes du glossaire (en gras au premier usage, éventuellement lien relatif). C'est le test `domain-vocabulary.md:75` inversé : un `DOMAIN.md` qui définit un terme est en faute, détectable par le resolver. Cette règle est ce qui l'empêche structurellement de devenir une seconde autorité lexicale — la préoccupation centrale du protocole existant.

**Règle de temporalité** : `DOMAIN.md` n'énonce que la vérité actuelle. Une règle future ou en cours de livraison vit dans son plan ou son ADR ; le glossaire PL montre la forme correcte (« Terme du design cible non encore implémenté de l'ADR-0021 »). Marqueurs interdits greppables : « premier palier », « hors scope initial », « objectif cible », « en v1 » et équivalents — la violation la plus fréquente du corpus PL (18 occurrences dans billing).

### 4.2 Structure de section (cible)

```markdown
# Domaine — <Contexte>
<1 paragraphe : responsabilité et hors-périmètre>
> Bandeau d'autorité (vérité actuelle ; vocabulaire dans CONCEPTS.md ; historique dans les ADR)

## Invariants                    # toujours/jamais, par concept
## Politiques et calculs         # règles conditionnelles, tables de décision, règles temporelles, permissions
## Machines à états              # états, transitions permises ET interdites
## Relations et contrats         # ownership, directions de dépendance, contrats cross-context
## Exemples limites              # rares, stables, chacun lié à sa règle et si possible à son test
## ADRs associés                 # liens relatifs
```

- **Section `Politiques et calculs` ajoutée** vs le template PL : c'est l'exutoire manquant qui a transformé `billing/## Relationships` en dépotoir de 186 puces. Les tables de décision Markdown y sont permises (précédent DMN CL1 : notation sans sémantique d'exécution) ; le plein DMN n'est justifié que si un moteur d'exécution est requis.
- **Mermaid : illustratif, jamais normatif.** Le contenu normatif est la liste états/transitions en texte ; un diagramme peut l'illustrer. Motifs : 0 Mermaid dans le corpus PL fonctionnel ; rendu non garanti sur tous les harnais ; un diagramme diverge silencieusement de sa liste.
- **Identifiants de règle (`BOOK-INV-001`) : non requis.** Aucun consommateur n'existe (0 test PL n'en référence) ; le mécanisme qui fonctionne déjà est l'ancre de section (`alignment-state.ts` référence la section « Indicateur d'alignement » par nom). Règle retenue : titres de sous-section stables comme ancres ; un schéma d'ID ne se justifie que le jour où des tests les référencent.
- **Anti-omnibus** : un `DOMAIN.md` par contexte, sous-sections par concept ; le seuil de split d'un contexte reste celui du protocole vocabulaire (preuve de frontières, jamais un compte de lignes). L'idée « DOMAIN.md index de sous-documents » est **différée sans évidence** : le plus gros fichier réel (billing, 225 lignes) est loin d'en avoir besoin.

### 4.3 Trois révisions motivées du contrat PL

1. **Exemples : autorisés, rares et normés** (PL les bannit). Analyse du désaccord avec BDD au §4.4.
2. **Ancrage code : permis au niveau module, interdit au niveau ligne.** Le ban PL absolu (« implementation details ») a été violé 5 fois dans le commit fondateur, parce que certains contenus en ont réellement besoin (la machine à états de capture-vbt est *portée par* `capture-flow-state.ts` — c'est un fait métier-code stable). Règle falsifiable retenue : nommer le module/service propriétaire d'une machine à états ou d'un calcul est permis ; les numéros de ligne, constantes volatiles et signatures sont interdits (la forme `service.ts:309-358` du corpus est la plus fragile possible). Le backlink inverse (commentaire code → section DOMAIN, motif `alignment-state.ts:24-27`) reste le mécanisme recommandé côté code.
3. **Composition UI : interdite, sans révision** — mais la règle doit être vérifiée par audit (§7), pas seulement énoncée : le corpus prouve que l'énoncé seul ne tient pas.

### 4.4 Le désaccord exemples-dans-DOMAIN vs pratique BDD (analyse demandée)

Les deux positions sont fondées, mais elles défendent des bénéfices différents :

- **Position PL (« Keep examples out »)** protège contre le pourrissement : un exemple prose n'est pas exécutable, donc rien ne le vérifie — c'est l'argument Nygard appliqué à l'échelle de la section.
- **Position BDD** revendique deux bénéfices distincts : (a) la **désambiguïsation** — « concrete examples are a tremendous way to help us explore the problem domain » et Gherkin v6 lie structurellement chaque `Rule:` à ses exemples illustratifs ; (b) l'**auto-vérification** — « the automated examples will help us to understand what the system is currently doing », qui exige l'exécutabilité.

**Résolution : les bénéfices sont séparables, le ban PL en sacrifie un pour rien.** Un exemple prose dans `DOMAIN.md` conserve intégralement (a) et perd (b). Or (b) n'est pas perdu pour le projet — il vit dans les tests, où BDD le place de toute façon. Le contrat retenu :

- un exemple n'entre dans `DOMAIN.md` que s'il **désambiguïse une règle qu'un lecteur pourrait raisonnablement mal lire** (cas limite, frontière temporelle, arrondi) — jamais un cas nominal ni un dialogue ;
- il est **attaché à sa règle** (même sous-section), stable (données métier, pas des valeurs de config), et pointe vers le test qui l'exécute quand il existe ;
- la règle abstraite reste normative ; l'exemple illustre. En cas de contradiction exemple/règle, c'est un finding d'audit, pas un choix silencieux.

C'est exactement la structure `Rule:` + `Example:` de Gherkin, transposée en prose avec le volet exécutable délégué aux tests.

### 4.5 Contradictions (règle de conduite agent)

En cas de contradiction entre `DOMAIN.md`, tests et code, l'agent n'élit pas silencieusement une autorité. Il classe : **bug** (le code contredit une règle confirmée), **doc obsolète** (le comportement a changé légitimement sans mise à jour), ou **décision non propagée** (ADR/plan accepté, implémentation partielle) — et le signale avec les trois preuves. Cette règle vit dans les instructions projet pendant l'expérimentation ; elle est déjà cohérente avec le protocole de blocage du contrat vocabulaire (signaler, ne pas choisir).

---

## 5. Topologie recommandée

**Règle unique : `DOMAIN.md` est le frère du `CONCEPTS.md` de son contexte.** Une phrase, mécanisable, aucune configuration — cohérente avec « Nothing configures this: the root file's own structure decides ».

| Cas | Layout | Comportement |
|---|---|---|
| Aucun document de domaine | — | Rien. Jamais de nag (motif établi : `ce-compound/SKILL.md:519`) |
| Dépôt simple, un contexte | `CONCEPTS.md` + `DOMAIN.md` à la racine | Le frère du glossaire racine |
| Multi-contextes | `CONCEPTS.md` racine (index) + `docs/contexts/<slug>/{CONCEPTS,DOMAIN}.md` | Le frère de chaque glossaire de contexte ; l'index racine n'a pas de `DOMAIN.md` (la vérité métier appartient aux contextes ; les contrats cross-context vivent dans la section Relations du côté propriétaire) |
| Convention existante (`CONTEXT.md`, `CONTEXT-MAP.md`) | états bloquants actuels | Inchangé : formats d'import via `migrate-domain-docs`, qui gagne une destination non lexicale (§10) |
| Autre convention (`RULES.md`, specs maison) | — | Hors périmètre : documents projet ordinaires, ni détectés ni migrés ; les instructions projet décident |
| Contexte devenu trop grand | — | Différé sans évidence (§4.2) |

La découverte est purement structurelle : présence du fichier frère = opt-in. Pas de clé `domain_*` dans la configuration — ce qui évite frontalement le pin négatif `domain_vocabulary_mode` du test de parité et l'esprit qu'il protège.

---

## 6. Matrice d'intégration par skill

Légende : **E** = dans l'expérimentation ; **D** = différé (critères §13) ; **N** = non retenu.

| Skill | Découvrir | Lire | Signaler contradiction | Proposer màj | Modifier | Vérifier vs code | Ancre observée |
|---|---|---|---|---|---|---|---|
| `ce-compound-refresh` (migration) | **E** | **E** | **E** | **E** (destination d'import) | **E** (avec arbitrage) | via grounding | `references/domain-migration.md` (fork-only) |
| `ce-compound-refresh` (audit) | **D** | **D** | **D** (signal de dérive, sans édit) | **D** | N | **D** | `SKILL.md:89` « collect the signal, don't edit yet » |
| `ce-compound` (grounding) | **E** (si édité ce run) | **E** | **E** | N | N | **E** | `references/grounding-validation.md:36` |
| `ce-brainstorm` | D | **D** | **D** (tripwire existant `:277-288`) | N | N | N | `SKILL.md:229` (lecture, à côté de `STRATEGY.md`) |
| `ce-plan` | D | **D** | **D** | N | N | N | `SKILL.md:342` |
| `ce-work` | D | **D** | **D** | **D** (« la vérité change dans le même changement » — le point 5 du cycle) | **D** (uniquement sur changement métier avéré) | N | `SKILL.md:108-114` (byte-identique upstream — coût maximal) |
| `ce-code-review` | N | D | **D** (drift docs/code) | N | N | **D** | persona nouveau = gouvernance-contesté (`AGENTS.md`, parité des rôles) ; alternative : étendre `learnings-researcher.md` Step 0 (pin de parité ×4) |
| `ce-setup` | N | — | — | — | — | — | Aucune clé de config ; scaffolding jamais (anti-cérémonie) |
| `lfg` | — | hérite de ce-plan/ce-work | — | — | — | — | Aucun edit propre |

**Principe de moindre surface** : pendant l'expérimentation, la lecture est portée par les instructions projet (une ligne dans l'`AGENTS.md` du projet adoptant), pas par les skills. Si la phase de preuve montre que cette ligne suffit (PL le suggère : ses runbooks et `AGENTS.md:15` routent déjà la lecture), les hooks D de lecture deviennent inutiles et la divergence est évitée définitivement — c'est le meilleur résultat possible. Ils ne se justifient que si l'évidence montre des agents qui n'ont *pas* lu la vérité métier alors que l'instruction projet existait.

---

## 7. Stratégie de grounding et de prévention de dérive

Trois étages, sans promettre de validation automatique là où il faut de la sémantique :

**Étage 1 — mécanique (déterministe, `domain-graph.py` + tests)** :
- `DOMAIN.md` frère qui définit un terme (grammaire d'entrée du glossaire détectée) → finding `domain-defines-terms` (protège l'autorité lexicale unique) ;
- liens relatifs cassés (vers CONCEPTS, ADR, autres contextes) — le resolver valide déjà les liens du graphe ;
- `DOMAIN.md` orphelin (sans `CONCEPTS.md` frère) → finding (la vérité métier sans vocabulaire n'a pas de contexte déclaré).

**Étage 2 — heuristiques (greppables, signalées jamais bloquantes)** :
- marqueurs de futur/livraison (« premier palier », « hors scope », « objectif cible », « en v1 ») ;
- références `fichier:lignes` (la forme interdite par §4.3.2) ;
- section Invariants vide livrée (le cas booking).

**Étage 3 — sémantique (agent, jamais garanti exhaustif)** :
- **Écriture** : extension d'une ligne de `grounding-validation.md:36` — les règles d'un `DOMAIN.md` créé/édité ce run sont des code-behavior claims, vérifiées comme les entrées de glossaire le sont déjà (citer la ligne définissante, corriger le contredit, adoucir l'invérifiable). Limite héritée et assumée : seul `ce-compound` invoque ce validateur ; un `DOMAIN.md` édité ailleurs n'est pas validé tant que l'adoption n'étend pas l'invocation.
- **Audit périodique (différé)** : la passe d'investigation de `ce-compound-refresh` (`SKILL.md:89`) collecte le signal de dérive règle-documentée-non-implémentée / implémentée-non-documentée / tests-contradictoires, comme elle le fait pour le vocabulaire — collecte sans édit, réconciliation arbitrée. Le backlink PL dérivé (hystérésis absente du doc) est exactement la classe de dérive que cet audit attraperait.
- **Duplication CONCEPTS/DOMAIN** : l'étage 1 attrape la forme structurelle (définition de terme) ; la forme sémantique (règle reformulée en définition) reste à l'audit agent.
- **Règle dans le mauvais contexte** : indécidable mécaniquement (le resolver « never makes a semantic judgment ») ; question d'arbitrage, comme l'ownership d'un terme aujourd'hui.

Leçon Evans intégrée : le Highlighted Core tient parce qu'il est *court* et que chaque changement déclenche notification. La version agent de ce contrat : petit fichier par contexte + mise à jour dans le même changement + audit qui compare périodiquement au code. La version PL (prose seule, zéro mécanisme) a déjà démontré qu'elle ne tient pas.

---

## 8. Surface exacte des fichiers

### 8.1 Expérimentation (PR fork, réversibles)

| Fichier | Nature | Changement |
|---|---|---|
| `skills/ce-compound-refresh/references/domain-migration.md` | fork-only | Étape 1 : inventorier les blocs non lexicaux ; étape 2 : classe de destination `DOMAIN.md`-de-contexte / ADR / drop-justifié dans le manifeste ; étape 3 : arbitrage ; étape 5 : barrière de destination étendue ; étape 6 : précondition de suppression étendue |
| `skills/ce-compound-refresh/references/domain-vocabulary.md` + 3 copies | fork-only | Un paragraphe : un `DOMAIN.md` frère non porteur de vocabulaire n'est pas une autorité lexicale ni un état bloquant ; s'il définit des termes, il l'est |
| `skills/ce-compound-refresh/scripts/domain-graph.py` | fork-only | Reconnaissance des frères `DOMAIN.md` ; findings `domain-defines-terms`, `domain-orphan` ; inventaire les expose en JSON |
| `tests/domain-graph.test.ts` + `tests/fixtures/domain-graph/` | fork-only | Fixtures : frère sain (0 finding), frère définissant un terme, orphelin ; déterminisme/lecture-seule préservés |
| `tests/domain-vocabulary-parity.test.ts` | fork-only | Pin du nouveau paragraphe (4 copies) |
| `tests/skills/ce-compound-refresh-domain.test.ts` | fork-only | Pin : le manifeste de migration couvre le contenu non lexical ; la suppression exige une destination approuvée |
| `skills/ce-compound/references/grounding-validation.md` | upstream-owned, déjà divergé (+1/−1) | Extension de la phrase de scope `:36` aux `DOMAIN.md` édités ce run |
| `docs/skills/ce-compound-refresh.md` (+ doc configuration si besoin : non) | docs | Mention de la destination d'import |

### 8.2 Adoption (différée — chiffrage de divergence, ancres vérifiées)

| Fichier | État upstream | Hook |
|---|---|---|
| `skills/ce-work/SKILL.md:108-114` | **byte-identique** | Lecture des `DOMAIN.md` des contextes touchés avant implémentation + màj dans le même changement sur changement métier avéré ; fait de ce-work un 5e consommateur de parité |
| `skills/ce-brainstorm/SKILL.md:229` | divergé (+17/−1) | Lecture à côté de `STRATEGY.md`/`CONCEPTS.md` |
| `skills/ce-plan/SKILL.md:342` | divergé (+7/−1) | Lecture des contextes touchés |
| `skills/ce-compound-refresh/SKILL.md:89,156,178` | divergé (+15/−3) | Audit de dérive + enum de rapport |
| `ce-code-review` persona ou `learnings-researcher.md` Step 0 | gouvernance-contesté / pin ×4 | Reviewer de cohérence docs/code |
| `skills/ce-setup`, `config-template.yaml`, `docs/skills/configuration.md` | byte-identiques | **Rien, même à l'adoption** — pas de clé, pas de scaffolding |

---

## 9. Tests de contrat et scénarios d'acceptation

**Mécaniques (CI, `bun test`)** — listés en §8.1. Critères d'acceptation :
1. Fixture dual `CONCEPTS.md` + `DOMAIN.md` frère non lexical → `validate` : 0 finding ; `inventory` expose le frère.
2. Fixture `DOMAIN.md` définissant un terme (grammaire `**Terme**:` ou `### Terme` + définition) → finding `domain-defines-terms`, exit 1.
3. Fixture legacy `CONTEXT.md` mixte (Language + State machine) → `plan-migration` produit un manifeste où le bloc non lexical a une destination explicite ; jamais de fusion automatique ; idempotence préservée.
4. Parité byte-identique des 4 copies incluant le nouveau paragraphe.
5. Route de migration : la suppression d'un legacy exige destination-ou-drop-approuvé pour chaque bloc non lexical (pin de prose dans le test de skill).

**Comportementaux (skill-creator, preuve PR — jamais CI)** :
6. Migration d'un CONTEXT.md mixte : l'agent propose la destination `DOMAIN.md`, n'y met aucune définition de terme, route les ambiguïtés vers `## Flagged ambiguities` du glossaire.
7. Grounding : un `DOMAIN.md` écrit avec une règle contredite par le code → le validateur la corrige ou l'adoucit (scénario zéro-tolérance : la règle contredite ne survit pas telle quelle).
8. Restraint : dépôt sans `DOMAIN.md` → aucun skill n'en propose la création (anti-nag).
9. Temporalité : contenu legacy au futur (« sera facturé… ») → routé vers ADR/plan, pas vers `DOMAIN.md`.

---

## 10. Migration depuis une documentation existante

Extension de la route à six étapes existante (`domain-migration.md`), pas un second workflow — la contrainte « sans créer deux workflows concurrents » de la mission est satisfaite par construction :

1. **Inventaire** : en plus des termes/alias/relations/invariants, chaque legacy est découpé en blocs, chaque bloc classé lexical / non lexical (machines à états, politiques, exemples, dialogues, ADR-like) / bruit.
2. **Proposition** : le manifeste gagne une colonne destination pour chaque bloc non lexical : `docs/contexts/<slug>/DOMAIN.md` (défaut pour invariants/états/relations), `docs/adr/` (contenu décisionnel, format ADR du projet), plan actif (contenu futur), drop justifié (dialogues d'exemple, bruit). Les `## Flagged ambiguities` legacy vont dans le glossaire (convention existante, pas dans DOMAIN).
3. **Arbitrage** : l'utilisateur tranche les blocs ambigus, comme pour l'ownership des termes.
4. **Aperçu** : les `DOMAIN.md` proposés sont montrés en entier, comme les glossaires.
5. **Application** : barrière de destination étendue ; écriture atomique.
6. **Suppression** : un legacy n'est supprimé que si chaque bloc a une destination écrite ou un drop approuvé.

Conventions non-Pocock (`RULES.md`, specs maison) : hors périmètre de la route — pas de grammaire d'import fiable, et les traiter tous transformerait la migration en aspirateur. Les instructions projet peuvent les faire lire ; une migration se fait à la main ou via une future grammaire si 2-3 projets en apportent une.

Cas PL : la migration est déjà faite localement (convention frère en place) ; PL ne consommerait que la reconnaissance mécanique et le grounding.

---

## 11. Risques de maintenance et de synchronisation upstream

- **Divergence nouvelle de l'expérimentation : quasi nulle.** Tout est fork-only sauf +1 ligne dans un fichier déjà divergé (+1/−1). Aucun fichier upstream propre n'est touché. Les merges upstream futurs ne rencontrent ces fichiers que s'ils créent des homonymes (improbable : 0 occurrence de `DOMAIN.md` upstream, aucun mouvement détecté).
- **Risque principal : l'écart de philosophie à l'adoption.** Upstream a délibérément scellé « Glossary only, not a spec or catch-all » (PR #838). Une proposition upstream de `DOMAIN.md` est une extension cohérente de cette frontière (le spec role vit *ailleurs*, le glossaire reste pur) — mais elle ne se défend qu'avec la preuve d'usage multi-projets que l'expérimentation doit produire. La proposer avant serait rejouer l'erreur que KTD8 interdit (pas de nouvelle surface publique sans preuve).
- **Risque de pin** : le test de parité protège « Nothing configures this » ; l'expérimentation le respecte (zéro config). Toute reformulation du paragraphe ajouté doit repasser par les 4 copies + le pin — coût connu et testé.
- **Risque d'inventaire** : pas de nouveau skill → pas d'impact sur `release:validate`, les registres de cleanup, ni le compte de skills.
- **Cérémonie** : aucun changement technique sans impact métier ne touche `DOMAIN.md` — la règle de mise à jour est déclenchée par « changement d'un invariant/relation/état métier », portée par les instructions projet, et l'anti-nag est pinné (§9.8).

---

## 12. Plan d'implémentation en étapes réversibles

1. **PR-0 (ce document)** — merge du RFC. Réversible trivialement.
2. **Phase de preuve PL (aucun changement fork)** — PL vit sa convention locale ; corriger son corpus des violations relevées (§3.2) pour que la preuve mesure le contrat révisé, pas le contrat cassé. Collecte : chaque changement métier note si `DOMAIN.md` a été mis à jour dans le même changement, spontanément ou après rappel.
3. **PR-A fork : correctif de migration** (§8.1, `domain-migration.md` + test de skill) — défendable indépendamment de tout le reste : supprime une perte de données. Revert = revert du commit.
4. **PR-B fork : reconnaissance mécanique + grounding** (§8.1 : contrat ×4, resolver, fixtures, parité, `grounding-validation.md:36`). Revert propre : fichiers fork-only + 1 ligne.
5. **Checkpoint (critères §13)** — après le premier vrai cycle de preuve PL **et** un second projet adoptant la forme. Si échec : les PR A/B restent (elles corrigent des défauts, pas la convention), tout le reste est abandonné et le RFC est marqué rejeté-après-expérimentation.
6. **Si critères atteints — PRs d'adoption** (dans cet ordre de coût croissant) : audit de dérive `ce-compound-refresh` ; hooks de lecture `ce-brainstorm`/`ce-plan` ; décision `ce-work` (le hook le plus utile — à ne prendre que si la ligne d'instructions projet s'est montrée insuffisante) ; question du reviewer `ce-code-review` posée explicitement au mainteneur (gouvernance).
7. **Proposition upstream** — après 6, avec la preuve multi-projets, sans chemins PL, comme le protocole vocabulaire y est déjà destiné.

À chaque étape : `bun run release:validate`, suite complète, évals skill-creator pour les scénarios comportementaux du §9.

---

## 13. Recommandation finale

**1. Devons-nous intégrer `DOMAIN.md` au fork Compound Engineering ?**

Pas comme convention générique aujourd'hui — l'évidence d'usage est n=1, vieille de trois jours, sans un seul cycle de mise à jour, et le contrat prescrit a été violé dès son artefact fondateur. Mais oui pour trois mécanismes minimaux qui corrigent des défauts réels du fork et rendent l'expérimentation possible sans perte de données : destination d'import non lexicale dans la migration, reconnaissance du fichier frère non porteur de vocabulaire par le resolver et le contrat de routage, extension du scope du validateur de grounding. Verdict : **expérimenter**.

**2. Quelle est la version minimale utile à expérimenter en premier ?**

Le fichier frère : `DOMAIN.md` à côté du `CONCEPTS.md` de son contexte, ne définissant aucun terme, n'énonçant que la vérité métier actuelle (contrat §4 : invariants, politiques/calculs, machines à états, relations/contrats, exemples limites rares et liés aux tests, ADR associés). Découverte structurelle, zéro configuration, zéro scaffolding, zéro nouveau skill. Les règles de lecture et de mise à jour vivent dans les instructions du projet adoptant — le plugin ne porte que la migration, la non-ambiguïté d'autorité et le grounding.

**3. Quels résultats observables justifieraient sa généralisation ?**

Quatre critères, tous observables, à réunir avant toute PR d'adoption (§12.6) :
- **Tenue** : sur les changements métier réels de Powerlifting Lausanne (premiers cycles post-migration), `DOMAIN.md` est mis à jour dans le même changement au moins 4 fois sur 5, sans rappel externe — la règle qu'aucune donnée ne soutient aujourd'hui ;
- **Valeur** : au moins un cas documenté où la lecture de `DOMAIN.md` a empêché une implémentation contradictoire, **ou** un audit de grounding a détecté puis corrigé une dérive réelle (la classe hystérésis-absente-du-doc, déjà observée) ;
- **Réplication** : un second projet adopte la forme frère avec le même contrat sans mutation structurelle majeure — le seuil que le propre doc de solution de PL fixe (« la même forme réapparaît dans plusieurs projets et un contrat stable émerge ») ;
- **Propreté** : le taux de violation du contrat (implémentation niveau-ligne, UI, temporalité) mesuré par les heuristiques du §7 est en baisse après la correction du corpus, prouvant que le contrat révisé est tenable et pas seulement mieux écrit.

Si la tenue échoue alors que l'instruction projet existait, la conclusion honnête n'est pas « il faut des hooks partout » mais « un document que ni les agents ni les humains ne maintiennent sous instruction explicite ne mérite pas de convention » — et le verdict devient rejeter, les correctifs A/B restant acquis.

---

## Annexe — sources primaires vérifiées (2026-08-13)

- Eric Evans, *Domain-Driven Design Reference* — domainlanguage.com (PDF 2015, CC-BY 4.0) : Ubiquitous Language p. 3-4, Bounded Context p. 2, Model-Driven Design p. 6, Domain Vision Statement p. 42, Highlighted Core p. 43, Context Map p. 29.
- Cucumber — cucumber.io/docs/bdd/, cucumber.io/docs/gherkin/reference/ (`Rule:` depuis Gherkin v6), Matt Wynne, *Example Mapping Introduction* (blog Cucumber, 2015).
- OMG DMN — omg.org/spec/DMN/ (citations du PDF 1.5 : Clause 1 Scope, Clause 2.1 conformance levels, Clause 5 decision tables, Clause 9.1 sur S-FEEL, Clause 10 FEEL).
- Michael Nygard, *Documenting Architecture Decisions* — cognitect.com, 2011-11-15.
- `mattpocock/skills` — état au 2026-08-13 (commits du jour renforçant le trigger `CONTEXT.md` ; `CONTEXT-FORMAT.md`, `ADR-FORMAT.md` ; « It is a glossary and nothing else »).
- `EveryInc/compound-engineering-plugin` — état au 2026-08-13 (PR #838 du 2026-06-02 ; 0 occurrence `DOMAIN.md` ; issue ouverte #1264 sans rapport avec un spec métier).
- Corpus Powerlifting Lausanne — chemins machine-local sous `/Users/vladimirmbassi/Dev/Node/powerlifting-lausanne` (AGENTS.md:15,17 ; docs/agents/domain.md:17,23,27,28 ; docs/solutions/documentation-gaps/separate-domain-vocabulary-from-current-domain-truth.md:26,48,52,62,82 ; les six paires docs/contexts/*/{CONCEPTS,DOMAIN}.md ; apps/mobile/.../alignment-state.ts:24-27).
- Fork — ancres citées dans le corps du RFC, vérifiées sur `main` à `f980bcbf`.
