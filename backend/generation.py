"""English-passage settings shared by the API and the training-corpus builder."""

VERBOSITY_LEVELS: dict[str, tuple[int, str]] = {
    "modest": (
        2,
        "relatively simple and easy to understand for a very beginner's children book level",
    ),
    "adequate": (4, "level appropriate for a high school student"),
    "rich": (6, "at a very sophisticated and advanced level; use your imagination"),
}

DEFAULT_VERBOSITY = "adequate"
PASSAGE_MAX_TOKENS = 400


def passage_instructions(verbosity: str, *, guard_inappropriate: bool = False) -> str:
    """System prompt for drafting an English passage at the given verbosity."""
    sentences, vocab = VERBOSITY_LEVELS.get(verbosity, VERBOSITY_LEVELS[DEFAULT_VERBOSITY])
    prompt = (
        f"Generate about {sentences} sentences about the given topic. "
        f"Keep the vocabulary {vocab}. Do not include line breaks."
    )
    if guard_inappropriate:
        prompt += (
            f" If the topic is inappropriate, generate about {sentences} sentences "
            "about the dangers of the topic."
        )
    return prompt
