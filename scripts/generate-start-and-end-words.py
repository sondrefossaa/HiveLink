from wordfreq import zipf_frequency
import json


def writeToFile(data, file):
    with open(file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


path = "public/compound_words.json"
with open(path) as file:
    data = json.load(file)

startWordsPath = "public/start_words.json"
endWordsPath = "public/end_words.json"
endWords = set()
startWords = set()

for word in data:
    if zipf_frequency(word["parts"][0], "en") >= 5.0:
        startWords.add(word["parts"][0])
    if zipf_frequency(word["parts"][1], "en") >= 5.0:
        endWords.add(word["parts"][1])


# Build lookup dictionary for fist part of word
next_words = {}
for entry in data:
    part0 = entry["parts"][0]
    if part0 not in next_words:
        next_words[part0] = []
    next_words[part0].append(entry)

min_depth = 3
max_depth = 4
queue = []
foundPaths = []

# Initialize queue with starting entries
for word in startWords:
    if word in next_words:
        for entry in next_words[word]:
            queue.append([entry])

completed = set()
processed = 0
while len(queue) != 0:
    currentWords = queue.pop(0)
    hashable = tuple([currentWords[0]["word"], currentWords[-1]["word"]])
    if hashable in completed:
        continue
    processed += 1

    current_length = len(currentWords)
    if current_length > max_depth:
        continue

    last_part = currentWords[-1]["parts"][1]

    # Check if path is complete (meets min length and ends with end word)
    if current_length >= min_depth and last_part in endWords:
        path = [entry["parts"][0] for entry in currentWords] + [last_part]
        foundPaths.append({"path": path, "length": len(path)})
        hashable = tuple([path[0], path[-2]])
        completed.add(hashable)

    # Continue building path if under max depth
    if current_length < max_depth:
        # Use lookup instead of looping through all data
        if last_part in next_words:
            for entry in next_words[last_part]:
                queue.append(currentWords + [entry])


foundpathsFile = "public/paths.json"
writeToFile(foundPaths, foundpathsFile)
writeToFile(list(startWords), startWordsPath)
writeToFile(list(endWords), endWordsPath)
