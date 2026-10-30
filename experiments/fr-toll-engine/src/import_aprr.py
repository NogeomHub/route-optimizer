"""APRR text-layout adapter with data-supplied vintage and vehicle class.
A changed document layout fails closed and needs an importer update/review.
"""
from datetime import date
from decimal import Decimal
import re,subprocess,unicodedata
MONTHS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
def normalized(text):return ''.join(c for c in unicodedata.normalize('NFKD',text)if not unicodedata.combining(c)).casefold()
def parse(text,effective_from,vehicle_class=1):
    when=date.fromisoformat(effective_from)
    day='1er'if when.day==1 else str(when.day)
    expected=f'{day} {MONTHS[when.month-1]} {when.year}'
    if normalized(expected) not in normalized(text) or f'Classe {vehicle_class}' not in text:raise ValueError('Official document vintage or class differs from import plan')
    if vehicle_class not in range(1,6):raise ValueError('Unsupported ASFA vehicle class')
    result={}
    for page,body in enumerate(text.split('\f'),1):
        for line in body.splitlines():
            cols=re.split(r'\s{2,}',line.strip())
            if len(cols)!=8 or not re.fullmatch(r'\d+,\d{2} €',cols[2+vehicle_class]):continue
            key=tuple(cols[:2]);value=int(Decimal(cols[2+vehicle_class].removesuffix(' €').replace(',','.'))*100)
            if key in result and result[key]['cents']!=value:raise ValueError('Conflicting directed PDF cell')
            result[key]={'entry':key[0],'exit':key[1],'cents':value,'pdf_page':page,'original_line':line.strip()}
    if not result:raise ValueError('No valid directed tariff cells')
    return result

def load(pdf,effective_from,vehicle_class=1):
    text=subprocess.check_output(['pdftotext','-layout',str(pdf),'-']).decode()
    return parse(text,effective_from,vehicle_class)
