"""Builds e2e/fixtures/cell-biology.pdf, a small realistic lecture used by the e2e tests and demos.

Run with the backend venv (it has PyMuPDF):
    ../backend/.venv/Scripts/python.exe scripts/make_fixture_pdf.py      (Windows)
    ../backend/.venv/bin/python scripts/make_fixture_pdf.py              (macOS/Linux)
"""

from pathlib import Path

import pymupdf

PAGES = [
    ("Lecture 3: The Cell",
     "Cell theory states that all living organisms are composed of cells, that the cell is the basic unit "
     "of structure and function, and that all cells arise from pre-existing cells. Two broad kinds of cells "
     "exist: prokaryotic cells, such as bacteria, and eukaryotic cells, found in plants, animals and fungi."),
    ("The plasma membrane",
     "Every cell is bounded by a plasma membrane. The membrane is a phospholipid bilayer: hydrophilic heads "
     "face the watery cytoplasm and exterior, while hydrophobic tails face inward. The fluid mosaic model "
     "describes membrane proteins floating within this lipid layer. The membrane is selectively permeable."),
    ("Transport across membranes",
     "Diffusion is the net movement of particles from higher to lower concentration and needs no energy. "
     "Osmosis is the diffusion of water across a selectively permeable membrane. Active transport moves "
     "substances against their concentration gradient and requires energy in the form of ATP. The "
     "sodium-potassium pump moves three sodium ions out and two potassium ions in for each ATP."),
    ("The nucleus and ribosomes",
     "The nucleus stores the cell's DNA and controls gene expression. Ribosomes translate messenger RNA into "
     "protein. Ribosomes attached to the rough endoplasmic reticulum make proteins destined for membranes or "
     "secretion. The Golgi apparatus modifies, sorts and packages these proteins."),
    ("Mitochondria",
     "Mitochondria carry out aerobic respiration and produce most of the cell's ATP. They have an inner "
     "membrane folded into cristae, which increases the surface area for the electron transport chain. "
     "Mitochondria contain their own DNA, inherited from the mother."),
    ("Cellular respiration",
     "Cellular respiration releases energy from glucose. Glycolysis splits glucose into two pyruvate in the "
     "cytoplasm, giving a net gain of two ATP. The Krebs cycle oxidises acetyl-CoA in the mitochondrial "
     "matrix, producing NADH and FADH2. The electron transport chain uses these carriers to pump protons "
     "and drive ATP synthase."),
    ("Photosynthesis",
     "Chloroplasts are the site of photosynthesis in plant cells. Chlorophyll absorbs mostly blue and red "
     "light. Photosynthesis converts light energy into chemical energy stored in glucose, releasing oxygen. "
     "Its products are the starting materials of cellular respiration."),
    ("The cell cycle",
     "The cell cycle is the ordered sequence of growth, DNA replication and division. Mitosis divides the "
     "nucleus into two genetically identical nuclei. Checkpoints halt the cycle if DNA is damaged. Cancer "
     "can result when cells escape checkpoint control and divide without limit."),
]


def main() -> None:
    out = Path(__file__).resolve().parents[1] / "e2e" / "fixtures" / "cell-biology.pdf"
    out.parent.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open()
    for title, body in PAGES:
        page = doc.new_page()
        page.insert_text((56, 72), title, fontsize=18)
        page.insert_textbox(pymupdf.Rect(56, 96, 540, 780), body, fontsize=11.5, lineheight=1.4)
    doc.set_metadata({"title": "Lecture 3: The Cell", "author": "StudyPilot fixture"})
    doc.save(out)
    doc.close()
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
