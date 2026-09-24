# DCS search

A browser-based search interface for the Digital Corpus of Sanskrit texts
published at <https://github.com/cltk/sanskrit_text_dcs>.

Searches run entirely in the reader's browser: keywords, exact phrases, or
regular expressions (grep-style), with or without diacritics, optionally
restricted to texts whose name contains a given string. Each hit shows the
text, the file name, the DCS reference (e.g. `12.3`) and the file line number,
linked to that line on GitHub.

## Setting up

1. Create a new GitHub repository (e.g. `dcs-search`) and push these files
   to its `main` branch, including the hidden `.github` folder.
2. In the repository, go to **Settings → Pages** and set **Source** to
   **GitHub Actions**.
3. Open the **Actions** tab. The "Build and publish" workflow runs on every
   push; you can also start it by hand with **Run workflow**.
4. When it finishes, the site is at `https://<username>.github.io/dcs-search/`.

The workflow downloads the corpus fresh at each build and turns it into
`assets/data/corpus.json`; the corpus itself is not stored in this repository.

## Using a different corpus

`scripts/build_index.py` reads every `*.txt` file in a folder. A trailing
reference in parentheses, like `// (12.3)`, becomes the citation; lines
without one are still searchable and cited by line number. To index other
texts, change the `git clone` step and the path passed to the script in
`.github/workflows/pages.yml`, and give `--link-base` the GitHub URL of the
folder holding the files so the references link correctly.
