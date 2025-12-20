from questionbankllm import QuestionAnalyzer, parse_question

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


def main():
    analyzer = QuestionAnalyzer()
    result = analyzer.analyze(SAMPLE_QUESTION)

    # Print a short human-readable summary
    print("Source:", result.source)
    print("Year:", result.year)
    print("Question #:", result.question_number)
    print("Topic:", result.topic_id, '-', result.topic_name)
    print("Question type:", result.question_type)
    print("Detected answer:", result.correct_option, "", result.correct_option_text)
    print("Dataset similarity:", result.match_confidence)
    print("\nPrompt:\n", result.prompt)
    if result.answer_options:
        print('\nOptions:')
        for opt in result.answer_options:
            print(f"  {opt.label}. {opt.text}")


if __name__ == '__main__':
    main()
