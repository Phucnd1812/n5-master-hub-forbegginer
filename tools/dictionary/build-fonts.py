#!/usr/bin/env python3
"""Create local WOFF2 subsets from licensed Google Fonts source snapshots."""
import json
from pathlib import Path
import sys
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

source = Path(sys.argv[1])
levels = json.loads(Path(sys.argv[2]).read_text())
repo = Path(__file__).resolve().parents[2]
out = repo / "assets/fonts/v1"
out.mkdir(parents=True,exist_ok=True)
css = []
latin = set(range(0x20,0x0250)) | set(range(0x0300,0x0370)) | set(range(0x1EA0,0x1EFA)) | set(range(0x2000,0x2070))


def ranges(points):
    ordered = sorted(points)
    spans = []
    start = end = ordered[0]
    for point in ordered[1:]:
        if point == end + 1:
            end = point
        else:
            spans.append((start,end))
            start = end = point
    spans.append((start,end))
    return ",".join(f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a,b in spans)


def declare(font, name, family, weight, points, axes=None):
    options = subset.Options()
    options.flavor = "woff2"
    process = subset.Subsetter(options=options)
    points = set(font.getBestCmap()) & points
    process.populate(unicodes=points)
    process.subset(font)
    if axes:
        font = instantiateVariableFont(font,axes)
    font.flavor = "woff2"
    font.save(out / (name+".woff2"))
    css.append(f'@font-face {{ font-family:"{family}"; src:url("{name}.woff2") format("woff2"); '
               f'font-style:normal; font-weight:{weight}; font-display:swap; unicode-range:{ranges(points)}; }}')


declare(TTFont(source / "jakarta.ttf"),"jakarta","Plus Jakarta Sans","600 700",latin,{"wght":(600,700)})
for style,weight in [("Regular",400),("Medium",500),("SemiBold",600)]:
    declare(TTFont(source / ("be-"+style+".ttf")),"vietnam-"+str(weight),"Be Vietnam Pro",str(weight),latin)

primary = set(range(0x3000,0x3100)) | set(range(0xFF00,0xFFA0)) | set(range(0x20,0x7F))
primary |= {ord(char) for char,row in levels.items() if row.get("jlpt_new") in (4,5)}
common = sorted(ord(char) for char,row in levels.items()
                if row.get("grade") in (1,2,3,4,5,6,8) and ord(char) not in primary)
declare(TTFont(source / "noto.ttf"),"jp-core","Noto Sans JP","400 600",primary,{"wght":(400,600)})
for i in range(0,len(common),225):
    declare(TTFont(source / "noto.ttf"),"jp-"+str(i//225),"Noto Sans JP","400 600",
            set(common[i:i+225]),{"wght":(400,600)})
(out/"fonts.css").write_text("\n".join(css)+"\n")
for family in ("plusjakartasans","bevietnampro","notosansjp"):
    name = family + "-OFL.txt"
    text = (source / name).read_text(encoding="utf-8")
    (out / name).write_text("\n".join(line.rstrip() for line in text.splitlines())+"\n",encoding="utf-8")
