.DEFAULT_GOAL := help
SHELL := /usr/bin/env bash
.SHELLFLAGS := -euo pipefail -c

.PHONY: setup dev cf-dev build format format-check lint fix typecheck test e2e db-generate db-migrate deploy check docs-lint docs-link-check docs-check help

setup: ## Install dependencies (bun install)
	bun install

dev: ## Start local dev server (Next.js + Cloudflare bindings)
	bun run dev

cf-dev: ## Run Cloudflare Pages dev (wrangler)
	bun run cf:dev

build: ## Build for Cloudflare Pages (next-on-pages)
	bun run cf:build

format: ## Format code (biome)
	bun run fmt

format-check: ## Check formatting without changes (biome)
	bunx biome format .

lint: ## Lint (biome)
	bun run lint

fix: ## Auto-fix lint + format issues (biome)
	bun run fix

typecheck: ## TypeScript type check
	bunx tsc -p tsconfig.json --noEmit

test: ## Run unit tests (vitest)
	bun run test

e2e: ## Run end-to-end tests
	bun run e2e

db-generate: ## Generate Drizzle migrations from schema
	bun run db:generate

db-migrate: ## Apply migrations to local D1
	bun run db:migrate

deploy: build ## Build + deploy to Cloudflare Pages
	bunx wrangler pages deploy

check: lint typecheck test build ## Run all checks (lint + typecheck + tests + build)

docs-lint: ## Lint markdown files
	bunx markdownlint-cli2 "docs/**/*.md" "README.md"

docs-link-check: ## Check for broken relative links in markdown docs
	python scripts/check_markdown_links.py

docs-check: docs-lint docs-link-check ## Run all docs quality gates

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
