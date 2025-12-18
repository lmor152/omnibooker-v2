"""Entry point for running the backend with `python -m omnibooker_backend`."""

import uvicorn


def main() -> None:
    uvicorn.run(
        "omnibooker_backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )


if __name__ == "__main__":
    main()
