const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const BLOG_DIR = path.join(__dirname, "../content/english/blog");
const THAI_RE = /[\u0E00-\u0E7F]/;

function parseArgs(argv) {
  const args = { check: false, dryRun: false, title: "" };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check") {
      args.check = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--title") {
      args.title = argv[i + 1] || "";
      i += 1;
    } else if (arg.startsWith("--title=")) {
      args.title = arg.slice("--title=".length);
    }
  }

  return args;
}

function hasThai(text) {
  return THAI_RE.test(text);
}

function slugify(text) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function getFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return null;
  }

  return {
    raw: match[0],
    body: match[1],
    end: match[0].length,
  };
}

function getStringField(frontmatter, field) {
  const match = frontmatter.match(
    new RegExp(`^${field}:\\s*(?:"([^"]*)"|'([^']*)'|([^\\n#]*))\\s*$`, "m"),
  );

  if (!match) {
    return "";
  }

  return (match[1] ?? match[2] ?? match[3] ?? "").trim();
}

function hasUsableSlug(frontmatter) {
  const slug = getStringField(frontmatter, "slug");
  return Boolean(slug);
}

function setSlug(markdown, frontmatter, slug) {
  const line = `slug: "${slug}"`;
  let nextBody;

  if (/^slug:\s*.*$/m.test(frontmatter.body)) {
    nextBody = frontmatter.body.replace(/^slug:\s*.*$/m, line);
  } else {
    const titleLine = /^title:\s*.*$/m;
    if (titleLine.test(frontmatter.body)) {
      nextBody = frontmatter.body.replace(titleLine, (match) => `${match}\n${line}`);
    } else {
      nextBody = `${line}\n${frontmatter.body}`;
    }
  }

  return `---\n${nextBody}\n---\n${markdown.slice(frontmatter.end)}`;
}

function translateWithShortcut(title) {
  const shortcut = process.env.SLUG_TRANSLATE_SHORTCUT;
  if (!shortcut || process.platform !== "darwin") {
    return "";
  }

  const inputPath = path.join(
    os.tmpdir(),
    `worajedt-slug-title-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
  );

  fs.writeFileSync(inputPath, title, "utf8");

  try {
    const result = spawnSync(
      "shortcuts",
      ["run", shortcut, "--input-path", inputPath, "--output-type", "public.plain-text"],
      {
        encoding: "utf8",
        timeout: 30000,
      },
    );

    if (result.status !== 0) {
      throw new Error(
        `Shortcut "${shortcut}" failed: ${(result.stderr || result.stdout || "").trim()}`,
      );
    }

    return (result.stdout || "").trim();
  } finally {
    fs.rmSync(inputPath, { force: true });
  }
}

function translateWithCommand(title) {
  const command = process.env.SLUG_TRANSLATE_COMMAND;
  if (!command) {
    return "";
  }

  const result = spawnSync(command, {
    input: title,
    encoding: "utf8",
    shell: true,
    timeout: 30000,
  });

  if (result.status !== 0) {
    throw new Error(
      `SLUG_TRANSLATE_COMMAND failed: ${(result.stderr || result.stdout || "").trim()}`,
    );
  }

  return (result.stdout || "").trim();
}

async function translateTitle(title) {
  return translateWithShortcut(title) || translateWithCommand(title);
}

async function slugFromTitle(title) {
  const source = hasThai(title) ? await translateTitle(title) : title;
  const slug = slugify(source);

  if (!slug) {
    throw new Error(
      [
        `Could not generate an English slug for "${title}".`,
        "Set one manually with slug: \"english-kebab-case\" or configure macOS translation:",
        "- SLUG_TRANSLATE_SHORTCUT=\"Your macOS Shortcut Name\"",
        "Optional for tests or custom local translators:",
        "- SLUG_TRANSLATE_COMMAND=\"your-command\"",
      ].join("\n"),
    );
  }

  return slug;
}

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".md") && file !== "_index.md")
    .map((file) => path.join(dir, file));
}

async function ensurePostSlugs({ check = false, dryRun = false } = {}) {
  const updates = [];

  for (const filePath of listMarkdownFiles(BLOG_DIR)) {
    const markdown = fs.readFileSync(filePath, "utf8");
    const frontmatter = getFrontmatter(markdown);
    if (!frontmatter || hasUsableSlug(frontmatter.body)) {
      continue;
    }

    const title = getStringField(frontmatter.body, "title");
    if (!title || !hasThai(title)) {
      continue;
    }

    const slug = await slugFromTitle(title);
    updates.push({ filePath, slug, title });

    if (!check && !dryRun) {
      fs.writeFileSync(filePath, setSlug(markdown, frontmatter, slug), "utf8");
    }
  }

  for (const update of updates) {
    const relative = path.relative(process.cwd(), update.filePath);
    const action = check || dryRun ? "would set" : "set";
    console.log(`${action} slug "${update.slug}" in ${relative}`);
  }

  if (check && updates.length > 0) {
    throw new Error("Some blog posts need generated slugs. Run npm run slugs.");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.title) {
    console.log(await slugFromTitle(args.title));
    return;
  }

  await ensurePostSlugs(args);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
