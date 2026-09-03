# Third-party data

HiveLink's Norwegian dictionary is derived from the following resources:

- **Norsk ordbank - bokmål 2005**, created by the University of Bergen and
  Språkrådet and distributed by the National Library of Norway's Language Bank.
  Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  Source: https://www.nb.no/sprakbanken/ressurskatalog/oai-nb-no-sbr-5/
- **NST's Norwegian pronunciation lexicon**, used as a secondary source of
  explicit lexical compound analyses when Norsk ordbank has no analysis.
- **Eli Anne Eiesland's manually reviewed Norwegian noun-noun compound data**,
  derived from NoWaC as part of PhD research at the University of Oslo. Its
  corpus counts and manual-attestation provenance are retained separately.
- **NB Bokmål 1-gram**, distributed by the National Library of Norway's
  Language Bank under [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
  This is the primary commonness source.
  Source: https://www.nb.no/sprakbanken/ressurskatalog/oai-nb-no-sbr-35/
- **NoWaC 1.1**, optional secondary frequency evidence. The supplied archive
  is licensed under
  [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/).

The rich build artifact keeps source-specific analyses, counts, ranks, and
provenance. Raw counts from different corpora are never added together. The
runtime artifact uses interned string IDs and derived puzzle tiers while keeping
the complete validated graph available for player moves.
