"""Read the published static semicolon files; never call a journey calculator.

This is a private import index, not an activated national catalogue. Dates need
an independently verified PDF/page and station/transaction matching is separate.
"""
import csv
from decimal import Decimal, InvalidOperation
import io


def cents(text):
    try:
        value=Decimal(text.strip().replace(',','.'))*100
    except (InvalidOperation, AttributeError): raise ValueError('Invalid monetary cell')
    if not value.is_finite() or value<0 or value!=value.to_integral_value():raise ValueError('Invalid monetary precision')
    return int(value)


def parse_static_matrix(raw, encoding="utf-8-sig"):
    text=raw.decode(encoding)
    reader=csv.DictReader(io.StringIO(text),delimiter=';')
    required={'autoroute_entree','nom_entree','autoroute_sortie','nom_sortie',*[f'classe{i}'for i in range(1,6)]}
    if not required.issubset(reader.fieldnames or []):raise ValueError('Unsupported schema (e.g. temporal A86/Arcos is NOT a static matrix)')
    records={}
    for line,row in enumerate(reader,2):
        if None in row or any(v is None for v in row.values()):raise ValueError('Truncated CSV row')
        key=(row['autoroute_entree'],row['nom_entree'],row['autoroute_sortie'],row['nom_sortie'])
        values=[None if row[f'classe{i}'].strip() == '#N/A' else cents(row[f'classe{i}']) for i in range(1,6)]
        if key in records:raise ValueError('Duplicate directed selector; manual review required')
        records[key]={'source_line':line,'entry_road':key[0],'entry':key[1],'exit_road':key[2],'exit':key[3],'cents_by_class':values}
    if not records:raise ValueError('Empty matrix')
    return records
