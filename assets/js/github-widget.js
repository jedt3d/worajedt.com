(function () {
  "use strict";

  const root = document.querySelector("[data-github-widget]");
  if (!root || !window.fetch) {
    return;
  }

  const username = root.getAttribute("data-github-user") || "jedt3d";
  const apiBase = "https://api.github.com";
  const numberFormat = new Intl.NumberFormat("en");
  const dateFormat = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const escapeHtml = (value) =>
    String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const setText = (selector, value) => {
    const element = root.querySelector(selector);
    if (element) {
      element.textContent = value;
    }
  };

  const fetchJson = async (url) => {
    const response = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) {
      throw new Error(`GitHub API ${response.status}`);
    }
    return response.json();
  };

  const fetchJsonPages = async (path, maxPages = 3) => {
    const results = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const separator = path.includes("?") ? "&" : "?";
      const rows = await fetchJson(`${apiBase}${path}${separator}per_page=100&page=${page}`);
      if (!Array.isArray(rows)) return results;
      results.push(...rows);
      if (rows.length < 100) break;
    }
    return results;
  };

  const formatAgo = (dateText) => {
    const then = new Date(dateText).getTime();
    const diff = Math.max(0, Date.now() - then);
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "today";
    if (days === 1) return "1 day ago";
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    if (months === 1) return "1 month ago";
    if (months < 12) return `${months} months ago`;
    const years = Math.floor(months / 12);
    return years === 1 ? "1 year ago" : `${years} years ago`;
  };

  const renderStats = (user) => {
    setText('[data-github-stat="repos"]', numberFormat.format(user.public_repos || 0));
    setText('[data-github-stat="gists"]', numberFormat.format(user.public_gists || 0));
    setText('[data-github-stat="followers"]', numberFormat.format(user.followers || 0));
    setText('[data-github-stat="since"]', new Date(user.created_at).getFullYear());
  };

  const renderRepos = (repos) => {
    const container = root.querySelector("[data-github-repos]");
    if (!container) return;

    const selected = repos
      .filter((repo) => !repo.archived)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 3);

    container.innerHTML = selected
      .map((repo) => {
        const language = repo.language || "mixed";
        return `
          <a class="github-repo-row" href="${escapeHtml(repo.html_url)}" target="_blank" rel="noopener">
            <span>
              <strong>${escapeHtml(repo.name)}</strong>
              <small class="github-repo-meta">
                ${escapeHtml(language)} | ${numberFormat.format(repo.stargazers_count || 0)} stars | ${numberFormat.format(repo.forks_count || 0)} forks | updated ${formatAgo(repo.updated_at)}
              </small>
            </span>
            <em>${escapeHtml(language)}</em>
          </a>
        `;
      })
      .join("");
  };

  const renderLanguages = (repos) => {
    const container = root.querySelector("[data-github-languages]");
    if (!container) return;

    const counts = repos.reduce((acc, repo) => {
      const language = repo.language || "Docs";
      acc[language] = (acc[language] || 0) + 1;
      return acc;
    }, {});

    const entries = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const total = entries.reduce((sum, entry) => sum + entry[1], 0) || 1;

    container.innerHTML = entries
      .map(([language, count]) => {
        const percent = Math.max(8, Math.round((count / total) * 100));
        return `
          <div class="github-language-row">
            <span>${escapeHtml(language)} <small>${count}</small></span>
            <b style="--value:${percent}%"></b>
          </div>
        `;
      })
      .join("");
  };

  const eventLabels = {
    CommitCommentEvent: "commit comments",
    CreateEvent: "branches/tags",
    DeleteEvent: "deletes",
    ForkEvent: "forks",
    GollumEvent: "wiki edits",
    IssueCommentEvent: "issue comments",
    IssuesEvent: "issues",
    MemberEvent: "collaboration",
    PublicEvent: "public repos",
    PullRequestEvent: "pull requests",
    PullRequestReviewCommentEvent: "PR comments",
    PullRequestReviewEvent: "PR reviews",
    PushEvent: "pushes",
    ReleaseEvent: "releases",
    WatchEvent: "stars",
  };

  const renderEventMix = (events) => {
    const container = root.querySelector("[data-github-events]");
    if (!container || !events.length) return;

    const counts = events.reduce((acc, event) => {
      const label = eventLabels[event.type] || event.type.replace(/Event$/, "").toLowerCase();
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});

    const entries = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const total = events.length || 1;

    container.innerHTML = entries
      .map(([label, count]) => {
        const percent = Math.max(8, Math.round((count / total) * 100));
        return `
          <div class="github-event-row">
            <span>${escapeHtml(label)} <small>${numberFormat.format(count)}</small></span>
            <b style="--value:${percent}%"></b>
          </div>
        `;
      })
      .join("");
  };

  const dateKey = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const renderActivity = (events) => {
    const heatmap = root.querySelector("[data-github-activity]");
    const months = root.querySelector("[data-github-months]");
    if (!heatmap || !months) return;

    const weeks = 26;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay() - (weeks - 1) * 7);
    start.setHours(0, 0, 0, 0);

    const counts = events.reduce((acc, event) => {
      const created = new Date(event.created_at);
      created.setHours(0, 0, 0, 0);
      const key = dateKey(created);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const max = Math.max(1, ...Object.values(counts));
    const cells = [];
    const monthLabels = [];
    let previousMonth = "";

    for (let week = 0; week < weeks; week += 1) {
      const weekDate = new Date(start);
      weekDate.setDate(start.getDate() + week * 7);
      const month = weekDate.toLocaleString("en", { month: "short" });
      monthLabels.push(
        month !== previousMonth
          ? `<span style="grid-column:${week + 1}">${month}</span>`
          : "<span></span>",
      );
      previousMonth = month;

      for (let day = 0; day < 7; day += 1) {
        const date = new Date(start);
        date.setDate(start.getDate() + week * 7 + day);
        const key = dateKey(date);
        const count = counts[key] || 0;
        const isFuture = date > today;
        const level = isFuture ? 0 : count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
        const title = isFuture
          ? "future"
          : `${count} public events on ${dateFormat.format(date)}`;
        cells.push(
          `<span class="github-cell${isFuture ? " is-future" : ""}" data-count="${count}" data-level="${level}" title="${escapeHtml(title)}"></span>`,
        );
      }
    }

    months.style.setProperty("--github-weeks", weeks);
    heatmap.style.setProperty("--github-weeks", weeks);
    months.innerHTML = monthLabels.join("");
    heatmap.innerHTML = cells.join("");

    const summary = root.querySelector("[data-github-activity-summary]");
    if (summary) {
      const repoCount = new Set(events.map((event) => event.repo && event.repo.name).filter(Boolean)).size;
      summary.textContent = `${numberFormat.format(events.length)} public account events across ${numberFormat.format(repoCount)} repos`;
    }
  };

  const renderGitHub = async () => {
    const status = root.querySelector("[data-github-status]");
    try {
      const [user, repos, events] = await Promise.all([
        fetchJson(`${apiBase}/users/${username}`),
        fetchJson(`${apiBase}/users/${username}/repos?sort=updated&per_page=100`),
        fetchJsonPages(`/users/${username}/events/public`),
      ]);

      renderStats(user);
      renderRepos(repos);
      renderLanguages(repos);
      renderActivity(events);
      renderEventMix(events);

      if (status) {
        status.textContent = `online - synced from GitHub public API at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        status.setAttribute("data-state", "online");
      }
    } catch (error) {
      renderActivity([]);
      if (status) {
        status.textContent = "offline - showing curated fallback snapshot";
        status.setAttribute("data-state", "offline");
      }
    }
  };

  renderActivity([]);
  renderGitHub();
})();
