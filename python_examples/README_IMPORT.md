Quick: install and import QuestionBankLLM (Windows PowerShell)

1) Create and activate a virtual environment (recommended)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -V
```

2) Install directly from GitHub

```powershell
pip install --upgrade pip
pip install git+https://github.com/Revampes/QuestionBankLLM.git
```

(Alternative - editable local install)

```powershell
git clone https://github.com/Revampes/QuestionBankLLM.git
cd QuestionBankLLM
pip install -e .
```

3) Run the example in this workspace

```powershell
cd "c:\Users\user\Desktop\Repos\QuestionBankWeb"
python python_examples\analyze_example.py
```

4) Optional: enable PDF/DOCX extraction

```powershell
pip install pymupdf python-docx
```

`QuestionAnalyzer` will automatically load rich document parsing if these two wheels are present. Without them, only plain-text analysis is available.

---

## Analyze full files (PDF/DOCX/TXT)

The sample script now exercises the new `QuestionAnalyzer.analyze_file_content(file_bytes, filename)` API, so you can point it at any supported file without spinning up Flask.

```powershell
# Analyze every question contained inside questions.pdf
python python_examples\analyze_example.py data\questions.pdf

# Still works with pasted text when no file is supplied
python python_examples\analyze_example.py
```

The output lists each detected question (there can be up to 36 per document), including the inferred source, year, paper, topic metadata, and detected answer choices. Images extracted from PDF/DOCX files are surfaced through the `QuestionAnalyzer` response payload and can be handled inside your host project as needed.

Common troubleshooting
- "ModuleNotFoundError: questionbankllm": ensure the venv is activated and you installed into that environment.
- Python version: package requires Python 3.9+. Run `python -V` to confirm.
- Network issues while pip installing from GitHub: check firewall/proxy or try cloning then `pip install -e .`.

If you get an error, copy the exact error text and paste it here and I'll help debug it.
