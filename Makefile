# openwa-oci-infra — operator entry points.
# Thin wrappers over scripts/ (the scripts stay authoritative).
#
#   make                # this help
#   make check          # lint + IaC fmt  (what CI runs)
#   make dev-up         # isolated dev worktree+branch (scripts/dev-env)
#   make local-up       # free workstation docker stack, for testing before deploy

.DEFAULT_GOAL := help

# ── local dev stack (free, workstation) ───────────────────────────────────────
LOCAL_PROJECT  ?= owa-local
LOCAL_ENGINE   ?= whatsapp-web.js
LOCAL_PORT     ?= 2785
LOCAL_PROBE_SAMPLES ?= 15
LOCAL_COMPOSE   = docker compose -p $(LOCAL_PROJECT) \
                  -f local/docker-compose.local.yml --env-file local/.env.local

.PHONY: help check lint fmt fmt-check bootstrap doctor deploy deploy-env launch \
        deicon sidecar-start sidecar-login sidecar-stop sidecar-status \
        tf-oci-init tf-oci-plan tf-oci-apply tf-cf-init tf-cf-plan tf-cf-apply \
        tf-aws-init tf-aws-plan tf-aws-apply tf-aws-destroy aws-ssh \
        dev-up dev-down dev-shell dev-path \
        local-up local-down local-ps local-logs local-probe local-env-force \
        pack graph graph-check

help: ## Show this help
	@awk -F ':.*## ' '/^[a-zA-Z0-9_-]+:.*## / { printf "  %-16s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

check: lint fmt-check bootstrap-tests ## Everything CI verifies (shellcheck + tofu fmt -check + bootstrap tests)

lint: ## Lint every shell script (scripts/lint)
	scripts/lint

fmt-check: ## Verify terraform/ formatting
	@tofu fmt -check -recursive terraform/

fmt: ## Rewrite terraform/ formatting
	tofu fmt -recursive terraform/

hooks: ## Enable the git-flow hooks (.githooks) for this clone, see docs/git-flow.md
	scripts/flow hooks

bootstrap: ## Install the operator toolchain (tofu, oci, cloudflared, supabase, uvx)
	scripts/bootstrap.sh

doctor: ## Report toolchain status without changing anything
	scripts/bootstrap.sh --check

deploy: ## rsync OpenWA/ + stack/ → VM, build, up (default host: wafine-vm)
	scripts/deploy.sh

deploy-env: ## Same as deploy, also replacing the VM's stack/.env with the local one
	PUSH_ENV=1 scripts/deploy.sh

launch: ## Launch the A1 VM, retrying on "Out of host capacity" (delay: make launch DELAY=120)
	scripts/oci-a1-retry.sh $(DELAY)

deicon: ## Fix `bad object refs/Icon?` on git fetch/pull
	scripts/git-deicon

sidecar-start: ## Start the tailnet sidecar (reach a foreign tailnet via SOCKS5)
	scripts/tailnet-sidecar start

sidecar-login: ## Authenticate the sidecar to a foreign tailnet (browser flow)
	scripts/tailnet-sidecar login

sidecar-stop: ## Stop the tailnet sidecar
	scripts/tailnet-sidecar stop

sidecar-status: ## Sidecar state + tailnet
	scripts/tailnet-sidecar status

# ── dev worktree (isolated workspace, scripts/dev-env) ────────────────────────
dev-up: ## Create .claude/worktrees/dev on mo/dev-local-env (idempotent)
	scripts/dev-env up

dev-down: ## Remove the dev worktree (branch kept)
	scripts/dev-env down

dev-shell: ## Open a shell inside the dev worktree
	scripts/dev-env shell

dev-path: ## Print the dev worktree path
	scripts/dev-env path

# ── local dev stack (free, workstation) ───────────────────────────────────────
local-env-force: ## Regenerate local/.env.local secrets (locks out previous keys)
	local/gen-env.sh --force

local/.env.local: ## Generate local/.env.local secrets once (via local/gen-env.sh)
	local/gen-env.sh

local-up: local/.env.local ## Build + start the local OpenWA stack (127.0.0.1:<port>)
	OPENWA_ENGINE=$(LOCAL_ENGINE) API_PORT=$(LOCAL_PORT) $(LOCAL_COMPOSE) up -d --build

local-down: ## Stop and remove the local stack
	$(LOCAL_COMPOSE) down

local-ps: ## Show the local stack's containers
	$(LOCAL_COMPOSE) ps

local-logs: ## Follow the local stack's logs
	$(LOCAL_COMPOSE) logs -f openwa

local-probe: ## Measure memory vs the free t4g.small verdict (needs a linked session)
	./local/probe-memory.sh $(LOCAL_PROJECT) $(LOCAL_PROBE_SAMPLES)

# ── IaC: OCI (production) ─────────────────────────────────────────────────────
tf-oci-init: ## OpenTofu init, terraform/oci (always through scripts/tf)
	scripts/tf oci init

tf-oci-plan: ## OpenTofu plan, terraform/oci
	scripts/tf oci plan

tf-oci-apply: ## OpenTofu apply, terraform/oci (ask the owner first: changes live infra)
	scripts/tf oci apply

# ── IaC: Cloudflare (phase 2 edge) ────────────────────────────────────────────
tf-cf-init: ## OpenTofu init, terraform/cloudflare
	scripts/tf cloudflare init

tf-cf-plan: ## OpenTofu plan, terraform/cloudflare
	scripts/tf cloudflare plan

tf-cf-apply: ## OpenTofu apply, terraform/cloudflare (ask the owner first: changes live infra)
	scripts/tf cloudflare apply

# ── IaC: AWS staging (billed dev host, owner-approved) ────────────────────────
tf-aws-init: ## OpenTofu init, terraform/aws
	scripts/tf aws init

tf-aws-plan: ## OpenTofu plan, terraform/aws
	scripts/tf aws plan

tf-aws-apply: ## OpenTofu apply, terraform/aws (ask the owner first: changes live infra)
	scripts/tf aws apply

tf-aws-destroy: ## OpenTofu destroy, terraform/aws (ask first — stops the billing)
	scripts/tf aws destroy

aws-ssh: ## SSM Session Manager shell into the staging host (no key, no open port)
	@aws ssm start-session --target "$$(scripts/tf aws output -raw instance_id)"

.PHONY: bootstrap-tests
bootstrap-tests:
	scripts/bootstrap/test/run-bootstrap-tests.sh

launch-check-syntax: ## Syntax check for launch-check.sh
	@bash -n scripts/launch-check.sh

# Hits live hosts, so it stays out of `check` (hermetic CI); `make lint` already covers its syntax.
.PHONY: go-live-check
go-live-check: ## HTTP smoke test of a deployment: WEB_URL=… API_URL=… [DOCS_URL=…] make go-live-check
	@scripts/go-live-check

# ── agent tooling (repomix context pack, graft code graph) ────────────────────
pack: ## Pack the repo into context/wafine-context.md (one-shot context for a fresh model)
	repomix

graph: ## Rebuild the graft code graph (graft/, gitignored local cache)
	graft build

graph-check: ## Fail if the graft graph is stale (graft check)
	graft check
