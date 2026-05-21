---
name: using-git-worktrees
description: Use when tasked with creating a new git worktree, building features in isolation, setting up parallel branches, or provisioning a safe sandbox environment to test architectural changes.
---

# Using Git Worktrees (Worktrunk)

## Overview
Git worktrees allow you to check out multiple branches of a repository simultaneously without cloning the entire repository from scratch. However, creating worktrees in nested subdirectories breaks relative path resolutions to peer monorepo packages. We use **Worktrunk** (`git-wt`) to automatically provision sibling worktrees and handle environment setup.

## When to Use
- When asked to create an isolated environment for a feature or branch.
- When you need a safe sandbox to test destructive or complex architectural changes.
- When working on multiple GitHub issues in parallel.

## Core Directives

### 1. NEVER Nest Worktrees
If you create a worktree inside a subdirectory of the current repo (e.g., `.agents/worktrees/feature`), all relative paths going UP and OUT of the repository (like `../../wwv-data-engine`) will immediately break due to the altered directory depth. 

**Worktrees MUST be siblings of the main repository root.**

### 2. ALWAYS Use Worktrunk
Do not use raw `git worktree add`. Always use the `git-wt` alias provided by Worktrunk. It is pre-configured via `.config/wt.toml` to:
- Automatically place the worktree in the correct sibling path.
- Automatically run `pnpm install`.
- Automatically copy `.env` files so the environment works immediately.

> [!IMPORTANT]
> **For AI Agents:** You MUST append the `--yes` flag when creating worktrees to bypass the interactive approval prompt for these hooks, otherwise the command will fail in your non-interactive shell.

### 3. Database Lifecycle & Port Assignment
Each worktree gets a deterministic PostgreSQL port assigned automatically based on its directory hash (to avoid collisions between multiple running worktrees).

> [!CAUTION]
> **Orphaned Volumes:** You MUST use `git-wt remove` to delete worktrees. This triggers a `pre-remove` hook that cleanly tears down the Docker database. If you manually delete the folder (`rm -rf`), the Docker volume is orphaned. If this happens, run `pnpm run db:prune` in the main repository to garbage collect orphaned database volumes.

## Quick Reference

| Action | Command | Details |
| :--- | :--- | :--- |
| **Create Worktree** | `git-wt switch --create <branch> --yes` | Provisions the sibling directory, branch, env files, and dependencies. |
| **Delete Worktree** | `git-wt remove` | Deletes the worktree and the associated branch cleanly. Run from within the worktree. |

## Implementation Steps

1. Run the create command from the main repository (always include `--yes`):
   ```bash
   git-wt switch --create feature/my-new-idea --yes
   ```
2. **CRITICAL:** Change your working directory to the newly created worktree before editing files. Worktrunk creates it as a sibling.
   ```bash
   # Example if the main repo is c:\dev\worldwideview
   cd ../worldwideview.feature-my-new-idea
   ```
3. Do your work, run tests, and commit.
4. When completely finished and merged, clean up by running `git-wt remove` from inside the worktree directory.

## Common Mistakes & Red Flags

| Excuse / Rationalization | Reality & Fix |
| :--- | :--- |
| "I'll just put the worktree in `.agents/worktrees` to keep the project folder clean." | **Red Flag:** This breaks relative paths to other monorepo packages. Delete the worktree and use `git-wt` to create a sibling worktree instead. |
| "I'll use `git worktree add` instead of `git-wt` because it's standard." | **Red Flag:** Raw git won't copy `.env` files or run the `pre-start` hooks for `pnpm install`, leaving you with a broken environment. Delete and use `git-wt`. |
| "I ran the command, but my file edits are applying to the main branch." | You forgot to `cd` into the newly created sibling directory. |
