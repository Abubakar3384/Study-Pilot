from app.services.chat import build_citations
from app.services.retrieval import Passage, chunk_pages, search

PAGES = [
    (1, "Photosynthesis converts light energy into chemical energy in chloroplasts."),
    (3, "Mitochondria are the powerhouse of the cell and produce ATP."),
    (4, "The Krebs cycle runs in the mitochondrial matrix and releases carbon dioxide."),
]


def test_search_ranks_relevant_page_first():
    hits = search(PAGES, "What do mitochondria produce?")
    assert hits[0].page_number == 3


def test_search_returns_nothing_for_unrelated_query():
    assert search(PAGES, "quantum chromodynamics gluons") == []
    assert search(PAGES, "what is the") == []  # only stopwords


def test_chunks_never_span_pages():
    long_page = " ".join(f"Sentence number {i} about enzymes." for i in range(100))
    chunks = chunk_pages([(7, long_page), (8, "Short page.")], max_chars=200)
    assert all(len(c.text) <= 200 for c in chunks)
    assert {c.page_number for c in chunks} == {7, 8}
    assert chunks[-1] == Passage(8, "Short page.")


def test_citations_only_for_retrieved_pages_and_deduplicated():
    passages = [Passage(3, "Mitochondria produce ATP.", 2.0), Passage(4, "Krebs cycle.", 1.0)]
    cites = build_citations([3, 3, 4, 99], passages)
    assert cites == [
        {"page_number": 3, "snippet": "Mitochondria produce ATP."},
        {"page_number": 4, "snippet": "Krebs cycle."},
    ]
