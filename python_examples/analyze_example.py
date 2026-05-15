import argparse
import textwrap
from pathlib import Path
from typing import Any, List

from questionbankllm import QuestionAnalyzer

SAMPLE_QUESTION = """DSE 2012 Q25
What is the theoretical volume of carbon dioxide that can be obtained, at room temperature and pressure,
when 1.2 g of Na2CO3(s) reacts with 50 cm3 of 1.0 M HNO3?
(Molar volume of gas at room temperature and pressure = 24 dm3;
Relative atomic masses: H = 1.0, C = 12.0, N = 14.0, O = 16.0, Na = 23.0)

A. 272 cm3
B. 544 cm3
C. 600 cm3
D. 1200 cm3
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Analyze a raw chemistry question string (default) or a file containing "
            "one or more questions. Files can be TXT, PDF or DOCX as long as the "
            "optional dependencies are installed."
        )
    )
    parser.add_argument(
        "file",
        nargs="?",
        help="Path to a TXT/PDF/DOCX file to analyze. If omitted, SAMPLE_QUESTION is used.",
    )
    return parser.parse_args()


def extract(record: Any, *candidates: str) -> Any:
    """Return the first non-None field from the record using attribute or dict lookups."""

    for key in candidates:
        value = None
        if isinstance(record, dict) and key in record:
            value = record[key]
        else:
            value = getattr(record, key, None)
        if value is not None:
            return value
    return None


def coerce_question_sequence(result: Any) -> List[Any]:
    """Ensure the analyzer output can be iterated as a list of per-question objects."""

    if result is None:
        return []
    if isinstance(result, (list, tuple)):
        return list(result)

    container = extract(result, "questions", "items", "results", "entries")
    if isinstance(container, (list, tuple)):
        return list(container)

    return [result]


def normalize_answer_options(record: Any) -> List[dict]:
    options = extract(record, "answer_options", "answerOptions") or []
    normalized = []
    for idx, option in enumerate(options, start=1):
        label = extract(option, "label", "option", "id", "key")
        text = extract(option, "text", "value", "content", "body")
        normalized.append({
            "label": label or chr(ord("A") + idx - 1),
            "text": (text or "").strip(),
        })
    return normalized


def print_question_summary(record: Any, index: int) -> None:
    header_parts = []
    source = extract(record, "source", "Source")
    year = extract(record, "year", "Year")
    paper = extract(record, "paper", "Paper")
    qnum = extract(record, "question_number", "questionNumber")

    if source:
        header_parts.append(str(source))
    if year:
        header_parts.append(str(year))
    if paper:
        header_parts.append(f"Paper {paper}")
    if qnum:
        header_parts.append(f"Q{qnum}")

    header = " | ".join(header_parts) or "Unlabeled question"
    print(f"\nQuestion {index}: {header}")

    topic = extract(record, "topic_name", "topicName")
    topic_id = extract(record, "topic_id", "topicId")
    if topic or topic_id:
        topic_label = f"{topic_id or ''} {topic or ''}".strip()
        print(f"  Topic: {topic_label}")

    qtype = extract(record, "question_type", "questionType")
    if qtype:
        print(f"  Type: {qtype}")

    match_conf = extract(record, "match_confidence", "matchConfidence")
    matched_id = extract(record, "matched_dataset_id", "matchedDatasetId")
    if match_conf or matched_id:
        details = []
        if matched_id:
            details.append(f"dataset {matched_id}")
        if match_conf is not None:
            details.append(f"confidence {match_conf}")
        print(f"  Match: {', '.join(details)}")

    prompt = extract(record, "prompt", "question", "rawPrompt")
    if prompt:
        prompt_text = prompt.strip()
        preview = prompt_text if len(prompt_text) <= 600 else f"{prompt_text[:597]}..."
        print("  Prompt:")
        print(textwrap.indent(preview, "    "))

    options = normalize_answer_options(record)
    if options:
        print("  Options:")
        for option in options:
            print(f"    {option['label']}. {option['text']}")

    correct = extract(record, "correct_option", "correctOption")
    correct_text = extract(record, "correct_option_text", "correctOptionText")
    if correct or correct_text:
        label = correct or "?"
        suffix = f" ({correct_text})" if correct_text else ""
        print(f"  Detected answer: {label}{suffix}")


def summarize_analysis(result: Any, label: str) -> None:
    questions = coerce_question_sequence(result)
    print(f"\n=== {len(questions)} question(s) detected from {label} ===")
    if not questions:
        print("No question blocks were detected."
              " Ensure the file contains recognizable assessment text.")
        return
    for idx, question in enumerate(questions, start=1):
        print_question_summary(question, idx)


def analyze_file(analyzer: QuestionAnalyzer, file_path: Path) -> None:
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    payload = file_path.read_bytes()
    result = analyzer.analyze_file_content(payload, file_path.name)
    summarize_analysis(result, file_path.name)


def analyze_sample(analyzer: QuestionAnalyzer) -> None:
    print("No file supplied. Falling back to SAMPLE_QUESTION.\n")
    result = analyzer.analyze(SAMPLE_QUESTION)
    summarize_analysis(result, "sample question text")


def main() -> None:
    args = parse_args()
    analyzer = QuestionAnalyzer()

    if args.file:
        analyze_file(analyzer, Path(args.file))
    else:
        analyze_sample(analyzer)


if __name__ == "__main__":
    main()
