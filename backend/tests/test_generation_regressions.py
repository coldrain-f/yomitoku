"""Zero-cost regression checks for representative generated reading items."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.schemas import GeneratedReading, GenerationConditions
from app.services.validation import validate_generated_reading

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "generation_regression_cases.json"
REGRESSION_CASES: list[dict[str, Any]] = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def make_item(case: dict[str, Any]) -> GeneratedReading:
    return GeneratedReading.model_validate(case["item"])


@pytest.mark.parametrize("case", REGRESSION_CASES, ids=lambda case: case["id"])
def test_representative_generated_items_pass_deterministic_quality_gate(
    case: dict[str, Any],
) -> None:
    conditions = GenerationConditions.model_validate(case["conditions"])
    item = make_item(case)

    assert validate_generated_reading(item, conditions.length_type, conditions.language) == []


def test_regression_cases_cover_both_languages_and_all_length_types() -> None:
    coverage = {
        (case["conditions"]["language"], case["conditions"]["length_type"])
        for case in REGRESSION_CASES
    }

    assert coverage == {
        ("ja", "short"),
        ("ja", "medium"),
        ("ja", "long"),
        ("ko", "short"),
        ("ko", "medium"),
        ("ko", "long"),
    }


@pytest.mark.parametrize(
    ("mutate", "expected_issue"),
    [
        (
            lambda item: item.choices[0].__setattr__("wrong_explanation", None),
            "missing_wrong_explanation",
        ),
        (
            lambda item: item.choices[1].__setattr__(
                "distractor_type", "partial_truth_off_focus"
            ),
            "correct_choice_has_distractor_type",
        ),
        (
            lambda item: item.choices[2].__setattr__("distractor_type", None),
            "missing_distractor_type",
        ),
        (
            lambda item: item.choices[2].__setattr__(
                "distractor_type", "partial_truth_off_focus"
            ),
            "duplicate_distractor_type",
        ),
    ],
)
def test_quality_gate_rejects_broken_distractor_contracts(
    mutate: Any,
    expected_issue: str,
) -> None:
    case = copy.deepcopy(REGRESSION_CASES[0])
    item = make_item(case)

    mutate(item)

    assert expected_issue in validate_generated_reading(item, "short", "ja")


def test_quality_gate_rejects_a_passage_outside_its_length_range() -> None:
    item = make_item(REGRESSION_CASES[0]).model_copy(update={"passage": "短い文です。"})

    assert "passage_too_short" in validate_generated_reading(item, "short", "ja")


def test_generated_reading_contract_rejects_non_unique_answer_or_choice_text() -> None:
    source = copy.deepcopy(REGRESSION_CASES[0]["item"])
    source["choices"][0]["isCorrect"] = True
    with pytest.raises(ValidationError, match="Exactly one choice"):
        GeneratedReading.model_validate(source)

    source = copy.deepcopy(REGRESSION_CASES[0]["item"])
    source["choices"][0]["text"] = source["choices"][1]["text"]
    with pytest.raises(ValidationError, match="Choice text must be unique"):
        GeneratedReading.model_validate(source)
