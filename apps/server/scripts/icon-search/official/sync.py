import hashlib
import json
import re
import subprocess
from collections import defaultdict
from collections.abc import Iterable
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.request import urlopen
from xml.etree import ElementTree


HAN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\U00020000-\U000323af]")


def chinese_labels(values: Iterable[str]) -> list[str]:
    return sorted({value.strip() for value in values if HAN.search(value)})


def icon_park(data: bytes) -> dict:
    snapshot = {}
    for icon in json.loads(data):
        titles = chinese_labels([icon["title"]])
        tags = chinese_labels(icon["tag"])
        if titles or tags:
            snapshot[icon["name"]] = {"titles": titles, "tags": tags}
    return snapshot


def remix_icon(data: bytes) -> dict:
    groups = json.loads(data)
    del groups["_comment"]
    labels = defaultdict(list)
    for icons in groups.values():
        for name, tags in icons.items():
            labels[name].extend(tags.split(","))
    return {
        name: tags for name, values in labels.items() if (tags := chinese_labels(values))
    }


def cldr_emoji(annotations: bytes, derived_annotations: bytes) -> dict:
    labels = defaultdict(lambda: {"titles": [], "tags": []})
    for data in (annotations, derived_annotations):
        for annotation in ElementTree.fromstring(data).findall("./annotations/annotation"):
            # CLDR omits emoji presentation selectors but retains all other code points.
            sequence = annotation.attrib["cp"].replace("\ufe0f", "")
            key = "-".join(format(ord(char), "x") for char in sequence)
            if annotation.get("type") == "tts":
                labels[key]["titles"].append(annotation.text)
            else:
                labels[key]["tags"].extend(annotation.text.split("|"))

    snapshot = {}
    for key, annotation in labels.items():
        titles = chinese_labels(annotation["titles"])
        tags = chinese_labels(annotation["tags"])
        if titles or tags:
            snapshot[key] = {"titles": titles, "tags": tags}
    return snapshot


def region_codes(data: bytes) -> set[str]:
    codes = set()
    for group in ElementTree.fromstring(data).findall("./idValidity/id[@type='region']"):
        if group.attrib["idStatus"] not in {"regular", "macroregion"}:
            continue
        for item in group.text.split():
            start, _, end = item.partition("~")
            if not re.fullmatch(r"[A-Z]{2}", start):
                continue
            if end:
                codes.update(start[0] + chr(code) for code in range(ord(start[1]), ord(end) + 1))
            else:
                codes.add(start)
    return codes


def iso_flags(names: bytes, validity: bytes) -> dict:
    codes = region_codes(validity)
    labels = defaultdict(list)
    for region in ElementTree.fromstring(names).findall("./localeDisplayNames/territories/territory"):
        code = region.attrib["type"]
        if code in codes and region.get("alt") in {None, "short"}:
            labels[code.lower()].append(region.text)
    return {
        code: titles for code, values in labels.items() if (titles := chinese_labels(values))
    }


SNAPSHOT_GENERATORS = {
    "icon-park.json": icon_park,
    "remix-icon.json": remix_icon,
    "cldr-emoji.json": cldr_emoji,
    "iso-flags.json": iso_flags,
}


def download(source: dict) -> bytes:
    with urlopen(source["url"], timeout=30) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != source["checksum"]:
        raise ValueError(f"Upstream checksum mismatch: {source['url']}")
    return data


def format_json(data: dict, path: Path) -> bytes:
    result = subprocess.run(
        ["oxfmt", f"--stdin-filepath={path}"],
        input=json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
        stdout=subprocess.PIPE,
        check=True,
    )
    return result.stdout


def sync_official_snapshots(resources_directory: Path) -> dict[str, int]:
    manifest_path = resources_directory / "manifest.json"
    official_directory = resources_directory / "official"
    original_manifest = manifest_path.read_bytes()
    manifest = json.loads(original_manifest)
    official = manifest["official"]
    snapshots = {}

    with ThreadPoolExecutor() as pool:
        downloads = {
            name: [pool.submit(download, source) for source in official[name]["sources"]]
            for name in SNAPSHOT_GENERATORS
        }
        for name, generate in SNAPSHOT_GENERATORS.items():
            snapshots[name] = generate(*(result.result() for result in downloads[name]))

    with TemporaryDirectory(prefix=".sync-official-", dir=resources_directory) as temporary:
        staging = Path(temporary)
        for name, snapshot in snapshots.items():
            data = format_json(dict(sorted(snapshot.items())), official_directory / name)
            (staging / name).write_bytes(data)
            official[name]["checksum"] = hashlib.sha256(data).hexdigest()
        (staging / "manifest.json").write_bytes(format_json(manifest, manifest_path))

        if manifest_path.read_bytes() != original_manifest:
            raise ValueError("The resource manifest changed during synchronization. Run sync again.")
        official_directory.mkdir(exist_ok=True)
        for name in snapshots:
            (staging / name).replace(official_directory / name)
        (staging / "manifest.json").replace(manifest_path)

    return {name: len(records) for name, records in snapshots.items()}


if __name__ == "__main__":
    resources = Path(__file__).resolve().parents[3] / "resources" / "icon-search"
    print(json.dumps(sync_official_snapshots(resources)))
