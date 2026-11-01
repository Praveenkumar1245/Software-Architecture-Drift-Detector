import urllib.request

url = 'https://tamilselvan3660.github.io/Software-Architecture-Drift-Detector/'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as resp:
        print('HTTP Status:', resp.status)
        html = resp.read().decode('utf-8')
        print('HTML length:', len(html))
        print('Is React app index.html:', 'id="root"' in html)
        print('Has Title:', '<title>Software Architecture Drift Detector</title>' in html)
        print('Has assets prefix:', '/Software-Architecture-Drift-Detector/assets/' in html)
        print('Has SPA redirect decoder:', 'Single Page Apps for GitHub Pages' in html)
        print('Is README rendered? (Should be False):', '# Software Architecture Drift Detector' in html and 'id="root"' not in html)
except Exception as e:
    print('Error:', e)
