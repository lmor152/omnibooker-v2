# syntax=docker/dockerfile:1.7

FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --upgrade pip

COPY applications/backend /app/applications/backend
COPY applications/worker /app/applications/worker

RUN pip install --no-cache-dir -e ./applications/backend -e ./applications/worker

ENV PYTHONPATH="/app/applications/backend/src:/app/applications/worker/src:${PYTHONPATH}"
EXPOSE 8000

CMD ["uvicorn", "omnibooker_backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
