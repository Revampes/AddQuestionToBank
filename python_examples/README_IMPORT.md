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

Common troubleshooting
- "ModuleNotFoundError: questionbankllm": ensure the venv is activated and you installed into that environment.
- Python version: package requires Python 3.9+. Run `python -V` to confirm.
- Network issues while pip installing from GitHub: check firewall/proxy or try cloning then `pip install -e .`.

If you get an error, copy the exact error text and paste it here and I'll help debug it.
