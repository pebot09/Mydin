#!/usr/bin/env python3
"""Mydin — app local de gestão financeira e de trabalho.

Uso:
    python run.py            # http://127.0.0.1:5000
    python run.py --port 8080
"""
import argparse

from mydin import create_app


def main():
    parser = argparse.ArgumentParser(description="Mydin — gestão financeira local")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    app = create_app()
    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()
