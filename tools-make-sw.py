# Regenerates sw.js with the list of every game file. Run after adding files:  python3 tools-make-sw.py
import os, re
ver = re.search(r"VERSION = '([^']+)'", open('js/state.js').read()).group(1)
files = ['./', 'index.html', 'manifest.webmanifest', 'css/style.css']
for d in ['js', 'lib', 'icons']:
    files += sorted(f'{d}/{f}' for f in os.listdir(d))
tpl = open('sw.template.js').read()
open('sw.js', 'w').write(tpl.replace('__VERSION__', ver).replace('__FILES__', ',\n  '.join(repr(f) for f in files)))
print('sw.js written for', ver, len(files), 'files')
