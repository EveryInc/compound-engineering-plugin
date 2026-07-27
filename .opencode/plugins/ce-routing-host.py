#!/usr/bin/env python3
"""Package-private native OpenCode bridge to canonical routing semantics."""

import argparse
import importlib.util
import os
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
RESOLVER = ROOT / "scripts" / "routing" / "config-resolver.py"


def load_resolver():
    spec = importlib.util.spec_from_file_location("ce_routing_canonical", RESOLVER)
    if spec is None or spec.loader is None:
        raise RuntimeError("canonical routing resolver is unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("--request-file")
    args = parser.parse_args()
    resolver = load_resolver()
    exit_code = 0
    try:
        resolver.require_runtime()
        schema = resolver.load_json_asset("settings-schema.json", "ce-routing-schema.json")
        roles = resolver.validate_role_catalog(
            resolver.load_json_asset("dispatch-roles.json", "dispatch-roles.json")
        )
        request = resolver.parse_request(schema["limits"]["request_bytes"], args.request_file)
        if request.get("op") != "opencode_host":
            raise resolver.RoutingError(
                "REQUEST_INVALID",
                "native OpenCode wrapper accepts only host operations",
                exit_code=2,
            )
        response, exit_code = resolver.opencode_host_op(request, schema, roles)
    except resolver.RoutingError as exc:
        response = exc.response()
        exit_code = exc.exit_code
    except BaseException:
        response = {
            "ok": False,
            "protocol": resolver.PROTOCOL,
            "error": {"code": "INTERNAL", "message": "unexpected native OpenCode routing failure"},
        }
        exit_code = 70
    sys.stdout.write(resolver.canonical_json(response) + "\n")
    return exit_code


if __name__ == "__main__":
    os.umask(0o077)
    raise SystemExit(main())
