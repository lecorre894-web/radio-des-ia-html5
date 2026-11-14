"""Comité scientifique SPARKTIATES.

Les rôles doctoraux/postdoctoraux sont des protocoles de méthode, non des diplômes.
Les modèles sont sélectionnés UNIQUEMENT parmi ceux installés sous Ollama.
"""
from __future__ import annotations

RESEARCH_ROLES = {
    "these": ("Analyse doctorale", "Formule problématique, hypothèses explicites, état de l'art disponible et prédictions falsifiables."),
    "postdoc": ("Contre-expertise postdoctorale", "Cherche biais, confusions causales, expériences témoins, limites et contre-exemples."),
    "mathsup": ("Mathématiques avancées", "Établit les hypothèses, formalise les équations et distingue preuve, calcul et intuition."),
    "methodes": ("Méthodologie expérimentale", "Prépare protocole reproductible : variables, contrôles, métriques, échantillonnage, incertitude et critères d'arrêt."),
    "systemes": ("Architecture systèmes", "Vérifie ressources physiques, complexité, mémoire, coût, synchronisation, passage à l'échelle et cas de panne."),
    "pairs": ("Relecture scientifique", "Rédige une revue critique indépendante de la proposition, avec objections majeures et mineures."),
    "epistemologie": ("Audit épistémologique", "Classe MESURÉ, RECONSTRUIT, CANDIDAT, ARTEFACT et INCONNU ; refuse les affirmations non étayées."),
    "jury": ("Jury scientifique", "Compare les positions précédentes, demande preuves manquantes et rend un verdict provisoire conditionné à des tests.")
}
RESEARCH_ORDER = tuple(RESEARCH_ROLES)
# Des préférences de modèles, PAS un téléchargement. Tous doivent être vérifiés dans /api/tags.
RESEARCH_MODEL_PREFERENCES = {
    "these": ("qwen3:14b", "gpt-oss:20b", "deepseek-r1:14b"),
    "postdoc": ("deepseek-r1:14b", "gpt-oss:20b", "qwen3:14b"),
    "mathsup": ("deepseek-r1:14b", "qwen3:14b", "gpt-oss:20b"),
    "methodes": ("qwen3:14b", "gpt-oss:20b", "deepseek-r1:14b"),
    "systemes": ("gpt-oss:20b", "qwen3:14b", "deepseek-r1:14b"),
    "pairs": ("deepseek-r1:14b", "gpt-oss:20b", "qwen3:14b"),
    "epistemologie": ("qwen3:14b", "deepseek-r1:14b", "gpt-oss:20b"),
    "jury": ("gpt-oss:20b", "qwen3:14b", "deepseek-r1:14b")
}
RESEARCH_PROTOCOL = (
    "\nPROTOCOLE SCIENTIFIQUE AVANCE : Tu incarnes un ROLE LOGICIEL méthodologique,"
    " sans diplôme, autorité académique ou autonomie scientifique garantie.\n"
    "1. Réponds à la question exacte, sans changement silencieux d'hypothèses.\n"
    "2. Sépare résultats MESURÉS, RECONSTRUITS, CANDIDATS, ARTEFACTS et INCONNUS ;"
    " les mesures doivent citer leur protocole et leur origine, sinon indique NON MESURÉ.\n"
    "3. Distingue démonstration mathématique, simulation, analogie et hypothèse ;"
    " explicite les prémisses et les limites.\n"
    "4. N'invente ni données, ni articles, ni DOI, ni validations indépendantes."
    " Si aucune source n'est fournie, signale l'absence de vérification documentaire.\n"
    "5. Présente au moins un contre-exemple ou une objection lorsque pertinent,"
    " et un test reproductible susceptible de réfuter ton affirmation.\n"
    "6. Conclus par un niveau d'incertitude QUALITATIF argumenté,"
    " sans score chiffré de confiance inventé.\n"
    "7. Les interventions du même modèle sous plusieurs rôles ne sont PAS des confirmations indépendantes.\n"
)


def installed_names(ollama_tags: dict) -> frozenset[str]:
    rows = ollama_tags.get("models") if isinstance(ollama_tags, dict) else None
    if not isinstance(rows, list):
        return frozenset()
    return frozenset(
        value
        for row in rows if isinstance(row, dict)
        for value in (row.get("name"),)
        if isinstance(value, str) and 1 <= len(value) <= 128
    )


def select_model(role: str, names: frozenset[str], fallback: str) -> str:
    """Aucune sélection fictive : le modèle de base doit lui aussi être présent."""
    if not isinstance(names, frozenset):
        names = frozenset(names)
    if role in RESEARCH_ROLES:
        for model in RESEARCH_MODEL_PREFERENCES[role]:
            if model in names:
                return model
    if fallback in names:
        return fallback
    raise ValueError("Aucun modèle Ollama compatible déjà installé.")


def research_catalog(names: frozenset[str], fallback: str) -> dict:
    return {
        "mode": "doctoral_method_profiles_not_academic_credentials",
        "models_installed": sorted(names),
        "base_model_installed": fallback in names,
        "has_external_subscription": False,
        "roles": [{"id": role, "name": name,
                   "model_if_available": next(
                       (m for m in RESEARCH_MODEL_PREFERENCES[role] if m in names),
                       fallback if fallback in names else None),
                   "independent_validation": False}
                  for role, (name, _) in RESEARCH_ROLES.items()],
        "important": "Le nombre de rôles ne prouve ni le niveau doctoral réel du modèle, ni une validation indépendante."
    }
