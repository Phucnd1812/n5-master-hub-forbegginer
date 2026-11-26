#!/usr/bin/env python3
"""Extract licensed sources into records for build.mjs. Inputs are local snapshots."""
import argparse
import gzip
import json
from pathlib import Path
import re
import unicodedata
import xml.etree.ElementTree as ET

COMMON = {"ichi1", "news1", "spec1", "spec2", "gai1"}
LANG = "{http://www.w3.org/XML/1998/namespace}lang"
KANJI = re.compile(r"[\u3400-\u9fff\U00020000-\U000323af]")
KANA = re.compile(r"[ぁ-ゖァ-ヺー]+\Z")


def xml(path, tag):
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        source = stream.read()
    source = source[re.search(r"<" + tag + r"(?:\s|>)", source).start():]
    return ET.fromstring(re.sub(r"&(?!amp;|quot;|apos;|lt;|gt;)([\w-]+);", r"\1", source))


def hira(value):
    return "".join(chr(ord(c) - 96) if "ァ" <= c <= "ヶ" else c for c in unicodedata.normalize("NFKC", value))


def values(element, path):
    return [node.text for node in element.findall(path) if node.text]


def senses_for(entry, written, reading):
    return [sense for sense in entry.findall("sense")
            if (not values(sense, "stagk") or written in values(sense, "stagk"))
            and (not values(sense, "stagr") or reading in values(sense, "stagr"))]


def readings_for(entry, written, reading):
    spellings = values(entry, "k_ele/keb")
    return [part for part in entry.findall("r_ele") if hira(part.findtext("reb", "")) == hira(reading)
            and (not values(part, "re_restr") or written in values(part, "re_restr"))
            and (written in spellings and part.find("re_nokanji") is None or written == reading)]


def group_for(tags, reading):
    groups = set()
    for tag in tags:
        if tag.startswith("v5"):
            groups.add("I")
        elif tag.startswith("v1"):
            groups.add("II")
        elif tag == "vk" or tag in {"vs-i", "vs-s"} and reading.endswith("する"):
            groups.add("III")
        elif tag in {"adj-i", "adj-ix"} and reading.endswith("い"):
            groups.add("i")
        elif tag == "adj-na":
            groups.add("na")
    if len(groups) == 1:
        return next(iter(groups))
    if "adj-na" in tags:
        return "adjn"
    for tag, display in [("n", "n"), ("n-pr", "proper"), ("pn", "pn"), ("adv", "adv"), ("vs", "nvs"),
                         ("exp", "exp"), ("adj-no", "adjno"), ("adj-pn", "adjpn"), ("conj", "conj"),
                         ("prt", "prt"), ("int", "int"), ("ctr", "ctr"), ("suf", "suf"), ("pref", "pref")]:
        if tag in tags:
            return display
    return "verb" if any(tag.startswith("v") for tag in tags) else "other"


def make_row(entry, written, reading, level, glosses, source=None):
    seq = int(entry.findtext("ent_seq")) if entry is not None else None
    suffix = ""
    base_written, base_reading = written, reading
    valid = entry is not None and bool(readings_for(entry, written, reading))
    if source and entry is not None and not valid:
        for ending, parts_of_speech in (("する", {"vs", "vs-s", "vs-i"}), ("と", {"adv-to"})):
            if not (written.endswith(ending) and reading.endswith(ending)):
                continue
            stem_written, stem_reading = written[:-len(ending)], reading[:-len(ending)]
            if readings_for(entry,stem_written,stem_reading) and any(
                parts_of_speech.intersection(values(sense,"pos"))
                for sense in senses_for(entry,stem_written,stem_reading)
            ):
                suffix = ending
                base_written,base_reading = stem_written,stem_reading
                valid = True
                break
    senses = senses_for(entry,base_written,base_reading) if valid else []
    tags = list(dict.fromkeys(tag for sense in senses for tag in values(sense, "pos")))
    # Keep only spellings known to carry that reading. Sense-restricted spellings
    # with a different primary POS are left as independent entries.
    aliases = []
    if valid:
        for candidate in values(entry, "k_ele/keb"):
            if candidate == base_written or not readings_for(entry,candidate,base_reading):
                continue
            candidate_tags = {tag for sense in senses_for(entry,candidate,base_reading) for tag in values(sense, "pos")}
            if set(tags) == candidate_tags:
                aliases.append(candidate+suffix)
    english = list(dict.fromkeys(g.text for sense in senses[:3]
                                 for g in sense.findall("gloss") if g.text and g.get(LANG, "eng") == "eng"))[:4]
    if source and source.get("meanings"):
        english = source["meanings"][:3]
    translation = glosses.get((seq, hira(reading)), "") if valid else ""
    return [seq if valid else None, written, hira(reading),
            ("III" if suffix == "する" else group_for(tags,hira(reading))) if valid else "other", translation, aliases, english,
            level, source["id"] if source else None]


def references(source_dir, entries, glosses):
    seen = set()
    rows, audit = [], []
    fixes = json.loads(Path(__file__).with_name("reference-fixes.json").read_text())
    for level in ("N5", "N4"):
        for row in json.loads((source_dir / (level.lower() + ".json")).read_text()):
            row = {**row, **fixes.get(row["word"]+"|"+hira(row["reading"]),fixes.get(row["word"], {}))}
            seq = row["jmdict_id"]
            payload = make_row(entries.get(seq), row["word"], row["reading"], level, glosses, row)
            audit.append([level, row["id"], row["word"], row["reading"], seq, payload[0] is not None])
            rows.append(payload)
            if payload[0]:
                seen.add((payload[0], payload[2]))
    return rows, seen, audit


def common_rows(entries, seen, glosses):
    for seq, entry in entries.items():
        k_parts = entry.findall("k_ele")
        for reading_node in entry.findall("r_ele"):
            reading = reading_node.findtext("reb")
            if not reading or not KANA.fullmatch(reading) or (seq, hira(reading)) in seen:
                continue
            restrictions = values(reading_node, "re_restr")
            spellings = [] if reading_node.find("re_nokanji") is not None else [
                k for k in k_parts if not restrictions or k.findtext("keb") in restrictions
            ]
            prioritized = set(values(reading_node, "re_pri")) & COMMON
            common_spellings = [k for k in spellings if set(values(k, "ke_pri")) & COMMON]
            if not prioritized and not common_spellings and (seq, hira(reading)) not in glosses:
                continue
            written = (common_spellings or spellings)[0].findtext("keb") if spellings else reading
            row = make_row(entry, written, reading, "", glosses)
            if row[0] and row[3] != "proper":
                yield row


def kanji_metadata(source_dir):
    document = xml(source_dir / "kanjidic2.xml.gz", "kanjidic2")
    levels = json.loads((source_dir / "kanji-levels.json").read_text())
    version = document.findtext("header/database_version")
    rows = []
    for entry in document.findall("character"):
        char = entry.findtext("literal")
        group = entry.findall("reading_meaning/rmgroup/reading")
        on = [node.text for node in group if node.get("r_type") == "ja_on"]
        kun = [node.text for node in group if node.get("r_type") == "ja_kun"]
        meanings = [node.text for node in entry.findall("reading_meaning/rmgroup/meaning")
                    if not node.get("m_lang")][:4]
        radical = entry.findtext("radical/rad_value[@rad_type='classical']")
        strokes = entry.findtext("misc/stroke_count")
        level = levels.get(char, {}).get("jlpt_new")
        rows.append([char, on, kun, int(strokes) if strokes else 0, int(radical) if radical else 0, level or 0, meanings])
    return version, rows


def stroke_rows(source_dir):
    document = xml(source_dir / "kanjivg.xml.gz", "kanjivg")
    for entry in document.findall("kanji"):
        identifier = entry.get("id", "").split("_")[-1]
        if re.fullmatch(r"[a-f0-9]{5,6}", identifier):
            strokes = [node.get("d") for node in entry.findall(".//{*}path") if node.get("d")]
            if strokes:
                yield [chr(int(identifier, 16)), strokes]


def main():
    command = argparse.ArgumentParser()
    command.add_argument("source_dir", type=Path, help="Directory with jmdict.xml.gz, kanjidic2.xml.gz, kanjivg.xml.gz, n5.json, n4.json, kanji-levels.json")
    command.add_argument("output", type=Path)
    args = command.parse_args()
    glosses = {}
    for line in Path(__file__).with_name("glosses.tsv").read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        identifier, kana, meaning = line.split("\t")
        glosses[int(identifier), kana] = meaning
    entries = {int(entry.findtext("ent_seq")): entry for entry in xml(args.source_dir / "jmdict.xml.gz", "JMdict")}
    reference, seen, audit = references(args.source_dir, entries, glosses)
    version, kanji = kanji_metadata(args.source_dir)
    raw = dict(reference=reference, common=list(common_rows(entries, seen, glosses)), kanji=kanji,
               strokes=list(stroke_rows(args.source_dir)), audit=audit, kanjidicVersion=version)
    args.output.write_text(json.dumps(raw, ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
