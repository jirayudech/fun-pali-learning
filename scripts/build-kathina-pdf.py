"""Build the public A4 chant sheet from the same reviewed texts as the website.
Needs Python Playwright, Chromium, and pypdf in the development environment only.
Run from any directory: python scripts/build-kathina-pdf.py
"""
from pathlib import Path
import base64, html, json, subprocess
from playwright.sync_api import sync_playwright
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / 'assets' / 'kathina-a4.pdf'
source = subprocess.check_output(['node', '--input-type=module', '-e',
    "import {chantPacks,materializePack,KATHINA_RECIPIENT} from './chant-content.js'; console.log(JSON.stringify({recipient:KATHINA_RECIPIENT,packs:chantPacks.map(p=>({id:p.id,title:p.title,lines:materializePack(p)}))}));"], cwd=ROOT, text=True)
data = json.loads(source)
packs = {p['id']: p for p in data['packs']}
font = base64.b64encode((ROOT / 'assets/fonts/noto-serif-thai.ttf').read_bytes()).decode()
def section(id, title):
    rows = ''.join('<p>'+' '.join('<span>'+html.escape(w)+'</span>' for w in line['text'].split())+'</p>' for line in packs[id]['lines'])
    response = '<aside>สงฆ์รับ: รุจฺจติ ภนฺเต</aside>' if id == 'third-monk' else ''
    return '<section><h2>'+title+'</h2>'+rows+response+'</section>'
page_html = '''<!doctype html><html lang="pi-Thai"><meta charset="utf-8"><title>บทสวดกฐิน รวม 3 บท · A4</title><style>
@font-face{font-family:Pali;src:url(data:font/ttf;base64,FONT) format('truetype');font-weight:100 900}
@page{size:A4 portrait;margin:9mm}
*{box-sizing:border-box}body{width:192mm;margin:0;color:#000;font-family:Pali,serif;font-feature-settings:"ss01" 1,"ccmp" 1,"locl" 1,"mark" 1,"mkmk" 1;font-size:12pt;line-height:1.55}
header{border-bottom:1px solid #555;margin-bottom:3mm;padding-bottom:2mm}h1{font-size:17pt;margin:0;font-weight:600}header p{font-size:10pt;margin:0}
main{display:grid;grid-template-columns:1fr 1fr;column-gap:7mm;align-items:start}section{margin-bottom:3mm}h2{font-size:12pt;margin:0 0 1.5mm;font-weight:700;border-bottom:1px solid #bbb;padding-bottom:1mm}section p{margin:0 0 1.2mm}section p span{white-space:nowrap}aside{font-size:9pt;border-top:1px dotted #999;padding-top:1mm;margin-top:1mm}
footer{border-top:1px solid #555;padding-top:2mm;font-size:8pt;line-height:1.6}footer p{margin:0}
</style><body><header><h1>บทสวดกฐิน · รวม ๓ บทใน A4 หน้าเดียว</h1><p>ผู้รับผ้ากฐิน: NAME / OBLIQUE</p></header><main><div>LEFT</div><div>RIGHT</div></main><footer><p>ฉบับซ้อม: ตรวจข้อความ ชื่อพระ ทางเลือกอาจารย์/อุปัชฌาย์ จุดหยุดและทำนองกับพระผู้กำกับก่อนสวด</p><p>องค์ที่ ๓ และญัตติ: ตามภาพต้นฉบับของผู้เรียน · กาเล: กาลทานสุตตคาถา (AN 5.36), ฉบับสวด “โอนา”</p><p>บาลีทีละนิด · jirayudech.github.io/fun-pali-learning/ · เรียงลำดับสวดตามหมายเลข ๑ → ๒ → ๓</p></footer></body></html>'''
page_html = page_html.replace('FONT',font).replace('NAME',html.escape(data['recipient']['name'])).replace('OBLIQUE',html.escape(data['recipient']['oblique']))
page_html = page_html.replace('LEFT',section('third-monk','๑ อปโลกน์กฐิน · องค์ที่ ๓')+section('kale-anumodana','๓ กาเล · อนุโมทนากฐิน')).replace('RIGHT',section('kathina-motion','๒ ญัตติทุติยกรรมวาจา'))
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':794,'height':1123})
    page.set_content(page_html);page.evaluate('document.fonts.ready');page.emulate_media(media='print')
    # A4 printable height is 297 - 2*9 = 279 mm. Never truncate or hide overflow.
    chosen = None
    for quarter in range(56,41,-1):
        size = quarter / 4
        page.evaluate('(n)=>document.body.style.fontSize=n+"pt"',size)
        height = page.evaluate('document.body.getBoundingClientRect().height')
        if height <= 279 * 96 / 25.4 - 2:
            chosen = size;break
    if chosen is None: raise RuntimeError('Full text does not fit legibly on one A4 page')
    expected = [line['text'] for pack in data['packs'] for line in pack['lines']]
    actual = page.locator('section p').all_text_contents()
    assert len(actual)==len(expected)==32
    assert sorted(actual)==sorted(expected), 'PDF layout must preserve every source line exactly'
    page.pdf(path=str(DEST),prefer_css_page_size=True,print_background=True,display_header_footer=False)
    page.screenshot(path='/tmp/kathina-a4-layout.png',full_page=True)
    browser.close()
reader = PdfReader(DEST)
assert len(reader.pages)==1
box = reader.pages[0].mediabox
assert abs(float(box.width)-595.28)<1 and abs(float(box.height)-841.89)<1
text = reader.pages[0].extract_text()
for ending in ['เอวเมตํ ธารยามิ','ปาณินนฺติ','รุจฺจติ ภนฺเต']:
    assert ending.replace(' ','') in ''.join(text.split()), ending
print(f'{DEST}: 1 A4 page, all 32 source lines, {chosen} pt, {DEST.stat().st_size} bytes')
