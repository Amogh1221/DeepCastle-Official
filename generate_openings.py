import re
import json

with open(r"C:\Users\Amogh\Stuff\Projects\Deepcastle\Chesskit-main\src\data\openings.ts", "r", encoding="utf-8") as f:
    data = f.read()

# Extract objects using regex
pattern = re.compile(r'{\s*name:\s*"([^"]+)",\s*fen:\s*"([^"]+)",?\s*}', re.MULTILINE)
openings = { match.group(2): match.group(1) for match in pattern.finditer(data) }

with open("server/openings.json", "w", encoding="utf-8") as f:
    json.dump(openings, f, indent=2)

print(f"Extracted {len(openings)} openings!")
