

ifneq (,$(wildcard ./.env))
	include ./.env
	export
endif

ifneq (,$(wildcard ./.env.local))
	include ./.env.local
	export
endif

install-python:
	uv sync --all-packages

install-node:
	cd applications/frontend && pnpm install

migrate:
	uv run --project applications/backend -- python -m omnibooker_backend.migrate

# Demo sessions and bookings in a LOCAL database (log in once first). ARGS=--reset to recreate.
seed-dev:
	uv run --project applications/backend -- python -m omnibooker_backend.dev_seed $(ARGS)

run-backend: migrate
	uv run --project applications/backend -- uvicorn omnibooker_backend.main:app

run-worker:
	uv run --project applications/worker -- python -m omnibooker_worker

run-frontend:
	cd applications/frontend && pnpm dev

run-database:
	docker compose up -d db