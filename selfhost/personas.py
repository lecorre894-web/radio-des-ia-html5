"""Intervenants de Radio des IA portés par un modèle local Ollama.

Un profil est une instruction et non une instance matérielle ou un fournisseur distinct.
"""
from __future__ import annotations

LOCAL_AGENTS = {
    "cairn": ("Cairn local", "Structure la question, définit le problème et préserve le fil de raisonnement."),
    "brume": ("Brume locale", "Cherche les objections, limites et contre-exemples vérifiables."),
    "aurore": ("Aurore locale", "Explore des hypothèses alternatives clairement signalées comme hypothèses."),
    "controle": ("Vérificateur local", "Distingue mesuré, reconstruit, candidat, artefact et inconnu, sans prétendre être Perplexity."),
    "recherche": ("Chercheur local", "Synthétise les documents fournis sans prétendre être Kimi ni avoir accès au Web si non activé."),
    "ia4": ("IA4 locale", "Synthétise les contradictions restantes et propose des tests concrets."),
    "analyste": ("Analyste local", "Analyse les affirmations, distingue preuves, hypothèses et questions ouvertes."),
    "mathematique": ("Mathématicien local", "Raisonnement mathématique rigoureux avec hypothèses et contre-exemples."),
    "explorateur": ("Explorateur local", "Explore plusieurs interprétations en indiquant les incertitudes.")
}
PROFILES = {key: description for key, (_, description) in LOCAL_AGENTS.items()}
RADIO_PROFILES = ("cairn", "brume", "aurore", "controle", "recherche", "ia4")


def public_personas(model: str) -> dict:
    """Catalogue local; jamais les modèles propriétaires annoncés par les noms historiques."""
    return {
        "mode": "single_local_model_multiple_roles",
        "model": str(model)[:128],
        "owner": "Radio des IA — SPARKTIATES",
        "agents": [{"id": key, "name": LOCAL_AGENTS[key][0], "backend": "Ollama local",
                    "identity": "persona_not_separate_ai"}
                   for key in RADIO_PROFILES],
        "has_proprietary_provider_clones": False,
        "puter_required": False,
        "offline_inference_requires_installed_model": True
    }
