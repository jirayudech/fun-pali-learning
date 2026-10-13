"""Generate three static images using Pollinations; never called by the website or deployment.
Requires POLLINATIONS_API_KEY through secure environment settings. Only run with available
free credits; this script does not buy credits or set up billing. It stops on 401/402/429.
"""
import json
import os
from pathlib import Path
import urllib.parse
import urllib.request
import urllib.error

root = Path(__file__).resolve().parent.parent
class ScopedRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlparse(newurl).hostname != 'gen.pollinations.ai':
            raise urllib.error.URLError('Unexpected redirect destination')
        return super().redirect_request(req, fp, code, msg, headers, newurl)
opener = urllib.request.build_opener(ScopedRedirect())
key = os.environ.get('POLLINATIONS_API_KEY')
if not key:
    raise SystemExit('Missing POLLINATIONS_API_KEY. Supply it in secure environment settings, never chat or source files.')
if os.environ.get('POLLINATIONS_USE_FREE_CREDITS') != '1':
    raise SystemExit('Confirm the account/key has free credits by setting POLLINATIONS_USE_FREE_CREDITS=1. No images requested.')
prompts = json.loads((root / 'assets/prompts.json').read_text())
art = {}
for i, (name, prompt) in enumerate(prompts.items()):
    dimensions = (1200, 420) if name == 'garden' else (640, 640)
    params = urllib.parse.urlencode({'model': 'flux', 'width': dimensions[0], 'height': dimensions[1], 'seed': 411 + i})
    url = 'https://gen.pollinations.ai/image/' + urllib.parse.quote(prompt, safe='') + '?' + params
    request = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + key})
    try:
        with opener.open(request, timeout=180) as response:
            content = response.read(12 * 1024 * 1024 + 1)
    except urllib.error.HTTPError as error:
        raise SystemExit(f'Pollinations returned HTTP {error.code}; stopped without retrying or buying credits.') from None
    except urllib.error.URLError:
        raise SystemExit('Pollinations network request failed; no credentials printed. Check the allowed domain.') from None
    if len(content) > 12 * 1024 * 1024:
        raise SystemExit('Image too large; refusing to save.')
    if content.startswith(b'\x89PNG\r\n\x1a\n'):
        ext = 'png'
    elif content.startswith(b'\xff\xd8\xff'):
        ext = 'jpg'
    elif content.startswith(b'RIFF') and content[8:12] == b'WEBP':
        ext = 'webp'
    else:
        raise SystemExit('Response was not a supported image; original SVGs remain in use.')
    filename = f'assets/{name}-pollinations.{ext}'
    (root / filename).write_bytes(content)
    art[name] = './' + filename
    print('Saved', filename)
(root / 'art.js').write_text('// Images generated with Pollinations; see assets/prompts.json.\nexport const art = ' + json.dumps(art) + ';\n')
(root / 'assets/generated-manifest.json').write_text(json.dumps({'provider': 'Pollinations', 'images': art, 'prompts': prompts}, indent=2))
print('All three images saved. Inspect them before committing and publishing.')
