#!/usr/bin/env python3
# =========================================================
# ARCHIE UNIVERSAL LEXICON ENGINE — OEWN DATASET BUILDER
#
# Builds the ingestion dataset (entries-*.json + per-lexfile
# synset jsons + frames.json) from an Open English WordNet
# repository checkout. The official OEWN release json assets
# are a verbatim JSON serialization of the YAML sources in
# src/yaml/ — same keys, same values, same file partitioning.
# This script reproduces that format exactly, so a dataset
# can be built from ANY commit of the OEWN repository (not
# just tagged releases).
#
#   python3 scripts/lexicon/build-oewn-dataset.py \
#       --oewn-dir /path/to/english-wordnet \
#       --out-dir /tmp/oewn-dataset
#
# Validated before first use (2026-09-17): the output built
# from the 2025-edition tag was compared, file by file and
# key by key, against the official english-wordnet-2025-json
# release asset — all 73 files structurally IDENTICAL
# (verbatim serialization; sourced example objects preserved
# as {"text", "source"} pairs; homograph pos keys like
# "n-1"/"n-2" preserved; pronunciation varieties preserved).
#
# Requirements: pyyaml (with the C loader for speed).
# =========================================================

import argparse
import glob
import json
import os
import sys

try:
    from yaml import CLoader as Loader
except ImportError:  # pragma: no cover — C loader is standard with pyyaml wheels
    from yaml import Loader

import yaml


def load_yaml(path):
    with open(path, encoding="utf-8") as f:
        return yaml.load(f, Loader=Loader)


def main():
    ap = argparse.ArgumentParser(
        description="Build the ARCHIE lexicon ingestion dataset "
                    "(official OEWN release json format) from an "
                    "OEWN repository checkout.")
    ap.add_argument("--oewn-dir", required=True,
                    help="path to an english-wordnet checkout "
                         "(defaults to its main branch state; use git "
                         "to pin the commit first and record it in the "
                         "provenance notes)")
    ap.add_argument("--out-dir", required=True,
                    help="directory to write the json dataset into")
    args = ap.parse_args()

    yaml_dir = os.path.join(args.oewn_dir, "src", "yaml")
    if not os.path.isdir(yaml_dir):
        sys.exit(f"No src/yaml directory under {args.oewn_dir} — "
                 "is this an english-wordnet checkout?")
    os.makedirs(args.out_dir, exist_ok=True)

    files = sorted(glob.glob(os.path.join(yaml_dir, "*.yaml")))
    if not files:
        sys.exit(f"No yaml sources found in {yaml_dir}")

    written = 0
    for src in files:
        base = os.path.basename(src)[:-5]  # strip .yaml
        data = load_yaml(src)
        out = os.path.join(args.out_dir, base + ".json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        written += 1

    print(f"Wrote {written} json files to {args.out_dir}")
    print("Next: npx tsx scripts/lexicon/ingest-oewn.ts "
          f"--dataset-dir {args.out_dir} --dry-run")


if __name__ == "__main__":
    main()
