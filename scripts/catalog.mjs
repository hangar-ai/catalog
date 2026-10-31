#!/usr/bin/env node
// index.json, the list Hangar's gallery reads, rebuilt from the kits themselves.
//
//   node scripts/catalog.mjs build [--local <folder>]     write index.json from sources.json
//   node scripts/catalog.mjs check [--local <folder>]     exit 1 when anything is out of step
//   node scripts/catalog.mjs add <owner/repo> <tag> [--local <folder>]
//
// sources.json is what people edit: a repository, the tag it is pinned to, and the commit that tag
// pointed at when it was reviewed. Everything else in an entry comes from the kit's hangar-kit.json
// at that tag. A tag can be moved by whoever owns the repository, so `check` also fails when one no
// longer points at the reviewed commit.
//
// --local reads the kits from git repositories in that folder (<folder>/<repo name>) instead of GitHub.
// No dependency: Node alone.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = path.join(root, "sources.json");
const INDEX = path.join(root, "index.json");
const ORG = "hangar-ai";

// What Hangar's gallery takes.
const MAX_BYTES = 256 * 1024;
const MAX_KITS = 200;
const MAX_TAGS = 8;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

function option(name) {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : undefined;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

const parseManifest = (text, where) => {
  try {
    return JSON.parse(text.replace(/^﻿/, ""));
  } catch (error) {
    throw new Error(`${where}: not valid JSON (${error.message})`);
  }
};

async function kitAt({ repo, tag }, local) {
  const where = `${repo} at ${tag}`;
  if (local) {
    const folder = path.join(local, repo.split("/")[1]);
    try {
      return {
        manifest: parseManifest(git("-C", folder, "show", `${tag}:hangar-kit.json`), where),
        commit: git("-C", folder, "rev-parse", `${tag}^{commit}`),
      };
    } catch (error) {
      if (error.message.includes("not valid JSON")) throw error;
      throw new Error(`${where}: not found in ${folder}`);
    }
  }
  const url = `https://raw.githubusercontent.com/${repo}/${tag}/hangar-kit.json`;
  const answer = await fetch(url);
  if (!answer.ok) throw new Error(`${where}: ${url} answered ${answer.status}`);
  const refs = git("ls-remote", `https://github.com/${repo}.git`, `refs/tags/${tag}`, `refs/tags/${tag}^{}`).split("\n").map((line) => line.split(/\s+/));
  const peeled = refs.find(([, name]) => name.endsWith("^{}")) ?? refs[0];
  if (!peeled?.[0]) throw new Error(`${where}: no such tag`);
  return { manifest: parseManifest(await answer.text(), where), commit: peeled[0] };
}

function sourceProblems(source) {
  const problems = [];
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(source.repo ?? "")) problems.push(`repo ${JSON.stringify(source.repo)} must be owner/name`);
  if (!/^v\d+\.\d+\.\d+/.test(source.tag ?? "")) problems.push(`${source.repo}: tag ${JSON.stringify(source.tag)} must be a version tag like v0.1.0, never a branch`);
  return problems;
}

function entryOf(source, manifest) {
  const at = `${source.repo} at ${source.tag}`;
  const { id, name, description, version, gallery } = manifest;
  const problems = [];
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(id)) problems.push(`${at}: id ${JSON.stringify(id)}`);
  for (const [key, value] of Object.entries({ name, description })) if (typeof value !== "string" || !value.trim()) problems.push(`${at}: ${key} is missing`);
  if (typeof version !== "string" || !SEMVER.test(version)) problems.push(`${at}: version ${JSON.stringify(version)} is not semver`);
  if (source.tag !== `v${version}`) problems.push(`${at}: the tag must be v and the manifest's version, and the manifest says ${version}`);
  if (typeof gallery?.permissionsSummary !== "string" || !gallery.permissionsSummary.trim()) problems.push(`${at}: gallery.permissionsSummary is missing`);
  // Past these lengths Hangar's gallery drops the entry, or the sentence on the card.
  for (const [key, value, max] of [["name", name, 80], ["description", description, 400], ["gallery.permissionsSummary", gallery?.permissionsSummary, 300]]) {
    if (typeof value === "string" && [...value.trim()].length > max) problems.push(`${at}: ${key} is past ${max} characters`);
  }
  const tags = gallery?.tags;
  if (!Array.isArray(tags) || !tags.length || tags.length > MAX_TAGS || tags.some((tag) => typeof tag !== "string" || !tag.trim() || [...tag.trim()].length > 24)) problems.push(`${at}: gallery.tags must hold 1 to ${MAX_TAGS} words of 24 characters at most`);
  if (problems.length) return { problems };
  return {
    problems,
    entry: {
      id,
      name: name.trim(),
      description: description.trim(),
      repo: source.repo,
      tag: source.tag,
      version,
      permissionsSummary: gallery.permissionsSummary.trim(),
      tags: tags.map((tag) => tag.trim()),
      // Only what the org maintains. A community kit stays unverified, however good.
      verified: source.repo.split("/")[0] === ORG,
    },
  };
}

function render(entries) {
  const lines = entries.map((entry) => {
    const fields = Object.entries(entry).map(([key, value]) => {
      const json = Array.isArray(value) ? `[${value.map((item) => JSON.stringify(item)).join(", ")}]` : JSON.stringify(value);
      return `      ${JSON.stringify(key)}: ${json}`;
    });
    return `    {\n${fields.join(",\n")}\n    }`;
  });
  return `{\n  "schema": 2,\n  "kits": [\n${lines.join(",\n")}\n  ]\n}\n`;
}

async function buildAll(sources, local) {
  const problems = [];
  const entries = [];
  const commits = new Map();
  for (const source of sources) {
    const shape = sourceProblems(source);
    if (shape.length) {
      problems.push(...shape);
      continue;
    }
    try {
      const { manifest, commit } = await kitAt(source, local);
      commits.set(source.repo, commit);
      const made = entryOf(source, manifest);
      problems.push(...made.problems);
      if (made.entry) entries.push(made.entry);
    } catch (error) {
      problems.push(error.message);
    }
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  for (let at = 1; at < entries.length; at++) if (entries[at].id === entries[at - 1].id) problems.push(`id ${entries[at].id} is listed twice`);
  if (entries.length > MAX_KITS) problems.push(`${MAX_KITS} kits at most`);
  return { problems, entries, commits };
}

const readSources = () => JSON.parse(fs.readFileSync(SOURCES, "utf8")).kits;
function writeSources(kits) {
  const sorted = [...kits].sort((a, b) => a.repo.localeCompare(b.repo));
  fs.writeFileSync(SOURCES, `${JSON.stringify({ kits: sorted }, null, 2)}\n`);
}

function stop(problems) {
  for (const problem of problems) console.error(`catalog: ${problem}`);
  process.exit(1);
}

async function main() {
  const command = process.argv[2];
  const local = option("--local") && path.resolve(option("--local"));

  if (command === "add") {
    const [repo, tag] = process.argv.slice(3);
    const shape = sourceProblems({ repo, tag });
    if (shape.length) stop(shape);
    const { commit } = await kitAt({ repo, tag }, local);
    writeSources([...readSources().filter((source) => source.repo !== repo), { repo, tag, commit }]);
    console.log(`catalog: ${repo} pinned to ${tag} (${commit.slice(0, 10)})`);
  }

  if (command === "build" || command === "add") {
    const sources = readSources();
    const { problems, entries, commits } = await buildAll(sources, local);
    if (problems.length) stop(problems);
    writeSources(sources.map((source) => ({ ...source, commit: source.commit ?? commits.get(source.repo) })));
    fs.writeFileSync(INDEX, render(entries));
    console.log(`catalog: index.json written (${entries.length} kit(s))`);
    return;
  }

  if (command === "check") {
    const sources = readSources();
    const { problems, entries, commits } = await buildAll(sources, local);
    for (const source of sources) {
      const now = commits.get(source.repo);
      if (now && source.commit !== now) problems.push(`${source.repo}: the tag ${source.tag} moved: it was reviewed at ${source.commit}, and points at ${now}`);
    }
    const current = fs.existsSync(INDEX) ? fs.readFileSync(INDEX, "utf8").replace(/\r\n/g, "\n") : "";
    if (!problems.length && current !== render(entries)) problems.push("index.json is out of step with sources.json and the kits: run `node scripts/catalog.mjs build` and commit it");
    if (Buffer.byteLength(current) > MAX_BYTES) problems.push(`index.json is past the ${MAX_BYTES} bytes Hangar reads`);
    if (problems.length) stop(problems);
    console.log(`catalog: ${entries.length} kit(s) in step with their tags`);
    return;
  }

  console.error("usage: node scripts/catalog.mjs build|check [--local <folder>] | add <owner/repo> <tag> [--local <folder>]");
  process.exit(2);
}

await main();
