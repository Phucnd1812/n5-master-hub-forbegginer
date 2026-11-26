# Dictionary data sources and licenses

## JMdict and KANJIDIC2

James William Breen, the Electronic Dictionary Research and Development Group (EDRDG) and contributors created JMdict and KANJIDIC2. The project uses their data under the [EDRDG licence](https://www.edrdg.org/edrdg/licence.html), [Creative Commons Attribution–ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/). The derived portions of `v1/vocab-n5.json`, `v1/words/`, `v1/kanji/` and `v1/kanji-core.json` are distributed on those terms.

N5 Master Hub selected frequent JMdict entries, filtered readings and senses by spelling restrictions, shortened English glosses, added reviewed Vietnamese glosses where available, and grouped the records for on-demand lookup. It extracted Kanji readings, meanings and stroke counts from KANJIDIC2 and attached level metadata and selected Vietnamese glosses. Source IDs remain in the word records. Neither project endorses the app.

- [JMdict project and downloads](https://www.edrdg.org/jmdict/j_jmdict.html). Snapshot SHA-256 `40192b9029e2baef5abdd4a8ce5a068c9bd7951c138b31a080f140ccfdce4de5`.
- [KANJIDIC2 XML](https://www.edrdg.org/kanjidic/kanjidic2.xml.gz), source stamp `2026-327`. SHA-256 `ffde2105ca869b4401d284b39aef38d19b4024fc90bd1bd3eb131bc03f0cd4ac`.

## KanjiVG

Ulrich Apel and the [KanjiVG contributors](https://github.com/KanjiVG/kanjivg/graphs/contributors) created the stroke drawings. The modified data in `v1/strokes/` uses [Creative Commons Attribution–ShareAlike 3.0 Unported](https://creativecommons.org/licenses/by-sa/3.0/). N5 Master Hub selected the standard glyph recordings, retained path geometry and stroke order, and converted the XML into compact JSON for animation.

- [KanjiVG r20260714](https://github.com/KanjiVG/kanjivg/releases/tag/r20260714), `kanjivg-20260714.xml.gz`. SHA-256 `d4a8e5e11533fe6a5d81a158b2c153964322641d2982c90a919461f3c06dca6b`.

## Level references

Vocabulary references come from [OpenJLPT](https://github.com/evanclan/OpenJLPT/tree/0d1d3410bec90bd4098a7c72de820543cb4f707c), which credits [Jonathan Waller’s JLPT resources](https://www.tanos.co.uk/jlpt/), JMdict and its contributors. The derived list data is distributed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). This build uses word, reading, reference identifier, selected glosses and level. Source example sentences are excluded. Selected reference spellings/readings were corrected after checking JMdict. This is a published study reference for N5/N4 coverage.

The Kanji level assignment uses only the `jlpt_new` field of [David Luz Gouveia’s Kanji data](https://github.com/davidluzgouveia/kanji-data/tree/00fd7079c3890f430759536f91aa1d4ec0ca4f), which credits Jonathan Waller. The source Kanji data is reused under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

| Local input | SHA-256 |
| --- | --- |
| `n5.json` | `cbb221c9a3a92108fcd02fb088d9afacc70bc8c96570d5730425de0a49dad5f3` |
| `n4.json` | `b38512a6dc1e06a3615f377b3e58184c4a85b6f769c2e3f58f2a4ef0e1810927` |
| `kanji-levels.json` | `561b72ea9df703c58fae0c68585812e172aaa7611d2fcee6719d55fd2dfd4fa4` |

## Rebuild

Place these six input files in a local directory and run from the repository root. Supply the checked-out v5.52.4 baseline as the second argument to `build.mjs` for the historical comparison. The generated JSON files and CSV audits are committed for use on GitHub Pages.

```sh
python3 tools/dictionary/prepare.py path/to/snapshots /tmp/n5-dictionary-input.json
node tools/dictionary/build.mjs /tmp/n5-dictionary-input.json path/to/v5.52.4
node tools/dictionary/audit.mjs
```

The bundled Plus Jakarta Sans, Be Vietnam Pro and Noto Sans JP fonts use the SIL Open Font License 1.1. The [font directory](../fonts/v1/) contains the copyright and license files. The WOFF2 subsets came from [Google Fonts revision 6ebe737](https://github.com/google/fonts/tree/6ebe737e44fd64ee736bbc6feed6136a6dbfd222), with the generation script in `tools/dictionary/build-fonts.py`.
