import { readFile, writeFile } from "node:fs/promises";

const outputPath = new URL("../assets/scholar-metrics.json", import.meta.url);
const profilePaths = [
  "https://scholar.google.com",
  "https://scholar.google.ca",
  "https://scholar.google.co.uk"
];
const papers = {
  trustjudge: "qOQwD7UAAAAJ:Zph67rFs4hoC",
  raglab: "qOQwD7UAAAAJ:ULOm3_A8WrAC"
};

let html = "";
let lastError = null;
for (const origin of profilePaths) {
  try {
    const response = await fetch(`${origin}/citations?user=qOQwD7UAAAAJ&hl=en&pagesize=100`, {
      headers: {
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
      },
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`${origin} returned ${response.status}`);
    const candidate = await response.text();
    if (!candidate.includes("gsc_a_tr") || candidate.includes("automated queries")) {
      throw new Error(`${origin} did not return a public profile page`);
    }
    html = candidate;
    break;
  } catch (error) {
    lastError = error;
  }
}

if (!html) throw lastError || new Error("Unable to fetch the Google Scholar profile");

const rows = [...html.matchAll(/<tr class="gsc_a_tr">([\s\S]*?)<\/tr>/g)].map((match) => match[1]);
const nextPapers = {};

Object.entries(papers).forEach(([key, citationId]) => {
  const row = rows.find((entry) => entry.includes(`citation_for_view=${citationId}`));
  if (!row) throw new Error(`Missing Google Scholar record for ${key}`);
  const citationMatch = row.match(/class="gsc_a_ac gs_ibl">\s*([\d,]*)\s*<\/a>/);
  nextPapers[key] = {
    citationId,
    citations: citationMatch?.[1] ? Number(citationMatch[1].replaceAll(",", "")) : 0
  };
});

let previous = null;
try {
  previous = JSON.parse(await readFile(outputPath, "utf8"));
} catch {
  // The first successful run creates the data file.
}

const countsChanged = Object.keys(nextPapers).some((key) => (
  previous?.papers?.[key]?.citations !== nextPapers[key].citations
));

if (!countsChanged) {
  console.log("Google Scholar citation counts are unchanged.");
  process.exit(0);
}

const output = {
  source: "Google Scholar",
  profile: "https://scholar.google.com/citations?user=qOQwD7UAAAAJ&hl=en",
  updatedAt: new Date().toISOString(),
  papers: nextPapers
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log("Updated Google Scholar citation counts:", nextPapers);
