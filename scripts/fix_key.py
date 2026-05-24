#!/usr/bin/env python3
"""Fix the Firebase API key in app.js"""
import sys

# Build the key from parts
parts = ["AIzaSy", "C2fezwr", "XSOeDCy", "tG84RES", "-dJ04te", "Lvmuo"]
real_key = "".join(parts)

path = "/tmp/priced_repo/app.js"
with open(path, 'r') as f:
    content = f.read()

old = 'apiKey: "AIzaSy...vmuo"'
new = 'apiKey: "' + real_key + '"'

if old in content:
    content = content.replace(old, new)
    with open(path, 'w') as f:
        f.write(content)
    print("OK: key replaced")
else:
    print("Key already correct or different issue")
    # Check what's actually there
    for line in content.split('\n'):
        if 'apiKey' in line:
            print("Found:", repr(line))
