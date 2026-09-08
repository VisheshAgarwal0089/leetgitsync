// Keep DOM dependencies centralized; network metadata is preferred.
export const selectors = {
  title: ['[data-cy="question-title"]', '[data-testid="question-title"]', 'a[href^="/problems/"] h1'],
  numberAndTitle: ['[data-cy="question-title"]', '[data-testid="question-title"]'],
  topic: ['a[href^="/tag/"]', '[data-cy="topic-tag"]'],
  company: ['a[href^="/company/"]', '[data-cy="company-tag"]', '[data-testid="company-tag"]'],
};

function firstText(document, names) {
  for (const selector of names) {
    const text = document.querySelector(selector)?.textContent?.trim();
    if (text) return text;
  }
  return '';
}

function allText(document, names) {
  return [...new Set(names.flatMap((selector) => [...document.querySelectorAll(selector)].map((node) => node.textContent?.trim()).filter(Boolean)))];
}

export function extractDomMetadata(document, slug) {
  const titleText = firstText(document, selectors.title);
  const match = titleText.match(/^\s*(\d+)\s*[.．]\s*(.+)$/);
  return {
    problemNumber: match ? Number(match[1]) : null,
    problemTitle: match?.[2] || titleText || null,
    problemSlug: slug,
    topics: allText(document, selectors.topic),
    companies: allText(document, selectors.company),
  };
}
