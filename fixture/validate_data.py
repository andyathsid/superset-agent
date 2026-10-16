#!/usr/bin/env python3
"""Validate generated Superset MCP security-test data and its invariants."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import Counter
from collections.abc import Iterator
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

try:
    from .generate_data import CSV_COLUMNS, PROMPT_INJECTION_MARKER, SCHEMA_VERSION
except ImportError:
    from generate_data import CSV_COLUMNS, PROMPT_INJECTION_MARKER, SCHEMA_VERSION


def _rows(path: Path) -> Iterator[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        yield from csv.DictReader(handle)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _check_manifest(data_dir: Path, manifest: dict[str, object]) -> None:
    if manifest.get("schema_version") != SCHEMA_VERSION:
        raise ValueError(
            f"Unsupported schema version {manifest.get('schema_version')!r}; "
            f"expected {SCHEMA_VERSION}"
        )
    if manifest.get("synthetic_data_only") is not True:
        raise ValueError("Manifest must identify the fixture as synthetic data")

    files = manifest.get("files")
    if not isinstance(files, dict) or set(files) != set(CSV_COLUMNS):
        raise ValueError("Manifest file list does not match the fixture schema")

    for name, expected_columns in CSV_COLUMNS.items():
        metadata = files[name]
        if not isinstance(metadata, dict):
            raise ValueError(f"Invalid metadata for {name}")
        path = data_dir / name
        if not path.is_file():
            raise FileNotFoundError(path)
        with path.open(encoding="utf-8", newline="") as handle:
            reader = csv.reader(handle)
            actual_columns = tuple(next(reader))
            row_count = sum(1 for _ in reader)
        if actual_columns != expected_columns:
            raise ValueError(f"Unexpected columns in {name}: {actual_columns}")
        if row_count != metadata.get("rows"):
            raise ValueError(f"Row-count mismatch in {name}")
        if path.stat().st_size != metadata.get("bytes"):
            raise ValueError(f"Byte-size mismatch in {name}")
        if _sha256(path) != metadata.get("sha256"):
            raise ValueError(f"SHA-256 mismatch in {name}")


def _check_relations(data_dir: Path, expected: dict[str, object]) -> dict[str, object]:
    regions = {row["region_code"] for row in _rows(data_dir / "regions.csv")}
    if regions != {"NA", "EMEA", "APAC", "LATAM"}:
        raise ValueError(f"Unexpected region set: {sorted(regions)}")

    products = {
        row["product_id"]: (Decimal(row["unit_price"]), Decimal(row["unit_cost"]))
        for row in _rows(data_dir / "products.csv")
    }
    customers = {
        row["customer_id"]: (row["tenant_id"], row["region_code"])
        for row in _rows(data_dir / "customers.csv")
    }
    if not products or not customers:
        raise ValueError("Product and customer dimensions must not be empty")

    order_tenants: Counter[str] = Counter()
    order_regions: Counter[str] = Counter()
    gross_total = Decimal(0)
    net_total = Decimal(0)
    profit_total = Decimal(0)
    for row in _rows(data_dir / "orders.csv"):
        customer_scope = customers.get(row["customer_id"])
        if customer_scope != (row["tenant_id"], row["region_code"]):
            raise ValueError(f"Order scope mismatch for {row['order_id']}")
        if row["product_id"] not in products:
            raise ValueError(f"Unknown product on {row['order_id']}")
        quantity = int(row["quantity"])
        unit_price = Decimal(row["unit_price"])
        discount_pct = Decimal(row["discount_pct"])
        gross = Decimal(row["gross_amount"])
        net = Decimal(row["net_amount"])
        cost = Decimal(row["cost_amount"])
        profit = Decimal(row["profit_amount"])
        if gross != unit_price * quantity:
            raise ValueError(f"Gross amount mismatch for {row['order_id']}")
        discount = (gross * discount_pct / 100).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        calculated_net = gross - discount
        if net != calculated_net:
            raise ValueError(f"Net amount mismatch for {row['order_id']}")
        if profit != net - cost:
            raise ValueError(f"Profit amount mismatch for {row['order_id']}")
        order_tenants[row["tenant_id"]] += 1
        order_regions[row["region_code"]] += 1
        gross_total += gross
        net_total += net
        profit_total += profit

    if dict(sorted(order_tenants.items())) != expected["order_counts_by_tenant"]:
        raise ValueError("Order tenant counts differ from the manifest")
    if dict(sorted(order_regions.items())) != expected["order_counts_by_region"]:
        raise ValueError("Order region counts differ from the manifest")
    if f"{gross_total:.2f}" != expected["order_gross_amount"]:
        raise ValueError("Order gross total differs from the manifest")
    if f"{net_total:.2f}" != expected["order_net_amount"]:
        raise ValueError("Order net total differs from the manifest")
    if f"{profit_total:.2f}" != expected["order_profit_amount"]:
        raise ValueError("Order profit total differs from the manifest")

    marker_ids: list[str] = []
    max_description_bytes = 0
    ticket_tenants: Counter[str] = Counter()
    ticket_regions: Counter[str] = Counter()
    for row in _rows(data_dir / "support_tickets.csv"):
        if row["customer_id"] not in customers:
            raise ValueError(f"Unknown customer on {row['ticket_id']}")
        contains_marker = row["contains_untrusted_marker"] == "true"
        marker_present = PROMPT_INJECTION_MARKER in row["description"]
        if contains_marker != marker_present:
            raise ValueError(f"Marker flag mismatch for {row['ticket_id']}")
        if contains_marker:
            marker_ids.append(row["ticket_id"])
        max_description_bytes = max(
            max_description_bytes, len(row["description"].encode("utf-8"))
        )
        ticket_tenants[row["tenant_id"]] += 1
        ticket_regions[row["region_code"]] += 1
    if marker_ids != expected["untrusted_marker_ticket_ids"]:
        raise ValueError("Prompt-injection marker IDs differ from the manifest")
    if max_description_bytes < 900:
        raise ValueError("Ticket descriptions are too small for response-size testing")
    if dict(sorted(ticket_tenants.items())) != expected["ticket_counts_by_tenant"]:
        raise ValueError("Ticket tenant counts differ from the manifest")
    if dict(sorted(ticket_regions.items())) != expected["ticket_counts_by_region"]:
        raise ValueError("Ticket region counts differ from the manifest")

    for row in _rows(data_dir / "payroll.csv"):
        if not row["work_email"].endswith("@corp.example.test"):
            raise ValueError(f"Non-test payroll email in {row['employee_id']}")
        if not row["bank_account_token"].startswith("TEST-BANK-"):
            raise ValueError(f"Non-test bank token in {row['employee_id']}")
        if not row["tax_identifier"].startswith("TEST-TAX-"):
            raise ValueError(f"Non-test tax identifier in {row['employee_id']}")

    for row in _rows(data_dir / "access_audit.csv"):
        if not row["source_ip"].startswith("192.0.2."):
            raise ValueError(f"Non-documentation IP in {row['event_id']}")

    return {
        "orders": sum(order_tenants.values()),
        "tickets": sum(ticket_tenants.values()),
        "largest_ticket_description_bytes": max_description_bytes,
        "untrusted_marker_tickets": len(marker_ids),
    }


def validate(data_dir: Path) -> dict[str, object]:
    manifest_path = data_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    _check_manifest(data_dir, manifest)
    expected = manifest.get("expected")
    if not isinstance(expected, dict):
        raise ValueError("Manifest expected-results section is missing")
    summary = _check_relations(data_dir, expected)
    return {
        "valid": True,
        "size": manifest["size"],
        "seed": manifest["seed"],
        **summary,
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "data_dir",
        nargs="?",
        type=Path,
        default=Path(__file__).resolve().parent / "generated",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    print(json.dumps(validate(args.data_dir), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
